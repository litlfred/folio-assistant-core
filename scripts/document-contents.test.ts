import { describe, expect, test } from "bun:test";

import { contentsList } from "./build-document-site.ts";

const ch = (id: string, title: string) => `<p><a id="${id}"></a></p>\n<h2>${title}</h2>\n<p>Text.</p>\n`;
const sec = (id: string, title: string) => `<p><a id="${id}"></a></p>\n<h3>${title}</h3>\n<p>Text.</p>\n`;

describe("contentsList", () => {
  test("chaptersAndSectionsLinked", () => {
    const out = contentsList(`<h1>Doc</h1>\n${ch("chap:one", "One")}${sec("sec:1-1", "One &amp; a half")}${ch("chap:two", "Two")}`);
    expect(out).toContain('<ol><li><a href="#chap:one">One</a><ol><li><a href="#sec:1-1">One &amp; a half</a></li></ol></li><li><a href="#chap:two">Two</a></li></ol>');
  });

  test("notAHeading", () => {
    const out = contentsList(`${ch("chap:one", "One")}${ch("chap:two", "Two")}`);
    expect(out).toContain("<strong>Contents</strong>");
    expect(out).not.toMatch(/<h[1-6]\b/);
  });

  test("ownContentsKept", () => {
    expect(contentsList(`<h2>Table of contents</h2>\n${ch("chap:one", "One")}${ch("chap:two", "Two")}`)).toBe("");
  });

  test("oneChapterNone", () => {
    expect(contentsList(ch("chap:one", "One"))).toBe("");
  });
});
