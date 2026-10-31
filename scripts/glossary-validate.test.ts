import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { instanceNs } from "./glossary-page.ts";
import { validate } from "./glossary-validate.ts";

function scheme(id: string, terms: object[]) {
  return JSON.stringify({ $schema: "folio-glossary/v1", id, title: id, source: "test", terms });
}

function term(id: string, prefLabel: string, extra: object = {}) {
  return { id, prefLabel, definition: `${prefLabel}.`, status: "candidate", source: "test", ...extra };
}

/** A repo holding instance `pc`, which mounts instance `sc` at `sc/`. */
function fixture(pcTerms: object[], block?: object): string {
  const repo = mkdtempSync(join(tmpdir(), "glossary-validate-"));
  writeFileSync(join(repo, "pc.json"), JSON.stringify({ name: "pc" }));
  mkdirSync(join(repo, "glossary"));
  writeFileSync(join(repo, "glossary/pc.glossary.json"), scheme("pc", pcTerms));
  mkdirSync(join(repo, "sc/glossary"), { recursive: true });
  writeFileSync(join(repo, "sc/sc.json"), JSON.stringify({ name: "sc" }));
  writeFileSync(join(repo, "sc/glossary/sc.glossary.json"), scheme("sc", [term("traceability", "Traceability")]));
  if (block) {
    mkdirSync(join(repo, "folio/pc/ch01"), { recursive: true });
    writeFileSync(join(repo, "folio/pc/ch01/b.ts"), `export default prose({\n  meta: ${JSON.stringify(block)},\n});\n`);
  }
  return repo;
}

const sc = `${instanceNs("sc")}glossary/sc/`;

describe("glossary-validate", () => {
  test("a scheme whose links all resolve passes", async () => {
    const repo = fixture([
      term("trade-item", "Trade Item", { broadMatch: ["https://www.gs1.org/standards/id-keys/gtin"] }),
      term("generic-product", "Generic Product", { related: ["trade-item"], closeMatch: [`${sc}traceability`] }),
    ]);
    const r = await validate(repo, "pc", { capitalized: true });
    expect(r.errors).toEqual([]);
    expect(r.notes.join("\n")).toContain("mounted instances: sc");
  });

  test("a mounted instance's IRI that names no term fails", async () => {
    const r = await validate(fixture([term("trade-item", "Trade Item", { exactMatch: [`${sc}missing`] })]), "pc");
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain("is not a term in sc");
  });

  test("a scheme that does not parse is reported, not thrown", async () => {
    const r = await validate(fixture([term("trade-item", "Trade Item", { related: ["no-such"] })]), "pc");
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain("no-such");
  });

  test("--capitalized refuses a lower-case prefLabel; without it, it passes", async () => {
    const repo = fixture([term("trade-item", "trade item")]);
    expect((await validate(repo, "pc", { capitalized: true })).errors[0]).toContain("is not Capitalized");
    expect((await validate(repo, "pc")).errors).toEqual([]);
  });

  test("a block's meta.glossary link is checked; ArchiMate links with no model mounted are noted, not failed", async () => {
    const repo = fixture([term("trade-item", "Trade Item")], {
      glossary: [{ iri: `${sc}traceability` }, { iri: `${sc}gone` }],
      archimate: { elements: [{ iri: "https://x/archimate/m/elements/e.jsonld", name: "E" }] },
    });
    const r = await validate(repo, "pc");
    expect(r.errors.length).toBe(1);
    expect(r.errors[0]).toContain(`${sc}gone`);
    expect(r.notes.join("\n")).toContain("no mounted instance holds a model: not checked");
  });
});
