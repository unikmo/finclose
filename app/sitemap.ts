import type { MetadataRoute } from 'next';

const BASE_URL = 'https://finbuks.com';

const SERVICES = ['balance-books', 'do-bookkeeping'];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: BASE_URL, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    ...['how-it-works', 'faq', 'legal', 'privacy', 'terms'].map((page) => ({
      url: `${BASE_URL}/${page}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: page === 'legal' || page === 'privacy' ? 0.5 : 0.6
    })),
    ...SERVICES.map((service) => ({
      url: `${BASE_URL}/start/${service}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.8
    }))
  ];
}
