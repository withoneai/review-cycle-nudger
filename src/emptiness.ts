import { normalizeLine, type Policy } from "./config.js";
import type { Review, Verdict } from "./types.js";

/**
 * Words the manager actually wrote: every line of the review page that is
 * not a heading and not one of the template's own prompt lines. This is the
 * whole definition of "empty", and it is code, not a judgment call. The
 * Status column is deliberately not trusted on its own, because "Drafting"
 * is what a manager sets when they open the page, not when they write in it.
 */
export function managerWords(markdown: string, templateLines: string[]): number {
  const template = new Set(templateLines);
  let words = 0;
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (template.has(normalizeLine(line))) continue;
    words += normalizeLine(line).split(" ").filter(Boolean).length;
  }
  return words;
}

export function daysBetween(fromIso: string, toYmd: string): number {
  const from = Date.UTC(...ymd(fromIso.slice(0, 10)));
  const to = Date.UTC(...ymd(toYmd));
  return Math.round((to - from) / 86_400_000);
}

function ymd(s: string): [number, number, number] {
  const [y, m, d] = s.split("-").map(Number);
  return [y, m - 1, d];
}

export function classify(review: Review, policy: Policy, now: Date): Verdict {
  if (review.status.toLowerCase() === "submitted") return { kind: "submitted" };
  const daysLeft = daysBetween(now.toISOString(), review.due);
  if (daysLeft > policy.windowDays) return { kind: "not-due", daysLeft };
  const words = managerWords(review.reviewMarkdown, policy.templateLines);
  if (words >= policy.startedAtWords) return { kind: "started", words };
  return { kind: "empty", words, daysLeft };
}
