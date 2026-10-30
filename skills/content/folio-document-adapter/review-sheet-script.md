---
name: review-sheet-script
description: >
  Build, install and reuse the Google Apps Script that keeps a public-comment
  review sheet's links and joined columns current (Tool `review-sheet-sync`):
  comment numbers, sections, pages and lines link into the frozen review
  draft, and Review Change Sets joins its comments. Use when setting up the
  review sheet for a document's public comment, when its links are missing or
  stale, or after a tab, header, anchor or draft link changes.
---

# The review sheet's Apps Script

The sheet itself, its tabs and who writes each column are the
[`public-comment`](public-comment.md) skill's (§"The live review sheet").
This skill is the script that keeps that sheet's links current, and the Tool
`review-sheet-sync` that builds it.

Links inside a cell's text (a section, a page, a "No. n" in a joined column)
cannot come from a formula: a formula makes at most one link per cell. They
are rich text, and rich text goes stale the moment the sheet changes. So the
sheet keeps them itself, with a Google Apps Script bound to it (owner,
2026-10-30: "Apps Script in the sheet"). Never paste them by hand from an
agent: it costs about 30 kB of tool output per 30 rows, and the next edit
undoes it.

**What it keeps current.** Columns are found by header text, so people may
move them.

| tab | column | becomes |
|---|---|---|
| Review Public Comments | No. | a link to the comment's page (`commentUrl` + its ref from Agent's *Comment ref*) |
| Review Public Comments | Sections | each section number, appendix, named section or chapter links to its first page in the draft |
| Review Public Comments | Page | each printed page or range links to that page |
| Review Public Comments | Line no(s) / Table / Figure | each `p.N` and each `line(s) N–M` / `L N` links to its page. Draft line numbers restart, so a line is placed on the page, near the row's own pages, whose numbered lines hold it |
| Review Change Sets | Sections, Pages | the union over the change-set's comments, sorted by page, each linked |
| Review Change Sets | Public Comments | `No. n (Status) · comment`, status in bold, joined by a blank line |
| Review Change Sets | Suggested Revisions, PC Architect Feedback, Dispositions | `No. n · text`, one per comment |

Every `No. n` in Review Change Sets links to `#gid=<Review Public Comments>&range=A<row>`.
Do not link to a named range by `#rangeid=`: Sheets shows "Invalid range"
for a named range whose id was set through the API.

**Build it.** From the folio's repository root, with the platform mounted:

```sh
bun run folio-assistant-core/tools/review-sheet-sync/build-review-sheet-script.ts --repo . --out Code.gs
```

`Code.gs` is not committed. It is rebuilt from the config, so attach it to
the thread or hand it over directly.

**Install it, once per sheet.** A person does this, from the sheet owner's
account, because Google asks the owner to authorise the script:

1. Open the sheet, then **Extensions → Apps Script**.
2. Replace everything in `Code.gs` with the built file, and save.
3. In the function list beside **Run** and **Debug**, pick
   **installTriggers** (not `onOpen`, which only adds the menu), and press
   **Run**. Allow access when asked.
4. Reload the sheet. A **Review links** menu appears.

`installTriggers` runs a full refresh, then installs two triggers: every edit
of the three tabs marks the sheet dirty, and every five minutes a dirty sheet
is rebuilt. **Review links → Refresh now** rebuilds at once.

**How to tell it works.** The first run of `installTriggers` takes about 20
seconds for 800 rows and its execution log ends "Execution completed" (a
one-second run means `onOpen` was picked). Then No. is a blue link, and
hovering a `No. n` on Review Change Sets shows a row such as A327. Failed
runs are listed with their error under **Executions** (the clock icon) in the
Apps Script editor. An agent checks from outside by reading a No. cell's
formula (`=HYPERLINK(…)`) and a joined cell's text-format runs.

**Protected columns.** The script runs as the account that installed it, so
it writes the grey and green columns even when they are protected, as long as
that account is an editor of the protected ranges. Install it from the
owner's account.

**Reuse it for another document's public comment.** Nothing in the template
names a document. Give the new folio:

1. The frozen review version in `library/<slug>/`, with its
   `pdf-line-map.json`, and the folio's `review-anchors.json` (the extraction
   described in `public-comment` §"The one fact everything rests on" makes both).
2. A `draft/` redirect on its site to the library viewer, or use the full
   viewer address as `draftUrl`.
3. `review/public-comment/sheet-sync.json`:

   ```json
   {
     "anchors": "folio/<doc>/review-anchors.json",
     "lineMap": "library/<slug>/pdf-line-map.json",
     "draftUrl": "https://<site>/draft/#page=",
     "commentUrl": "https://<site>/en/folio-assistant-core/public-comments/folio/<doc>/index.html#",
     "namedSections": { "CR": "Client Registry" },
     "aliases": { "how to use the guidance": "How to use this guidance" },
     "tabs": { "RPC": "Review Public Comments" },
     "columns": { "rpc": { "lines": "Line no(s) / Table / Figure" } }
   }
   ```

   `namedSections` lists the unnumbered sections reviewers cite by name, and
   their abbreviations, which are matched only in capitals. `aliases` gives
   other names for front-matter chapters. `tabs` and `columns` override the
   defaults in `build-review-sheet-script.ts` only where the new sheet's
   headers differ. The printed-to-PDF offset and the last printed page are
   read from the line map.
4. A sheet with the tabs above, Agent's *No.*, *Comment ref* and
   *Change-sets* columns filled, then build and install as above.

**Rebuild and paste again** when the review anchors change, the draft link
moves, or a tab or a header the script reads is renamed. Renaming a header
the script reads, without rebuilding, leaves that column unlinked; it fails
nothing.
