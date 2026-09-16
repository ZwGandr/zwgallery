import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import Unfonts from 'unplugin-fonts/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    Unfonts({
      // Google Fonts API V2
      fontsource: {
        families: [
          'Dancing Script Variable'
        ]
      },
    }),
  ],
  server: {
    proxy: {
      "/api": {
        // 本地开发时把前端的 /api 请求转发到 Spring Boot。
        target: "http://localhost:8090",
        changeOrigin: true,
        // 后端控制器使用 /photos，因此转发前去掉 /api 前缀。
        rewrite: path => path.replace(/^\/api/, ""),
      },
    },
  },
})
