/**
 * A feedback issue (from a site's 📣 link and the shared issue form,
 * `templates/issue-forms/block-feedback.yml`) as a Contributor Feedback row
 * of a drafting review sheet. The agent's sheet sync uses it: each new
 * feedback issue becomes one row, and that issue is the row's change-set
 * issue. Plain-body issues (a folio without the form) parse too.
 *
 * Skill: `review-sheet-script`, "Feedback from the site".
 */
import { createHash } from "node:crypto";
import { bareName, buildToc } from "./build-review-sheet-script.js";

export type Feedback = {
  content?: string; section?: string; block?: string; url?: string; source?: string;
  type?: string; comment?: string; proposed?: string;
};

/** GitHub renders a form as `### <label>` then the value; an empty field is `_No response_`. */
const LABELS: Record<string, keyof Feedback> = {
  content: "content", section: "section", block: "block", "on the site": "url", source: "source",
  type: "type", comment: "comment", "proposed change": "proposed",
};

export function parseFeedbackIssue(body: string): Feedback {
  const out: Feedback = {};
  const set = (label: string, value: string) => {
    const k = LABELS[label.trim().toLowerCase()];
    const v = value.trim().replace(/^`(.*)`$/, "$1");
    if (k && v && v !== "_No response_" && !/^general \| technical \| editorial$/i.test(v)) out[k] = v;
  };
  if (/^###\s/m.test(body)) {
    for (const part of body.split(/^###\s+/m).slice(1)) {
      const nl = part.indexOf("\n");
      set(nl < 0 ? part : part.slice(0, nl), nl < 0 ? "" : part.slice(nl + 1));
    }
    return out;
  }
  // Plain body: "**Label:** value" lines, then free text under Comment / Proposed change.
  const re = /^\*\*([^*]+):\*\*[ \t]*(.*)$/gm;
  const hits = [...body.matchAll(re)];
  hits.forEach((m, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].index! : body.length;
    const rest = body.slice(m.index! + m[0].length, end);
    set(m[1], (m[2] + rest).trim());
  });
  return out;
}

type Anchors = Parameters<typeof buildToc>[0] & { blocks?: { label: string; sections: string[] }[] };

export type FeedbackRow = { title: string; sections: string; feedback: string; issue: string };

/**
 * The sheet row for a feedback issue: Sections is the TOC entry of the
 * block's section (by the block's anchor, else by the section's name), Title
 * a draft from the section and the comment's first sentence (people may
 * rewrite it: Title is theirs), Contributor Feedback "@login (Type): comment".
 */
export function feedbackRow(issue: { body: string; url: string; login: string }, anchors: Anchors): FeedbackRow {
  const f = parseFeedbackIssue(issue.body);
  const toc = buildToc(anchors);
  const byAnchor = new Map(toc.map(([n, a]) => [a, n]));
  const sec = f.block ? anchors.blocks?.find((b) => b.label === f.block)?.sections[0] : undefined;
  const name = (sec && byAnchor.get(sec)) ?? toc.find(([n]) => f.section && bareName(n) === f.section.replace(/,/g, ";"))?.[0] ?? "";
  const first = (f.comment ?? "").split(/(?<=[.!?])\s|\n/)[0].trim();
  const short = first.length > 80 ? first.slice(0, 79).trimEnd() + "…" : first;
  // `name` is the dropdown value, marked under its chapter; the title takes it bare.
  const where = bareName(name) || f.section || "";
  return {
    title: [where, short].filter(Boolean).join(": "),
    sections: name,
    feedback: `@${issue.login}${f.type ? ` (${f.type})` : ""}: ${f.comment ?? ""}${f.proposed ? `\nProposed: ${f.proposed}` : ""}`,
    issue: issue.url,
  };
}

/**
 * What the agent's proposal (the `Contributor Feedback (agent)` column) was
 * written against: a short hash of the row's people cells, Title, Selected
 * Sections and every person's Contributor Feedback column, by header. The
 * agent keeps it in the Agent tab's `Feedback basis (change set)`; on each
 * sync a row whose basis differs, whoever changed it, a person or an agent,
 * gets a fresh proposal, and so does a row whose proposal a person cleared.
 * Picks are compared bare, so the script's repair of a tree mark is no change.
 */
export function feedbackBasis(header: string[], row: string[], names = { title: "Title", sections: "Selected Sections", feedback: "Contributor Feedback" }): string {
  const parts: string[] = [];
  header.forEach((h, i) => {
    const v = String(row[i] ?? "").trim();
    if (h === names.title) parts.push(`${h}=${v}`);
    else if (h === names.sections) parts.push(`${h}=${v.split(",").map(bareName).filter(Boolean).join(",")}`);
    else if ((h === names.feedback || h.startsWith(`${names.feedback} (`)) && h !== `${names.feedback} (agent)`) parts.push(`${h}=${v}`);
  });
  return createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 12);
}
