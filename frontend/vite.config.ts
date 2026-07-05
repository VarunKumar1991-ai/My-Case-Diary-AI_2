import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  // The site is served from the root of the custom domain (cd.varunkumar.shop),
  // so assets must be referenced from '/'. (A GitHub Pages *project* URL like
  // <user>.github.io/<repo>/ would need a '/<repo>/' base — but the custom
  // domain, which is the real entry point, always serves at the root.)
  // Redeploy trigger 2026-07-05: republish the base:'/' build after run #5's
  // deploy step failed during the first custom-domain (cd.varunkumar.shop) attach.
  base: '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
