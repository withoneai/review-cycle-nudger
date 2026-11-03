import * as notion from "@withone/sdk/notion";
import { DEMO, PROPS, connections, loadFixture, oneClient, reviewsDataSourceId } from "./config.js";
import type { Review } from "./types.js";

const notionConn = () => oneClient().connection(connections.notion());

const MARKDOWN_CHAR_LIMIT = 8000;

type Props = Record<string, { type?: string; [k: string]: unknown }>;

function text(prop: unknown): string {
  const p = prop as { type?: string; title?: { plain_text?: string }[]; rich_text?: { plain_text?: string }[] } | undefined;
  const parts = p?.type === "title" ? p.title : p?.type === "rich_text" ? p.rich_text : undefined;
  return (parts ?? []).map((t) => t.plain_text ?? "").join("").trim();
}

function titleOf(props: Props): string {
  for (const v of Object.values(props)) if (v?.type === "title") return text(v) || "(untitled)";
  return "(untitled)";
}

function person(prop: unknown): { name: string; email: string | null } | null {
  const p = prop as { type?: string; people?: { name?: string; person?: { email?: string } }[] } | undefined;
  if (p?.type === "people" && p.people?.length) {
    return { name: p.people[0].name ?? "(unnamed)", email: p.people[0].person?.email ?? null };
  }
  const t = text(prop);
  return t ? { name: t, email: null } : null;
}

function statusOf(prop: unknown): string {
  const p = prop as { type?: string; status?: { name?: string } | null; select?: { name?: string } | null } | undefined;
  return p?.status?.name ?? p?.select?.name ?? "";
}

function dateOf(prop: unknown): string | null {
  const p = prop as { date?: { start?: string } | null } | undefined;
  return p?.date?.start?.slice(0, 10) ?? null;
}

/** The goals doc can be a URL property or a relation to another page. Either way we need a page id. */
function goalsRef(prop: unknown): { pageId: string; url: string } | null {
  const p = prop as { type?: string; url?: string | null; relation?: { id?: string }[] } | undefined;
  if (p?.type === "relation" && p.relation?.[0]?.id) {
    const id = p.relation[0].id;
    return { pageId: id, url: `https://www.notion.so/${id.replace(/-/g, "")}` };
  }
  const url = p?.type === "url" ? p.url : text(prop);
  const id = url?.match(/([0-9a-f]{32})(?:\?|$)/i)?.[1];
  return url && id ? { pageId: id, url } : null;
}

async function pageMarkdown(pageId: string): Promise<string> {
  const res = await notionConn().run(notion.retrievePageAsMarkdown({ path: { pageId } }));
  const md = (res.data as { markdown?: string })?.markdown ?? "";
  return md.length > MARKDOWN_CHAR_LIMIT ? `${md.slice(0, MARKDOWN_CHAR_LIMIT)}\n\n[truncated]` : md;
}

interface FixtureReview {
  id: string;
  title: string;
  employee: string;
  manager: string;
  manager_email: string | null;
  status: string;
  due: string;
  url: string;
  goals_doc_url: string | null;
  review_markdown: string;
  goals_markdown: string | null;
}

const goalsIds = new Map<string, string>();

/**
 * Every row of the reviews data source, with the review page's own content as
 * markdown. Goals docs are not read here: only reviews that turn out to be
 * empty need one, so `goalsFor()` reads them on demand. In demo mode both come
 * from the recorded fixture.
 */
export async function listReviews(): Promise<{ reviews: Review[]; capturedAt: Date }> {
  if (DEMO) {
    const meta = loadFixture("notion/meta.json") as { captured_at: string };
    const raw = loadFixture("notion/reviews.json") as FixtureReview[];
    return {
      capturedAt: new Date(meta.captured_at),
      reviews: raw.map((r) => ({
        id: r.id,
        title: r.title,
        employee: r.employee,
        manager: r.manager,
        managerEmail: r.manager_email,
        status: r.status,
        due: r.due,
        url: r.url,
        goalsDocUrl: r.goals_doc_url,
        reviewMarkdown: r.review_markdown,
        goalsMarkdown: r.goals_markdown,
      })),
    };
  }

  const rows: { id: string; url?: string; properties?: Props }[] = [];
  let cursor: string | undefined;
  do {
    const res = await notionConn().run(
      notion.queryDataSourcesPages({
        path: { dataSourceId: reviewsDataSourceId() },
        body: { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) },
      }),
    );
    const data = res.data as { results?: typeof rows; has_more?: boolean; next_cursor?: string | null };
    rows.push(...(data?.results ?? []).filter((r) => r.id));
    cursor = data?.has_more ? (data.next_cursor ?? undefined) : undefined;
  } while (cursor);

  const reviews: Review[] = [];
  for (const row of rows) {
    const props = row.properties ?? {};
    const manager = person(props[PROPS.manager]);
    const due = dateOf(props[PROPS.due]);
    if (!manager || !due) continue; // a row with no manager or no deadline cannot be nudged; skip it rather than guess
    const status = statusOf(props[PROPS.status]);
    const goals = goalsRef(props[PROPS.goalsDoc]);
    if (goals) goalsIds.set(row.id, goals.pageId);
    reviews.push({
      id: row.id,
      title: titleOf(props),
      employee: person(props[PROPS.employee])?.name ?? titleOf(props),
      manager: manager.name,
      managerEmail: manager.email,
      status,
      due,
      url: row.url ?? "",
      goalsDocUrl: goals?.url ?? null,
      // a submitted review is never nudged, so its content is never needed
      reviewMarkdown: status.toLowerCase() === "submitted" ? "" : await pageMarkdown(row.id),
      goalsMarkdown: null,
    });
  }
  return { reviews, capturedAt: new Date() };
}

/** The goals doc linked from a review row, as markdown, or null when there is none. */
export async function goalsFor(review: Review): Promise<string | null> {
  if (DEMO) return review.goalsMarkdown;
  const pageId = goalsIds.get(review.id);
  return pageId ? pageMarkdown(pageId) : null;
}

/** A cheap liveness probe for `npm run check`: the data source answers and has the properties we read. */
export async function probeNotion(): Promise<{ rows: number; missing: string[] }> {
  const res = await notionConn().run(
    notion.queryDataSourcesPages({ path: { dataSourceId: reviewsDataSourceId() }, body: { page_size: 1 } }),
  );
  const results = (res.data as { results?: { properties?: Props }[] })?.results;
  if (!Array.isArray(results)) throw new Error("Notion answered, but not with a list of rows.");
  const props = results[0]?.properties ?? {};
  const missing = results.length ? Object.values(PROPS).filter((p) => !(p in props)) : [];
  return { rows: results.length, missing };
}
