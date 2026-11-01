---
name: review-log-watch
description: >
  Poll a drafting review log (a Contributor Feedback sheet) and its folio
  repository's issues mechanically, with Tool `review-log-watch`, and
  start agent work only when a cell people set or an open issue changed.
  Each issue that no row links yet becomes a Contributor Feedback row, and a
  closed issue's row is hidden with its text struck through.
  Use on every wake of a review-log watcher, and when setting up a watcher
  for a new log.
---

# Review-log watch

A review log is a drafting sheet (skill
[`review-sheet-script`](review-sheet-script.md)) for one folio repository. A
watcher is the agent thread that keeps it moving. This skill is what the
watcher does on each wake. Process:
[`processes/content/review-log-watch.bpmn`](../../../processes/content/review-log-watch.bpmn)
(checklist beside it).

## Why mechanical (owner, 2026-11-01)

"watch agents should look for new issues and update google sheets with
summary … this one should be mechanical skill run on same polling that kicks
of watcher agent review … should not trigger any agentic activity unless a
change to google sheet or issues … make sure fully documented as
tools/skills/processes".

The owner's answers:

- **Q-WATCH1 B.** The watcher runs a core tool on every poll.
- **Q-WATCH2 B.** Each issue gets a row on Contributor Feedback.
- **10:18Z.** "current google sheets should be reviewed to add in existing
  issues. if issue is closed it correpsonds to hidden row that text has line
  through it/hidden".

The poll still wakes the watcher thread once a minute. Until the tool says
`changed`, though, the watcher only reads and runs the tool. It does not
reason about the rows, edit anything or post anything.

## Each wake

1. **Read** the Contributor Feedback tab from row 1, so the header row (first
   cell `Change-set`) is included, and save the values as JSON.
2. **Check**:

   ```
   bun run folio-assistant-core/tools/review-log-watch/watch.ts \
     --repo litlfred/dth-phc --sheet values.json \
     --state ~/.cache/review-log-watch/<sheet-id>.json
   ```

   - Exit 0 is `{"status":"unchanged"}`. Queue the next wake and stop.
   - Exit 10 is `changed`. The output has `changes` (an issue opened, updated
     or closed, or a cell's old and new text) and `append`.
3. **Append** each `append[].row` below the last row of Contributor Feedback.
   The row is already lined up with the header:
   - **Title:** the issue's title.
   - **First Contributor Feedback column:** `@login (#N): first paragraph`.
   - **Issue:** the issue's URL.

   Every other cell stays empty. The script assigns the Change-set id. This
   tool is the only thing that adds issue rows, so nobody adds them by hand.
   A row with `closed: true` is appended like the others and then treated as
   in step 4.
4. **Closed issues.** Hide each row in `closedRows`, plus the rows just
   appended for closed issues, and strike its text through. Hiding and
   striking are formatting only, so the row's text and history stay. A
   reopened issue's row is shown again, without the strike-through, by hand.
5. **Agent pass.** Run [Contributor feedback](../../../processes/content/contributor-feedback.bpmn)
   on each changed row, and record the step on the Agent tab at once. A new
   row gets a proposal. A Ready for agent = Yes gets its edit, and a Ready for
   merge = Yes gets its merge. A Blue answer to a Decision needed question is
   taken up.
6. **Accept.** Run the check again with the same inputs plus `--accept`, so
   the state file records what was handled. A row the pass could not finish
   still differs from the stored state, so it comes back on the next wake.
7. Queue the next wake.

## What counts as a change

- **Issues:** the repository's issues, open and closed, with their state and
  `updated_at`. `--author <login>` keeps only the issues one person opened.
  - Pull requests are left out.
  - So are issues labelled `no-sheet`, which an Editor sets to keep an issue
    off the sheet.
- **Cells:** only the ones people set, under these headers:
  - Title, Selected Sections, every Contributor Feedback column, and
    Disposition (Blue);
  - Ready for agent, Ready for merge and Dispositions confirmed (Orange).

  The agent's Green columns and the script's Grey ones are not watched, so
  the watcher's own writes never wake it.
- **First check:** with no state file yet, every issue counts as new, and
  every unlinked issue gets a row. This is how an existing sheet takes in its
  existing issues.

## Setting up a watcher

A log is not set up until a watcher has both of these wakes:

- a chain of **1-minute** delayed wakes (`send_later`), each of which queues
  the next;
- an hourly scheduled task that restarts the chain if it breaks.

Keep the state file outside the repository, one per sheet. Without it, a fresh
container treats its first check as a first check: it reports every issue as
opened, and appends rows only for issues that no row links yet.

## Limits

- The tool reads one tab and one repository, from the issues API (up to 100
  issues a page, every page). It never writes the sheet or
  GitHub.
- The summary is the issue's first paragraph, cut to 300 characters.
  Committee members may rewrite the Title and their own column.
