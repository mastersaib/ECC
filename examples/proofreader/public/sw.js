/* global self, caches */
/**
 * Galley service worker: cache-first for the app shell so the proofreader
 * opens offline; AI and status requests always go to the network.
 * Bump CACHE when shipping changed files.
 */
'use strict';

const CACHE = 'galley-v2';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'lib/spelling.js',
  'lib/styles.js',
  'lib/wordlists.js',
  'lib/rules-core.js',
  'lib/rules-style.js',
  'lib/engine.js',
  'lib/ai.js',
  'lib/history.js',
  'lib/exporters.js',
  'lib/merge.js',
  'lib/sync.js',
  'js/store.js',
  'js/editor.js',
  'js/native.js',
  'js/app.js',
  'js/panels.js',
  'js/offline.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(
    caches.match(event.request).then(hit => {
      const network = fetch(event.request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => hit || Response.error());
      return hit || network;
    })
  );
});
