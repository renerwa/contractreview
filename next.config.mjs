import bundleAnalyzer from '@next/bundle-analyzer';
import { createMDX } from 'fumadocs-mdx/next';
import createNextIntlPlugin from 'next-intl/plugin';

const withMDX = createMDX();

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const withNextIntl = createNextIntlPlugin({
  requestConfig: './src/core/i18n/request.ts',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.VERCEL ? undefined : 'standalone',
  reactStrictMode: false,
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],
  images: {
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    qualities: [60, 70, 75],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
      },
    ],
  },
  async redirects() {
    return [
      // 将模板自带的通用 AI 工具页永久合并到首页，避免无关页面被用户或搜索引擎继续访问。
      {
        source: '/ai-image-generator',
        destination: '/',
        permanent: true,
      },
      {
        source: '/:locale(en|zh)/ai-image-generator',
        destination: '/:locale',
        permanent: true,
      },
      {
        source: '/ai-music-generator',
        destination: '/',
        permanent: true,
      },
      {
        source: '/:locale(en|zh)/ai-music-generator',
        destination: '/:locale',
        permanent: true,
      },
      {
        source: '/ai-video-generator',
        destination: '/',
        permanent: true,
      },
      {
        source: '/:locale(en|zh)/ai-video-generator',
        destination: '/:locale',
        permanent: true,
      },
      // 旧模板文章 slug 改为合同审查关键词 slug，保留外链和历史收录权重。
      {
        source: '/blog/what-is-xxx',
        destination: '/blog/ai-contract-review',
        permanent: true,
      },
      {
        source: '/:locale(en|zh)/blog/what-is-xxx',
        destination: '/:locale/blog/ai-contract-review',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/imgs/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // Allow OAuth popups to retain window.opener after cross-origin navigation
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
        ],
      },
    ];
  },
  turbopack: {
    resolveAlias: {
      // fs: {
      //   browser: './empty.ts', // We recommend to fix code imports before using this method
      // },
    },
  },
  experimental: {
    turbopackFileSystemCacheForDev: true,
    // Disable mdxRs for Vercel deployment compatibility with fumadocs-mdx
    ...(process.env.VERCEL ? {} : { mdxRs: true }),
  },
  reactCompiler: true,
};

export default withBundleAnalyzer(withNextIntl(withMDX(nextConfig)));
