import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // По умолчанию Next режет тело server action на 1 МБ — файл платёжки
  // (лимит 15 МБ в app/dispatch/actions.ts) падал бы непрозрачно через
  // app/error.tsx вместо дружелюбной ошибки валидации.
  experimental: {
    serverActions: { bodySizeLimit: "16mb" },
  },
}

export default nextConfig
