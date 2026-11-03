<h3 align="center">Review Cycle Nudger</h3>
<p align="center">An AI agent that finds the performance reviews still empty a few days before the deadline, reads each report's own goals doc in Notion, and drafts the nudge each manager should get: how every goal landed, quoted from the doc, so the first paragraph is half written before they open the page.<br />Built on <a href="https://withone.ai">One</a>. It never messages a manager. One digest goes to your people-ops channel in Slack, and a human forwards what they agree with.</p>

<p align="center">
  <a href="https://withone.ai"><strong>Website</strong></a>
  &nbsp;·&nbsp;
  <a href="https://withone.ai/docs"><strong>Docs</strong></a>
  &nbsp;·&nbsp;
  <a href="https://app.withone.ai"><strong>Dashboard</strong></a>
</p>

---

## Run it (no keys needed)

```bash
git clone https://github.com/withoneai/review-cycle-nudger
cd review-cycle-nudger && npm install
npm start
```

With nothing configured it replays a recorded review cycle for a fictional nine-person team, and the same pipeline runs on it: the emptiness check, the quote check, the digest. The Claude step replays the output Claude actually returned for that cycle (`fixtures/nudges.json`, one real call, recorded 2026-11-03). Nothing is posted anywhere.

When you're ready for your own cycle: `cp .env.example .env`, fill it in, `npm run check` to prove Notion answers with the columns this reads, then `npm start -- --dry-run` to see the digest before anything is posted.

## What it does

1. **Reads every row of your reviews database in Notion**, one row per report: employee, manager, status, deadline, and a link to that person's goals doc. Each review page's own content is read as markdown.
2. **Decides "empty" in code, by counting words.** Headings and the template's own prompt lines (listed in `config/cycle.md`) do not count. Under 60 real words with the deadline inside 7 days is empty. The Status column is not trusted on its own: a review set to "Drafting" with nothing in it is still empty, and a "Submitted" one is never chased.
3. **Reads the goals doc for each empty review**, and only for those.
4. **Has Claude write the head start** for each report: every goal in the doc, whether it landed (hit, partly, missed, unclear), the sentence from the doc that shows it, and one line on where the manager could start. One call for the whole cycle.
5. **Checks every quote against the goals doc in code** (`src/gate.ts`). A quote that is not in the doc is dropped. A review the model forgot is still nudged, without a head start. A review id the model invented is ignored.
6. **Posts one digest to a Slack channel you choose**, one drafted message per manager. Nothing goes to a manager directly.

## Sample run (the demo cycle)

```
   Maya Chen        Dana Ortiz     Not started  0 words written, 4d left, EMPTY
   Leo Park         Dana Ortiz     Drafting     12 words written, 4d left, EMPTY
   Ana Silva        Dana Ortiz     Submitted    submitted, skip
   Sam Okafor       Raj Mehta      Drafting     0 words written, 4d left, EMPTY
   Priya Nair       Raj Mehta      Drafting     165 words written, started, skip
   Tom Becker       Ines Laurent   Not started  0 words written, 4d left, EMPTY
   Ruth Adeyemi     Ines Laurent   Not started  0 words written, 3d left, EMPTY
   Kenji Watanabe   Raj Mehta      Submitted    submitted, skip
   Elif Demir       Chris Wu       Not started  due in 17d, outside the 7-day window, skip

9 review(s): 2 submitted, 1 started, 1 not due yet, 5 empty inside the window

── to Raj Mehta
   Your review is due on 2026-11-07, and 1 is still empty. The one below has a head start taken from the goals doc.

   *Sam Okafor* (due 2026-11-07, 0 words so far): https://www.notion.so/tidewell/Sam-Okafor-H2-2026-review-rv04
   • Launch the clinic analytics dashboard [hit]: "Shipped to all clinics on Aug 18."
   • Booking page p95 load under 1.5s [partly]: "Now 2.1s, down from 3.4s."
   • On-call runbook for the booking service [missed]: "Not started."
   Start here: You could open with the analytics dashboard shipping to all clinics on Aug 18, then cover booking page load (now 2.1s, down from 3.4s, against a 1.5s target) and the runbook, which was not started.

3 manager(s), 5 review(s), 11 quote(s) verified against the goals docs, 0 dropped
```

Sam's review says "Drafting". It has zero words in it. That is the case the word count exists for.

## Set up your Notion

One database, one row per review. The column names below are the defaults; rename them in `.env` (`PROP_*`) if yours differ.

| Column | Type | Used for |
|---|---|---|
| (title) | Title | The review's name |
| Employee | Person or text | Who the review is about |
| Manager | Person | Who gets nudged (a Person column also gives the email) |
| Status | Status or select | Only "Submitted" matters: it is never chased |
| Due | Date | The deadline |
| Goals doc | URL or relation | That person's goals page for the cycle |

The review page body is the review itself. Put your template's prompt lines in `config/cycle.md` so they never count as the manager's words.

## What you need

- A free [One account](https://app.withone.ai) with Notion and Slack connected
- An [Anthropic API key](https://platform.claude.com)
- Node 20+

## What it costs

One Claude call per run, whatever the size of the cycle. The recorded demo call (5 empty reviews, 4 goals docs) was 6,071 input and 2,038 output tokens on `claude-opus-5-5`, about $0.09. Notion is one query per 100 reviews plus one page read per review and per goals doc. Slack is one message.

## What it does not do

- It does not DM managers. The digest goes to one channel and a human decides what to forward. Wiring direct messages is a few lines in `src/slack.ts`, and we left it out on purpose.
- It does not write the review, suggest a rating, or judge anyone's performance. The quotes are checked; the one-line "start here" suggestion is not, so read it as a suggestion.
- It does not understand goals that live outside the linked doc (OKR tools, spreadsheets, someone's head). No doc means no head start, and the digest says so.
- "Empty" is a word count. A manager who pasted 80 words of notes to themselves counts as started.
- It does not track whether a nudge worked. Run it again the next day and the reviews that got written drop out on their own.

## License

MIT
