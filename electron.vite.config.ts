import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        // 自包含插件目录（主进程侧：src/plugins/<id>/main、shared）
        '@plugins': resolve('src/plugins'),
        '@shared': resolve('src/shared')
      }
    },
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
        '@renderer': resolve('src/renderer/src'),
        '@plugins': resolve('src/renderer/src/plugins'),
        '@shared': resolve('src/shared')
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
