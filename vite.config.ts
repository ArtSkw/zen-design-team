import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// The published page loads nothing from anywhere else (fonts bundled, no CDNs, no
// analytics), so its policy says exactly that. Build only: the dev server needs an
// inline script for hot reload.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

const csp: Plugin = {
  name: 'csp',
  apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
}

export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages serves the build from https://artskw.github.io/zen-design-team/
  // (`vite preview` mirrors it); the dev server stays at the root
  base: command === 'build' || isPreview ? '/zen-design-team/' : '/',
  plugins: [react(), csp],
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
}))
