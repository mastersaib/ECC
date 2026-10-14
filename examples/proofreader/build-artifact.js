#!/usr/bin/env node
'use strict';

/**
 * Build a single self-contained page for publishing Galley as a claude.ai
 * artifact: inlines the stylesheet and scripts, drops the local-only parts
 * (service worker, web manifest) and the document skeleton the artifact
 * host adds itself.
 *
 *   node build-artifact.js [out.html]     # default: dist/galley.html
 */

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, 'public');

function read(rel) {
  const file = path.resolve(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) throw new Error(`Refusing to inline ${rel}`);
  return fs.readFileSync(file, 'utf8');
}

function between(text, start, end) {
  const a = text.indexOf(start);
  const b = text.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`Markers not found: ${start} ... ${end}`);
  return text.slice(a + start.length, b);
}

function build() {
  const html = read('index.html');
  const head = between(html, '<!-- page:start -->', '<!-- page:head-end -->');
  const body = between(html, '<body>', '<!-- page:end -->');
  let page = `${head.trim()}\n${body.trim()}\n`;
  page = page.replace(/<!-- local:start -->[\s\S]*?<!-- local:end -->\n?/g, '');
  page = page.replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${read('styles.css')}</style>`);
  page = page.replace(/<script src="([^"]+)"><\/script>/g, (_match, src) =>
    `<script>\n${read(src).replace(/<\/script/gi, '<\\/script')}</script>`);
  return page;
}

if (require.main === module) {
  const out = path.resolve(process.argv[2] || path.join(__dirname, 'dist', 'galley.html'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, build());
  console.log(`Wrote ${out}`);
}

module.exports = { build };
