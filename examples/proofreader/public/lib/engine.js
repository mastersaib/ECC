/**
 * Galley proofreading engine.
 *
 *   const result = GalleyEngine.check(text, { dialect: 'en-GB', style: 'harts', mode: 'creative' });
 *   result.issues  // [{ id, ruleId, category, severity, start, end, text, replacement, message, explanation, inDialogue }]
 *
 * Everything runs locally and synchronously: no network, no dictionary
 * download. Rules live in rules-core.js and rules-style.js.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./spelling'), require('./styles'),
      require('./rules-core'), require('./rules-style')
    );
  } else {
    root.GalleyEngine = factory(root.GalleySpelling, root.GalleyStyles, root.GalleyRulesCore, root.GalleyRulesStyle);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Spelling, Styles, RulesCore, RulesStyle) {
  'use strict';

  const VERSION = '1.0.0';
  const LDQ = '“';
  const RDQ = '”';

  const CATEGORIES = {
    spelling: 'Spelling',
    grammar: 'Grammar',
    punctuation: 'Punctuation',
    capitalization: 'Capitalization',
    style: 'Style guide',
    dialect: 'Dialect',
    typography: 'Typography',
    consistency: 'Consistency',
    flow: 'Flow'
  };
  const SEVERITY_RANK = { error: 0, warning: 1, suggestion: 2, info: 3 };
  const RULES = RulesCore.RULES.concat(RulesStyle.RULES);
  const NON_TERMINAL = new Set([
    'mr', 'mrs', 'ms', 'dr', 'st', 'jr', 'sr', 'prof', 'rev', 'gen', 'col',
    'capt', 'lt', 'sgt', 'mt', 'ft', 'vs', 'cf', 'approx', 'no', 'vol', 'ch',
    'fig', 'p', 'pp', 'ed', 'inc', 'ltd', 'co', 'dept', 'al', 'viz', 'ca',
    'e.g', 'i.e', 'a.m', 'p.m', 'u.s', 'u.k', 'jan', 'feb', 'mar', 'apr',
    'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec'
  ]);

  // ------------------------------------------------------------ quotations

  function scanDoubleQuotes(text, spans) {
    let lineStart = 0;
    for (const line of text.split('\n')) {
      let open = -1;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        const pos = lineStart + i;
        if (ch === LDQ || (ch === '"' && open < 0)) {
          if (open < 0) open = pos;
        } else if ((ch === RDQ || ch === '"') && open >= 0) {
          spans.push({ start: open, end: pos + 1, kind: 'double', closed: true });
          open = -1;
        }
      }
      if (open >= 0) spans.push({ start: open, end: lineStart + line.length, kind: 'double', closed: false });
      lineStart += line.length + 1;
    }
  }

  function scanSingleQuotes(text, spans) {
    const covered = [];
    for (const m of text.matchAll(/‘(?:[^’\n]|’(?=\p{L}))*’(?!\p{L})/gu)) {
      spans.push({ start: m.index, end: m.index + m[0].length, kind: 'single', closed: true });
      covered.push(m.index);
    }
    // An opening single mark with no partner on its line is unclosed speech.
    for (const m of text.matchAll(/(^|[\s(—])(‘)[^\n]*/gmu)) {
      const start = m.index + m[1].length;
      if (covered.includes(start)) continue;
      const lineEnd = text.indexOf('\n', start);
      spans.push({ start, end: lineEnd < 0 ? text.length : lineEnd, kind: 'single', closed: false });
    }
    // Straight single quotes count only when they wrap at least two words.
    for (const m of text.matchAll(/(^|[\s(—])('(?=\p{L})(?:[^'\n]|'(?=\p{L}))*\s(?:[^'\n]|'(?=\p{L}))*'(?!\p{L}))/gmu)) {
      const start = m.index + m[1].length;
      spans.push({ start, end: start + m[2].length, kind: 'single', closed: true });
    }
  }

  function findQuoteSpans(text) {
    const spans = [];
    scanDoubleQuotes(text, spans);
    scanSingleQuotes(text, spans);
    spans.sort((a, b) => a.start - b.start || b.end - a.end);
    for (const span of spans) {
      span.nested = spans.some(o => o !== span && o.kind !== span.kind &&
        o.start < span.start && span.end <= o.end);
    }
    return spans;
  }

  function mergeIntervals(spans) {
    const merged = [];
    for (const { start, end } of spans) {
      const last = merged[merged.length - 1];
      if (last && start <= last[1]) last[1] = Math.max(last[1], end);
      else merged.push([start, end]);
    }
    return merged;
  }

  function within(intervals, pos) {
    let lo = 0;
    let hi = intervals.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (pos < intervals[mid][0]) hi = mid - 1;
      else if (pos >= intervals[mid][1]) lo = mid + 1;
      else return true;
    }
    return false;
  }

  // ------------------------------------------------------- smart quotes

  function smartQuoteAt(text, i) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : '';
    if (ch === '"') return !prev || /[\s([{—–-]/.test(prev) ? LDQ : RDQ;
    if (ch !== "'") return ch;
    if (/[\p{L}\p{N}]/u.test(prev)) return '’';
    if (/^(?:tis|twas|em|cause|til|n['’]|\d)/i.test(text.slice(i + 1, i + 6))) return '’';
    if (!prev || /[\s([{“—–-]/.test(prev)) return '‘';
    return '’';
  }

  function smartQuotes(text) {
    let out = '';
    for (let i = 0; i < text.length; i++) out += smartQuoteAt(text, i);
    return out;
  }

  // ------------------------------------------------------------- context

  function findProtected(text) {
    const ranges = [];
    const patterns = [
      /\bhttps?:\/\/[^\s<>"”]+/g,
      /\bwww\.[^\s<>"”]+/g,
      /[\w.+-]+@[\w-]+\.[\w.-]+/g,
      /`[^`\n]+`/g
    ];
    for (const re of patterns) {
      for (const m of text.matchAll(re)) ranges.push({ start: m.index, end: m.index + m[0].length });
    }
    return mergeIntervals(ranges.sort((a, b) => a.start - b.start));
  }

  function wordBefore(text, pos) {
    let i = pos - 1;
    while (i >= 0 && /[ \t]/.test(text[i])) i--;
    let word = '';
    while (i >= 0 && /[\p{L}\p{N}.'’]/u.test(text[i])) word = text[i--] + word;
    return word;
  }

  function wordAfter(text, pos) {
    let i = pos;
    while (i < text.length && /[ \t]/.test(text[i])) i++;
    const m = text.slice(i, i + 40).match(/^[\p{L}\p{N}]+/u);
    return m ? m[0] : '';
  }

  function isSentenceStart(text, pos) {
    let i = pos - 1;
    while (i >= 0 && /[ \t"“‘'([*_]/.test(text[i])) i--;
    if (i < 0 || text[i] === '\n') return true;
    if (/[”’)\]"']/.test(text[i]) && i > 0 && /[.!?]/.test(text[i - 1])) i--;
    const ch = text[i];
    if (ch === '!' || ch === '?') return true;
    if (ch !== '.') return false;
    if (text[i - 1] === '.' || text[i - 1] === ' ') return false; // ellipsis
    const word = wordBefore(text, i).toLowerCase().replace(/\.$/, '');
    if (NON_TERMINAL.has(word) || /^\d+$/.test(word) || /^\p{L}$/u.test(word)) return false;
    return true;
  }

  function sentenceBounds(text, pos) {
    let start = pos;
    while (start > 0) {
      const ch = text[start - 1];
      if (ch === '\n') break;
      if (/\s/.test(ch) && /[.!?]["”’)]*$/.test(text.slice(Math.max(0, start - 4), start - 1))) break;
      start--;
    }
    let end = pos;
    while (end < text.length && text[end] !== '\n' && !/[.!?]/.test(text[end])) end++;
    return { start, end: Math.min(text.length, end + 1) };
  }

  function createContext(text, profile, options) {
    const issues = [];
    const quoteSpans = findQuoteSpans(text);
    const dialogue = mergeIntervals(quoteSpans);
    const protectedRanges = findProtected(text);
    const curly = (text.match(/’/g) || []).length;
    const straight = (text.match(/'/g) || []).length;
    let currentRule = null;

    const ctx = {
      text,
      profile,
      quoteSpans,
      usesCurlyApostrophes: curly > straight,
      inDialogue: pos => within(dialogue, pos),
      isSentenceStart: pos => isSentenceStart(text, pos),
      sentenceBounds: pos => sentenceBounds(text, pos),
      wordBefore: pos => wordBefore(text, pos),
      wordAfter: pos => wordAfter(text, pos),
      smartQuoteAt: pos => smartQuoteAt(text, pos),
      each(regex, fn) {
        for (const m of text.matchAll(regex)) {
          const found = fn(m);
          if (found) ctx.add(found);
        }
      },
      add(raw) {
        const issue = Object.assign({
          ruleId: currentRule ? currentRule.id : 'custom',
          category: currentRule ? currentRule.category : 'style',
          severity: 'warning',
          replacement: null,
          explanation: ''
        }, raw);
        if (!(issue.start >= 0 && issue.end <= text.length && issue.end >= issue.start)) return;
        if (protectedRanges.some(([s, e]) => issue.start < e && issue.end > s)) return;
        issue.inDialogue = ctx.inDialogue(issue.start);
        if (profile.mode === 'creative' && issue.voice === 'soft') {
          if (issue.inDialogue) return;
          issue.severity = 'info';
          issue.explanation = `${issue.explanation} Keep it if this is the narrator's voice.`.trim();
        } else if (profile.mode === 'creative' && issue.voice === 'dialogue' && issue.inDialogue) {
          issue.severity = 'info';
          issue.explanation = `${issue.explanation} Inside dialogue: keep it if this is how the character speaks.`.trim();
        }
        delete issue.voice;
        if (issue.replacement !== null && text.slice(issue.start, issue.end) === issue.replacement) return;
        issue.text = text.slice(issue.start, issue.end);
        issue.source = issue.source || 'rules';
        issues.push(issue);
      }
    };

    ctx.runRule = rule => {
      currentRule = rule;
      try {
        rule.run(ctx);
      } catch (err) {
        if (options.strict) throw err;
        if (typeof console !== 'undefined') console.warn(`[Galley] rule ${rule.id} failed:`, err);
      } finally {
        currentRule = null;
      }
    };
    return { ctx, issues };
  }

  function finalize(issues) {
    issues.sort((a, b) => a.start - b.start || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.end - b.end);
    const seen = new Set();
    const out = [];
    for (const issue of issues) {
      const dup = `${issue.start}:${issue.end}:${issue.replacement}`;
      if (seen.has(dup)) continue;
      seen.add(dup);
      issue.id = `${issue.ruleId}:${issue.start}:${issue.end}`;
      issue.key = `${issue.ruleId}|${issue.text.toLowerCase()}`;
      out.push(issue);
    }
    return out;
  }

  function computeStats(text, quoteSpans) {
    const words = (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
    const sentences = (text.match(/[.!?]+(?=\s|$|["”’)])/g) || []).length;
    const paragraphs = text.split(/\n/).filter(line => line.trim()).length;
    const dialogueChars = mergeIntervals(quoteSpans).reduce((sum, [s, e]) => sum + (e - s), 0);
    return {
      words,
      characters: text.length,
      sentences,
      paragraphs,
      dialogueShare: text.length ? Math.round((dialogueChars / text.length) * 100) : 0
    };
  }

  function resolveProfile(options) {
    const profile = Styles.resolveProfile(options);
    profile.spellingName = Spelling.SYSTEM_NAMES[profile.spelling];
    return profile;
  }

  /**
   * Proofread `text`. options: { dialect, style, mode, poetry, strict }
   */
  function check(text, options) {
    const opts = options || {};
    const source = String(text || '');
    const profile = resolveProfile(opts);
    const { ctx, issues } = createContext(source, profile, opts);
    for (const rule of RULES) ctx.runRule(rule);
    return {
      issues: finalize(issues),
      profile,
      stats: computeStats(source, ctx.quoteSpans)
    };
  }

  function applyFix(text, issue) {
    if (issue.replacement === null || issue.replacement === undefined) return text;
    if (text.slice(issue.start, issue.end) !== issue.text) return text; // stale
    return text.slice(0, issue.start) + issue.replacement + text.slice(issue.end);
  }

  /** Apply several fixes, last first, skipping any that overlap. */
  function applyFixes(text, issues) {
    const sorted = issues
      .filter(i => i.replacement !== null && i.replacement !== undefined)
      .sort((a, b) => b.start - a.start);
    let out = text;
    let floor = Infinity;
    let applied = 0;
    for (const issue of sorted) {
      if (issue.end > floor) continue;
      const next = applyFix(out, issue);
      if (next !== out) {
        out = next;
        applied++;
        floor = issue.start;
      }
    }
    return { text: out, applied };
  }

  return {
    VERSION,
    CATEGORIES,
    SEVERITY_RANK,
    DIALECTS: Styles.DIALECTS,
    STYLE_GUIDES: Styles.STYLE_GUIDES,
    RULE_IDS: RULES.map(r => r.id),
    check,
    applyFix,
    applyFixes,
    smartQuotes,
    findQuoteSpans,
    resolveProfile,
    describeProfile: Styles.describeProfile
  };
}));
