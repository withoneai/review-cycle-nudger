import "dotenv/config";
import { readFileSync } from "node:fs";
import { One } from "@withone/sdk";

/**
 * Demo mode replays a recorded review cycle from fixtures/. It turns on two
 * ways: explicitly with --demo, or implicitly when the required keys are
 * absent. The implicit fallback is what makes a fresh clone runnable with
 * zero configuration: the same emptiness check, the same quote-verification
 * gate and the same Slack digest all run for real. Only the Notion reads and
 * the Claude call come from disk, and nothing is posted to Slack.
 */
const KEYS_PRESENT = Boolean(
  process.env.ONE_SECRET && process.env.ANTHROPIC_API_KEY && process.env.ONE_CONNECTION_NOTION && process.env.NOTION_REVIEWS_DATA_SOURCE_ID,
);

export const DEMO = process.argv.includes("--demo") || !KEYS_PRESENT;
export const DEMO_REASON = process.argv.includes("--demo") ? "--demo" : KEYS_PRESENT ? "" : "no keys in the environment";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
    console.error("Or run `npm start -- --demo` to replay the recorded cycle, no keys needed.");
    process.exit(1);
  }
  return value;
}

let client: One | undefined;
export function oneClient(): One {
  client ??= new One(required("ONE_SECRET"));
  return client;
}

export const connections = {
  notion: () => required("ONE_CONNECTION_NOTION"),
  slack: () => required("ONE_CONNECTION_SLACK"),
};

export const reviewsDataSourceId = () => required("NOTION_REVIEWS_DATA_SOURCE_ID");
export const slackConfigured = () => Boolean(process.env.ONE_CONNECTION_SLACK && process.env.SLACK_CHANNEL);
export const slackChannel = () => required("SLACK_CHANNEL");

/** Property names on the reviews data source. Defaults match the template in the README. */
export const PROPS = {
  employee: process.env.PROP_EMPLOYEE || "Employee",
  manager: process.env.PROP_MANAGER || "Manager",
  status: process.env.PROP_STATUS || "Status",
  due: process.env.PROP_DUE || "Due",
  goalsDoc: process.env.PROP_GOALS_DOC || "Goals doc",
};

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

export function loadFixture(relPath: string): unknown {
  const url = new URL(`../fixtures/${relPath}`, import.meta.url);
  try {
    return JSON.parse(readFileSync(url, "utf8"));
  } catch {
    throw new Error(`No fixture at fixtures/${relPath}.`);
  }
}

export function loadPolicy(): string {
  return readFileSync(new URL("../config/cycle.md", import.meta.url), "utf8");
}

export interface Policy {
  windowDays: number;
  startedAtWords: number;
  templateLines: string[];
}

/** The numbers and template lines are parsed out of config/cycle.md so that file stays the single source. */
export function parsePolicy(text = loadPolicy()): Policy {
  const num = (label: string) => {
    const m = text.match(new RegExp(`^${label}:\\s*(\\d+)`, "mi"));
    if (!m) throw new Error(`config/cycle.md is missing a "${label}: <number>" line.`);
    return Number(m[1]);
  };
  const section = text.split(/^## Template lines\s*$/m)[1]?.split(/^## /m)[0] ?? "";
  const templateLines = section
    .split("\n")
    .filter((l) => l.trim().startsWith("- "))
    .map((l) => normalizeLine(l.trim().slice(2)));
  return { windowDays: num("Nudge window"), startedAtWords: num("Started at"), templateLines };
}

/** Lowercase, markdown punctuation stripped, whitespace collapsed. Used for template matching. */
export function normalizeLine(line: string): string {
  return line
    .replace(/[#*_>`]/g, "")
    .replace(/^\s*[-+]\s+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
