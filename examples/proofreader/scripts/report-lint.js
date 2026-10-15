#!/usr/bin/env node
'use strict';

/**
 * Print Android lint findings from lint-results-*.xml as GitHub Actions
 * annotations and a step-summary table, so they are readable in the run log
 * without downloading the report.
 *
 *   node scripts/report-lint.js android/app/build/reports/lint-results-debug.xml
 *
 * Exits 0 whatever lint found: the workflow decides what fails the build.
 */

const fs = require('fs');
const path = require('path');

const ENTITIES = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'" };

function unescapeXml(value) {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (whole, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, name) ? ENTITIES[name] : whole;
  });
}

function attributes(tag) {
  const out = {};
  for (const m of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) out[m[1]] = unescapeXml(m[2]);
  return out;
}

function parseLintXml(xml) {
  const issues = [];
  for (const m of xml.matchAll(/<issue\b([^>]*)>([\s\S]*?)<\/issue>/g)) {
    const attrs = attributes(m[1]);
    const location = m[2].match(/<location\b([^>]*)\/?>/);
    const loc = location ? attributes(location[1]) : {};
    issues.push({
      id: attrs.id || 'Unknown',
      severity: attrs.severity || 'Warning',
      message: attrs.message || '',
      file: loc.file || '',
      line: loc.line ? Number(loc.line) : 0
    });
  }
  return issues;
}

// Annotation properties and messages must not contain raw newlines, and
// properties must not contain commas or colons.
function escapeData(value) {
  return String(value).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function escapeProperty(value) {
  return escapeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

function annotation(issue, root) {
  const level = /error|fatal/i.test(issue.severity) ? 'error' : 'warning';
  const file = issue.file ? path.relative(root, issue.file) : '';
  const props = [`title=${escapeProperty(`Android lint: ${issue.id}`)}`];
  if (file && !file.startsWith('..')) {
    props.unshift(`file=${escapeProperty(file)}`);
    if (issue.line) props.push(`line=${issue.line}`);
  }
  return `::${level} ${props.join(',')}::${escapeData(issue.message)}`;
}

function summaryTable(issues, root) {
  if (!issues.length) return 'Android lint found no issues in the app module.\n';
  const cell = s => String(s).replace(/\|/g, '\\|').replace(/\s+/g, ' ');
  const rows = issues.map(i => {
    const where = i.file ? `${path.relative(root, i.file)}${i.line ? `:${i.line}` : ''}` : '';
    return `| ${cell(i.severity)} | ${cell(i.id)} | ${cell(where)} | ${cell(i.message)} |`;
  });
  return ['| Severity | Check | Where | Message |', '|---|---|---|---|', ...rows, ''].join('\n');
}

function main(argv) {
  const file = argv[2];
  if (!file || !fs.existsSync(file)) {
    console.log(`[report-lint] No lint XML report at ${file || '(none given)'}`);
    return 0;
  }
  const root = process.env.GITHUB_WORKSPACE || process.cwd();
  const issues = parseLintXml(fs.readFileSync(file, 'utf8'));
  for (const issue of issues) console.log(annotation(issue, root));
  console.log(`[report-lint] ${issues.length} lint issue(s)`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### Android lint\n\n${summaryTable(issues, root)}`);
  }
  return 0;
}

if (require.main === module) process.exit(main(process.argv));

module.exports = { parseLintXml, annotation, summaryTable, unescapeXml };
