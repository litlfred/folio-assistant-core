#!/usr/bin/env bun
/**
 * Check an instance's glossary and its links into the instances it mounts.
 *
 *   bun run folio-assistant-core/scripts/glossary-validate.ts --instance <name> [--repo .] [--capitalized]
 *
 * The cross-instance glossary validator of the L2 DTH plan (litlfred/dth-pc#2,
 * PC-6; dth-hrh#47). It started as dth-pc's `scripts/glossary/validate.ts`
 * and moved here because a validator is the platform's, not a folio's
 * (dth-pc AGENTS.md; owner, 2026-10-31). Every instance calls this one copy.
 *
 * It checks:
 *
 * - every scheme in `<repo>/glossary/*.glossary.json`, and in each mount, parses
 *   as `folio-glossary/v1` (which already refuses a bare id naming no term);
 * - every `broader`, `related` and SKOS match (`exactMatch`, `closeMatch`,
 *   `broadMatch`, `narrowMatch`) that names this instance's namespace, or a
 *   MOUNTED instance's, names a term that exists there. A match into a
 *   namespace that is not mounted (GS1, HL7, …) is not checked, nor is an
 *   IRI into a mounted namespace outside its `glossary/` (a vocabulary class);
 * - every concept a block names in `meta.glossary` exists, here or in a mount;
 * - every ArchiMate element or view a block names in `meta.archimate`, and
 *   every figure-to-view mapping, exists in a mounted instance's model;
 * - with `--capitalized`, every prefLabel starts with a capital (the DTH rule
 *   that KG concepts are Capitalized; owner, 2026-10-31).
 *
 * A mounted instance is any directory `<repo>/<d>/` holding `<d>.json`. It
 * reports each failure and exits 1 if there is one. ArchiMate links are
 * reported as unchecked, not failed, when no mounted instance holds a model,
 * or holds the model but not the version the link names.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { GlossarySchema } from "../schemas/glossary.ts";
import { instanceNs } from "./glossary-page.ts";

const MATCHES = ["exactMatch", "closeMatch", "broadMatch", "narrowMatch"] as const;

export interface Instance {
  name: string;
  ns: string;
  root: string;
}

type Glossary = ReturnType<typeof GlossarySchema.parse>;

export interface Report {
  errors: string[];
  notes: string[];
}

function instanceAt(root: string, file: string): Instance {
  const d = JSON.parse(readFileSync(join(root, file), "utf-8"));
  return { name: d.name, ns: instanceNs(d.name, d.stub, d), root };
}

/** Every term and scheme IRI an instance's `glossary/` declares. */
function glossaryOf(
  inst: Instance,
  errors: string[] = [],
): { known: Set<string>; bareIds: Set<string>; docs: Array<{ f: string; g: Glossary }> } {
  const dir = join(inst.root, "glossary");
  const known = new Set<string>();
  const bareIds = new Set<string>();
  const docs: Array<{ f: string; g: Glossary }> = [];
  if (!existsSync(dir)) return { known, bareIds, docs };
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".glossary.json")).sort()) {
    const parsed = GlossarySchema.safeParse(JSON.parse(readFileSync(join(dir, f), "utf-8")));
    if (!parsed.success) {
      for (const i of parsed.error.issues) errors.push(`${inst.name} ${f}: ${i.path.join(".")}: ${i.message}`);
      continue;
    }
    const g = parsed.data;
    known.add(`${inst.ns}glossary/${g.id}`);
    for (const t of g.terms) {
      known.add(t.iri ?? `${inst.ns}glossary/${g.id}/${t.id}`);
      bareIds.add(t.id);
    }
    docs.push({ f, g });
  }
  return { known, bareIds, docs };
}

/** The instances mounted at the repository root: `<d>/<d>.json`. */
export function mountedInstances(repo: string, self: string): Instance[] {
  const out: Instance[] = [];
  for (const d of readdirSync(repo).sort()) {
    if (d === self || d.startsWith(".") || d === "node_modules") continue;
    const p = join(repo, d);
    if (!statSync(p).isDirectory() || !existsSync(join(p, `${d}.json`))) continue;
    try {
      out.push(instanceAt(p, `${d}.json`));
    } catch {
      // not an instance declaration
    }
  }
  return out;
}

function walkTs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walkTs(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : [],
  );
}

/** The parts of a block's meta this validator reads. */
export interface Meta {
  glossary?: Array<string | { iri?: unknown }>;
  glossaryTerms?: Array<string | { iri?: unknown }>;
  archimate?: {
    elements?: Array<{ iri?: unknown; name?: unknown }>;
    views?: Array<{ iri?: unknown; name?: unknown }>;
    figures?: Array<{ figure?: unknown; model?: unknown; view?: unknown }>;
  };
  [key: string]: unknown;
}

/**
 * A block's `meta: { … }` object, read as JSON whether it is written on one
 * line or pretty-printed over several. `undefined` if there is none or it is
 * not JSON.
 */
export function metaOf(src: string): Meta | undefined {
  const start = src.search(/\bmeta:\s*\{/);
  if (start < 0) return undefined;
  const open = src.indexOf("{", start);
  let depth = 0;
  let inStr = false;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(src.slice(open, i + 1));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export async function validate(repo: string, instance: string, opts: { capitalized?: boolean } = {}): Promise<Report> {
  const errors: string[] = [];
  const notes: string[] = [];
  const self = instanceAt(repo, `${instance}.json`);
  const mounted = mountedInstances(repo, instance);
  const here = glossaryOf(self, errors);
  const there = new Map(mounted.map((m) => [m, glossaryOf(m, errors).known]));

  const checkRef = (ctx: string, r: string) => {
    if (!r.includes("://")) {
      if (!here.bareIds.has(r)) errors.push(`${ctx}: bare id "${r}" is not a term in ${self.name}`);
      return;
    }
    if (r.startsWith(self.ns)) {
      if (!here.known.has(r)) errors.push(`${ctx}: ${r} is not a term in ${self.name}`);
      return;
    }
    const inst = mounted.find((x) => r.startsWith(x.ns));
    if (!inst) return;
    // Only glossary IRIs are glossary terms; a class of the instance's own
    // vocabulary (a `ns#BusinessProcess` class) is not checked here.
    if (!r.startsWith(`${inst.ns}glossary/`)) {
      otherIris.set(inst.name, (otherIris.get(inst.name) ?? 0) + 1);
      return;
    }
    if (!there.get(inst)!.has(r)) errors.push(`${ctx}: ${r} is not a term in ${inst.name}`);
  };
  const otherIris = new Map<string, number>();

  for (const { f, g } of here.docs) {
    for (const t of g.terms) {
      // prefLabel is a string or a language map; every label must be Capitalized.
      const labels = typeof t.prefLabel === "string" ? [t.prefLabel] : Object.values(t.prefLabel);
      for (const l of labels) {
        if (opts.capitalized && !/^[A-Z]/.test(l)) errors.push(`${f}: ${t.id} prefLabel "${l}" is not Capitalized`);
      }
      for (const b of t.broader ?? []) checkRef(`${f}: ${t.id} broader`, b);
      for (const r of t.related ?? []) checkRef(`${f}: ${t.id} related`, r);
      for (const m of MATCHES) for (const r of t[m] ?? []) checkRef(`${f}: ${t.id} ${m}`, r);
    }
    const linked = g.terms.filter((t) => MATCHES.some((m) => t[m]?.length)).length;
    notes.push(`${f}: ${g.terms.length} terms (${linked} matched to another scheme)`);
  }

  // ArchiMate models of every mounted instance, keyed by model id.
  const models = new Map<string, { elements: Set<string>; views: Set<string> }>();
  const withModels = mounted.filter((m) => existsSync(join(m.root, "archimate/cat-archimate.config.json")));
  if (withModels.length) {
    const { readArchimate } = await import("../../cat-harness-tools/archimate/schemas/archimate.ts");
    for (const m of withModels) {
      const cfg = JSON.parse(readFileSync(join(m.root, "archimate/cat-archimate.config.json"), "utf-8"));
      for (const cm of cfg.models ?? []) {
        const p = join(m.root, "archimate", cm.file);
        if (!existsSync(p)) continue;
        const model = readArchimate(readFileSync(p));
        models.set(cm.id, {
          elements: new Set(model.elements.map((e: { id: string }) => e.id)),
          views: new Set(model.views.map((v: { id: string }) => v.id)),
        });
      }
    }
  }
  const iriRe = /\/archimate\/([^/]+)\/(elements|views)\/([^/]+)\.jsonld$/;
  let glosLinks = 0;
  let archLinks = 0;
  let unchecked = 0;
  const unmountedModels = new Map<string, number>();
  for (const file of walkTs(join(repo, "folio", instance))) {
    const src = readFileSync(file, "utf-8");
    // As keys: a chapter manifest's `dir: "glossary"` is not a link.
    if (!/"(archimate|glossary|glossaryTerms)"\s*:/.test(src)) continue;
    const meta = metaOf(src);
    if (!meta) {
      errors.push(`${file}: names "archimate" or "glossary" but its meta is not a JSON object`);
      continue;
    }
    // `glossary: [{ iri, … }]`, or the older `glossaryTerms: [iri]` (dth-phc).
    for (const [key, list] of [["glossary", meta.glossary], ["glossaryTerms", meta.glossaryTerms]] as const) {
      for (const gEntry of Array.isArray(list) ? list : []) {
        glosLinks++;
        checkRef(`${file} meta.${key}`, String(typeof gEntry === "string" ? gEntry : gEntry.iri));
      }
    }
    const a = meta.archimate;
    if (!a) continue;
    if (!models.size) {
      unchecked++;
      continue;
    }
    for (const x of [...(a.elements ?? []), ...(a.views ?? [])]) {
      const hit = String(x.iri).match(iriRe);
      if (hit && !models.has(hit[1])) {
        // A model version the mount does not hold (an older pin): not checked.
        unmountedModels.set(hit[1], (unmountedModels.get(hit[1]) ?? 0) + 1);
        continue;
      }
      archLinks++;
      if (!hit || !models.get(hit[1])![hit[2] as "elements" | "views"].has(hit[3])) {
        errors.push(`${file}: ${x.iri} (${x.name}) is not in a mounted ArchiMate model`);
      }
    }
    for (const fm of a.figures ?? []) {
      if (!models.has(String(fm.model))) {
        unmountedModels.set(String(fm.model), (unmountedModels.get(String(fm.model)) ?? 0) + 1);
        continue;
      }
      archLinks++;
      if (!models.get(String(fm.model))?.views.has(String(fm.view))) {
        errors.push(`${file}: figure ${fm.figure} view ${fm.view} is not in mounted ArchiMate model ${fm.model}`);
      }
    }
  }
  notes.push(`glossary links from blocks: ${glosLinks}; ArchiMate links and figure mappings: ${archLinks}`);
  for (const [name, n] of otherIris) {
    notes.push(`${n} link(s) into ${name} name something other than a glossary term (a vocabulary class): not checked`);
  }
  for (const [model, n] of unmountedModels) {
    notes.push(`${n} ArchiMate link(s) name model ${model}, which no mounted instance holds (repin it to check them): not checked`);
  }
  if (unchecked) notes.push(`${unchecked} block(s) name ArchiMate elements, but no mounted instance holds a model: not checked`);
  notes.push(`mounted instances: ${mounted.map((m) => m.name).join(", ") || "none"}`);
  return { errors, notes };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const at = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const instance = at("--instance");
  if (!instance) {
    console.error("usage: glossary-validate.ts --instance <name> [--repo .] [--capitalized]");
    process.exit(2);
  }
  const r = await validate(at("--repo") ?? ".", instance, { capitalized: args.includes("--capitalized") });
  for (const n of r.notes) console.log(`· ${n}`);
  for (const e of r.errors) console.error(`✗ ${e}`);
  console.log(r.errors.length ? `✗ ${r.errors.length} problem(s)` : "✓ glossary and links resolve");
  process.exit(r.errors.length ? 1 : 0);
}
