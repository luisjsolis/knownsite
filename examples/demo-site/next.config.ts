import type { NextConfig } from 'next';

// Static export: `knownsite build` post-processes the files in out/.
const nextConfig: NextConfig = {
  output: 'export',
};

export default nextConfig;
