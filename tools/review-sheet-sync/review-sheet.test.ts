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

import { buildConfig, buildScript, chunks, configRows, readable } from "./build-review-sheet-script.js";
import { feedbackBasis } from "./feedback-issue.js";

const code = buildScript();
const withConfig = <T extends object>(t: T, rows: string[][]) => ({ ...t, Config: { id: 50, rows } });

type Rich = { text: string; links: [number, number, string][]; bold: [number, number][] };

/** A fake folio: a draft with printed pages 1–3 on PDF pages 12–14 (offset 11). */
function folio(): string {
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
    draftUrl: "D#page=",
    commentUrl: "C#",
  }));
  return repo;
}

/** A fake of the Apps Script services the script calls, over tabs of strings. */
function runtime(tabs: Record<string, { id: number; rows: string[][] }>) {
  const written: Record<string, Record<string, unknown[][]>> = {};
  const props: Record<string, string> = {};
  // A write lands at its rows: a whole column is the array of its rows from
  // row 2; a one-row write fills only its place.
  const put = (name: string, h: string, r: number, v: unknown[][]) => {
    const tab = (written[name] ??= {});
    if (r === 1 || (r === 2 && v.length > 1)) return void (tab[h] = v);
    const arr = (tab[h] ??= []);
    v.forEach((x, i) => (arr[r - 2 + i] = x));
  };
  const sheet = (name: string) => {
    const t = tabs[name];
    return {
      hideSheet: () => ((t as { hidden?: boolean }).hidden = true),
      getName: () => name,
      getSheetId: () => t.id,
      getLastRow: () => t.rows.length,
      getLastColumn: () => t.rows[0].length,
      getRange: (r: number, c: number, nr: number, nc: number) => ({
        getDisplayValues: () => t.rows.slice(r - 1, r - 1 + nr).map((row) => row.slice(c - 1, c - 1 + nc)),
        setValues: (v: unknown[][]) => put(name, t.rows[0][c - 1], r, v),
        setRichTextValues: (v: unknown[][]) => put(name, t.rows[0][c - 1], r, v),
        clearContent: () => {},
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
        getSheetByName: (n: string) => (tabs[n] ? sheet(n) : null),
        insertSheet: (n: string) => ((tabs[n] = { id: 99, rows: [["Section", "Link"]] }), sheet(n)),
      }),
      newRichTextValue: builder,
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
  return { g, written, props, sheet };
}

function load(code: string, g: Record<string, unknown>) {
  const fn = new Function(...Object.keys(g), `${code}\nreturn { refreshAll, markDirty, refreshIfDirty };`);
  return fn(...Object.values(g)) as { refreshAll(): void; markDirty(e: unknown): void; refreshIfDirty(): void };
}

const tabs = () => ({
  "Review Public Comments": {
    id: 1,
    rows: [
      ["No.", "Sections", "Page", "Line no(s) / Table / Figure", "Comment / issue", "Suggested revision", "Architect Feedback (initials)", "Disposition", "Status", "Agentic status"],
      ["1", "1.2 and Chapter 1", "2", "p.2 line 3", "Too short", "Lengthen it", "AB agrees", "", "Pending", ""],
      ["2", "nowhere", "3", "L 5", "Typo", "", "", "Accepted", "", ""],
      ["3", "", "", "", "Off topic", "", "", "", "", ""],
    ],
  },
  Agent: {
    id: 2,
    rows: [
      ["No.", "Comment ref", "Agentic status", "Change-sets", "Change-set", "Title", "Pull request (change set)", "What the PRs changed (change set)", "Agent completed (UTC, change set)"],
      ["1", "PC-0002", "PR open", "CS-001", "CS-001", "Fix scope", "https://github.com/o/r/pull/97\nhttps://github.com/o/r/pull/130", "Adds the scope\nFixes a typo", "2026-10-30 22:30Z"],
      ["2", "PC-0003", "PR open", "CS-001", "CS-002", "Other", "", "", ""],
      ["3", "PC-0004", "Not started", "CS-002", "", "", "", "", ""],
    ],
  },
  "Review Change Sets": {
    id: 3,
    rows: [
      ["Change-set", "Sections", "Pages", "Public Comments", "Suggested Revisions", "PC Architect Feedback", "Dispositions", "Agentic status"],
      ["CS-001", "", "", "", "", "", "", ""],
      ["CS-002", "", "", "", "", "", "", ""],
    ],
  },
});

const slice = (r: Rich, [a, z]: [number, number, ...unknown[]]) => r.text.slice(a, z);

describe("review-sheet.gs, built and run against a fake sheet", () => {
  const pcRows = configRows(buildConfig(folio(), "review/public-comment/sheet-sync.json"));
  const rt = runtime(withConfig(tabs(), pcRows));
  load(code, rt.g).refreshAll();
  const rpc = rt.written["Review Public Comments"];
  const rcs = rt.written["Review Change Sets"];

  test("the built script has no template placeholder left", () => {
    expect(code).not.toContain("/*@@CONFIG@@*/");
    expect(code).toContain("@OnlyCurrentDoc");
    expect(code).toMatch(/at ([0-9a-f]{40}|unknown)/);
    expect(code).not.toMatch(/UrlFetchApp|MailApp|GmailApp|DriveApp/);
  });

  test("RPC No. links to the comment's page, and stays a number", () => {
    expect(rpc["No."]).toEqual([['=HYPERLINK("C#PC-0002",1)'], ['=HYPERLINK("C#PC-0003",2)'], ['=HYPERLINK("C#PC-0004",3)']]);
  });

  test("RPC Sections link each section and chapter to its first PDF page", () => {
    const r = rpc.Sections[0][0] as Rich;
    expect(r.links.map((l) => [slice(r, l), l[2]])).toEqual([["1.2", "D#page=13"], ["Chapter 1", "D#page=12"]]);
    expect((rpc.Sections[1][0] as Rich).links).toEqual([]);
  });

  test("RPC Page links printed pages at the printed-to-PDF offset", () => {
    expect((rpc.Page[0][0] as Rich).links).toEqual([[0, 1, "D#page=13"]]);
    expect((rpc.Page[1][0] as Rich).links).toEqual([[0, 1, "D#page=14"]]);
  });

  test("RPC lines go to the page that holds them", () => {
    const r = rpc["Line no(s) / Table / Figure"][0][0] as Rich;
    expect(r.links.map((l) => [slice(r, l), l[2]])).toEqual([["p.2", "D#page=13"], ["line 3", "D#page=13"]]);
    const r2 = rpc["Line no(s) / Table / Figure"][1][0] as Rich;
    expect(r2.links.map((l) => [slice(r2, l), l[2]])).toEqual([["L 5", "D#page=14"]]);
  });

  test("RCS joins its comments, each No. n linking to its RPC row, status bold", () => {
    const c = rcs["Public Comments"][0][0] as Rich;
    expect(c.text).toBe("No. 1 (Pending) · Too short\n\nNo. 2 · Typo");
    expect(c.links.map((l) => [slice(c, l), l[2]])).toEqual([["No. 1", "#gid=1&range=A2"], ["No. 2", "#gid=1&range=A3"]]);
    expect(c.bold.map(([a, z]) => c.text.slice(a, z))).toEqual(["(Pending)"]);
    expect((rcs["Suggested Revisions"][0][0] as Rich).text).toBe("No. 1 · Lengthen it");
    expect((rcs["PC Architect Feedback"][0][0] as Rich).text).toBe("No. 1 · AB agrees");
    expect((rcs.Dispositions[0][0] as Rich).text).toBe("No. 2 · Accepted");
  });

  test("RCS Sections and Pages are the union over its comments, linked", () => {
    const s = rcs.Sections[0][0] as Rich;
    expect(s.text).toBe("1, 1.2, nowhere");
    expect(s.links.map((l) => l[2])).toEqual(["D#page=12", "D#page=13"]);
    const p = rcs.Pages[0][0] as Rich;
    expect(p.text).toBe("2–3");
    expect(p.links).toEqual([[0, 3, "D#page=13"]]);
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

  test("an edit rebuilds at once while a rebuild is quick", () => {
    const rt2 = runtime(withConfig(tabs(), pcRows));
    load(code, rt2.g).markDirty({ range: { getSheet: () => rt2.sheet("Agent") } });
    expect(rt2.props.dirty).toBeUndefined();
    expect(rt2.written["Review Change Sets"]).toBeDefined();
  });

  test("once a rebuild is slow, an edit marks the sheet dirty, and the timer rebuilds once", () => {
    const rt2 = runtime(withConfig(tabs(), pcRows));
    rt2.props.lastMs = "20000";
    const s = load(code, rt2.g);
    s.markDirty({ range: { getSheet: () => rt2.sheet("Public Comment Source") } });
    expect(rt2.props.dirty).toBeUndefined();
    s.markDirty({ range: { getSheet: () => rt2.sheet("Agent") } });
    expect(rt2.props.dirty).toBe("1");
    s.refreshIfDirty();
    expect(rt2.props.dirty).toBeUndefined();
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
    sectionUrl: "S#",
  }));
  return repo;
}

const draftTabs = () => ({
  "Contributor Feedback": {
    id: 1,
    rows: [
      ["Change-set", "Title", "Selected Sections", "Section links", "Contributor Feedback (CL)", "Contributor Feedback (initials/name)", "Issue", "Agentic status", "Staging review page"],
      ["CS-004", "Define registry", "Ch 1 Why it matters,\u2514\u20021.1 Global challenges", "", "AB: needs a definition", "", "", "", ""],
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

  test("the script is the same for every document: nothing of the folio is in it", () => {
    expect(code).not.toContain("S#");
    expect(code).not.toContain("Global challenges");
    expect(dRows[1][0]).toBe("CFG");
    expect(dRows.every((r, i) => i === 0 || r[1].startsWith("|"))).toBe(true);
    expect(JSON.parse(dRows[1][1].slice(1)).MODE).toBe("drafting");
  });

  test("the built script is plain ASCII, so a paste cannot mangle it", () => {
    expect(/[^\x00-\x7f]/.test(code)).toBe(false);
  });

  test("the TOC has chapters and sections, without commas, each with its anchor", () => {
    const toc = rt.written.TOC.Section as string[][];
    expect(toc.map((r) => r[0])).toEqual([
      "Section", "About this draft", "About this draft · Questions for the TWG", "Ch 1 Why it matters",
      "Ch 1 · Objectives and key messages", "1.1 Global challenges", "Ch 12 Privacy; Security and Trust",
    ].map((n) => (/^(Section|About this draft$|Ch \d+ [^·])/.test(n) ? n : `\u2514\u2002${n}`)));
    expect(toc[4][1]).toBe('=HYPERLINK("S#sec:ch01-lead","open")');
    expect(tabs.TOC.hidden).toBe(true);
  });

  test("a used row without a Change-set gets the next id; an empty row does not", () => {
    expect(fb["Change-set"]).toEqual([["CS-004"], ["CS-005"], [""]]);
  });

  test("Section links has each picked section linked, one per line; unknown picks are left out; Sections is not rewritten", () => {
    const r = fb["Section links"][0][0] as Rich;
    expect(r.text).toBe("Ch 1 Why it matters\n1.1 Global challenges");
    expect(r.links.map((l) => [slice(r, l), l[2]])).toEqual([["Ch 1 Why it matters", "S#chap:ch01-why"], ["1.1 Global challenges", "S#sec:1-1"]]);
    const r2 = fb["Section links"][1][0] as Rich;
    // A marked pick ("\u2514 1.1 ...") and a bare one (an old value, or a first chip Sheets trimmed) both link.
    expect(r2.links.map((l) => [slice(r2, l), l[2]])).toEqual([["Ch 12 Privacy; Security and Trust", "S#chap:ch12-privacy"], ["1.1 Global challenges", "S#sec:1-1"]]);
    expect(fb.Sections).toBeUndefined();
  });

  test("Selected Sections is kept valid: a bare pick gets its mark, a gone one is flagged in Section links", () => {
    expect(fb["Selected Sections"][1][0]).toBe("Ch 12 Privacy; Security and Trust, Somewhere else, \u2514\u20021.1 Global challenges");
    expect((fb["Section links"][1][0] as Rich).text).toBe(
      'Ch 12 Privacy; Security and Trust\n1.1 Global challenges\n\u26a0 "Somewhere else" is not in the document now: pick its section again');
    expect(tabs.TOC.rows.length).toBeGreaterThan(0);
    expect((rt.written.TOC.Section as string[][])[5]).toEqual(["\u2514\u20021.1 Global challenges", '=HYPERLINK("S#sec:1-1","open")', "sec:1-1"]);
  });

  test("a pick of a section renamed since follows it, by its anchor", () => {
    const t = withConfig(draftTabs(), dRows) as Record<string, { id: number; rows: string[][] }>;
    t.TOC = { id: 9, rows: [["Section", "Link", "Anchor"], ["\u2514\u20021.1 Old challenges", "open", "sec:1-1"]] };
    t["Contributor Feedback"].rows[1][2] = "\u2514\u20021.1 Old challenges";
    const rt2 = runtime(t);
    load(code, rt2.g).refreshAll();
    const f = rt2.written["Contributor Feedback"];
    expect(f["Selected Sections"][0][0]).toBe("\u2514\u20021.1 Global challenges");
    expect((f["Section links"][0][0] as Rich).text).toBe("1.1 Global challenges");
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
    expect(w["Selected Sections"][1]).toEqual(["\u2514\u20021.1 Global challenges"]);
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

  test("Issue and Agentic status come from the Agent tab by change set", () => {
    const i = fb.Issue[0][0] as Rich;
    expect(i.text).toBe("dth#12");
    expect(i.links).toEqual([[0, 6, "https://github.com/o/dth/issues/12"]]);
    expect((fb["Agentic status"][0][0] as Rich).text).toBe("dth#40 (PR open, 2026-10-30 23:40Z) · Adds the definition");
    expect((fb.Issue[1][0] as Rich).text).toBe("");
  });

  test("Staging review page links the change set's preview, from the Agent tab", () => {
    expect(fb["Staging review page"][0][0]).toEqual({ text: "review", links: [[0, 6, "https://o.github.io/dth/STAGING/cs-004/en/review/"]], bold: [] });
    expect((fb["Staging review page"][1][0] as Rich).text).toBe("");
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
