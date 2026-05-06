import type { MetadataRoute } from 'next';

import { envConfigs } from '@/config';
import { defaultLocale, locales } from '@/config/locale';

const seoRoutes = [
  '/',
  '/pricing',
  '/showcases',
  '/blog',
  '/blog/ai-contract-review',
  '/docs',
  '/updates',
];

function buildLocalizedUrl(route: string, locale: string) {
  const baseUrl = envConfigs.app_url.replace(/\/$/, '');
  const prefix = locale === defaultLocale ? '' : `/${locale}`;

  return `${baseUrl}${prefix}${route === '/' ? '' : route}`;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date('2026-04-29');

  // sitemap 只保留合同审查相关的公开 SEO 页面，避免模板页面继续被提交给搜索引擎。
  return locales.flatMap((locale) =>
    seoRoutes.map((route) => ({
      url: buildLocalizedUrl(route, locale),
      lastModified,
      changeFrequency: route === '/' ? 'weekly' : 'monthly',
      priority: route === '/' ? 1 : 0.7,
    }))
  );
}
