const { GenerateSW } = require('workbox-webpack-plugin');

const publicUrl = process.env.PUBLIC_URL || '';

module.exports = {
  webpack: {
    configure: (webpackConfig, { env }) => {
      if (env === 'production') {
        webpackConfig.plugins.push(
          new GenerateSW({
            clientsClaim: false,
            skipWaiting: false,
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
            navigateFallback: `${publicUrl}/index.html`,
            navigateFallbackDenylist: [/^\/api\//],
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
            ],
          })
        );
      }
      return webpackConfig;
    },
  },
};
