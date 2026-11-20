const pages = process.env.NEXT_PUBLIC_STATIC_PAGES === "1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(pages ? {
    output: "export",
    basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
    trailingSlash: true,
  } : {
    async headers() {
      return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] }];
    },
  }),
};
export default nextConfig;
