import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves this project from /<repo-name>/, so the asset base
  // path must be set accordingly when built via the Pages workflow (only).
  base: process.env.GH_PAGES === 'true' ? '/My-Case-Diary-AI_2/' : '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
