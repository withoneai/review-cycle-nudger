import { DEMO, parsePolicy, slackConfigured } from "./config.js";
import { probeNotion } from "./notion.js";

/** Proves the run will work before you rely on it: the policy parses, and (live only) Notion answers with the expected columns. */
let failed = false;
try {
  const p = parsePolicy();
  console.log(`✓ config/cycle.md parses: nudge window ${p.windowDays} days, started at ${p.startedAtWords} words, ${p.templateLines.length} template line(s)`);
  if (p.templateLines.length === 0) console.log("! no template lines listed, so template prompts will count as the manager's words");
  if (DEMO) {
    console.log("\nNo keys in the environment, so no connection was probed.");
    console.log("This clone will run `npm start` in demo mode: recorded cycle, real pipeline.");
  } else {
    const { rows, missing } = await probeNotion();
    console.log(`✓ Notion answers (${rows} row(s) seen on the reviews data source)`);
    if (missing.length) throw new Error(`the reviews data source has no column named: ${missing.join(", ")} (set PROP_* in .env)`);
    console.log(slackConfigured() ? "✓ Slack connection and channel are set" : "! Slack not configured, the digest will print instead of posting");
  }
} catch (err) {
  console.error(`✗ ${err instanceof Error ? err.message : err}`);
  failed = true;
}
process.exit(failed ? 1 : 0);
