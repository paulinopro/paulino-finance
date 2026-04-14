/**
 * Genera todos los PNG del manifest a partir de UN icono maestro.
 *
 * 1. Coloca tu icono (PNG, idealmente cuadrado y ≥512px, mejor 1024px) en:
 *    public/pwa-icon-source.png
 *    (puedes copiarlo desde tu archivo definitivo, p. ej. el que usas en build/icons).
 * 2. Ejecuta: npm run generate-icons
 *
 * Escribe en public/icons/* y public/apple-touch-icon.png (CRA los copia a build/ al hacer npm run build).
 */
const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');

const publicDir = path.join(__dirname, '..', 'public');
const manifestPath = path.join(publicDir, 'manifest.webmanifest');
const SOURCE = path.join(publicDir, 'pwa-icon-source.png');

function writeSized(srcImage, size, destAbsolutePath) {
  return new Promise((resolve, reject) => {
    srcImage
      .clone()
      .cover(size, size)
      .write(destAbsolutePath, (err) => (err ? reject(err) : resolve()));
  });
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(
      [
        'No existe public/pwa-icon-source.png',
        'Copia ahí tu icono definitivo (PNG cuadrado, recomendado 1024×1024).',
        'Ejemplo: copia el PNG que ya tengas en build/icons (p. ej. icon-512.png) y renómbralo a pwa-icon-source.png.',
      ].join('\n')
    );
    process.exit(1);
  }

  const master = await Jimp.read(SOURCE);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const iconsDir = path.join(publicDir, 'icons');
  await fs.promises.mkdir(iconsDir, { recursive: true });

  const written = [];
  for (const icon of manifest.icons) {
    const [w] = icon.sizes.split('x').map(Number);
    const dest = path.join(publicDir, icon.src);
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await writeSized(master, w, dest);
    written.push(icon.src);
  }

  const appleDest = path.join(publicDir, 'apple-touch-icon.png');
  await writeSized(master, 180, appleDest);
  written.push('apple-touch-icon.png');

  console.log(`Generados ${written.length} archivos desde pwa-icon-source.png`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
