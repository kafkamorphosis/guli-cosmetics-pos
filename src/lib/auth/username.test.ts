import { expect, it } from "vitest";
import { usernameToEmail } from "./username";

it("maps a username to the synthetic auth email", () => {
  expect(usernameToEmail(" Ali.Seller ")).toBe("ali.seller@gulicosmetics.local");
});
