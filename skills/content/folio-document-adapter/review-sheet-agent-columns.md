---
name: review-sheet-agent-columns
description: >
  Whenever an agent works on a change set of a folio whose review sheet is
  kept by the Tool `review-sheet-sync`, it writes the Agent tab's columns for
  that change set and its comments as it goes: status, what it did, the PR,
  the staging page, what the PR changed and when it finished. Use on every
  change-set edit, draft, PR, push, merge or close, in a sheet sync or not.
---

# Keep the review sheet's Agent columns current

The owner's rule, 2026-10-31: "if agent works on a CS via google sheet Tool
is enabled for PC, then it updates the necessary columns". It is part of the
process, not a courtesy at the end. The sheet's views (Agentic status and
Staging review page on Review Public Comments and Review Change Sets) are
built from the Agent tab, so a change set worked without writing Agent shows
reviewers nothing.

The tabs and who writes each column are the [`public-comment`](public-comment.md)
skill's (§"The live review sheet"). The script that turns Agent into the
views is [`review-sheet-script`](review-sheet-script.md). This skill says
**when** the agent writes Agent and **what**.

## When it applies

The folio has the Tool enabled: it carries the Tool's config,
`review/public-comment/sheet-sync.json` (a drafting sheet:
`review/drafting/sheet-sync.json`), and the session can reach the sheet
through a Google Sheets connector. The sheet's id is not in the repository;
it is given by the project (its scheduled sheet-sync task, or the owner).

It applies to **any** work on a change set, however it started: a sheet
sync, a card, a thread message, an issue or a review comment on the PR. If
the Tool is enabled but the sheet cannot be reached, do the work, and say in
the reply that the sheet was not updated and why.

## When to write

Write as each step completes, not once at the end:

| step | Agent, per comment row (A–H) | Agent, per change-set row (I–N) |
|---|---|---|
| work starts | Agentic status *Working* | |
| PR opened, or a push to it | *PR open*; action taken, applied in, handled by, date actioned | Pull request, Staging review page, What the PRs changed, Agent completed |
| blocked on a decision | *Needs human*, and what is needed in action taken | |
| ready for review | *Ready for review* | Agent completed |
| merged | *Change merged* | clear the staging page (a merged branch's preview 404s) |
| closed unmerged | *Not started*, and say so in action taken | remove that PR's line from K, M and N |

## What to write

- **Re-read the headers first.** People move columns. Find each column by its
  header, never by a letter remembered from an earlier run.
- **Write only the Agent tab.** Every other tab is people's, or formulas, or
  the Apps Script's. The one exception is an explicit instruction from the
  owner for a named cell, such as setting Ready for agent on named rows.
- **Per comment row** (every PC in the change set): Agentic status; Agentic
  action taken (what was done, in a sentence); Agentic applied in (the
  sections or blocks changed); Agentic handled by (the agent and its
  session); Agentic date actioned (`YYYY-MM-DD HH:MMZ`, UTC).
- **Per change-set row:** Pull request (one PR URL per line); Staging review
  page (`STAGING/<slug>/en/review/` while the PR is open); What the PRs
  changed (one line per PR, in the same order as the URLs: what that PR
  changes in the document, in a reader's words); Agent completed (one UTC
  time per PR, same order). A change set may have several PRs, and a line in
  M or N always matches the line of its URL in K.
- **Append, never reorder.** A change set new to Agent goes at the end of
  I–N. Review Change Sets' typed columns sit beside rows derived from I, so
  moving a row moves people's inputs onto the wrong change set.
- **No reviewer names or emails** anywhere the agent writes, in the sheet or
  in the repository. Name feedback by tab, row and column header.
- **Only a PR that edits the document** for the change set goes in Pull
  request (public-comment §"Which PR counts").

## Checking it

After writing, read the change set's row on Review Change Sets back. Once
the Apps Script has refreshed (within five minutes of an edit), its Agentic
status shows `<repo>#n (status, completed) · what it changed` for each PR. A
missing or wrong line there means an Agent cell is missing or out of step.
