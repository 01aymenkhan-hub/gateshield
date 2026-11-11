import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { proxyClientMaxBodySize: '48mb' },
  serverExternalPackages: ['isomorphic-dompurify'],
  outputFileTracingExcludes: {
    '/*': ['./backend/**/*', './uploads/**/*', './.git/**/*'],
  },
  allowedDevOrigins: [
    "unworthy-undecided-cabana.ngrok-free.dev",
  ],
  poweredByHeader: false,
  async headers() {
    const securityHeaders = [
      // Clickjacking, base-tag injection, form hijacking and plugin content (OWASP A05).
      {
        key: 'Content-Security-Policy',
        value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
      },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      // Camera is required for CNIC / QR scanning on this origin only.
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=()' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      ...(process.env.NODE_ENV === 'production'
        ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
        : []),
    ];
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
