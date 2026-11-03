import type { FlaggedReview, NudgeDraft, VerifiedNudge } from "./types.js";

/** Whitespace, curly quotes and markdown emphasis are not evidence of anything; ignore them when matching. */
export function normalizeQuote(s: string): string {
  return s
    .replace(/[*_`]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * The model proposes, this file decides what stands.
 *
 * - A report the model names must be one of the reviews the code flagged as
 *   empty, for that same manager. Anything else is dropped.
 * - Every quote must appear verbatim in that report's own goals doc. One that
 *   does not is removed and kept aside in `droppedQuotes`, because a nudge
 *   that tells a manager their report "hit the renewal target" on the basis of
 *   a sentence nobody wrote is worse than no head start at all.
 * - A report with no goals doc keeps no evidence, whatever the model said.
 * - A flagged review the model forgot is still nudged, with no head start:
 *   the reminder is code's job, the head start is the model's.
 */
export function gate(draft: NudgeDraft, flagged: FlaggedReview[], goals: Map<string, string | null>): VerifiedNudge[] {
  const byId = new Map(flagged.map((f) => [f.review.id, f]));
  const out = new Map<string, VerifiedNudge>();

  const nudgeFor = (manager: string) => {
    let n = out.get(manager);
    if (!n) {
      const first = flagged.find((f) => f.review.manager === manager)!;
      n = { manager, managerEmail: first.review.managerEmail, opener: "", reports: [] };
      out.set(manager, n);
    }
    return n;
  };

  for (const proposed of draft.nudges) {
    for (const r of proposed.reports) {
      const f = byId.get(r.reviewId);
      if (!f || f.review.manager !== proposed.manager) continue; // not a review we flagged, or the wrong manager
      if (nudgeFor(f.review.manager).reports.some((x) => x.review.id === f.review.id)) continue; // cited twice
      const doc = goals.get(f.review.id);
      const haystack = doc ? normalizeQuote(doc) : "";
      const evidence = [];
      const droppedQuotes = [];
      for (const e of r.evidence) {
        const q = normalizeQuote(e.quote);
        if (doc && q.length >= 8 && haystack.includes(q)) evidence.push(e);
        else droppedQuotes.push(e);
      }
      const n = nudgeFor(f.review.manager);
      if (!n.opener) n.opener = proposed.opener;
      n.reports.push({ review: f.review, daysLeft: f.daysLeft, words: f.words, startHere: r.startHere, evidence, droppedQuotes });
    }
  }

  for (const f of flagged) {
    const n = nudgeFor(f.review.manager);
    if (!n.reports.some((x) => x.review.id === f.review.id)) {
      n.reports.push({ review: f.review, daysLeft: f.daysLeft, words: f.words, startHere: "", evidence: [], droppedQuotes: [] });
    }
  }

  for (const n of out.values()) n.reports.sort((a, b) => a.daysLeft - b.daysLeft || a.review.employee.localeCompare(b.review.employee));
  return [...out.values()].sort((a, b) => a.manager.localeCompare(b.manager));
}
