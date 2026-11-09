export type Role = "admin" | "manager" | "seller";

// Server layouts pick a menu by name; icons are components and can't cross to the client as props.
export type NavKey = "pos" | "seller" | "admin";

const HOME = { admin: "/admin", manager: "/", seller: "/buyurtmalarim" } as const;
const NAV_KEY: Record<Role, NavKey> = { admin: "admin", manager: "pos", seller: "seller" };

export function homeFor<R extends Role>(role: R): (typeof HOME)[R] {
  return HOME[role];
}

export function navKeyFor(role: Role): NavKey {
  return NAV_KEY[role];
}
