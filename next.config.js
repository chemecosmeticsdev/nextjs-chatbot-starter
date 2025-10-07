/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: false,
    instrumentationHook: true,
    // Memory optimizations for development
    optimizeCss: process.env.NODE_ENV === 'development' ? false : true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  // Webpack configuration for memory optimization
  webpack: (config, { dev, isServer }) => {
    // Memory optimizations for development
    if (dev) {
      // Reduce memory usage in development
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          minSize: 20000,
          maxSize: 244000,
          cacheGroups: {
            default: {
              minChunks: 2,
              priority: -20,
              reuseExistingChunk: true,
            },
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendors',
              priority: -10,
              chunks: 'all',
              maxSize: 244000,
            },
          },
        },
      };

      // Optimize module resolution for development
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };

      // Reduce webpack stats output in development
      config.stats = 'errors-warnings';

      // Enable webpack cache for faster rebuilds
      config.cache = {
        type: 'filesystem',
        buildDependencies: {
          config: [__filename],
        },
      };
    }

    // General memory optimizations (only in production to avoid webpack conflicts)
    if (!dev) {
      config.optimization = {
        ...config.optimization,
        // Enable tree shaking in production only
        usedExports: true,
        sideEffects: false,
      };
    }

    return config;
  },
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    BAWS_ACCESS_KEY_ID: process.env.BAWS_ACCESS_KEY_ID,
    BAWS_SECRET_ACCESS_KEY: process.env.BAWS_SECRET_ACCESS_KEY,
    DEFAULT_REGION: process.env.DEFAULT_REGION,
    BEDROCK_REGION: process.env.BEDROCK_REGION,
    GITHUB_PAT: process.env.GITHUB_PAT,
    COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID,
    COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID,
    COGNITO_CLIENT_SECRET: process.env.COGNITO_CLIENT_SECRET,
    COGNITO_REGION: process.env.COGNITO_REGION,
    COGNITO_USER_POOL_ARN: process.env.COGNITO_USER_POOL_ARN,
    SUPER_ADMIN_EMAIL: process.env.SUPER_ADMIN_EMAIL,
    SUPER_ADMIN_PASSWORD: process.env.SUPER_ADMIN_PASSWORD,
    NEXT_PUBLIC_COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID,
    NEXT_PUBLIC_COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID,
    NEXT_PUBLIC_COGNITO_REGION: process.env.COGNITO_REGION,
  },
}

module.exports = nextConfig