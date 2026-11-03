import { DEMO, DEMO_REASON, parsePolicy, slackConfigured } from "./config.js";
import { classify } from "./emptiness.js";
import { gate } from "./gate.js";
import { goalsFor, listReviews } from "./notion.js";
import { draftNudges } from "./nudges.js";
import { digestText, nudgeText, postDigest } from "./slack.js";
import type { FlaggedReview } from "./types.js";

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(
    [
      "Usage:",
      "  npm start                 read the cycle from Notion, draft the nudges, post one digest to Slack",
      "  npm start -- --demo       replay the recorded cycle, no keys, no network",
      "  npm start -- --dry-run    print the digest, post nothing",
      "",
      "The nudge window, the word count that counts as started, and the template lines live in config/cycle.md.",
    ].join("\n"),
  );
  process.exit(0);
}
const dryRun = args.includes("--dry-run");

console.log(`── review cycle nudger${DEMO ? ` (demo: ${DEMO_REASON}, replaying the recorded cycle)` : ""}\n`);
if (DEMO && DEMO_REASON !== "--demo") {
  console.log("   No keys found, so this replays a recorded review cycle for a fictional nine-person team.");
  console.log("   Same pipeline. Copy .env.example to .env to read your own.\n");
}

const policy = parsePolicy();
const { reviews, capturedAt } = await listReviews();

const flagged: FlaggedReview[] = [];
const tally = { submitted: 0, notDue: 0, started: 0 };
for (const review of reviews) {
  const v = classify(review, policy, capturedAt);
  const tag =
    v.kind === "submitted" ? "submitted, skip" :
    v.kind === "not-due" ? `due in ${v.daysLeft}d, outside the ${policy.windowDays}-day window, skip` :
    v.kind === "started" ? `${v.words} words written, started, skip` :
    `${v.words} words written, ${v.daysLeft}d left, EMPTY`;
  console.log(`   ${review.employee.padEnd(16)} ${review.manager.padEnd(14)} ${review.status.padEnd(12)} ${tag}`);
  if (v.kind === "submitted") tally.submitted++;
  else if (v.kind === "not-due") tally.notDue++;
  else if (v.kind === "started") tally.started++;
  else flagged.push({ review, words: v.words, daysLeft: v.daysLeft });
}

console.log(
  `\n${reviews.length} review(s): ${tally.submitted} submitted, ${tally.started} started, ${tally.notDue} not due yet, ${flagged.length} empty inside the window\n`,
);
if (flagged.length === 0) {
  console.log("Nothing to chase. No digest posted.");
  process.exit(0);
}

const goals = new Map<string, string | null>();
for (const f of flagged) goals.set(f.review.id, await goalsFor(f.review));

const draft = await draftNudges(flagged, goals);
const nudges = gate(draft, flagged, goals);

for (const n of nudges) {
  console.log(`── to ${n.manager}`);
  console.log(nudgeText(n).replace(/^/gm, "   "));
  for (const r of n.reports) {
    for (const d of r.droppedQuotes) console.log(`   ✗ dropped for ${r.review.employee} (not in the goals doc): "${d.quote}"`);
  }
  console.log();
}

const kept = nudges.reduce((n, x) => n + x.reports.reduce((m, r) => m + r.evidence.length, 0), 0);
const dropped = nudges.reduce((n, x) => n + x.reports.reduce((m, r) => m + r.droppedQuotes.length, 0), 0);
console.log(`${nudges.length} manager(s), ${flagged.length} review(s), ${kept} quote(s) verified against the goals docs, ${dropped} dropped`);

const soonest = flagged.map((f) => f.review.due).sort()[0];
const text = digestText(nudges, `first deadline ${soonest}`);
if (dryRun) {
  console.log(`\n── would post to Slack:\n${text}`);
} else if (DEMO) {
  console.log("demo mode: nothing was posted to Slack");
} else if (!slackConfigured()) {
  console.log(`\nSLACK_CHANNEL not configured; printing the digest instead:\n\n${text}`);
} else {
  await postDigest(text);
  console.log("posted one digest to Slack");
}
