/**
 * A feedback issue (from a site's 📣 link and the shared issue form,
 * `templates/issue-forms/block-feedback.yml`) as a Contributor Feedback row
 * of a drafting review sheet. The agent's sheet sync uses it: each new
 * feedback issue becomes one row, and that issue is the row's change-set
 * issue. Plain-body issues (a folio without the form) parse too.
 *
 * Skill: `review-sheet-script`, "Feedback from the site".
 */
import { buildToc } from "./build-review-sheet-script.js";

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
  const name = (sec && byAnchor.get(sec)) ?? toc.find(([n]) => f.section && n === f.section.replace(/,/g, ";"))?.[0] ?? "";
  const first = (f.comment ?? "").split(/(?<=[.!?])\s|\n/)[0].trim();
  const short = first.length > 80 ? first.slice(0, 79).trimEnd() + "…" : first;
  const where = name || f.section || "";
  return {
    title: [where, short].filter(Boolean).join(": "),
    sections: name,
    feedback: `@${issue.login}${f.type ? ` (${f.type})` : ""}: ${f.comment ?? ""}${f.proposed ? `\nProposed: ${f.proposed}` : ""}`,
    issue: issue.url,
  };
}
