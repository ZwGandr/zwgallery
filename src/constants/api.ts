// src/constants/api.ts
// export const BASE_API2 = 'https://back.zwgandr.cn';
// export const BASE_API2 = 'http://localhost:8090';
export const BASE_API2 =
    import.meta.env.VITE_API_BASE ?? "/api";// 让所有请求都变成 /api 开头，方便在开发环境中使用代理