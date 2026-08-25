import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1", "::1", "100.123.234.111"],
  
  poweredByHeader: false,
  compress: true,

  images: {
    unoptimized: true,
  },

  // Cache static assets and wallpapers in the browser/CDN to avoid repeated 304 re-fetches
  async headers() {
    return [
      {
        source: "/Themes/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/:file((?:.*)\\.(?:jpg|jpeg|png|webp|avif|gif|svg|ico|woff|woff2|ttf|eot|otf|mp3|mp4|webm))",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
      {
        source: "/manifest.json",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/favicon.ico",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },

  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },

  // Disable server-side bundling for these native/browser-only modules
  serverExternalPackages: [
    "@tensorflow/tfjs-core",
    "@tensorflow/tfjs-backend-webgl",
    "@tensorflow/tfjs-converter",
    "@tensorflow-models/body-segmentation",
  ],

  turbopack: {
    resolveAlias: {
      "@mediapipe/selfie_segmentation": "./lib/mediapipe-stub.js",
    },
  },

  // Webpack alias (if fallback is used)
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@mediapipe/selfie_segmentation": path.resolve("./lib/mediapipe-stub.js"),
    };
    return config;
  },

  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
