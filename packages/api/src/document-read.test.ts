import { describe, expect, it } from "vitest";
import { findPages, selectPages } from "./document-read.js";

const pages = [
  "Seite eins: Vertragsbeginn 2019.",
  "Seite zwei: Abschlusskosten und Zillmerung.",
  "Seite drei: Laufende Kosten 2,4 % TER.",
  "Seite vier: Rückkaufswert.",
  "Seite fünf: Kündigungsfrist.",
];

describe("selectPages", () => {
  it("reads three pages by default and reports the next page", () => {
    const selection = selectPages(pages);
    expect(selection.pages.map((p) => p.page)).toEqual([1, 2, 3]);
    expect(selection.nextPage).toBe(4);
    expect(selection.truncated).toBe(true);
  });

  it("reads a single requested page", () => {
    const selection = selectPages(pages, { page: 3 });
    expect(selection.pages).toEqual([
      { page: 3, text: "Seite drei: Laufende Kosten 2,4 % TER." },
    ]);
    expect(selection.nextPage).toBe(4);
  });

  it("clamps out-of-range pages", () => {
    const selection = selectPages(pages, { page: 99 });
    expect(selection.firstPage).toBe(5);
    expect(selection.nextPage).toBeNull();
  });

  it("stops at the character budget and points to the next page", () => {
    const selection = selectPages(pages, { pageFrom: 1, pageTo: 5, maxChars: 20 });
    expect(selection.pages).toHaveLength(1);
    expect(selection.pages[0]!.text.length).toBe(20);
    expect(selection.nextPage).toBe(2);
  });

  it("caps a call at five pages", () => {
    const many = Array.from({ length: 20 }, (_, i) => `Seite ${i + 1}`);
    const selection = selectPages(many, { pageFrom: 1, pageTo: 20, maxChars: 20000 });
    expect(selection.pages).toHaveLength(5);
    expect(selection.nextPage).toBe(6);
  });
});

describe("findPages", () => {
  it("finds pages with context and page numbers", () => {
    const matches = findPages(pages, "zillmerung");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.page).toBe(2);
    expect(matches[0]!.snippet).toContain("Zillmerung");
  });

  it("returns no matches for an unknown term", () => {
    expect(findPages(pages, "garantiezins")).toEqual([]);
  });

  it("limits the number of matching pages", () => {
    const many = Array.from({ length: 10 }, (_, i) => `Kosten auf Seite ${i + 1}`);
    expect(findPages(many, "kosten", 3)).toHaveLength(3);
  });
});
