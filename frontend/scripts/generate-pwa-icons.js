/**
 * Genera PNGs placeholder para desarrollo (banda slate + cyan).
 * Los iconos definitivos viven en public/icons/ y public/apple-touch-icon.png (ver manifest.webmanifest).
 * Ejecutar: npm run generate-icons
 */
const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');

const publicDir = path.join(__dirname, '..', 'public');
const iconsDir = path.join(publicDir, 'icons');

function fillBand(image, y0, y1, rgba) {
  image.scan(0, y0, image.bitmap.width, y1 - y0, function (x, y, idx) {
    this.bitmap.data[idx + 0] = rgba[0];
    this.bitmap.data[idx + 1] = rgba[1];
    this.bitmap.data[idx + 2] = rgba[2];
    this.bitmap.data[idx + 3] = rgba[3];
  });
}

function mk(size, destAbsolutePath) {
  return new Promise((resolve, reject) => {
    new Jimp(size, size, 0x0f172aff, (err, image) => {
      if (err) return reject(err);
      const half = Math.floor(size / 2);
      fillBand(image, half, size, [14, 165, 233, 255]);
      image.write(destAbsolutePath, (e) => (e ? reject(e) : resolve()));
    });
  });
}

async function main() {
  await fs.promises.mkdir(iconsDir, { recursive: true });
  await mk(192, path.join(iconsDir, 'icon-192.png'));
  await mk(512, path.join(iconsDir, 'icon-512.png'));
  await mk(180, path.join(publicDir, 'apple-touch-icon.png'));
  console.log('Placeholders escritos: public/icons/icon-192.png, icon-512.png, public/apple-touch-icon.png');
  console.log('Si ya tienes marca definitiva, no vuelvas a ejecutar este script.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
