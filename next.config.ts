import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["localhost", "100.123.234.111"],
  
  // Disable server-side bundling for these native/browser-only modules
  serverExternalPackages: [
    "@tensorflow/tfjs-core",
    "@tensorflow/tfjs-backend-webgl",
    "@tensorflow/tfjs-converter",
    "@tensorflow-models/body-segmentation",
  ],

  // Turbopack alias for Next 15+
  turbo: {
    resolveAlias: {
      // Stub this out so Turbopack doesn't crash looking for its ESM exports
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
};

export default nextConfig;
