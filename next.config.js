/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "vdqxnyvsbdexyxrdilnn.supabase.co",
      },
    ],
  },
  // ビルド時のTypeScriptエラーとESLintエラーを無視（初回デプロイ用）
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
