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
 *   namespace that is not mounted (GS1, HL7, …) is not checked;
 * - every concept a block names in `meta.glossary` exists, here or in a mount;
 * - every ArchiMate element or view a block names in `meta.archimate`, and
 *   every figure-to-view mapping, exists in a mounted instance's model;
 * - with `--capitalized`, every prefLabel starts with a capital (the DTH rule
 *   that KG concepts are Capitalized; owner, 2026-10-31).
 *
 * A mounted instance is any directory `<repo>/<d>/` holding `<d>.json`. It
 * reports each failure and exits 1 if there is one. ArchiMate links are
 * reported as unchecked, not failed, when no mounted instance holds a model.
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
    if (inst && !there.get(inst)!.has(r)) errors.push(`${ctx}: ${r} is not a term in ${inst.name}`);
  };

  for (const { f, g } of here.docs) {
    for (const t of g.terms) {
      if (opts.capitalized && !/^[A-Z]/.test(t.prefLabel)) errors.push(`${f}: ${t.id} prefLabel "${t.prefLabel}" is not Capitalized`);
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
  for (const file of walkTs(join(repo, "folio", instance))) {
    const src = readFileSync(file, "utf-8");
    if (!src.includes('"archimate"') && !src.includes('"glossary"')) continue;
    const m = src.match(/meta: (\{.*\}),\n/);
    if (!m) {
      errors.push(`${file}: names "archimate" or "glossary" but its meta is not one line of JSON`);
      continue;
    }
    const meta = JSON.parse(m[1]);
    for (const gEntry of Array.isArray(meta.glossary) ? meta.glossary : []) {
      glosLinks++;
      checkRef(`${file} meta.glossary`, String(gEntry.iri));
    }
    const a = meta.archimate;
    if (!a) continue;
    if (!models.size) {
      unchecked++;
      continue;
    }
    for (const x of [...(a.elements ?? []), ...(a.views ?? [])]) {
      archLinks++;
      const hit = String(x.iri).match(iriRe);
      if (!hit || !models.get(hit[1])?.[hit[2] as "elements" | "views"].has(hit[3])) {
        errors.push(`${file}: ${x.iri} (${x.name}) is not in a mounted ArchiMate model`);
      }
    }
    for (const fm of a.figures ?? []) {
      archLinks++;
      if (!models.get(String(fm.model))?.views.has(String(fm.view))) {
        errors.push(`${file}: figure ${fm.figure} view ${fm.view} is not in mounted ArchiMate model ${fm.model}`);
      }
    }
  }
  notes.push(`glossary links from blocks: ${glosLinks}; ArchiMate links and figure mappings: ${archLinks}`);
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
