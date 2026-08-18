import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    build: {
      // electron-vite v5: 使用 build.externalizeDeps 替代已弃用的 externalizeDepsPlugin
      externalizeDeps: true
    }
  },
  preload: {
    build: {
      externalizeDeps: true
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [tailwindcss(), react()],
    build: {
      rollupOptions: {
        input: {
          // 定义多个入口点
          main: resolve(__dirname, 'src/renderer/resource/index.html'),
          loading: resolve(__dirname, 'src/renderer/resource/loading.html')
        }
      }
    }
  }
})
