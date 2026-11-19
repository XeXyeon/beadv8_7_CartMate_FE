import type { NextConfig } from "next";
import { apiRewrites } from "./src/api/services";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  // 개발 서버를 http://127.0.0.1:<포트>로 열어도 HMR · 클라이언트 JS가 붙게 한다. (기본은 localhost만 허용, 개발 전용 설정)
  allowedDevOrigins: ["127.0.0.1"],
  partialPrefetching: true,
  // 브라우저의 /api/* 요청을 경로 접두어별로 BE 서비스에 넘긴다. 같은 출처가 되어 인증 쿠키를 그대로 쓸 수 있다.
  // 서비스 표 · 주소 환경변수(<서비스>_SERVICE_URL, API_BASE_URL)는 src/api/services.ts
  async rewrites() {
    return apiRewrites();
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
