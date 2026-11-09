import type { MetadataRoute } from 'next';

const BASE_URL = 'https://finbuks.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/lab', '/firm']
    },
    sitemap: `${BASE_URL}/sitemap.xml`
  };
}
