import { describe, expect, it } from "vitest";
import { errorMessage } from "./errors";

describe("errorMessage", () => {
  it("maps known RPC codes to Uzbek", () => {
    expect(errorMessage({ message: "ORDER_ALREADY_CANCELLED" })).toBe("Bu buyurtma allaqachon bekor qilingan");
  });
  it("falls back to a generic message", () => {
    expect(errorMessage(new Error("boom"))).toBe("Xatolik yuz berdi. Qaytadan urinib koʻring.");
  });
});
