export type OrderType = "store" | "tekpe";
export type Destination = "KR" | "UZ";
export type PaymentMethod = "cash" | "card" | "transfer" | "credit";

// The order the client wants the buttons in: Oʻtkazma, Naqd, Nasiya, Karta.
export const PAYMENT_METHODS: PaymentMethod[] = ["transfer", "cash", "credit", "card"];
export type OrderStatus = "completed" | "pending" | "new" | "ready" | "picked_up" | "cancelled";
