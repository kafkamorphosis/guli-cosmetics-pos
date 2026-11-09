// Texts the shop bot sends in chat (Uzbek Latin, like the rest of the app).
export function shopWelcome(firstName?: string) {
  const hi = firstName ? `Assalomu alaykum, ${firstName}!` : "Assalomu alaykum!";
  return `${hi} 🌸\nGuli cosmetics doʻkoniga xush kelibsiz.\n\nPastdagi tugmani bosing, mahsulotlarni tanlang va buyurtma bering. Buyurtma holati haqida shu yerga xabar yuboramiz.`;
}
