import type { MetadataRoute } from 'next';

const BASE_URL = 'https://antibalcony.com';

const SERVICES = ['balance-books', 'payroll', 'do-bookkeeping', 'bookkeeping-payroll'];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: BASE_URL, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    ...SERVICES.map((service) => ({
      url: `${BASE_URL}/start/${service}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.8
    }))
  ];
}
