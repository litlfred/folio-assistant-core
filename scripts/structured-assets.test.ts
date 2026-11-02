import { describe, expect, test } from "bun:test";

import { fieldHeading, linkKindLabels, structuredAssetsBody, type StructuredAsset } from "./structured-assets.ts";

const fr: StructuredAsset = { kind: "functional-requirement", label: "freq:FR-AN-01", id: "FR-AN-01", title: "Standard reports", section: "7.5 Analytics", fields: { priority: "must" }, personas: [] };
const pers: StructuredAsset = { kind: "persona", label: "pers:officer", title: "Registration officer", section: "5.1 Personas", fields: { personaType: "person" }, personas: [] };
const scen: StructuredAsset = { kind: "user-scenario", label: "scen:renew", title: "Renew a licence", section: "5.2", fields: {}, personas: ["pers:officer"] };

describe("the structured-assets page", () => {
  const html = structuredAssetsBody("DTH", [pers, scen, fr]);
  test("one table per kind, in the order the kinds first appear, with counts", () => {
    expect(html.indexOf('id="persona"')).toBeLessThan(html.indexOf('id="user-scenario"'));
    expect(html.indexOf('id="user-scenario"')).toBeLessThan(html.indexOf('id="functional-requirement"'));
    expect(html).toContain("Functional requirements");
    expect(html).toContain("(1)");
  });
  test("every row links to its card in the document", () => {
    expect(html).toContain('<a href="../#freq%3AFR-AN-01">FR-AN-01</a>');
    expect(html).toContain('<a href="../#pers%3Aofficer">Registration officer</a>');
  });
  test("a scenario's personas are named by title and linked", () => {
    expect(html).toMatch(/Renew a licence<\/a><\/td><td><a href="\.\.\/#pers%3Aofficer">Registration officer<\/a>/);
  });
  test("meta fields become columns; where a block came from does not", () => {
    expect(html).toContain(">Priority<");
    expect(html).toContain(">Persona type<");
    expect(fieldHeading("minimumDataSet")).toBe("Minimum data set");
  });
});

describe("kind labels link to the assets page", () => {
  const card = (kind: string) => `<div class="fa-block fa-block-${kind}" markdown="1">\n<p><a id="x"></a>\n<span class="fa-block-kind">K</span> text</p>\n</div>`;
  test("a listed kind links to its table", () => {
    expect(linkKindLabels(card("persona"), new Set(["persona"]))).toContain('<a class="fa-block-kind" href="assets/#persona"');
  });
  test("a kind the page does not list stays plain", () => {
    expect(linkKindLabels(card("remark"), new Set(["persona"]))).toContain('<span class="fa-block-kind">K</span>');
  });
});
