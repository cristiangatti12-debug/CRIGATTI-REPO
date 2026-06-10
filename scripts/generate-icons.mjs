// Run with: node scripts/generate-icons.mjs
// Renders VelaLogo.tsx SVG to PNG using sharp
import sharp from "sharp";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Wrap a PNG buffer in a valid ICO container (supported by all modern browsers)
function pngToIco(pngBuffer) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);  // reserved
  header.writeUInt16LE(1, 2);  // type: 1 = ICO
  header.writeUInt16LE(1, 4);  // image count: 1

  const dir = Buffer.alloc(16);
  dir.writeUInt8(32, 0);              // width  32px
  dir.writeUInt8(32, 1);              // height 32px
  dir.writeUInt8(0, 2);               // no palette
  dir.writeUInt8(0, 3);               // reserved
  dir.writeUInt16LE(1, 4);            // color planes
  dir.writeUInt16LE(32, 6);           // bits per pixel
  dir.writeUInt32LE(pngBuffer.length, 8);  // size of image data
  dir.writeUInt32LE(22, 12);          // offset of image data (6 + 16)

  return Buffer.concat([header, dir, pngBuffer]);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");
const appDir    = join(__dirname, "..", "app");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 40 40" fill="none">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#00d4ff"/>
      <stop offset="100%" stop-color="#7b61ff"/>
    </linearGradient>
  </defs>
  <rect width="40" height="40" rx="9" fill="url(#g)"/>
  <path d="M5 30 L5 27 L12 22 L20 24.5 L28 16 L28 30 Z" fill="white" fill-opacity="0.18"/>
  <polyline points="5,27 12,22 20,24.5 28,16" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="12" cy="22" r="1.3" fill="white" fill-opacity="0.7"/>
  <circle cx="20" cy="24.5" r="1.3" fill="white" fill-opacity="0.7"/>
  <circle cx="28" cy="16" r="1.8" fill="white"/>
  <line x1="28" y1="16" x2="28" y2="6" stroke="white" stroke-width="2" stroke-linecap="round"/>
  <path d="M28 7 L28 15.5 L16.5 15.5 Z" fill="white" fill-opacity="0.95"/>
  <path d="M28 9.5 L28 15 L36 12.5 Z" fill="white" fill-opacity="0.6"/>
</svg>`;

const buf = Buffer.from(svg);

await sharp(buf).resize(512, 512).png().toFile(join(publicDir, "icon-512-v2.png"));
console.log("✅ icon-512-v2.png");

await sharp(buf).resize(192, 192).png().toFile(join(publicDir, "icon-192-v2.png"));
console.log("✅ icon-192-v2.png");

const png32 = await sharp(buf).resize(32, 32).png().toBuffer();
writeFileSync(join(appDir, "favicon.ico"), pngToIco(png32));
console.log("✅ favicon.ico");
