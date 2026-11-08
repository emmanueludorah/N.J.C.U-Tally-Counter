// Stores the site on the device so it opens without a connection.
// The build (see vite.config.js) fills in these two placeholders. The cache
// name changes whenever any file changes, which is how updates are picked up.
const CACHE_NAME = '__CACHE_NAME__'
const FILES = __FILES__
const CACHE_PREFIX = 'tally-counter-'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

// Saved files are used first, so opening the site uses no data. Files are
// matched by address only: hosts can send a Vary header that would otherwise
// stop the page's script and stylesheet matching their saved copies.
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  const lookup = request.mode === 'navigate' ? '/' : request
  event.respondWith(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.match(lookup, { ignoreVary: true }))
      .then((saved) => saved ?? fetch(request)),
  )
})
