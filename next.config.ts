import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // LAN addresses allowed to reach the dev server, so the app can be opened
  // from a phone on the same Wi-Fi. Dev-only; has no effect on production.
  allowedDevOrigins: ["192.168.0.110", "10.0.0.190"],
};

export default nextConfig;
