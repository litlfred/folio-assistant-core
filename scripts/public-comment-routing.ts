/**
 * TWG routing: which review committee (TWG sub-group) owns a comment, and,
 * rolled up from its comments, a change-set.
 *
 * The taxonomy is the TWG Coordinator's, fixed for the life of the
 * consultation (DPI-H comment categorisation skill requirements v0.1,
 * 2026-10-06, §4 and §10; smart-ra `uploads/`): five domain sub-groups and
 * three non-domain categories. Nothing here invents a category (REQ-01): a
 * value that does not name one is kept, shown raw, and counted as unmapped
 * until a person rules on it.
 *
 * A comment's routing comes from the columns of the master log it was
 * ingested from, held in `public.labels`. A human categorisation overrides the
 * AI one (REQ-26). "A/ B" is a primary and a secondary group (REQ-04).
 *
 * A change-set's committee is the plurality of its routed comments' primary
 * groups. Ties go to the more specific domain group (REQ-03's rule, e.g. a
 * terminology point inside a financing section resolves to Metadata
 * registries), which is `TWG_GROUPS`' order.
 */

/** The fixed categories, most specific first: the tie-break order. */
export const TWG_GROUPS = [
  "Metadata registries",
  "Supply chain",
  "Financial systems",
  "Clinical",
  "WHO",
  "Core architects",
  "Editorial",
  "No",
] as const;
export type TwgGroup = (typeof TWG_GROUPS)[number];

/** Spellings found in the returned logs that name a category unambiguously. */
const ALIASES: Record<string, TwgGroup> = {
  metadata: "Metadata registries",
  "metadata registry": "Metadata registries",
  "no but note accompanying comments": "No",
};

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** The category a single value names, if it names exactly one. */
export function twgGroup(value: string): TwgGroup | undefined {
  const v = norm(value);
  return TWG_GROUPS.find((g) => norm(g) === v) ?? ALIASES[v];
}

export interface Routing {
  /** The primary group, absent when the value names no category. */
  group?: TwgGroup;
  secondary: TwgGroup[];
  source: "human" | "ai";
  /** The value as the log holds it. */
  raw: string;
}

const isHuman = (k: string) => /human/i.test(k) && /categori[sz]/i.test(k);
const isAi = (k: string) => !/human/i.test(k) && /categori[sz]/i.test(k);

/** A comment's routing from its ingested labels, or undefined when it has none. */
export function commentRouting(labels: Record<string, string> | undefined): Routing | undefined {
  if (!labels) return undefined;
  const pick = (test: (k: string) => boolean) => Object.entries(labels).find(([k, v]) => test(k) && v.trim())?.[1];
  const human = pick(isHuman);
  const raw = human ?? pick(isAi);
  if (!raw) return undefined;
  const parts = raw.split("/").map((s) => s.trim()).filter(Boolean);
  const whole = twgGroup(raw);
  const groups = whole ? [whole] : parts.map(twgGroup);
  const ok = groups.length > 0 && groups.every(Boolean);
  return {
    ...(ok ? { group: groups[0]! } : {}),
    secondary: ok ? [...new Set(groups.slice(1) as TwgGroup[])] : [],
    source: human ? "human" : "ai",
    raw: raw.trim(),
  };
}

export interface ChangeSetRouting {
  /** The plurality group of its routed comments; absent when none is routed. */
  group?: TwgGroup;
  /** Comments routed to each group, most first. */
  counts: Array<{ group: TwgGroup; n: number }>;
  routed: number;
  /** Refs whose value names no category: they need a ruling. */
  unmapped: number;
  total: number;
}

export function changeSetRouting(refs: string[], byRef: Map<string, Routing | undefined>): ChangeSetRouting {
  const n = new Map<TwgGroup, number>();
  let unmapped = 0;
  for (const r of refs) {
    const x = byRef.get(r);
    if (!x) continue;
    if (x.group) n.set(x.group, (n.get(x.group) ?? 0) + 1);
    else unmapped++;
  }
  const counts = [...n].map(([group, k]) => ({ group, n: k }))
    .sort((a, b) => b.n - a.n || TWG_GROUPS.indexOf(a.group) - TWG_GROUPS.indexOf(b.group));
  return {
    ...(counts[0] ? { group: counts[0].group } : {}),
    counts,
    routed: counts.reduce((s, c) => s + c.n, 0),
    unmapped,
    total: refs.length,
  };
}
