import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { resolve } from "path";

const rootPkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));

const nextConfig: NextConfig = {
  output: 'standalone',
  env: {
    APP_VERSION: rootPkg.version || '0.0.0',
  },
};

export default nextConfig;
