/**
 * Style-guide rules: quotation marks, dialogue punctuation, dashes, serial
 * commas, numbers, percentages, dates, times, abbreviations, ellipses,
 * hyphenation, poetry line breaks and consistency checks. Every rule reads
 * the resolved profile from styles.js, so the same text is judged
 * differently under CMOS, AP, APA, MLA, New Hart's Rules or the house style.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./spelling'), require('./wordlists'));
  } else {
    root.GalleyRulesStyle = factory(root.GalleySpelling, root.GalleyWords);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Spelling, Words) {
  'use strict';

  const LDQ = '“';
  const RDQ = '”';
  const LSQ = '‘';
  const RSQ = '’';
  const EM = '—';
  const EN = '–';
  const VERBS = Words.SPEECH_VERBS.join('|');
  const MONTHS = Words.MONTHS.join('|');
  const PRONOUNS = 'he|she|they|I|we|you|it';

  function guide(ctx) {
    return ctx.profile.guideShort === 'Dialect' ? ctx.profile.dialectName : ctx.profile.guideShort;
  }

  // ----------------------------------------------------------- quotations

  const quotationMarks = {
    id: 'quotation-marks',
    category: 'punctuation',
    run(ctx) {
      const want = ctx.profile.quotes;
      if (want !== 'double' && want !== 'single') return;
      for (const span of ctx.quoteSpans) {
        if (span.nested || span.kind === want || !span.closed) continue;
        const inner = ctx.text.slice(span.start + 1, span.end - 1);
        const swapped = want === 'double'
          ? inner.replace(/“/g, LSQ).replace(/”/g, RSQ)
          : inner.replace(/‘(?=\S)/g, LDQ).replace(/(\S)’(?!\p{L})/gu, `$1${RDQ}`);
        const open = want === 'double' ? LDQ : LSQ;
        const close = want === 'double' ? RDQ : RSQ;
        ctx.add({
          start: span.start, end: span.end, replacement: open + swapped + close,
          severity: 'warning',
          message: `${guide(ctx)} uses ${want} quotation marks for speech and quotations.`,
          explanation: want === 'double'
            ? 'Use double marks outside and single marks for a quotation inside a quotation.'
            : 'Use single marks outside and double marks for a quotation inside a quotation.'
        });
      }
    }
  };

  const punctuationInsideQuotes = {
    id: 'punctuation-inside-quotes',
    category: 'punctuation',
    run(ctx) {
      if (ctx.profile.punctInQuotes !== 'inside') return;
      ctx.each(/([^\s.,!?])(["”])([.,])/gd, m => ({
        start: m.indices[2][0], end: m.indices[3][1], replacement: m[3] + m[2],
        severity: 'warning',
        message: `${guide(ctx)} places periods and commas inside closing quotation marks.`
      }));
      ctx.each(/([?!])(["”])([.,])/gd, m => ({
        start: m.indices[2][0], end: m.indices[3][1], replacement: m[2],
        severity: 'warning', message: `Drop the "${m[3]}": the quotation already ends with "${m[1]}".`
      }));
    }
  };

  const dialogueTags = {
    id: 'dialogue-tags',
    category: 'punctuation',
    run(ctx) {
      const tag = `(?:(?:${PRONOUNS})\\s+(?:${VERBS})|(?:${VERBS}))\\b`;
      ctx.each(new RegExp(`(\\p{L})(["\\u201d])(\\s+)(${tag})`, 'gdu'), m => ({
        start: m.indices[2][0], end: m.indices[2][0], replacement: ',',
        severity: 'error',
        message: 'Missing comma before the closing quotation mark of a dialogue tag.',
        explanation: '"I\'m tired," she said. The comma goes inside the quotation marks.'
      }));
      ctx.each(new RegExp(`(\\.)(["\\u201d\\u2019])(\\s+)(${tag})`, 'gdu'), m => ({
        start: m.indices[1][0], end: m.indices[1][1], replacement: ',',
        severity: 'error',
        message: 'A dialogue tag follows: end the quoted sentence with a comma, not a period.',
        explanation: '"I\'m tired," she said. Action beats are different: "I\'m tired." She yawned.'
      }));
      ctx.each(new RegExp(`(,)(["\\u201d\\u2019])(\\s+)(He|She|They|We|You|It)(\\s+)(${VERBS})\\b`, 'gdu'), m => ({
        start: m.indices[4][0], end: m.indices[4][1], replacement: m[4].toLowerCase(),
        severity: 'error', message: 'A dialogue tag after a comma continues the sentence, so it stays lowercase.'
      }));
    }
  };

  const multiParagraphDialogue = {
    id: 'multi-paragraph-dialogue',
    category: 'punctuation',
    run(ctx) {
      if (ctx.profile.poetry) return;
      const { text } = ctx;
      for (const span of ctx.quoteSpans) {
        if (span.closed || span.nested) continue;
        const after = text.slice(span.end).match(/^\n+[ \t]*(\S)?/);
        const next = after && after[1];
        if (next && /["“‘']/.test(next)) continue; // continued speech, correctly reopened
        ctx.add({
          start: span.start, end: span.start + 1,
          severity: next === undefined && span.end >= text.length ? 'error' : 'warning',
          message: 'Unclosed quotation mark.',
          explanation: 'If the same speaker continues into the next paragraph, open that paragraph with a quotation mark and close only at the end of the final paragraph. Otherwise, close the quotation here.'
        });
      }
    }
  };

  // ------------------------------------------------------------------ dashes

  const DASH_TARGETS = {
    'em-closed': EM,
    'em-spaced': ` ${EM} `,
    'en-spaced': ` ${EN} `
  };

  const dashes = {
    id: 'dashes',
    category: 'punctuation',
    run(ctx) {
      const style = ctx.profile.dash;
      const target = DASH_TARGETS[style] || (ctx.profile.family === 'us' ? EM : ` ${EN} `);
      const label = style === 'either' ? 'a dash' : `${guide(ctx)} dash style`;
      const report = (start, end, message) => ctx.add({
        start, end, replacement: target, severity: 'warning', message,
        explanation: `Use ${label}: "word${target}word".`
      });
      ctx.each(/(\S)( ?-{2,3} ?)(?=\S)/gd, m => report(m.indices[2][0], m.indices[2][1], 'Typewriter double hyphen used as a dash.'));
      ctx.each(/([^\s\d])( - )(?=[^\s\d])/gd, m => report(m.indices[2][0], m.indices[2][1], 'Spaced hyphen used as a dash.'));
      if (style === 'either') return;
      if (style !== 'em-closed') {
        ctx.each(/([\p{L}\p{N}])(—)(?=[\p{L}\p{N}])/gdu, m => report(m.indices[2][0], m.indices[2][1], 'Closed em dash.'));
      }
      if (style !== 'em-spaced') {
        ctx.each(/(\S)( — )(?=\S)/gd, m => report(m.indices[2][0], m.indices[2][1], 'Spaced em dash.'));
      }
      if (style !== 'en-spaced') {
        ctx.each(/(\S)( – )(?=\S)/gd, m => report(m.indices[2][0], m.indices[2][1], 'Spaced en dash.'));
      }
    }
  };

  const numberRanges = {
    id: 'number-ranges',
    category: 'punctuation',
    run(ctx) {
      if (ctx.profile.rangeDash === 'en') {
        ctx.each(/(^|[^\d\-–.:/,])(\d{1,4})(-)(\d{1,4})(?![\d\-–.:/])/gdm, m => {
          if (/\d{3}-\d{4}/.test(m[0])) return null; // phone numbers
          return {
            start: m.indices[3][0], end: m.indices[3][1], replacement: EN,
            severity: 'suggestion', message: 'Use an en dash for number ranges (10–20).'
          };
        });
      } else if (ctx.profile.rangeDash === 'hyphen') {
        ctx.each(/(\d)(–)(\d)/gd, m => ({
          start: m.indices[2][0], end: m.indices[2][1], replacement: '-',
          severity: 'info', message: `${guide(ctx)} uses a hyphen for ranges.`
        }));
      }
    }
  };

  // ------------------------------------------------------------- ellipsis

  const ELLIPSIS_FORMS = { spaced: '. . .', closed: '...' };

  const ellipses = {
    id: 'ellipses',
    category: 'typography',
    run(ctx) {
      const found = [];
      for (const m of ctx.text.matchAll(/\. \. \.|(?<!\.)\.\.\.(?!\.)|…/g)) {
        const form = m[0] === '…' ? 'char' : m[0] === '...' ? 'closed' : 'spaced';
        found.push({ index: m.index, len: m[0].length, form });
      }
      let target = ELLIPSIS_FORMS[ctx.profile.ellipsis];
      let reason = `${guide(ctx)} writes the ellipsis as "${target}".`;
      if (!target) {
        const counts = {};
        for (const f of found) counts[f.form] = (counts[f.form] || 0) + 1;
        const forms = Object.keys(counts);
        if (forms.length < 2) return;
        const majority = forms.sort((a, b) => counts[b] - counts[a])[0];
        target = majority === 'char' ? '…' : ELLIPSIS_FORMS[majority];
        reason = 'Ellipses are written two different ways. Match the majority form.';
      }
      for (const f of found) {
        const current = ctx.text.substr(f.index, f.len);
        if (current === target) continue;
        ctx.add({
          start: f.index, end: f.index + f.len, replacement: target,
          severity: 'suggestion', message: reason
        });
      }
    }
  };

  // -------------------------------------------------------- serial comma

  const INTRODUCTORY = new Set([
    'after', 'before', 'when', 'while', 'if', 'although', 'though', 'because',
    'since', 'in', 'on', 'at', 'by', 'for', 'with', 'yesterday', 'today',
    'tomorrow', 'tonight', 'however', 'then', 'now', 'so', 'well', 'yes', 'no',
    'oh', 'still', 'also', 'first', 'finally', 'meanwhile', 'later', 'instead',
    'otherwise', 'besides', 'sometimes', 'often', 'here', 'there', 'once',
    'as', 'during', 'until', 'upon', 'without', 'despite', 'inside',
    'outside', 'like', 'unlike', 'perhaps', 'maybe', 'indeed', 'anyway',
    'again', 'okay', 'ok', 'sure', 'look', 'listen', 'hey', 'dear', 'and',
    'but', 'or', 'next', 'thus', 'therefore', 'moreover', 'furthermore'
  ]);
  const ITEM = "[\\p{L}'\\u2019-]+(?: [\\p{L}'\\u2019-]+){0,2}";

  const serialComma = {
    id: 'serial-comma',
    category: 'punctuation',
    run(ctx) {
      const mode = ctx.profile.serialComma;
      if (mode === 'required') {
        const re = new RegExp(`((?:${ITEM}, )+)(${ITEM})( (?:and|or) )(?=[\\p{L}])`, 'gdu');
        ctx.each(re, m => {
          const items = m[1].split(', ').filter(Boolean);
          const firstWord = items[0].split(' ')[0].toLowerCase();
          if (/^(but|yet|so|or|and|nor)\b/i.test(m[2])) return null;
          if (items.length === 1) {
            if (INTRODUCTORY.has(firstWord)) return null;
            if (ctx.isSentenceStart(m.index) && /ly$/.test(firstWord)) return null;
            // "After we ate dinner, Tom and Jerry left": an introductory clause, not a list.
            const lead = ctx.text.slice(ctx.sentenceBounds(m.index).start, m.indices[1][1]);
            const leadWord = (lead.match(/\p{L}+/u) || [''])[0].toLowerCase();
            if (lead.indexOf(',') === lead.length - 2 && INTRODUCTORY.has(leadWord)) return null;
          }
          const at = m.indices[2][1];
          return {
            start: at, end: at, replacement: ',', severity: 'suggestion',
            message: `${guide(ctx)} uses the serial (Oxford) comma before the last item in a list.`,
            explanation: 'Red, white, and blue. Ignore this if the words before the comma are an introductory phrase rather than a list item.'
          };
        });
      } else if (mode === 'avoid') {
        const re = new RegExp(`((?:${ITEM}, ){2,})(and|or) `, 'gdu');
        ctx.each(re, m => {
          const commaAt = m.indices[1][1] - 2;
          return {
            start: commaAt, end: commaAt + 1, replacement: '', severity: 'suggestion',
            message: `${guide(ctx)} omits the serial comma unless it prevents confusion.`
          };
        });
      }
    }
  };

  // ------------------------------------------------------------- numbers

  const SKIP_BEFORE = new Set([
    'page', 'pages', 'p', 'pp', 'chapter', 'ch', 'section', 'part', 'volume',
    'vol', 'no', 'number', 'figure', 'fig', 'table', 'step', 'level', 'grade',
    'room', 'route', 'platform', 'gate', 'version', 'verse', 'act', 'scene',
    'line', 'lines', 'row', 'column', 'episode', 'season', 'track', 'size',
    'rank', 'score', 'apartment', 'flat', 'floor', 'highway', 'interstate',
    'flight', 'bus', 'channel', 'year', 'unit', 'item', 'rule', 'article',
    'clause', 'appendix', 'question', 'lesson', 'week', 'day', 'phase', 'stage'
  ]);
  const UNIT_AFTER = /^\s?(?:%|percent|per cent|°|a\.m\.|p\.m\.|am\b|pm\b|o['’]clock|kg|km|cm|mm|m\b|g\b|lbs?\b|oz\b|mph|kph|ft\b|in\b|mi\b|ml\b|l\b|px|pt\b|[KMGT]B\b|mg\b|BCE?\b|AD\b|CE\b|x\b)/i;

  function sentenceHasBigNumber(ctx, pos, limit) {
    const { start, end } = ctx.sentenceBounds(pos);
    // Clock times (18:30) and years are not quantities, so they do not count.
    for (const m of ctx.text.slice(start, end).matchAll(/(?<![\d:])\d[\d,]*(?![\d:])/g)) {
      const value = Number(m[0].replace(/,/g, ''));
      const year = /^\d{4}$/.test(m[0]) && value >= 1000 && value < 3000;
      if (value > limit && !year) return true;
    }
    return false;
  }

  const numbers = {
    id: 'numbers',
    category: 'style',
    run(ctx) {
      const style = ctx.profile.numbers;
      const limit = style === 'nine' ? 9 : style === 'hundred' ? 100 : -1;
      const { text } = ctx;
      ctx.each(/(^|[^\p{L}\p{N}$£€¥#.,:/\-–])(\d{1,4})(?!\p{N}|[.,:/\-–]\p{N})/gdmu, m => {
        const start = m.indices[2][0];
        const end = m.indices[2][1];
        const value = Number(m[2]);
        if (UNIT_AFTER.test(text.slice(end, end + 10))) return null;
        const before = ctx.wordBefore(start).toLowerCase();
        const after = ctx.wordAfter(end);
        if (SKIP_BEFORE.has(before.replace(/\.$/, ''))) return null;
        if (new RegExp(`^(${MONTHS})$`, 'i').test(before) || new RegExp(`^(${MONTHS})$`, 'i').test(after)) return null;
        if (ctx.isSentenceStart(start)) {
          const words = Words.numberToWords(value);
          return {
            start, end, replacement: words ? words[0].toUpperCase() + words.slice(1) : null,
            severity: 'suggestion',
            message: m[2].length === 4 && value > 999
              ? 'Avoid starting a sentence with a year; reword the sentence.'
              : 'Spell out a number that begins a sentence, or reword.'
          };
        }
        if (limit < 0 || value > limit || m[2].length > 3) return null;
        if (sentenceHasBigNumber(ctx, start, limit)) return null; // keep a series consistent
        return {
          start, end, replacement: Words.numberToWords(value), severity: 'suggestion',
          message: limit === 9
            ? `${guide(ctx)} spells out numbers one through nine.`
            : `${guide(ctx)} spells out whole numbers from zero to one hundred.`
        };
      });
      if (style !== 'nine') return;
      const tens = Words.TENS.join('|');
      const teens = Words.ONES.slice(10).join('|');
      const re = new RegExp(`\\b((?:${tens})(?:-(?:one|two|three|four|five|six|seven|eight|nine))?|${teens})\\b(?!\\s+(?:hundred|thousand|million|billion))`, 'gi');
      ctx.each(re, m => {
        if (ctx.isSentenceStart(m.index) || ctx.inDialogue(m.index)) return null;
        const value = Words.wordsToNumber(m[0]);
        if (value === null || value < 10) return null;
        return {
          start: m.index, end: m.index + m[0].length, replacement: String(value),
          severity: 'suggestion', message: `${guide(ctx)} uses numerals from 10 up.`
        };
      });
    }
  };

  const percentages = {
    id: 'percentages',
    category: 'style',
    run(ctx) {
      const p = ctx.profile;
      const word = p.percentWord === 'either' ? (p.family === 'us' ? 'percent' : 'per cent') : p.percentWord;
      if (p.percentWord === 'percent') {
        ctx.each(/\bper cent\b/gi, m => ({
          start: m.index, end: m.index + m[0].length, replacement: 'percent',
          severity: 'warning', category: 'dialect', message: `${p.dialectName} writes "percent".`
        }));
      } else if (p.percentWord === 'per cent') {
        ctx.each(/\bpercent\b/gi, m => ({
          start: m.index, end: m.index + m[0].length, replacement: 'per cent',
          severity: 'warning', category: 'dialect', message: `${guide(ctx)} writes "per cent".`
        }));
      }
      if (p.percentSymbol === 'symbol') {
        ctx.each(/(\d)(\s?(?:percent|per cent)\b)/gdi, m => ({
          start: m.indices[2][0], end: m.indices[2][1], replacement: '%',
          severity: 'suggestion', message: `${guide(ctx)} uses the % sign with numerals.`
        }));
      } else if (p.percentSymbol === 'word') {
        ctx.each(/(\d)(\s?%)/gd, m => ({
          start: m.indices[2][0], end: m.indices[2][1], replacement: ` ${word}`,
          severity: 'suggestion', message: `${guide(ctx)} spells out "${word}" in running text.`
        }));
      }
    }
  };

  // ------------------------------------------------------- dates & times

  const dates = {
    id: 'dates',
    category: 'style',
    run(ctx) {
      const p = ctx.profile;
      const dmy = new RegExp(`\\b(\\d{1,2})(st|nd|rd|th)?( (?:of )?)(${MONTHS})(,? (\\d{4}))?\\b`, 'gd');
      const mdy = new RegExp(`\\b(${MONTHS}) (\\d{1,2})(st|nd|rd|th)?\\b(,? (\\d{4}))?`, 'gd');
      if (p.dateOrder === 'mdy') {
        ctx.each(dmy, m => ({
          start: m.index, end: m.index + m[0].length,
          replacement: `${m[4]} ${m[1]}${m[6] ? `, ${m[6]}` : ''}`,
          severity: 'warning', message: `${guide(ctx)} writes dates as month, day, year.`
        }));
      } else if (p.dateOrder === 'dmy') {
        ctx.each(mdy, m => ({
          start: m.index, end: m.index + m[0].length,
          replacement: `${m[2]} ${m[1]}${m[5] ? ` ${m[5]}` : ''}`,
          severity: 'warning', message: `${guide(ctx)} writes dates as day, month, year.`
        }));
      }
      if (p.ordinalDates === 'avoid') {
        // A date in the wrong order is already rewritten whole by the rule above.
        const forms = [];
        if (p.dateOrder !== 'dmy') forms.push(`\\b(?:${MONTHS}) \\d{1,2}(st|nd|rd|th)\\b`);
        if (p.dateOrder !== 'mdy') forms.push(`\\b\\d{1,2}(st|nd|rd|th)(?= (?:of )?(?:${MONTHS}))`);
        ctx.each(new RegExp(forms.join('|'), 'gd'), m => {
          if (ctx.inDialogue(m.index)) return null;
          const [s, e] = m.indices[1] || m.indices[2];
          return {
            start: s, end: e, replacement: '', severity: 'suggestion',
            message: 'Dates in running text take cardinal numbers (October 14, not October 14th).'
          };
        });
      }
      if (p.dateOrder === 'mdy') {
        ctx.each(new RegExp(`\\b(${MONTHS}) (\\d{1,2})( )(\\d{4})\\b`, 'gd'), m => ({
          start: m.indices[3][0], end: m.indices[3][1], replacement: ', ',
          severity: 'error', message: 'Put a comma between the day and the year.'
        }));
        ctx.each(new RegExp(`\\b(${MONTHS}) (\\d{1,2}), (\\d{4})(?=\\s+\\p{Ll})`, 'gdu'), m => {
          const at = m.indices[3][1];
          return {
            start: at, end: at, replacement: ',', severity: 'warning',
            message: 'A full date in mid-sentence takes a comma after the year too.'
          };
        });
      }
      ctx.each(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g, m => {
        const a = Number(m[1]);
        const b = Number(m[2]);
        if (a > 12 || b > 12 || a === b) return null;
        return {
          start: m.index, end: m.index + m[0].length, severity: 'info',
          message: 'Ambiguous numeric date.',
          explanation: `Americans read ${m[0]} as month/day, most other readers as day/month. Spell out the month.`
        };
      });
    }
  };

  const AMPM = /\b(\d{1,2})(?::(\d{2}))?(\s?)(a\.m\.|p\.m\.|a\.m|p\.m|am|pm|AM|PM|A\.M\.|P\.M\.)(?![\p{L}])/gdu;

  function formatTime(hour, minute, form, keepMinutes) {
    const suffix = form === 'a.m.' ? (hour >= 12 ? 'p.m.' : 'a.m.') : (hour >= 12 ? 'pm' : 'am');
    const h = hour % 12 === 0 ? 12 : hour % 12;
    return `${h}${keepMinutes || minute !== '00' ? `:${minute}` : ''} ${suffix}`;
  }

  const times = {
    id: 'times',
    category: 'style',
    run(ctx) {
      const p = ctx.profile;
      const seen = { minutes: [], bare: [] };
      ctx.each(AMPM, m => {
        (m[2] ? seen.minutes : seen.bare).push(m);
        const isPm = /p/i.test(m[4]);
        if (m[1] === '12') {
          return {
            start: m.index, end: m.index + m[0].length, severity: 'info',
            message: `"12 ${isPm ? 'p.m.' : 'a.m.'}" is often misread. Consider "${isPm ? 'noon' : 'midnight'}".`
          };
        }
        if (p.ampm === 'a.m.' && (m[4] !== (isPm ? 'p.m.' : 'a.m.') || m[3] !== ' ')) {
          return {
            start: m.indices[3][0], end: m.indices[4][1], replacement: isPm ? ' p.m.' : ' a.m.',
            severity: 'warning', message: `${guide(ctx)} writes lowercase "a.m." and "p.m." with periods.`
          };
        }
        if (p.ampm === 'either' && /[A-Z]/.test(m[4])) {
          return {
            start: m.indices[4][0], end: m.indices[4][1], replacement: m[4].toLowerCase(),
            severity: 'suggestion', message: 'Lowercase "am" and "pm" read better in prose.'
          };
        }
        return null;
      });
      if (seen.minutes.length && seen.bare.length) {
        const minority = seen.minutes.length < seen.bare.length ? seen.minutes : seen.bare;
        for (const m of minority) {
          ctx.add({
            start: m.index, end: m.index + m[0].length, severity: 'info', category: 'consistency',
            message: 'Times are styled two ways ("6 p.m." and "6:00 p.m."). Pick one.'
          });
        }
      }
      if (p.twelveHour === 'required') {
        const form = p.ampm === 'either' ? 'a.m.' : p.ampm;
        ctx.each(/(^|[^\d:.])([01]?\d|2[0-3]):([0-5]\d)(?![\d:]|\s?(?:a\.?m|p\.?m|AM|PM))/gdm, m => {
          const hour = Number(m[2]);
          if (hour < 13 && hour !== 0) return null;
          return {
            start: m.indices[2][0], end: m.indices[3][1],
            replacement: formatTime(hour, m[3], form, seen.minutes.length > 0),
            severity: 'warning', message: `${guide(ctx)} uses 12-hour time.`
          };
        });
      }
      ctx.each(/\b12 (noon|midnight)\b/gi, m => ({
        start: m.index, end: m.index + m[0].length, replacement: m[1],
        severity: 'suggestion', message: `"12 ${m[1]}" is redundant.`
      }));
    }
  };

  // -------------------------------------------------------- abbreviations

  const abbreviations = {
    id: 'abbreviations',
    category: 'style',
    run(ctx) {
      const p = ctx.profile;
      if (p.honorificPeriod === true) {
        ctx.each(/\b(Mr|Mrs|Ms|Dr|Jr|Sr)\b(?![.\p{L}'’])/gu, m => ({
          start: m.index, end: m.index + m[0].length, replacement: `${m[1]}.`,
          severity: 'warning', message: `${guide(ctx)} writes "${m[1]}." with a period.`
        }));
      } else if (p.honorificPeriod === false) {
        ctx.each(/\b(Mr|Mrs|Ms|Dr)(\.)(?= \p{Lu})/gdu, m => ({
          start: m.indices[2][0], end: m.indices[2][1], replacement: '',
          severity: 'warning', message: `${guide(ctx)} writes "${m[1]}" without a period.`
        }));
      }
      if (p.usAbbrev === 'U.S.') {
        ctx.each(/(^|[^\p{L}.])(US)(?![\p{L}.])/gdu, m => {
          if (/\p{Lu}{2,}/u.test(ctx.wordBefore(m.indices[2][0]))) return null; // HELP US
          return {
            start: m.indices[2][0], end: m.indices[2][1], replacement: 'U.S.',
            severity: 'warning', message: `${guide(ctx)} abbreviates the United States as "U.S."`
          };
        });
      } else if (p.usAbbrev === 'US') {
        // "U.S." at the end of a paragraph also ends the sentence.
        ctx.each(/\bU\.S\./g, m => ({
          start: m.index, end: m.index + m[0].length,
          replacement: /^[ \t]*(?:\n|$)/.test(ctx.text.slice(m.index + m[0].length)) ? 'US.' : 'US',
          severity: 'warning', message: `${guide(ctx)} writes "US" without periods.`
        }));
      }
      ctx.each(/(^|[\s(])(eg|ie)(?=[\s,])/gd, m => ({
        start: m.indices[2][0], end: m.indices[2][1], replacement: m[2] === 'eg' ? 'e.g.' : 'i.e.',
        severity: 'warning', message: `Write "${m[2] === 'eg' ? 'e.g.' : 'i.e.'}" with periods.`
      }));
      if (p.egComma === 'required') {
        ctx.each(/\b(e\.g\.|i\.e\.)(?= )/g, m => ({
          start: m.index + m[0].length, end: m.index + m[0].length, replacement: ',',
          severity: 'suggestion', message: `${guide(ctx)} puts a comma after "${m[1]}".`
        }));
      }
    }
  };

  // ----------------------------------------------------------- hyphens

  const LY_ADJECTIVES = new Set([
    'family', 'early', 'only', 'holy', 'jelly', 'silly', 'belly', 'friendly',
    'lovely', 'ugly', 'curly', 'bully', 'rally', 'italy', 'july', 'supply',
    'reply', 'fly', 'ally', 'lily', 'daily', 'weekly', 'monthly', 'yearly',
    'hourly', 'nightly', 'likely', 'elderly', 'costly', 'lonely', 'lively',
    'deadly', 'orderly', 'worldly', 'kindly', 'sickly', 'stately', 'timely',
    'unlikely', 'unruly', 'homely', 'portly', 'beastly', 'bubbly', 'cuddly',
    'wobbly', 'prickly', 'sparkly', 'wily', 'oily', 'hilly', 'chilly',
    'jolly', 'folly', 'manly', 'motherly', 'fatherly', 'brotherly',
    'sisterly', 'scholarly', 'heavenly', 'earthly', 'ghostly', 'godly',
    'leisurely', 'cowardly', 'surly', 'burly', 'smelly', 'woolly', 'frilly',
    'assembly', 'butterfly', 'dragonfly', 'firefly', 'monopoly', 'homily',
    'anomaly', 'lowly', 'comely', 'shapely', 'stately', 'saintly'
  ]);

  const hyphens = {
    id: 'hyphens',
    category: 'punctuation',
    run(ctx) {
      ctx.each(/\b([a-z]+ly)(-)([a-z]+)\b/gd, m => {
        if (LY_ADJECTIVES.has(m[1].toLowerCase())) return null;
        return {
          start: m.indices[2][0], end: m.indices[2][1], replacement: ' ',
          severity: 'suggestion',
          message: 'No hyphen after an -ly adverb ("a highly respected writer").'
        };
      });
    }
  };

  // ---------------------------------------------------- fiction details

  const soundEffects = {
    id: 'sound-effects',
    category: 'style',
    run(ctx) {
      if (!ctx.profile.italicSounds) return;
      const words = Words.ONOMATOPOEIA.map(w => w.replace('-', '\\-')).join('|');
      const re = new RegExp(`(^|[\\s\\u201c"(\\u2014])((?:${words})(?:[-, ]+(?:${words}))*)(?=[!.\\u2026,])`, 'gdi');
      ctx.each(re, m => {
        const start = m.indices[2][0];
        if (!/^\p{Lu}/u.test(m[2]) || !ctx.isSentenceStart(start)) return null;
        return {
          start, end: m.indices[2][1], severity: 'info',
          message: 'House style italicizes sound effects. Check this is italic in the manuscript.',
          explanation: 'Plain text cannot show italics. Wrap it in *asterisks* here to mark it as italic.'
        };
      });
    }
  };

  const POETRY_CONTINUATIONS = /^(of|in|on|to|the|a|an|with|for|from|into|upon|by|at|as|is|was|are|were|that|my|his|her|their|its|our|your)\b/;

  const poetryLineBreaks = {
    id: 'poetry-line-breaks',
    category: 'punctuation',
    run(ctx) {
      if (!ctx.profile.poetry) return;
      ctx.each(/([\p{L}])(,)([ \t]*\n[ \t]*)(\p{Ll}+)/gdu, m => {
        if (!POETRY_CONTINUATIONS.test(m[4])) return null;
        return {
          start: m.indices[2][0], end: m.indices[2][1], replacement: '',
          severity: 'suggestion',
          message: 'Comma at a line break where prose would not use one.',
          explanation: 'Poetry follows prose punctuation. The line break already gives the pause, so a comma is only needed if the sentence itself takes one here.'
        };
      });
    }
  };

  // --------------------------------------------------------- consistency

  const consistency = {
    id: 'consistency',
    category: 'consistency',
    run(ctx) {
      const { text } = ctx;
      const forms = new Map();
      for (const m of text.matchAll(/\p{L}+(?:-\p{L}+)+|\p{L}+/gu)) {
        const key = m[0].toLowerCase().replace(/-/g, '');
        if (key.length < 4) continue;
        if (!forms.has(key)) forms.set(key, new Map());
        const variants = forms.get(key);
        const surface = m[0].toLowerCase();
        if (!variants.has(surface)) variants.set(surface, []);
        variants.get(surface).push(m.index);
      }
      for (const variants of forms.values()) {
        if (variants.size < 2) continue;
        const sorted = [...variants.entries()].sort((a, b) => b[1].length - a[1].length);
        const [preferred] = sorted[0];
        for (const [surface, positions] of sorted.slice(1)) {
          for (const pos of positions) {
            ctx.add({
              start: pos, end: pos + surface.length,
              replacement: Spelling.matchCase(text.slice(pos, pos + surface.length), preferred),
              severity: 'info',
              message: `Spelled two ways: "${surface}" and "${preferred}".`
            });
          }
        }
      }
      const curly = /[“”‘’]/.test(text);
      const straight = /["']/.test(text);
      if (curly && straight) {
        for (const m of text.matchAll(/["']/g)) {
          ctx.add({
            start: m.index, end: m.index + 1, replacement: ctx.smartQuoteAt(m.index),
            severity: 'info', category: 'typography',
            message: 'Straight quote in a manuscript that uses curly quotes.'
          });
        }
      }
      const ok = (text.match(/\bOK\b/g) || []).length;
      const okay = (text.match(/\bokay\b/gi) || []).length;
      if (ok && okay) {
        const re = ok < okay ? /\bOK\b/g : /\bokay\b/gi;
        ctx.each(re, m => ({
          start: m.index, end: m.index + m[0].length,
          replacement: ok < okay ? 'okay' : 'OK', severity: 'info',
          message: 'Both "OK" and "okay" appear. Pick one.'
        }));
      }
    }
  };

  return {
    RULES: [
      quotationMarks, punctuationInsideQuotes, dialogueTags,
      multiParagraphDialogue, dashes, numberRanges, ellipses, serialComma,
      numbers, percentages, dates, times, abbreviations, hyphens,
      soundEffects, poetryLineBreaks, consistency
    ],
    formatTime
  };
}));
