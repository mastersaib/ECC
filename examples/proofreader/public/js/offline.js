/* global window */
/**
 * Offline support for the self-hosted page: a service worker caches the app
 * shell so Galley opens and proofreads with no network. Skipped on file://
 * and inside the claude.ai viewer, where service workers are unavailable.
 */
(function () {
  'use strict';
  const hosted = window.claude && typeof window.claude.use === 'function';
  const app = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  if (hosted || app || !('serviceWorker' in navigator) || !/^https?:$/.test(window.location.protocol)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // offline caching is an enhancement; the app works without it
    });
  });
}());
