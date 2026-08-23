import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1", "::1", "100.123.234.111"],
  
  poweredByHeader: false,
  compress: true,

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
        source: "/:file((?:.*)\\.(?:jpg|jpeg|png|webp|svg|ico|woff|woff2|ttf|mp3|mp4|webm))",
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
