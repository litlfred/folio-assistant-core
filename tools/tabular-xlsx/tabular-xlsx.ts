import { toolFactory } from "@litlfred/cat-harness/schemas/tool-folders.js";
import { defineTool } from "@litlfred/cat-harness/schemas/tool.js";

export default toolFactory((t) =>
  defineTool({
    id: "tabular-xlsx",
    title: "Spreadsheet tabular metadata",
    description:
      "Read a workbook into a `folio-tabular-csvw/v1` record, one CSVW table per rectangular block of cells. Blocks are split on empty rows, then on empty columns, so several tables on one sheet are found, each anchored at its real top-left cell (`fac:anchor`: sheet, A1 cell, row, column). Dates are read through the number formats in `styles.xml`, not misread as integer serials. A malformed part is refused rather than half-read. No new dependency: ZIP via `node:zlib`, SpreadsheetML via `fast-xml-parser`. Governed by the `tabular-metadata` skill (bean `eief`).",
    install: { none: true },
    invoke: { shell: "bun run folio-assistant-core/scripts/tabular-xlsx.ts" },
    io: {
      inputs: [
        { name: "file", schema: t("WorkbookPath"), required: true, arg: { positional: 0 }, description: "Path to the `.xlsx` workbook." },
        { name: "doc-id", schema: t("DocId"), required: false, arg: { flag: "--doc-id" }, description: "The record's `doc_id`. Default: the file name without its extension." },
        { name: "out", schema: t("RepoPath"), required: false, arg: { flag: "--out" }, description: "Where to write `tabular.csvw.json`. Default: stdout." },
      ],
      outputs: [
        { name: "record", schema: t("Text"), description: "A `folio-tabular-csvw/v1` document, one table per block. Exit 2 when the file is not a SpreadsheetML workbook." },
      ],
    },
    satisfies: ["tabular-metadata"],
    requires: { runtime: ["bun"], network: false },
  }),
);
