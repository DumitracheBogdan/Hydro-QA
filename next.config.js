/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.sharepoint.com" }]
  }
};

module.exports = nextConfig;