import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // LOCAL DEMO: 10.0.0.190 is this machine's current LAN address, added so the
  // dev server can be opened from a phone on the same Wi-Fi. Do not commit.
  allowedDevOrigins: ["192.168.0.110", "10.0.0.190"],
};

export default nextConfig;
