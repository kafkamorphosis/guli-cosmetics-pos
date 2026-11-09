// Nasiya: what a credit order owes. Uzbekistan shipping in $ is paid separately and is not debt.
export function creditTotal(o: { subtotal: number; shipping_krw: number }): number {
  return o.subtotal + o.shipping_krw;
}

export function outstanding(rows: { paid_krw: number; credit_due_krw: number }[]) {
  return {
    due: rows.reduce((n, r) => n + r.credit_due_krw, 0),
    paid: rows.reduce((n, r) => n + r.paid_krw, 0),
    count: rows.length,
  };
}
