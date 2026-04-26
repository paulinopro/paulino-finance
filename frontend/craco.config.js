const { GenerateSW } = require('workbox-webpack-plugin');

const publicUrl = (process.env.PUBLIC_URL || '').replace(/\/$/, '');

/** RegExp serializado en el SW; no usar variables dentro de funciones match (no existen en el SW). */
function pwaImageAssetsRuntimePattern() {
  const prefix = (publicUrl || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') || '';
  // /pwa-icons/*.png o /apple-touch-icon.png (login, apple-touch, og); mismo host + PUBLIC_URL
  if (!prefix) {
    return new RegExp(
      `^https?://[^/]+(/pwa-icons/[^?]+\\.png|/apple-touch-icon\\.png)(\\?.*)?$`,
      'i'
    );
  }
  return new RegExp(
    `^https?://[^/]+${prefix}(/pwa-icons/[^?]+\\.png|/apple-touch-icon\\.png)(\\?.*)?$`,
    'i'
  );
}

/**
 * No añadimos PNG/manifest de public/ a additionalManifestEntries: Workbox precachea en el
 * install y un 404 en producción rompe todo el SW (bad-precaching-response). Los iconos se
 * sirven como estáticos del build; el precache sigue siendo el emitido por webpack.
 */
module.exports = {
  webpack: {
    configure: (webpackConfig, { env }) => {
      if (env === 'production') {
        const pushHandlerScript = `${publicUrl}/pwa-push-handler.js`.replace(/\/{2,}/g, '/');
        webpackConfig.plugins.push(
          new GenerateSW({
            clientsClaim: false,
            skipWaiting: false,
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
            importScripts: [pushHandlerScript],
            navigateFallback: `${publicUrl || ''}/index.html`.replace(/\/+/g, '/'),
            navigateFallbackDenylist: [
              /^\/api\//,
              /^\/pwa-icons\//,
              /\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot|json|webmanifest)$/i,
            ],
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
                urlPattern: pwaImageAssetsRuntimePattern(),
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
