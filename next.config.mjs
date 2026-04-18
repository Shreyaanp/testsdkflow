/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [{ source: "/", destination: "/oauth", permanent: false }];
  },
};
export default nextConfig;
