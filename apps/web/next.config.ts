import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Internal packages ship raw TypeScript rather than a build artefact, so
  // there is no dist/ to go stale and no build step between editing a package
  // and seeing the change. Next compiles them as part of the app.
  transpilePackages: [
    '@relayflow/access',
    '@relayflow/core',
    '@relayflow/data',
    '@relayflow/entities',
    '@relayflow/logger',
    '@relayflow/logic',
    '@relayflow/tokens',
  ],

  typedRoutes: true,

  // A build that typechecks in CI but skips it here would let a broken deploy
  // through. (Next 16 removed `next lint`; linting is its own CI step.)
  typescript: { ignoreBuildErrors: false },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
