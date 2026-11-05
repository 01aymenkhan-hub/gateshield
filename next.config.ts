import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingExcludes: {
    '/*': ['./backend/**/*', './uploads/**/*', './.git/**/*'],
  },
  allowedDevOrigins: [
    "unworthy-undecided-cabana.ngrok-free.dev",
  ],
};

export default nextConfig;
