import { toolFactory } from "@litlfred/cat-harness-tools/schemas/tools/tool-folders.js";
import { defineTool } from "@litlfred/cat-harness-tools/schemas/tools/tool.js";

export default toolFactory((t) =>
  defineTool({
    id: "review-sheet-sync",
    title: "Build the review sheet's Apps Script",
    description:
      "Builds `Code.gs`, the Google Apps Script that keeps a public-comment review sheet's links and joins current: each comment No. links to its comment page, Sections, Page and Line no(s) link to the page of the frozen review draft, Review Change Sets joins its comments, suggested revisions, feedback and dispositions with each `No. n` linking to its row, and on both tabs Agentic status lists each pull request of the change-set, linked, with its status and what it changed, from the Agent tab. The script is the same for every review (`review-sheet.gs`); this Tool fills in one folio's data from its `review/public-comment/sheet-sync.json`, its review anchors and the draft's `pdf-line-map.json`. A person pastes the output into the sheet once (Extensions > Apps Script) and runs `installTriggers`; from then on the sheet rebuilds itself within five minutes of an edit, with no agent. With `\"mode\": \"drafting\"` in the config it builds the simpler drafting sheet instead: one Contributor Feedback tab where each row is a change set (ids assigned by the script), Sections picked from the document's table of contents and linked to it, and Issue and Agentic status from the Agent tab.",
    install: { service: "Google Apps Script bound to the review sheet: paste the built Code.gs once, run installTriggers" },
    invoke: { shell: "bun run folio-assistant-core/tools/review-sheet-sync/build-review-sheet-script.ts" },
    io: {
      inputs: [
        { name: "repo", schema: t("RepoPath"), required: false, arg: { flag: "--repo" }, description: "The folio repository. Default the current directory." },
        { name: "config", schema: t("RepoPath"), required: false, arg: { flag: "--config" }, description: "The folio's sheet settings. Default `review/public-comment/sheet-sync.json`: anchors, lineMap, draftUrl, commentUrl, and optional namedSections, aliases, tabs and columns. A drafting sheet's config (`review/drafting/sheet-sync.json`) has mode `drafting`, anchors and sectionUrl." },
        { name: "out", schema: t("RepoPath"), required: false, arg: { flag: "--out" }, description: "Where to write Code.gs. Default standard output." },
      ],
      outputs: [
        { name: "script", schema: t("RepoPath"), description: "Code.gs, ready to paste into the sheet's Apps Script editor. Never committed to the folio: it is rebuilt from the config." },
      ],
    },
    satisfies: ["review-sheet-script"],
    requires: { runtime: ["bun"], network: false },
    selection: {
      when:
        "A public review is kept in a shared Google Sheet with the public-comment tabs (Review Public Comments, Review Change Sets, Agent), and its links or joined columns must stay current without an agent re-pasting them. Also after the review anchors, the draft's link prefix or a tab or column name changes: rebuild and paste again.",
      limits:
        "Builds the script only; installing it is a person's step in the sheet, since the sheet's owner must authorise it. It reads only the tabs and headers named in the config. In the reviewers' columns the link text must be in the cell already: it links what reviewers wrote and does not rewrite their words. The joined columns and Agentic status it writes whole.",
      cost: "Reads three JSON files and writes one file of about 20 kB. In the sheet, a full refresh of 800 rows takes about 20 seconds.",
    },
  }),
);
