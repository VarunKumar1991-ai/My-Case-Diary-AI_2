import { describe, expect, it } from "vitest";
import { extractPlainText } from "./richText.js";

describe("extractPlainText", () => {
  it("extracts the text of a single text node", () => {
    expect(extractPlainText({ type: "text", text: "Hello" })).toBe("Hello");
  });

  it("joins sibling text nodes with a space", () => {
    const doc = {
      type: "paragraph",
      content: [
        { type: "text", text: "Hello" },
        { type: "text", text: "world" },
      ],
    };
    expect(extractPlainText(doc)).toBe("Hello world");
  });

  it("walks nested document structures depth-first", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "First" }] },
        { type: "paragraph", content: [{ type: "text", text: "Second" }] },
      ],
    };
    expect(extractPlainText(doc)).toBe("First Second");
  });

  it("returns an empty string for nodes without text or content", () => {
    expect(extractPlainText({ type: "horizontalRule" })).toBe("");
  });

  it("returns an empty string for non-object input", () => {
    expect(extractPlainText(null)).toBe("");
    expect(extractPlainText(undefined)).toBe("");
    expect(extractPlainText("plain string")).toBe("");
    expect(extractPlainText(42)).toBe("");
  });

  it("never produces interpretable markup from attacker-controlled text content", () => {
    const doc = { type: "text", text: "<script>alert(1)</script>" };
    // The walk only ever copies the `text` string verbatim — it cannot
    // introduce or interpret HTML, so the hostile string survives intact
    // as inert text rather than becoming markup.
    expect(extractPlainText(doc)).toBe("<script>alert(1)</script>");
  });
});
