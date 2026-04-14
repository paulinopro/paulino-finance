/**
 * Comprueba que los PNG en public/icons/ coincidan con sizes en manifest.webmanifest.
 * Uso: node scripts/validate-pwa-icons.js
 */
const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');

const publicDir = path.join(__dirname, '..', 'public');

async function main() {
  const manifestPath = path.join(publicDir, 'manifest.webmanifest');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const errors = [];

  for (const icon of manifest.icons) {
    const file = path.join(publicDir, icon.src);
    if (!fs.existsSync(file)) {
      errors.push(`Falta archivo: ${icon.src}`);
      continue;
    }
    const img = await Jimp.read(file);
    const w = img.bitmap.width;
    const h = img.bitmap.height;
    const [ew, eh] = icon.sizes.split('x').map(Number);
    if (w !== ew || h !== eh) {
      errors.push(`${icon.src}: manifest dice ${icon.sizes}, archivo es ${w}x${h}`);
    }
  }

  const apple = path.join(publicDir, 'apple-touch-icon.png');
  if (fs.existsSync(apple)) {
    const img = await Jimp.read(apple);
    const w = img.bitmap.width;
    const h = img.bitmap.height;
    if (w !== h) {
      errors.push(`apple-touch-icon.png: debería ser cuadrado (es ${w}x${h})`);
    }
    if (w !== 180 || h !== 180) {
      console.warn(
        `Aviso: apple-touch-icon.png es ${w}x${h}; Apple recomienda 180x180 (suele aceptar tamaños cercanos).`
      );
    }
  } else {
    errors.push('Falta public/apple-touch-icon.png');
  }

  if (errors.length) {
    console.error('Validación de iconos PWA:\n' + errors.join('\n'));
    process.exit(1);
  }
  console.log('Validación OK: iconos del manifest y apple-touch-icon presentes.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
