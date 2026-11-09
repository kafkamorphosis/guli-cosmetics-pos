import { describe, expect, it } from "vitest";
import { groupByBox, type BoxGroupOrder } from "./box-groups";

const o = (id: string, over: Partial<BoxGroupOrder>): BoxGroupOrder => ({
  id,
  created_at: `2026-10-25T0${id.length}:00:00Z`,
  status: "new",
  destination: "KR",
  box_id: null,
  box_no: null,
  box_status: null,
  ...over,
});

describe("groupByBox", () => {
  const orders = [
    o("p1", { status: "pending", created_at: "2026-10-25T09:00:00Z" }),
    o("a1", { box_id: "bOpen", box_no: 9, box_status: "open", created_at: "2026-10-25T08:00:00Z" }),
    o("a2", { box_id: "bOpen", box_no: 9, box_status: "open", created_at: "2026-10-25T08:30:00Z" }),
    o("c1", { status: "ready", box_id: "b5", box_no: 5, box_status: "closed" }),
    o("c2", { status: "picked_up", box_id: "b3", box_no: 3, box_status: "picked_up" }),
    o("x1", { status: "cancelled" }),
    o("u1", { destination: "UZ", box_id: "bUz", box_no: 8, box_status: "open" }),
  ];

  it("keeps only the chosen country", () => {
    expect(groupByBox(orders, "UZ").map((g) => g.key)).toEqual(["bUz"]);
  });

  it("orders groups: pending, open box, closed boxes newest first, then the rest", () => {
    const groups = groupByBox(orders, "KR");
    expect(groups.map((g) => [g.kind, g.boxNo])).toEqual([
      ["pending", null],
      ["open", 9],
      ["closed", 5],
      ["closed", 3],
      ["other", null],
    ]);
  });

  it("lists orders newest first inside a group", () => {
    const open = groupByBox(orders, "KR").find((g) => g.kind === "open")!;
    expect(open.orders.map((x) => x.id)).toEqual(["a2", "a1"]);
  });
});
