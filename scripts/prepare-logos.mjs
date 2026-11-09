// Builds print/web-ready logo files under public/brand from Guli.webp (Guli cosmetics).
import sharp from "sharp";

const SRC = "Guli.webp";
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

// Full wordmark (flower + "Guli cosmetics") for the printed sheets and the login page.
await sharp(SRC).flatten({ background: WHITE }).trim({ threshold: 20 }).resize({ height: 400 }).png().toFile("public/brand/guli.png");

// The flower alone, for a square mark that stays readable at favicon / app-shell size.
// The "G" touches the flower's box, so erase the G's connected pink region (seeded inside its stroke).
const { data, info } = await sharp(SRC).flatten({ background: WHITE }).raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;
const isInk = (p) => data[p * C] - data[p * C + 1] > 6;
const stack = [530 * W + 670];
const seen = new Uint8Array(W * H);
let erased = 0;
while (stack.length) {
  const p = stack.pop();
  if (seen[p] || !isInk(p)) continue;
  seen[p] = 1;
  data.fill(255, p * C, p * C + 3);
  erased++;
  const x = p % W;
  if (x > 0) stack.push(p - 1);
  if (x < W - 1) stack.push(p + 1);
  if (p >= W) stack.push(p - W);
  if (p < W * (H - 1)) stack.push(p + W);
}
if (erased > 120000) throw new Error(`G erase spread into the flower (${erased} px)`);

const flowerArea = await sharp(data, { raw: info }).extract({ left: 185, top: 125, width: 530, height: 580 }).png().toBuffer();
const flower = await sharp(flowerArea).trim({ threshold: 20 }).png().toBuffer();
await sharp(flower).resize(96, 96, { fit: "contain", background: WHITE }).png().toFile("public/brand/guli-mark.png");

// Windows app/installer icon (electron-builder builds the .ico from a 512px PNG).
const mark = await sharp(flower).resize(420, 420, { fit: "contain", background: WHITE }).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: WHITE } })
  .composite([{ input: mark, gravity: "center" }])
  .png()
  .toFile("desktop/build/icon.png");

console.log("logos written to public/brand/ and desktop/build/icon.png");
