// 默认使用同域 /api；开发环境由 Vite 代理，生产环境由宝塔 Nginx 代理。
export const BASE_API2 = import.meta.env.VITE_API_BASE ?? "/api";
