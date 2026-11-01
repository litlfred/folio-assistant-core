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

The poll wakes the watcher thread every minute. Until the tool says
`changed`, the watcher only reads, runs the tool and does the stall pass
("Every poll", below). It does not otherwise reason about the rows.

## Each wake

1. **Read** two small ranges (Q-WATCH4 A, owner 2026-11-01 10:36Z):
   - `Watch!F1:I1`, where the sheet script writes `Cells hash`, the hash
     itself, and the time it last checked. The script rewrites it on every
     refresh and every timer tick, from the cells people set.
   - Contributor Feedback's header row with its Change-set and Issue
     columns (A to K), so the tool can give a new row the next Change-set id.

   Save the values as JSON, with the header row and with an empty first row
   for each sheet row above it, so the row numbers stay the sheet's. A sheet
   whose script has no Watch tab yet is read whole, from row 1, and gets no
   `--sheet-hash`.
2. **Check**:

   ```
   bun run folio-assistant-core/tools/review-log-watch/watch.ts \
     --repo litlfred/dth-phc --sheet values.json \
     --state ~/.cache/review-log-watch/<sheet-id>.json \
     --sheet-hash <Watch!G1>
   ```

   - Exit 0 is `{"status":"unchanged"}`. Do the stall pass (below), then
     stop. The next wake was queued first.
   - Exit 10 is `changed`. The output has `changes` (an issue opened, updated
     or closed, or a cell's old and new text) and `append`.
3. **Append** each `append[].row` below the last row of Contributor Feedback.
   The row is already lined up with the header:
   - **Change-set:** the next id, also in `append[].agent.csId`.
   - **Title:** the issue's title.
   - **First Contributor Feedback column:** `@login (#N): first paragraph`.
   - **Issue:** the issue's URL.

   The issue's Markdown is turned into plain cell text: a `[label](url)`
   shows its label, and bold, italic and code marks are dropped. Its links
   are in `append[].links` (the column and each link's start, end and URL).
   Write the cell with those as `textFormatRuns` (`updateCells`), so each
   link is clickable (owner, 2026-11-01 10:51Z: "shiud be links").

   Then write `append[].agent` to the **Agent** tab as a new row: its
   Change-set and Issue columns. The script fills Contributor Feedback's
   Issue column from the Agent tab, by Change-set, on every refresh. An
   Issue written only on Contributor Feedback is cleared on the next refresh,
   which is how every issue link vanished from the four DTH logs on
   2026-11-01 15:30Z.

   Every other cell stays empty. This tool is the only thing that adds issue
   rows, so nobody adds them by hand.
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

## Every poll: hand new feedback on, and catch stalled rows

The owner's rule, 2026-11-01 21:08Z: "when new feedback check if current
agent is still working and provide it to them. if not try and pick up", and
"agent should also watch for stalled and restart as needed". DTH-HRH CS-007
showed why: a contributor wrote twice in their column, and the agent working
the row never heard of it, because nothing passed it on.

This pass runs on **every** poll, changed or not, after the check:

1. **New feedback goes to the row's agent.** For each row whose Blue cells
   changed, find the thread that owns it: the one named in its Agent row or
   its Feedback (agent) cell, or else ask the coordinator. Send it the new
   text verbatim, with the CS id, the cell and the time. Then write in
   Feedback (agent) who has it and what happens next, so the contributor sees
   at once that it was heard.
2. **Find stalled rows.** A row is stalled when
   - its Blue cells changed, or Ready for agent turned Yes, more than
     **10 minutes** ago, and no Agent step has been recorded since; or
   - its agent has recorded no step for **2 hours** while the row is open.
3. **Restart or take over.** Ask the owning thread once. If it gives no
   answer within 10 minutes, or it is done or stopped, take the row over
   yourself, or ask the coordinator for a new thread. Either way, write the
   new owner, its current step and a link into Feedback (agent).

A row whose agent is working, but that shows nothing new, is not stalled:
say what it is doing in Feedback (agent), with links to its pull requests,
so the row stops looking stuck.

## What counts as a change

- **Issues:** the repository's issues, open and closed, with their state and
  `updated_at`. `--author <login>` keeps only the issues one person opened.
  - Pull requests are left out.
  - So are issues labelled `no-sheet`, which an Editor sets to keep an issue
    off the sheet.
- **Cells:** with `--sheet-hash`, the script's hash stands for them, and a
  change shows as one change on `#hash`; the watcher then reads the rows to
  see which changed. Without it, the tool compares the cells itself. Either
  way, only the cells people set count, under these headers:
  - Title, Selected Sections, every Contributor Feedback column, and
    Disposition (Blue);
  - Ready for agent, Ready for merge and Dispositions confirmed (Orange).

  The agent's Green columns and the script's Grey ones are not watched, so
  the watcher's own writes never wake it.
- **First check (`baseline: true`):** with no state file yet, every issue
  counts as new and every unlinked issue gets a row. This is how an existing
  sheet takes in its existing issues. The watcher appends the rows, hides the
  closed ones and accepts, but starts no agent pass, because a cell that is
  merely seen for the first time has not changed.

## Setting up a watcher

A log is not set up until a watcher has both of these wakes:

- a chain of **1-minute** delayed wakes (`send_later`), each of which queues
  the next before it reads anything (owner, 2026-11-01 19:47Z: every minute,
  never skipping a poll during long work; it was 3 minutes from 10:20Z). A
  `send_later` fires once, so a wake that does not queue the next ends the
  chain;
- an hourly scheduled task that restarts the chain if it breaks.

Keep the state file outside the repository, one per sheet. Without it, a fresh
container treats its first check as a first check: it reports every issue as
opened, and appends rows only for issues that no row links yet.

## Limits

- The tool reads one tab and one repository, from the issues API (up to 100
  issues a page, every page). It never writes the sheet or
  GitHub.
- The summary is the issue's first paragraph, cut to 300 characters. A link
  the cut runs through keeps its target on the part that is left.
  Committee members may rewrite the Title and their own column.
