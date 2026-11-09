import { describe, expect, it } from "vitest";
import { cartReducer, cartTotals, isOverStock, unitPrice, type CartLine, type CartProduct } from "./cart";

const A: CartProduct = { id: "a", barcode: "1", name: "A", photoPath: null, retailPrice: 10000, wholesalePrice: 8000, weightG: 250, stock: 5 };
const B: CartProduct = { id: "b", barcode: "2", name: "B", photoPath: null, retailPrice: 20000, wholesalePrice: 15000, weightG: 500, stock: 1 };

function build(): CartLine[] {
  let s: CartLine[] = [];
  s = cartReducer(s, { type: "add", product: A });
  s = cartReducer(s, { type: "add", product: A });
  s = cartReducer(s, { type: "add", product: B });
  s = cartReducer(s, { type: "setQty", id: "b", qty: 3 });
  s = cartReducer(s, { type: "toggleWholesale", id: "b" });
  return s;
}

describe("cartReducer", () => {
  it("adding the same product twice increments qty on one line", () => {
    let s = cartReducer([], { type: "add", product: A });
    s = cartReducer(s, { type: "add", product: A });
    expect(s).toHaveLength(1);
    expect(s[0].qty).toBe(2);
  });
  it("setQty 0 removes the line, setQty 7 sets it", () => {
    const s = cartReducer([], { type: "add", product: A });
    expect(cartReducer(s, { type: "setQty", id: "a", qty: 0 })).toHaveLength(0);
    expect(cartReducer(s, { type: "setQty", id: "a", qty: 7 })[0].qty).toBe(7);
  });
  it("dec at qty 1 keeps qty 1", () => {
    const s = cartReducer([], { type: "add", product: A });
    expect(cartReducer(s, { type: "dec", id: "a" })[0].qty).toBe(1);
  });
  it("inc, remove and clear", () => {
    const s = cartReducer([], { type: "add", product: A });
    expect(cartReducer(s, { type: "inc", id: "a" })[0].qty).toBe(2);
    expect(cartReducer(s, { type: "remove", id: "a" })).toHaveLength(0);
    expect(cartReducer(build(), { type: "clear" })).toHaveLength(0);
  });
  it("toggleWholesale switches unit price", () => {
    const b = build().find((l) => l.id === "b")!;
    expect(unitPrice(b)).toBe(15000);
  });
});

describe("cartTotals / isOverStock", () => {
  it("sums lines with wholesale prices applied", () => {
    expect(cartTotals(build())).toEqual({ lineCount: 2, itemCount: 5, totalWeightG: 2000, subtotal: 65000 });
  });
  it("flags qty above stock", () => {
    const [a, b] = build();
    expect(isOverStock(b)).toBe(true);
    expect(isOverStock(a)).toBe(false);
  });
});

describe("limits and refresh", () => {
  it("caps quantities at 99 999", () => {
    const s = cartReducer([], { type: "add", product: A });
    expect(cartReducer(s, { type: "setQty", id: "a", qty: 150000 })[0].qty).toBe(99999);
    const full = cartReducer(s, { type: "setQty", id: "a", qty: 99999 });
    expect(cartReducer(full, { type: "inc", id: "a" })[0].qty).toBe(99999);
  });
  it("refresh updates price and stock, keeps qty and optom, drops products that are gone", () => {
    let s = cartReducer([], { type: "add", product: A });
    s = cartReducer(s, { type: "add", product: B });
    s = cartReducer(s, { type: "toggleWholesale", id: "a" });
    const fresh = cartReducer(s, { type: "refresh", ids: ["a", "b"], products: [{ ...A, retailPrice: 11000, wholesalePrice: 9000, stock: 2 }] });
    expect(fresh).toHaveLength(1);
    expect(fresh[0]).toMatchObject({ id: "a", qty: 1, isWholesale: true, wholesalePrice: 9000, stock: 2 });
  });
});

describe("refresh only touches the lines it asked about", () => {
  it("keeps a line scanned after the refresh request went out", () => {
    let s = cartReducer([], { type: "add", product: A });
    s = cartReducer(s, { type: "add", product: B }); // scanned while the refresh was in flight
    const fresh = cartReducer(s, { type: "refresh", ids: ["a"], products: [{ ...A, retailPrice: 11000 }] });
    expect(fresh.map((l) => l.id)).toEqual(["a", "b"]);
    expect(fresh[0].retailPrice).toBe(11000);
  });
  it("drops a requested line whose product is gone", () => {
    const s = cartReducer(cartReducer([], { type: "add", product: A }), { type: "add", product: B });
    expect(cartReducer(s, { type: "refresh", ids: ["a", "b"], products: [A] }).map((l) => l.id)).toEqual(["a"]);
  });
});

describe("Hammasi optom", () => {
  it("setAllWholesale switches every line on and off", () => {
    let lines = cartReducer([], { type: "add", product: A });
    lines = cartReducer(lines, { type: "add", product: B });
    lines = cartReducer(lines, { type: "setAllWholesale", on: true });
    expect(lines.every((l) => l.isWholesale)).toBe(true);
    lines = cartReducer(lines, { type: "setAllWholesale", on: false });
    expect(lines.some((l) => l.isWholesale)).toBe(false);
  });
  it("adds new products as wholesale while it is on; a single line can still be switched back", () => {
    let lines = cartReducer([], { type: "add", product: A, wholesale: true });
    expect(lines[0].isWholesale).toBe(true);
    lines = cartReducer(lines, { type: "toggleWholesale", id: A.id });
    lines = cartReducer(lines, { type: "add", product: A, wholesale: true });
    expect(lines[0].isWholesale).toBe(false); // an existing line keeps its own choice
  });
});
