const { GenerateSW } = require('workbox-webpack-plugin');

const publicUrl = (process.env.PUBLIC_URL || '').replace(/\/$/, '');

/**
 * No añadimos PNG/manifest de public/ a additionalManifestEntries: Workbox precachea en el
 * install y un 404 en producción rompe todo el SW (bad-precaching-response). Los iconos se
 * sirven como estáticos del build; el precache sigue siendo el emitido por webpack.
 */
module.exports = {
  webpack: {
    configure: (webpackConfig, { env }) => {
      if (env === 'production') {
        webpackConfig.plugins.push(
          new GenerateSW({
            clientsClaim: false,
            skipWaiting: false,
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
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
                urlPattern: ({ url }) =>
                  url.pathname.startsWith(`${publicUrl || ''}/pwa-icons/`.replace(/\/+/g, '/')) &&
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
