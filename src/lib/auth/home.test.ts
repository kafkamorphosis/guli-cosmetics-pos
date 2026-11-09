import { describe, expect, it } from "vitest";
import { homeFor, navKeyFor } from "./home";

describe("homeFor", () => {
  it("sends each role to its own start page", () => {
    expect(homeFor("admin")).toBe("/admin");
    expect(homeFor("manager")).toBe("/");
    expect(homeFor("seller")).toBe("/buyurtmalarim");
  });
});

describe("navKeyFor", () => {
  it("picks the menu for the role", () => {
    expect(navKeyFor("manager")).toBe("pos");
    expect(navKeyFor("seller")).toBe("seller");
    expect(navKeyFor("admin")).toBe("admin");
  });
});
