import { describe, expect, it } from "vitest";
import { INIT_DATA_MAX_AGE_S, signInitData, verifyInitData } from "./init-data";

const TOKEN = "123456:ABCdefGhIJKlmNoPQRsTUVwxyZ0123456789";
const NOW = 1_800_000_000;

function launch(fields: Record<string, string>, token = TOKEN) {
  const p = new URLSearchParams(fields);
  p.set("hash", signInitData(fields, token));
  return p.toString();
}

const base = { auth_date: String(NOW - 60), query_id: "AAH", user: JSON.stringify({ id: 4242, first_name: "Dilnoza", username: "dili" }) };

describe("verifyInitData", () => {
  it("accepts data signed with the bot token", () => {
    expect(verifyInitData(launch(base), TOKEN, NOW)).toEqual({ id: 4242, firstName: "Dilnoza", lastName: undefined, username: "dili" });
  });

  it("rejects data signed with another bot", () => {
    expect(verifyInitData(launch(base, "999:otherotherotherotherotherotherother"), TOKEN, NOW)).toBeNull();
  });

  it("rejects a changed user id", () => {
    const p = new URLSearchParams(launch(base));
    p.set("user", JSON.stringify({ id: 1, first_name: "Dilnoza" }));
    expect(verifyInitData(p.toString(), TOKEN, NOW)).toBeNull();
  });

  it("rejects old launches", () => {
    const old = { ...base, auth_date: String(NOW - INIT_DATA_MAX_AGE_S - 1) };
    expect(verifyInitData(launch(old), TOKEN, NOW)).toBeNull();
  });

  it("rejects empty or malformed input", () => {
    expect(verifyInitData("", TOKEN, NOW)).toBeNull();
    expect(verifyInitData("hash=zz&user=1", TOKEN, NOW)).toBeNull();
    expect(verifyInitData(launch({ auth_date: String(NOW) }), TOKEN, NOW)).toBeNull();
  });
});
