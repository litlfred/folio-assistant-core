/**
 * What the agent writes on a review sheet's Agent tab, made by a tool rather
 * than typed (owner, 2026-10-31: "what can we do to fix process/skills/tools
 * so no broken things like this"). The two slips that day were typed data: a
 * disposition line "Nos. 127 to 135" that took in two comments of another
 * change set, and an Agent completed time left behind after acting.
 *
 *   dispositions <input.json>   the change set's Disposition (change set) cell
 *   brief <input.json> [--look <text>]   the PR body's review brief, the same lines
 *   push --head <sha> [--expect <minutes>]   the cells to write on every push
 *   done                        Agent completed alone, when the agent acted
 *                               with no new commit (nothing to restage)
 *
 * dispositions reads which comments are in the change set and the people's
 * Blue Disposition from the sheet's own values (as read, header row
 * included), so the numbers come from the sheet and never from memory. It
 * then runs the sheet's own check (`dispositionProblems`, from the same
 * review-sheet.gs) and exits 1, printing the problems, if any remain: the
 * agent fixes the input and runs it again, and a flagged cell never reaches
 * the sheet. Skill: `review-sheet-script`, "Writing the Agent tab with the tool".
 *
 * Input for dispositions:
 *   {
 *     "cs": "CS-001",
 *     "comments": [["No.", …, "Change-sets"], ["126", …, "CS-001"], …],   // Agent - Comments (drafting: omit)
 *     "blue": [["No.", …, "Disposition"], ["126", …, "Not accepted"], …],  // Review Public Comments
 *     "previous": "<the cell as it stands>",   // its Decided lines are kept, in order
 *     "decided": ["Decided (No. 327, 2026-10-31): A, by …; …"],   // new decisions, appended
 *     "overall": "Editorial and clarity revisions …",
 *     "items": [{ "nos": [136], "word": "Accepted", "why": "DPI-F defined at first use." },
 *               { "rest": true, "word": "Not accepted", "why": "Already reflected." }]
 *   }
 * An item without "word" takes the comment's Blue Disposition; "rest" covers
 * every comment of the change set no other item names, grouped by the Blue
 * word where one is set.
 */
import { readFileSync } from "node:fs";
import { buildScript } from "./build-review-sheet-script.js";

type Item = { nos?: (number | string)[]; rest?: boolean; word?: string; why?: string };
export type DispositionInput = {
  cs: string;
  comments?: string[][];
  blue?: string[][];
  nos?: (number | string)[];
  previous?: string;
  decided?: string[];
  overall?: string;
  items: Item[];
};

const sheet = new Function(buildScript() + "\nreturn { dispositionProblems, DISPOSITION_WORDS };")() as {
  dispositionProblems: (text: string, nos: string[], human: Record<string, string>) => string;
  DISPOSITION_WORDS: string[];
};

/** A column of a values array by its header, or an error naming what is there. */
function column(values: string[][], header: string): number {
  const h = (values[0] || []).map((x) => String(x).trim().toLowerCase());
  const i = h.indexOf(header.toLowerCase());
  if (i < 0) throw new Error(`no "${header}" column in [${(values[0] || []).join(", ")}]: pass the rows with their header row`);
  return i;
}

/** "Nos. 127 to 131, 134, 135, 138 and 139" or "No. 136". Runs of three or more become "a to b". */
export function nosLabel(nos: string[]): string {
  const n = [...new Set(nos.map(Number))].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < n.length; ) {
    let j = i;
    while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++;
    if (j - i >= 2) parts.push(`${n[i]} to ${n[j]}`);
    else for (let k = i; k <= j; k++) parts.push(String(n[k]));
    i = j + 1;
  }
  const list = parts.length > 1 ? parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1] : parts[0];
  return (n.length > 1 ? "Nos. " : "No. ") + list;
}

export function dispositions(input: DispositionInput): { text: string; problems: string } {
  const nos = input.comments
    ? (() => {
        const no = column(input.comments!, "No."), cs = column(input.comments!, "Change-sets");
        return input.comments!.slice(1)
          .filter((r) => String(r[cs] ?? "").split(/[,\s]+/).includes(input.cs))
          .map((r) => String(r[no]).trim()).filter(Boolean);
      })()
    : (input.nos ?? []).map(String);
  const human: Record<string, string> = {};
  if (input.blue?.length) {
    const no = column(input.blue, "No."), d = column(input.blue, "Disposition");
    input.blue.slice(1).forEach((r) => { const n = String(r[no] ?? "").trim(); if (n) human[n] = String(r[d] ?? "").trim(); });
  }
  const set = (w: string) => w && !/^pending$/i.test(w);
  const canon = (w: string) => sheet.DISPOSITION_WORDS.find((x) => x.toLowerCase() === w.toLowerCase()) ?? w;
  const named = new Set(input.items.flatMap((i) => (i.nos ?? []).map(String)));
  const lines: string[] = [];
  for (const item of input.items) {
    const these = item.rest ? nos.filter((n) => !named.has(n)) : (item.nos ?? []).map(String);
    if (!these.length) continue;
    // Group by the word each comment ends up with: the item's, else the people's.
    const by = new Map<string, string[]>();
    for (const n of these) {
      // "rest" defers to the people's word; a named item states its own, and
      // the check below flags it if it differs from theirs.
      const w = canon(item.rest && set(human[n]) ? human[n] : item.word || (set(human[n]) ? human[n] : ""));
      by.set(w, [...(by.get(w) ?? []), n]);
    }
    for (const [w, group] of by) lines.push(`${nosLabel(group)}: ${w || "(no disposition)"}.${item.why ? " " + item.why : ""}`);
  }
  const kept = String(input.previous ?? "").split("\n").filter((l) => /^Decided\b/.test(l.trim())).map((l) => l.trim());
  const history = [...kept, ...(input.decided ?? []).filter((d) => !kept.includes(d.trim()))];
  const text = [
    ...(history.length ? [history.join("\n"), ""] : []),
    ...(input.overall ? [`Overall: ${input.overall}`] : []),
    ...lines,
  ].join("\n");
  return { text, problems: sheet.dispositionProblems(text, nos, human) };
}

/**
 * The PR body's review brief: the staging review page shows only what sits
 * between these markers (cat-harness-tools#1153). The same Overall line and
 * per-comment lines as the Disposition, as Markdown, plus where to look.
 */
export function brief(input: DispositionInput, look?: string): string {
  const { text } = dispositions(input);
  const lines = text.split("\n").filter((l) => l && !/^Decided\b/.test(l));
  const md = lines.map((l) => l.replace(/^(Overall|Nos?\. [^:]+):/, (_, h) => `- **${h}:**`));
  return ["<!-- review-brief -->", ...md, ...(look ? [`- **Where to look:** ${look}`] : []), "<!-- /review-brief -->"].join("\n");
}

/** The cells to write on every push, with the time from the clock, never typed. */
export function push(head: string, expectMinutes: number, now = new Date()): Record<string, string> {
  if (!/^[0-9a-f]{40}$/i.test(head)) throw new Error("--head takes the full 40-character commit sha (git rev-parse HEAD)");
  const fmt = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ") + "Z";
  return {
    "PR head (change set)": head,
    "Staging deploy (change set)": `building, expected ${fmt(new Date(now.getTime() + expectMinutes * 60000))}`,
    "Agent completed (UTC, change set)": fmt(now),
  };
}

/** Agent completed alone: acted on Ready for agent, but no new commit, so no restage. */
export function done(now = new Date()): Record<string, string> {
  return { "Agent completed (UTC, change set)": now.toISOString().slice(0, 16).replace("T", " ") + "Z" };
}

if (import.meta.main) {
  const [cmd, ...rest] = process.argv.slice(2);
  const flag = (f: string) => { const i = rest.indexOf(f); return i >= 0 ? rest[i + 1] : undefined; };
  if (cmd === "dispositions" && rest[0]) {
    const { text, problems } = dispositions(JSON.parse(readFileSync(rest[0], "utf8")));
    if (problems) { console.error(problems); console.error("\nNothing to write: fix the input and run again."); process.exit(1); }
    console.log(text);
  } else if (cmd === "brief" && rest[0]) {
    const input = JSON.parse(readFileSync(rest[0], "utf8"));
    const { problems } = dispositions(input);
    if (problems) { console.error(problems); process.exit(1); }
    console.log(brief(input, flag("--look")));
  } else if (cmd === "push" && flag("--head")) {
    console.log(JSON.stringify(push(flag("--head")!, Number(flag("--expect") ?? 20)), null, 2));
  } else if (cmd === "done") {
    console.log(JSON.stringify(done(), null, 2));
  } else {
    console.error("usage: agent-record.ts dispositions <input.json> | brief <input.json> [--look <text>] | push --head <full sha> [--expect <minutes>] | done");
    process.exit(2);
  }
}
