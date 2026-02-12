import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,     // ✅ 固定端口（你已经在用的）
    strictPort: true // ✅ 端口被占用就直接报错，不乱跳
  }
})
