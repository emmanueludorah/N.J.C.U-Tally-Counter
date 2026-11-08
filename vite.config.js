import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The page only needs its own files, so everything else is blocked, including
// inline scripts and sending data to other sites. connect-src is needed by the
// service worker, which saves the site's own files for offline use.
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.google-analytics.com",
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

// Sent by the web host. vercel.json holds a copy of this list, so change both.
const SECURITY_HEADERS = {
  // frame-ancestors only works as a header, so it isn't in the meta tag.
  'Content-Security-Policy': `${CONTENT_SECURITY_POLICY}; frame-ancestors 'none'`,
  'Strict-Transport-Security': 'max-age=63072000',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
}

// Netlify and Cloudflare Pages read a _headers file from the published folder.
function hostHeadersFile() {
  return {
    name: 'host-headers-file',
    apply: 'build',
    generateBundle() {
      const lines = Object.entries(SECURITY_HEADERS).map(
        ([header, value]) => `  ${header}: ${value}`,
      )
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: `/*\n${lines.join('\n')}\n`,
      })
    },
  }
}

// Creates sw.js with the list of every file to save for offline use.
function offlineServiceWorker() {
  return {
    name: 'offline-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const publicFiles = readdirSync('public')
      const builtFiles = Object.keys(bundle).filter(
        (file) => file !== '_headers' && file !== 'index.html',
      )

      const template = readFileSync('src/service-worker.js', 'utf8')
      const hash = createHash('sha256').update(template)
      for (const output of Object.values(bundle)) {
        hash.update(output.code ?? output.source)
      }
      for (const file of publicFiles) {
        hash.update(readFileSync(`public/${file}`))
      }

      const files = ['/', ...[...builtFiles, ...publicFiles].map((file) => `/${file}`)]
      const source = template
        .replace('__CACHE_NAME__', () => `tally-counter-${hash.digest('hex').slice(0, 12)}`)
        .replace('__FILES__', () => JSON.stringify(files))

      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// Build only: the dev server relies on inline scripts for hot reloading.
function securityMetaTags() {
  return {
    name: 'security-meta-tags',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: CONTENT_SECURITY_POLICY,
          },
          injectTo: 'head-prepend',
        },
        {
          tag: 'meta',
          attrs: { name: 'referrer', content: 'no-referrer' },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    securityMetaTags(),
    hostHeadersFile(),
    offlineServiceWorker(),
  ],
  preview: { headers: SECURITY_HEADERS },
})
