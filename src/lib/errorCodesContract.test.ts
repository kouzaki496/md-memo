import { describe, expect, it } from "vitest";
import { checkErrorCodes } from "@/lib/checkErrorCodes";

/** app_error.rs ↔ messages.errors キー一致（Rust: scripts/check-error-codes.mjs と同じ） */
describe("error codes contract", () => {
  it("app_error.rs and messages.errors keys match", () => {
    const { missingInFe, missingInRust } = checkErrorCodes();
    expect(missingInFe, `missing in messages.errors: ${missingInFe.join(", ")}`).toEqual([]);
    expect(missingInRust, `missing in app_error.rs: ${missingInRust.join(", ")}`).toEqual([]);
  });
});
