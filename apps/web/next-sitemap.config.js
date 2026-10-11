/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://jov.ie',
  generateRobotsTxt: true,
  // Investor surfaces are private and never listed (app/robots.ts disallows
  // them; the gated portal is dynamic, but keep generated sitemaps closed).
  exclude: [
    '/investor-portal',
    '/investor-portal/*',
    '/investors',
    '/investors/*',
    '/pitch',
    '/pitch/*',
  ],
  robotsTxtOptions: {
    policies: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/out/',
          '/api/',
          '/investor-portal$',
          '/investor-portal/',
          '/investors$',
          '/investors/',
          '/pitch$',
          '/pitch/',
        ],
      },
    ],
  },
};
