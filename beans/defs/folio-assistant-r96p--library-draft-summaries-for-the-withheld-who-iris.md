---
# folio-assistant-r96p
title: 'LIBRARY: draft summaries for the withheld who-iris entries (0/121, 0/250)'
status: todo
type: task
created_at: 2026-10-01T18:43:35Z
updated_at: 2026-10-01T18:43:35Z
parent: folio-assistant-slw1
---

Issue #1794 (follow-up to PR #1818, which only fixed the viewer).

## Why
The owner ruled on 2026-10-01 (option 1 of 4) that a WITHHELD library entry's rows show the section's summary when one exists, and otherwise "Withheld — copyright not granted" with a link to the catalogue record. Drafting the summaries was explicitly NOT part of that change. Measured at PR #1818: who-iris `who-pub-tps-931` has 0 of 121 sections summarised and `9789241548960-eng` has 0 of 250 (243 prose, 7 empty), so every row reads "Withheld". The banner reports the count.

## What
Drain the summary queue for the withheld entries with the existing machinery (library-ingestion skill, "Summarising prose blocks"): `bun run cat summaries:next -- --n 5 --entry <slug>`, then `bun run cat summaries:record`. Do it a few blocks at a time. A summary is 1–3 sentences in your own words and must never quote the refused text: the summary is published even though the text is not.

## Done when
- Both withheld entries have draft summaries for their prose blocks. The viewer banner then reads "N of M sections summarised" with N > 0.
- A no-leak check passes: grep the generated `cat-harness/docs/assets/library/entries/<slug>.json` for sentences from the entry's sections and find none outside the summaries.


## Progress 2026-10-10 (bean-backlog drain, lane C): drafts done, no-leak check not yet run

Measured on `litlfred/who-iris` main, where the library lives after the
separation:
- `library/who-pub-tps-931/summaries.json` has **121** draft narratives.
- `library/9789241548960-eng/summaries.json` has **243** draft narratives.

So Done-when item 1 (N > 0) is met for both entries.

**Item 2 is not met yet.** The no-leak check needs the GENERATED viewer JSON
(`docs/assets/library/entries/<slug>.json`), which is built at deploy and not
committed in who-iris. A proxy was run over the summaries themselves: does any
narrative carry a verbatim 10-word run from its sections?
- who-pub-tps-931: 0 of 121.
- 9789241548960-eng: 13 of 243. Each is a short quoted phrase, e.g. "for
  derivative products such as summaries algorithms or wall charts".

Quoting inside a summary is allowed by the criterion ("none outside the
summaries"), so this is no leak. It is noted because it is the closest thing
measurable without a build. Close this bean once the grep runs on a built site.
