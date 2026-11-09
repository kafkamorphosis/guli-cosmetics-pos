"use client";

import { useCallback, useEffect, useReducer } from "react";
import { cartReducer, cartTotals, type CartLine } from "@/lib/domain/cart";
import type { StoredRequest } from "./request-key";

export type CartKeys = { cart: string; request: string };
export const KASSA_CART: CartKeys = { cart: "guli.cart", request: "guli.cart.request" };

function loadLines(key: string): CartLine[] {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as CartLine[]) : [];
  } catch {
    return [];
  }
}

// The cart survives an accidental reload. Only render this hook client-side (the checkout
// screen is loaded with ssr: false), so reading sessionStorage during init is safe.
export function useCart(keys: CartKeys) {
  const requestKey = keys.request;
  const [lines, dispatch] = useReducer(cartReducer, keys.cart, loadLines);

  useEffect(() => {
    try {
      sessionStorage.setItem(keys.cart, JSON.stringify(lines));
    } catch {
      // Storage full or blocked: the cart still works for this page view.
    }
  }, [keys.cart, lines]);

  // The idempotency key of the last attempt plus a fingerprint of what it sent, persisted so a
  // reload after a lost response can still tell a retry from a changed cart (see request-key.ts).
  const loadRequest = useCallback((): StoredRequest => {
    try {
      const raw = sessionStorage.getItem(requestKey);
      const parsed = raw ? (JSON.parse(raw) as StoredRequest) : null;
      return parsed && typeof parsed.id === "string" && typeof parsed.fp === "string" ? parsed : null;
    } catch {
      return null;
    }
  }, [requestKey]);

  const saveRequest = useCallback((r: StoredRequest) => {
    try {
      if (r) sessionStorage.setItem(requestKey, JSON.stringify(r));
      else sessionStorage.removeItem(requestKey);
    } catch {}
  }, [requestKey]);

  const finishOrder = useCallback(() => {
    saveRequest(null);
    dispatch({ type: "clear" });
  }, [saveRequest]);

  return { lines, dispatch, totals: cartTotals(lines), loadRequest, saveRequest, finishOrder };
}
