const fs = require('fs');
const path = require('path');
const { GenerateSW } = require('workbox-webpack-plugin');

const publicUrl = (process.env.PUBLIC_URL || '').replace(/\/$/, '');

/**
 * PNG/manifest en public/ se copian a build/ pero no pasan por webpack chunks;
 * Workbox no los precacheaba. Sin ellos en precache, el SW no aporta el arreglo al 404 del servidor,
 * pero incluirlos evita estados raros y alinea la PWA con los archivos reales del build.
 */
function additionalManifestEntriesFromPublic() {
  const publicDir = path.join(__dirname, 'public');
  const iconsDir = path.join(publicDir, 'icons');
  const entries = [];

  const pushUrl = (relativePath) => {
    const url = `${publicUrl}/${relativePath}`.replace(/\/+/g, '/');
    entries.push({ url: url.startsWith('/') ? url : `/${url}`, revision: null });
  };

  if (fs.existsSync(iconsDir)) {
    for (const f of fs.readdirSync(iconsDir)) {
      if (f.endsWith('.png')) {
        pushUrl(`icons/${f}`);
      }
    }
  }

  if (fs.existsSync(path.join(publicDir, 'apple-touch-icon.png'))) {
    pushUrl('apple-touch-icon.png');
  }
  if (fs.existsSync(path.join(publicDir, 'manifest.webmanifest'))) {
    pushUrl('manifest.webmanifest');
  }

  return entries;
}

module.exports = {
  webpack: {
    configure: (webpackConfig, { env }) => {
      if (env === 'production') {
        const extra = additionalManifestEntriesFromPublic();
        webpackConfig.plugins.push(
          new GenerateSW({
            clientsClaim: false,
            skipWaiting: false,
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
            navigateFallback: `${publicUrl || ''}/index.html`.replace(/\/+/g, '/'),
            navigateFallbackDenylist: [
              /^\/api\//,
              /^\/icons\//,
              /\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot|json|webmanifest)$/i,
            ],
            additionalManifestEntries: extra,
            runtimeCaching: [
              {
                urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/fullcalendar\/.*/i,
                handler: 'StaleWhileRevalidate',
                options: {
                  cacheName: 'fullcalendar-css',
                },
              },
              {
                urlPattern: ({ url }) => url.pathname.startsWith('/api'),
                handler: 'NetworkOnly',
              },
              {
                urlPattern: ({ url }) =>
                  url.pathname.startsWith(`${publicUrl || ''}/icons/`.replace(/\/+/g, '/')) &&
                  url.pathname.endsWith('.png'),
                handler: 'StaleWhileRevalidate',
                options: {
                  cacheName: 'pwa-icons',
                  expiration: {
                    maxEntries: 40,
                    maxAgeSeconds: 60 * 60 * 24 * 30,
                  },
                },
              },
            ],
          })
        );
      }
      return webpackConfig;
    },
  },
};
