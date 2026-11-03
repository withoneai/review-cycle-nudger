import * as slack from "@withone/sdk/slack";
import { connections, oneClient, slackChannel } from "./config.js";
import type { VerifiedNudge } from "./types.js";

const MARK = { hit: "hit", partly: "partly", missed: "missed", unclear: "unclear" } as const;

/** The message one manager would get, assembled only from verified pieces. */
export function nudgeText(n: VerifiedNudge): string {
  const lines = [n.opener || `${n.reports.length} of your reviews are still empty.`];
  for (const r of n.reports) {
    lines.push("", `*${r.review.employee}* (due ${r.review.due}, ${r.words} words so far): ${r.review.url}`);
    if (r.evidence.length) {
      for (const e of r.evidence) lines.push(`• ${e.goal} [${MARK[e.landed]}]: "${e.quote}"`);
    } else if (!r.review.goalsDocUrl) {
      lines.push("• No goals doc is linked on this review.");
    }
    if (r.startHere) lines.push(`Start here: ${r.startHere}`);
  }
  return lines.join("\n");
}

/**
 * One digest to the people-ops channel, not one DM per manager. The person
 * who owns the cycle reads the drafted nudges and forwards the ones they
 * agree with. Nothing reaches a manager without a human passing it on.
 */
export function digestText(nudges: VerifiedNudge[], deadlineLabel: string): string {
  const total = nudges.reduce((n, x) => n + x.reports.length, 0);
  const parts = [`*Review cycle: ${total} review(s) still empty, ${deadlineLabel}*`, "Drafted nudges below, one per manager. Forward the ones you agree with."];
  for (const n of nudges) parts.push("", "────────", `*To ${n.manager}*${n.managerEmail ? ` (${n.managerEmail})` : ""}`, nudgeText(n));
  return parts.join("\n");
}

export async function postDigest(text: string): Promise<void> {
  const res = await oneClient()
    .connection(connections.slack())
    .run(slack.sendMessageChannelChatPostmessage({ body: { channel: slackChannel(), text } }));
  const data = res.data as { ok?: boolean; error?: string };
  if (data?.ok === false) throw new Error(`Slack rejected the message: ${data.error}`);
}
