/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  async redirects() {
    return [
      { source: '/workbench', has: [{ type: 'query', key: 'tool' }], destination: '/v2/tools', permanent: false },
      ...['/workbench', '/agent', '/studio'].map(source => ({ source, destination: '/v2', permanent: false })),
    ]
  },
}

export default nextConfig
