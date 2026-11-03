export interface Review {
  id: string;
  title: string;
  employee: string;
  manager: string;
  managerEmail: string | null;
  status: string;
  due: string; // YYYY-MM-DD
  url: string;
  goalsDocUrl: string | null;
  reviewMarkdown: string;
  goalsMarkdown: string | null; // null when the review row links no goals doc
}

export type Verdict =
  | { kind: "submitted" }
  | { kind: "not-due"; daysLeft: number }
  | { kind: "started"; words: number }
  | { kind: "empty"; words: number; daysLeft: number };

export interface FlaggedReview {
  review: Review;
  words: number;
  daysLeft: number;
}

/** What the model returns. Nothing here is trusted until src/gate.ts has checked it. */
export interface GoalEvidence {
  goal: string;
  landed: "hit" | "partly" | "missed" | "unclear";
  quote: string; // must appear verbatim in that report's goals doc
}

export interface ReportHeadStart {
  reviewId: string;
  startHere: string;
  evidence: GoalEvidence[];
}

export interface ManagerNudge {
  manager: string;
  opener: string;
  reports: ReportHeadStart[];
}

export interface NudgeDraft {
  nudges: ManagerNudge[];
}

export interface VerifiedReport {
  review: Review;
  daysLeft: number;
  words: number;
  startHere: string;
  evidence: GoalEvidence[];
  droppedQuotes: GoalEvidence[];
}

export interface VerifiedNudge {
  manager: string;
  managerEmail: string | null;
  opener: string;
  reports: VerifiedReport[];
}
