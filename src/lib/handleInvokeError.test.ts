import { describe, expect, it, vi } from "vitest";
import { handleInvokeError, reportStatusError } from "@/lib/handleInvokeError";
import { messages } from "@/lib/messages";

describe("handleInvokeError", () => {
  it("maps known error codes", () => {
    expect(handleInvokeError("search_task_failed")).toBe(messages.errors.search_task_failed());
  });

  it("logs with optional context", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    handleInvokeError("note_not_found", "read_note");
    expect(spy).toHaveBeenCalledWith("read_note", "note_not_found");
    spy.mockRestore();
  });
});

describe("reportStatusError", () => {
  it("sets formatted status message", () => {
    const setStatus = vi.fn();
    reportStatusError(setStatus, "config_save_failed");
    expect(setStatus).toHaveBeenCalledWith(messages.errors.config_save_failed());
  });
});
