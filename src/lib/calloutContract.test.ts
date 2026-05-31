import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeCalloutKind, splitPreviewSegments } from "@/lib/previewSegments";

type CalloutContract = {
  version: number;
  constants: {
    kinds: string[];
    defaultKind: string;
    labelsJa: Record<string, string>;
  };
  normalizeKind: Array<{ id: string; raw: string | null; kind: string }>;
  splitSegments: Array<{
    id: string;
    markdown: string;
    segments: Array<{ type: string; kind?: string; content: string }>;
  }>;
  renderBodyHtml: Array<{ id: string; markdown: string; contains: string[] }>;
};

const contractPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/callout-contract.json"
);
const contract = JSON.parse(readFileSync(contractPath, "utf8")) as CalloutContract;

/** docs/callout-contract.json — FE 側契約テスト（Rust: callout_contract.rs） */
describe("callout contract (FE)", () => {
  it("constants match docs/callout-contract.json", () => {
    expect(contract.constants.defaultKind).toBe("info");
    expect(contract.constants.kinds).toEqual(["info", "warn", "alert", "tip"]);
    expect(contract.constants.labelsJa.warn).toBe("注意");
  });

  it("normalizeKind cases", () => {
    for (const { id, raw, kind } of contract.normalizeKind) {
      expect(normalizeCalloutKind(raw ?? undefined), id).toBe(kind);
    }
  });

  it("splitSegments cases", () => {
    for (const { id, markdown, segments } of contract.splitSegments) {
      const actual = splitPreviewSegments(markdown);
      expect(
        actual.map((s) =>
          s.type === "callout"
            ? { type: s.type, kind: s.kind, content: s.content }
            : { type: s.type, content: s.content }
        ),
        id
      ).toEqual(segments);
    }
  });
});
