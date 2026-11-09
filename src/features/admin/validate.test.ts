import { describe, expect, it } from "vitest";
import { normalizeUsername, validatePassword, validateUsername } from "./validate";

describe("validateUsername", () => {
  it("accepts 3-32 lowercase letters, digits, dot, dash, underscore", () => {
    expect(validateUsername("Ali.Seller")).toBeNull();
    expect(validateUsername("e2e_seller")).toBeNull();
  });
  it("rejects too short and spaces", () => {
    expect(validateUsername("ab")).not.toBeNull();
    expect(validateUsername("ali seller")).not.toBeNull();
    expect(validateUsername("aliʻ")).not.toBeNull();
  });
  it("normalizes case and whitespace", () => {
    expect(normalizeUsername("  Ali.Seller ")).toBe("ali.seller");
  });
});

describe("validatePassword", () => {
  it("requires at least 8 characters", () => {
    expect(validatePassword("1234567")).not.toBeNull();
    expect(validatePassword("12345678")).toBeNull();
  });
});
