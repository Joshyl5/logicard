// One-off script: rasterizes public/favicon.svg into PWA icon sizes.
// Not part of the running app — run once, then `sharp` can be removed from package.json.
const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');

const NAVY    = '#071d40';
const svgPath = path.join(__dirname, '..', 'public', 'favicon.svg');
const outDir  = path.join(__dirname, '..', 'public', 'icons');

async function composite(size, glyphSize, background = NAVY) {
  const svgBuffer   = fs.readFileSync(svgPath);
  const glyphBuffer = await sharp(svgBuffer).resize(glyphSize, glyphSize).toBuffer();
  const offset      = Math.round((size - glyphSize) / 2);

  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: glyphBuffer, top: offset, left: offset }])
    .png()
    .toBuffer();
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  // "any" icons — the source art already has natural internal padding (~75-78% fill), so no extra offset needed.
  for (const size of [192, 512]) {
    const buf = await composite(size, size);
    fs.writeFileSync(path.join(outDir, `icon-${size}.png`), buf);
  }

  // Maskable — Android's safe zone needs content within the inner ~80% circle,
  // so scale the glyph down further and center it with generous padding.
  const maskableBuf = await composite(512, Math.round(512 * 0.65));
  fs.writeFileSync(path.join(outDir, 'icon-512-maskable.png'), maskableBuf);

  // Apple touch icon — iOS ignores manifest.json, needs its own opaque PNG.
  const appleBuf = await composite(180, Math.round(180 * 0.78));
  fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), appleBuf);

  console.log('Generated icons in', outDir);
}

main().catch(err => { console.error(err); process.exit(1); });
