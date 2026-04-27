/** @type {import('next').NextConfig} */
const bucket = process.env.AWS_S3_BUCKET;
const region = process.env.AWS_REGION ?? "us-east-1";
const cloudfrontDomain = process.env.AWS_CLOUDFRONT_DOMAIN;

const remotePatterns = [];
if (cloudfrontDomain) {
  remotePatterns.push({ protocol: "https", hostname: cloudfrontDomain });
}
if (bucket) {
  remotePatterns.push({
    protocol: "https",
    hostname: `${bucket}.s3.${region}.amazonaws.com`,
  });
  remotePatterns.push({
    protocol: "https",
    hostname: `s3.${region}.amazonaws.com`,
    pathname: `/${bucket}/**`,
  });
}

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns,
  },
};

export default nextConfig;
