import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  transpilePackages: ['@ail/db'],
  poweredByHeader: false,
  // Lint runs once at the repo root (`pnpm lint`); don't repeat it inside `next build`.
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Keep build-time DB fan-out modest (Neon free tier connection limits).
    staticGenerationMaxConcurrency: 4,
  },
};

export default withNextIntl(nextConfig);
