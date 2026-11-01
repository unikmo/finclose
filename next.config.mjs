/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: false,
  // pdfjs loads its own worker file at run time; bundling it breaks that.
  experimental: { serverComponentsExternalPackages: ['pdfjs-dist'] }
};

export default nextConfig;
