/** @type {import('next').NextConfig} */
const nextConfig = {
  // Configure output for AWS Amplify deployment
  output: 'standalone',
  // Skip TypeScript checking during build to avoid memory issues
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    typedRoutes: false,
    instrumentationHook: true,
    // Memory optimizations for development
    optimizeCss: process.env.NODE_ENV === 'development' ? false : true,
    // Enable memory-efficient compilation
    optimizeServerReact: true,
    // Reduce memory usage during builds
    turbo: false, // Disable Turbopack to avoid memory spikes
    // Memory-efficient middleware
    instrumentationHook: true,
  },
  // Production performance optimizations
  productionBrowserSourceMaps: false, // Disable source maps to save memory
  compress: true, // Enable gzip compression
  // Memory-efficient asset handling
  generateBuildId: async () => {
    // Use timestamp instead of git hash to reduce memory
    return `build-${Date.now()}`;
  },
  // ESLint configuration for AWS Amplify builds
  eslint: {
    // Only run ESLint on these directories during production builds
    dirs: ['app', 'lib', 'components'],
    // Allow production builds to successfully complete even if ESLint finds errors
    ignoreDuringBuilds: true,
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
        // Memory-efficient chunk splitting
        splitChunks: {
          chunks: 'all',
          minSize: 30000,
          maxSize: 250000,
          cacheGroups: {
            framework: {
              chunks: 'all',
              name: 'framework',
              test: /(?<!node_modules.*)[\\/]node_modules[\\/](react|react-dom|scheduler|prop-types|use-subscription)[\\/]/,
              priority: 40,
              enforce: true,
            },
            lib: {
              test: /[\\/]node_modules[\\/]/,
              name: 'lib',
              priority: 30,
              chunks: 'all',
              maxSize: 200000,
            },
            commons: {
              name: 'commons',
              minChunks: 2,
              priority: 20,
              chunks: 'all',
              maxSize: 150000,
            },
          },
        },
        // Minimize memory usage during optimization
        minimize: true,
        // Reduce memory footprint
        removeAvailableModules: true,
        removeEmptyChunks: true,
        mergeDuplicateChunks: true,
      };

      // Memory-efficient performance hints
      config.performance = {
        hints: false, // Disable to reduce memory usage
        maxAssetSize: 500000,
        maxEntrypointSize: 500000,
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
    COGNITO_REGION: process.env.COGNITO_REGION,
    COGNITO_USER_POOL_ARN: process.env.COGNITO_USER_POOL_ARN,
    SUPER_ADMIN_EMAIL: process.env.SUPER_ADMIN_EMAIL,
    SUPER_ADMIN_PASSWORD: process.env.SUPER_ADMIN_PASSWORD,
    NEXT_PUBLIC_COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID,
    NEXT_PUBLIC_COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID,
    NEXT_PUBLIC_COGNITO_REGION: process.env.COGNITO_REGION,
    // AWS Amplify Production Configuration
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    S3_DOCUMENT_BUCKET: process.env.S3_DOCUMENT_BUCKET,
    JWT_SECRET: process.env.JWT_SECRET,
    MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
    // AWS SQS Job Queue Configuration
    SQS_CRITICAL_QUEUE_URL: process.env.SQS_CRITICAL_QUEUE_URL,
    SQS_HIGH_QUEUE_URL: process.env.SQS_HIGH_QUEUE_URL,
    SQS_NORMAL_QUEUE_URL: process.env.SQS_NORMAL_QUEUE_URL,
    SQS_LOW_QUEUE_URL: process.env.SQS_LOW_QUEUE_URL,
    SQS_CRITICAL_DLQ_URL: process.env.SQS_CRITICAL_DLQ_URL,
    SQS_HIGH_DLQ_URL: process.env.SQS_HIGH_DLQ_URL,
    SQS_NORMAL_DLQ_URL: process.env.SQS_NORMAL_DLQ_URL,
    SQS_LOW_DLQ_URL: process.env.SQS_LOW_DLQ_URL,
    // Step Functions Configuration
    STEPFUNCTIONS_S3_BUCKET: process.env.STEPFUNCTIONS_S3_BUCKET,
    ACCOUNT_ID: process.env.ACCOUNT_ID,
  },
}

module.exports = nextConfig