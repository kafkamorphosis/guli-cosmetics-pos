import { describe, expect, it } from "vitest";
import { cartFingerprint, resolveRequest, type Payload } from "./request-key";

const base: Payload = {
  items: [
    { product_id: "b", qty: 1, is_wholesale: false },
    { product_id: "a", qty: 2, is_wholesale: true },
  ],
  type: "store",
  destination: null,
  phone: null,
  name: null,
  payment: "cash",
};

describe("cartFingerprint", () => {
  it("ignores line order", () => {
    expect(cartFingerprint(base)).toBe(cartFingerprint({ ...base, items: [...base.items].reverse() }));
  });
  it("changes when the cart, type or customer changes", () => {
    const fp = cartFingerprint(base);
    expect(cartFingerprint({ ...base, items: [{ product_id: "a", qty: 3, is_wholesale: true }] })).not.toBe(fp);
    expect(cartFingerprint({ ...base, type: "tekpe", destination: "UZ" })).not.toBe(fp);
    expect(cartFingerprint({ ...base, phone: "+821012345678" })).not.toBe(fp);
  });
});

describe("resolveRequest", () => {
  const never = async () => {
    throw new Error("should not look up");
  };
  it("mints a key for a first attempt", async () => {
    expect(await resolveRequest(null, "fp1", never, () => "new")).toEqual({ kind: "new", id: "new" });
  });
  it("reuses the key when retrying the same cart", async () => {
    expect(await resolveRequest({ id: "k1", fp: "fp1" }, "fp1", never, () => "new")).toEqual({ kind: "reuse", id: "k1" });
  });
  it("mints a new key when the cart changed and the old attempt never landed", async () => {
    expect(await resolveRequest({ id: "k1", fp: "fp1" }, "fp2", async () => null, () => "new")).toEqual({ kind: "new", id: "new" });
  });
  it("reports the order the old attempt already placed when the cart changed", async () => {
    const order = { id: "o1", order_no: 7 };
    expect(await resolveRequest({ id: "k1", fp: "fp1" }, "fp2", async (id) => (id === "k1" ? order : null), () => "new")).toEqual({
      kind: "placed",
      order,
    });
  });
});
