import { describe, expect, it } from "vitest";
import { isNetworkError } from "./network";

describe("isNetworkError", () => {
  it("recognises browser fetch failures, including Safari", () => {
    expect(isNetworkError({ message: "TypeError: Failed to fetch" })).toBe(true);
    expect(isNetworkError({ message: "TypeError: Load failed" })).toBe(true);
    expect(isNetworkError({ message: "NetworkError when attempting to fetch resource." })).toBe(true);
  });
  it("treats timeouts and aborts as network failures", () => {
    expect(isNetworkError({ name: "AbortError", message: "x" })).toBe(true);
    expect(isNetworkError({ name: "TimeoutError" })).toBe(true);
  });
  it("does not treat server errors or bugs as network failures", () => {
    expect(isNetworkError({ code: "P0001", message: "EMPTY_CART" })).toBe(false);
    expect(isNetworkError(new Error("boom"))).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});
