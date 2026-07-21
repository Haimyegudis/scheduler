// One-off script to (re)generate PWA icons from public/logo.png.
// Run with: node scripts/gen-pwa-icons.js
const sharp = require('sharp');
const path = require('path');

const src = path.join(__dirname, '..', 'public', 'logo.png');

async function main() {
  for (const size of [512, 192]) {
    const out = path.join(__dirname, '..', 'public', `pwa-${size}.png`);
    await sharp(src)
      .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toFile(out);
    console.log('wrote', out);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
