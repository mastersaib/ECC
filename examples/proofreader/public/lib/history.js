/**
 * Proofreading history for the Galley dashboard: records a snapshot of
 * each check and turns the log into trends (issues per 1,000 words over
 * time, recurring rule types, category totals). Pure functions; the page
 * decides where the log lives (browser storage, or the shared workspace
 * when hosted on claude.ai).
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GalleyHistory = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_ENTRIES = 300;
  const MERGE_WINDOW_MS = 10 * 60 * 1000;

  const RULE_LABELS = {
    spacing: 'Spacing',
    'repeated-punctuation': 'Doubled punctuation',
    capitalization: 'Capitalization',
    typo: 'Common misspellings',
    'dialect-spelling': 'Dialect spelling',
    'repeated-word': 'Repeated words',
    'a-an': '"a" versus "an"',
    confusion: 'Confused words (its/it\'s, your/you\'re, than/then)',
    'wrong-phrase': 'Misheard phrases',
    'nonstandard-grammar': 'Nonstandard grammar',
    'dialect-usage': 'Dialect usage',
    'formal-register': 'Informal register',
    'quotation-marks': 'Quotation mark style',
    'punctuation-inside-quotes': 'Punctuation and quotation marks',
    'dialogue-tags': 'Dialogue tag punctuation',
    'multi-paragraph-dialogue': 'Unclosed or continued quotations',
    dashes: 'Dash style',
    'number-ranges': 'Number ranges',
    ellipses: 'Ellipses',
    'serial-comma': 'Serial comma',
    numbers: 'Numbers: words or numerals',
    percentages: 'Percentages',
    dates: 'Dates',
    times: 'Times',
    abbreviations: 'Abbreviations',
    hyphens: 'Hyphens after -ly adverbs',
    'sound-effects': 'Italic sound effects',
    'poetry-line-breaks': 'Commas at line breaks',
    consistency: 'Inconsistent spellings'
  };

  function ruleLabel(ruleId) {
    if (RULE_LABELS[ruleId]) return RULE_LABELS[ruleId];
    if (ruleId.startsWith('ai-')) return `AI: ${ruleId.slice(3)}`;
    return ruleId;
  }

  /** Condense one check result into a log entry. */
  function snapshot(result, meta) {
    const counts = {};
    const severities = { error: 0, warning: 0, suggestion: 0, info: 0 };
    const rules = {};
    for (const issue of result.issues) {
      counts[issue.category] = (counts[issue.category] || 0) + 1;
      severities[issue.severity] = (severities[issue.severity] || 0) + 1;
      const rule = rules[issue.ruleId] || (rules[issue.ruleId] = { count: 0, samples: [] });
      rule.count++;
      if (rule.samples.length < 3 && issue.text.trim()) rule.samples.push(issue.text.slice(0, 60));
    }
    return {
      at: (meta && meta.at) || new Date().toISOString(),
      docId: (meta && meta.docId) || 'default',
      words: result.stats.words,
      total: result.issues.length,
      counts,
      severities,
      rules,
      dialect: result.profile.dialectId,
      style: result.profile.guideId
    };
  }

  /**
   * Add a snapshot to the log. Checks of the same document within ten
   * minutes replace each other, so live checking while typing does not
   * flood the history. Returns a new array.
   */
  function record(log, entry) {
    const list = Array.isArray(log) ? log.slice() : [];
    const last = list[list.length - 1];
    if (last && last.docId === entry.docId &&
        Date.parse(entry.at) - Date.parse(last.at) < MERGE_WINDOW_MS) {
      list[list.length - 1] = Object.assign({}, entry, { startedAt: last.startedAt || last.at });
    } else {
      list.push(entry);
    }
    return list.slice(-MAX_ENTRIES);
  }

  function rate(entry) {
    if (!entry.words) return 0;
    const serious = (entry.severities.error || 0) + (entry.severities.warning || 0);
    return Math.round((serious / entry.words) * 10000) / 10;
  }

  /** Trends for the dashboard and for the AI summary prompt. */
  function summarize(log) {
    const list = Array.isArray(log) ? log : [];
    const categories = {};
    const rules = {};
    let words = 0;
    for (const entry of list) {
      words += entry.words || 0;
      for (const [cat, n] of Object.entries(entry.counts || {})) categories[cat] = (categories[cat] || 0) + n;
      for (const [id, info] of Object.entries(entry.rules || {})) {
        const agg = rules[id] || (rules[id] = { id, label: ruleLabel(id), count: 0, sessions: 0, samples: [] });
        agg.count += info.count;
        agg.sessions += 1;
        for (const s of info.samples || []) if (agg.samples.length < 4 && !agg.samples.includes(s)) agg.samples.push(s);
      }
    }
    const series = list.map(e => ({ at: e.at, rate: rate(e), words: e.words, total: e.total }));
    const first = series[0];
    const last = series[series.length - 1];
    let change = null;
    if (series.length >= 2 && first.rate > 0) {
      change = Math.round(((last.rate - first.rate) / first.rate) * 100);
    }
    return {
      sessions: list.length,
      wordsChecked: words,
      currentRate: last ? last.rate : 0,
      firstRate: first ? first.rate : 0,
      change,
      series,
      categories,
      topRules: Object.values(rules).sort((a, b) => b.count - a.count).slice(0, 8)
    };
  }

  return { snapshot, record, summarize, rate, ruleLabel, RULE_LABELS, MAX_ENTRIES };
}));
