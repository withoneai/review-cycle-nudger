import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePolicy } from "./config.js";
import { classify, managerWords } from "./emptiness.js";
import { gate } from "./gate.js";
import type { FlaggedReview, Review } from "./types.js";

const policy = parsePolicy();
const TEMPLATE = "## Overall\n*Write two or three sentences on the overall cycle.*\n\n## Rating\n*Meets / Exceeds / Below*\n";

function review(p: Partial<Review>): Review {
  return {
    id: "rv-1", title: "t", employee: "Maya", manager: "Dana", managerEmail: null, status: "Not started",
    due: "2026-11-07", url: "u", goalsDocUrl: "g", reviewMarkdown: TEMPLATE, goalsMarkdown: null, ...p,
  };
}
const now = new Date("2026-11-03T09:00:00Z");

test("template prompts are not the manager's words", () => {
  assert.equal(managerWords(TEMPLATE, policy.templateLines), 0);
});

test("a review marked Drafting with nothing written is still empty", () => {
  assert.equal(classify(review({ status: "Drafting" }), policy, now).kind, "empty");
});

test("a submitted review is never nudged, even when empty", () => {
  assert.equal(classify(review({ status: "Submitted" }), policy, now).kind, "submitted");
});

test("a deadline outside the window is skipped", () => {
  assert.equal(classify(review({ due: "2026-11-30" }), policy, now).kind, "not-due");
});

test("enough real words counts as started", () => {
  const md = TEMPLATE + "word ".repeat(policy.startedAtWords);
  assert.equal(classify(review({ reviewMarkdown: md }), policy, now).kind, "started");
});

const flagged: FlaggedReview[] = [{ review: review({}), words: 0, daysLeft: 4 }];
const goals = new Map([["rv-1", "## Renewals\nWhere it stands: 93% through October, 41 of 44 clinics renewed."]]);

test("a quote that is in the goals doc survives, whitespace and emphasis aside", () => {
  const out = gate(
    { nudges: [{ manager: "Dana", opener: "o", reports: [{ reviewId: "rv-1", startHere: "s", evidence: [{ goal: "Renewals", landed: "hit", quote: "Where it stands:  93% through October, **41 of 44** clinics renewed." }] }] }] },
    flagged, goals,
  );
  assert.equal(out[0].reports[0].evidence.length, 1);
});

test("an invented quote is dropped, not shipped", () => {
  const out = gate(
    { nudges: [{ manager: "Dana", opener: "o", reports: [{ reviewId: "rv-1", startHere: "s", evidence: [{ goal: "Renewals", landed: "hit", quote: "Renewed every clinic in the territory." }] }] }] },
    flagged, goals,
  );
  assert.equal(out[0].reports[0].evidence.length, 0);
  assert.equal(out[0].reports[0].droppedQuotes.length, 1);
});

test("a review the model never mentioned is still nudged", () => {
  const out = gate({ nudges: [] }, flagged, goals);
  assert.equal(out.length, 1);
  assert.equal(out[0].reports[0].review.id, "rv-1");
});

test("a reviewId the code never flagged is ignored", () => {
  const out = gate(
    { nudges: [{ manager: "Dana", opener: "o", reports: [{ reviewId: "rv-999", startHere: "s", evidence: [] }] }] },
    flagged, goals,
  );
  assert.deepEqual(out[0].reports.map((r) => r.review.id), ["rv-1"]);
});
