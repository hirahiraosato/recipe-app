import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "vdqxnyvsbdexyxrdilnn.supabase.co",
      },
    ],
  },
};

export default nextConfig;
