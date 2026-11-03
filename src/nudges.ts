import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CLAUDE_MODEL, DEMO, loadFixture, loadPolicy } from "./config.js";
import type { FlaggedReview, NudgeDraft } from "./types.js";

export const DraftSchema = z.object({
  nudges: z.array(
    z.object({
      manager: z.string(),
      opener: z.string(),
      reports: z.array(
        z.object({
          reviewId: z.string(),
          startHere: z.string(),
          evidence: z.array(
            z.object({
              goal: z.string(),
              landed: z.enum(["hit", "partly", "missed", "unclear"]),
              quote: z.string(),
            }),
          ),
        }),
      ),
    }),
  ),
});

/** Kept separate from the call so the exact prompt can be read, tested and recorded. */
export function buildPrompt(flagged: FlaggedReview[], goals: Map<string, string | null>): string {
  const byManager = new Map<string, FlaggedReview[]>();
  for (const f of flagged) byManager.set(f.review.manager, [...(byManager.get(f.review.manager) ?? []), f]);

  const blocks: string[] = [];
  for (const [manager, list] of byManager) {
    blocks.push(`### Manager: ${manager}`);
    for (const f of list) {
      const doc = goals.get(f.review.id);
      blocks.push(
        [
          `#### reviewId: ${f.review.id}`,
          `Report: ${f.review.employee}`,
          `Deadline: ${f.review.due} (${f.daysLeft} day(s) left). Words the manager has written so far: ${f.words}.`,
          doc ? `Goals doc:\n"""\n${doc.trim()}\n"""` : "Goals doc: none linked on the review row.",
        ].join("\n"),
      );
    }
  }

  return `You help a people-ops lead chase performance reviews that are still empty close to their deadline. The code has already decided which reviews are empty (by counting the words the manager wrote, not by trusting the status column). Your job is the head start: for each report, read their own goals doc and say how each goal landed, so the manager's first paragraph is half written before they open the page.

## Policy (the source of truth for tone and limits)

${loadPolicy()}

## The empty reviews, grouped by manager

${blocks.join("\n\n")}

## Instructions

- One entry in "nudges" per manager above, with "manager" copied exactly.
- opener: one or two sentences to that manager. Name the deadline as a date and how many of their reviews are still empty. No claims about any person here.
- reports: one per reviewId listed under that manager, with reviewId copied exactly.
- evidence: one item per goal in the goals doc. "goal" is a short name for it. "landed" is hit, partly, missed or unclear, judged only from what the doc says. "quote" is the sentence from the goals doc that shows it, copied character for character (it is checked against the doc by code, and a quote that does not match is thrown away). Do not stitch two sentences into one quote.
- If there is no goals doc, or it says nothing usable, return an empty evidence list.
- startHere: one sentence suggesting what the manager could write first, grounded only in the evidence you quoted. With no evidence, suggest starting from "What went well" and say the goals doc is missing.
- Never suggest a rating. Never say anything about the person the goals doc does not say.
- No em dashes or en dashes anywhere. Use a comma, period, colon or parentheses.`;
}

/**
 * One Claude call for the whole cycle: every empty review, grouped by
 * manager, with each report's goals doc inline. Which reviews reach this
 * function is decided in code (src/emptiness.ts); what the model says about
 * each one is checked in code (src/gate.ts). In demo mode this returns the
 * output Claude actually produced for the recorded cycle.
 */
export async function draftNudges(flagged: FlaggedReview[], goals: Map<string, string | null>): Promise<NudgeDraft> {
  if (DEMO) return DraftSchema.parse(loadFixture("nudges.json"));

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: buildPrompt(flagged, goals) }],
    output_config: { format: zodOutputFormat(DraftSchema) },
  });
  if (response.stop_reason === "refusal") throw new Error("Claude declined to draft nudges for this cycle.");
  if (!response.parsed_output) throw new Error("Claude returned output that did not match the schema.");
  return response.parsed_output;
}
