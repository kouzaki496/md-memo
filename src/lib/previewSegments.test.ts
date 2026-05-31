import { describe, expect, it } from "vitest";
import { splitPreviewSegments } from "@/lib/previewSegments";

describe("splitPreviewSegments", () => {
  it("returns single markdown segment for plain text", () => {
    const segments = splitPreviewSegments("hello\nworld");
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ type: "markdown", content: "hello\nworld" });
  });

  it("parses block callout", () => {
    const md = ["::: note warn", "be careful", ":::"].join("\n");
    const segments = splitPreviewSegments(md);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ type: "callout", kind: "warn", content: "be careful" });
  });

  it("parses single-line callout", () => {
    const segments = splitPreviewSegments("note::tip Remember this");
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ type: "callout", kind: "tip", content: "Remember this" });
  });

  it("keeps unclosed callout as markdown", () => {
    const md = ["::: note", "no end"].join("\n");
    const segments = splitPreviewSegments(md);
    expect(segments).toHaveLength(1);
    expect(segments[0].type).toBe("markdown");
  });
});
