import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export so Tauri can load the app from ./out.
  // cacheComponents / partialPrefetching need a server and cannot be used here.
  output: "export",
  images: {
    unoptimized: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
