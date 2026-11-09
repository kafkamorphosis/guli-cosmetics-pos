import { describe, expect, it } from "vitest";
import { badgeCount, NAV } from "./nav-items";

describe("badgeCount", () => {
  it("adds up the live counts an item shows", () => {
    const counts = { lowStock: 3, pending: 2 };
    expect(badgeCount({ badge: ["lowStock", "pending"] }, counts)).toBe(5);
    expect(badgeCount({ badge: ["pending"] }, counts)).toBe(2);
    expect(badgeCount({}, counts)).toBeNull();
  });
  it("shows nothing until a count has loaded", () => {
    expect(badgeCount({ badge: ["pending"] }, { lowStock: 3, pending: null })).toBeNull();
    expect(badgeCount({ badge: ["lowStock", "pending"] }, { lowStock: 3, pending: null })).toBe(3);
  });
});

describe("NAV", () => {
  it("puts pending orders on Tekpe and Bildirishnomalar", () => {
    expect(NAV.pos.find((i) => i.href === "/tekpe")?.badge).toEqual(["pending"]);
    expect(NAV.pos.find((i) => i.href === "/bildirishnomalar")?.badge).toEqual(["lowStock", "pending"]);
  });
});
