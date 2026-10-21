/**
 * Galley's voice guard: the code that keeps every fix Galley can apply small.
 *
 * Proofreading fixes mechanics: a wrong word, a verb tense, a comma, a
 * repeated word. It never deletes or rewrites what the author wrote. Prompts
 * ask the AI for minimal fixes; this module enforces it, for the AI and for
 * the rules alike. An edit that would go further is not applied. It is shown
 * as a suggestion the author can make by hand.
 *
 * An applicable fix may:
 *   - remove at most one of the author's words (a repeated "the the"),
 *   - change at most four words in all, counting each word taken out and
 *     each word put in ("they was" -> "they were" is two; "me and him" ->
 *     "he and I" is four; "18:30" -> "6:30 p.m." is four),
 *   - never delete a sentence, a line break or a paragraph break.
 * Punctuation, capitalization and spacing changes that keep the same words
 * are always allowed. "p.m." and "per cent" count as one word each.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GalleyVoiceGuard = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LIMITS = { wordsLost: 1, wordsChanged: 4 };
  const MAX_COMPARED_WORDS = 400;
  const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
  const WORD_CHAR = /[\p{L}\p{N}'’-]/u;

  function words(text) {
    const t = String(text)
      .replace(/\b(?:\p{L}\.){2,}/gu, m => m.replace(/\./g, '')) // "p.m.", "U.S." are one word
      .replace(/\bper cent\b/gi, 'percent');
    return (t.match(WORD) || []).map(w => w.toLowerCase().replace(/’/g, "'"));
  }

  function lineBreaks(text) {
    return (String(text).match(/\n/g) || []).length;
  }

  /** Letters and digits only, lowercased: what is left when punctuation, case and spacing are ignored. */
  function letters(text) {
    return String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  }

  function lcsLength(a, b) {
    let prev = new Array(b.length + 1).fill(0);
    for (let i = 1; i <= a.length; i++) {
      const row = new Array(b.length + 1).fill(0);
      for (let j = 1; j <= b.length; j++) {
        row[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], row[j - 1]);
      }
      prev = row;
    }
    return prev[b.length];
  }

  /** How many of the author's words an edit removes or replaces. */
  function measure(original, replacement) {
    const before = words(original);
    const after = words(replacement);
    if (before.length > MAX_COMPARED_WORDS || after.length > MAX_COMPARED_WORDS) {
      return { removed: before.length, added: after.length, lost: Math.max(0, before.length - after.length) };
    }
    const kept = lcsLength(before, after);
    return {
      removed: before.length - kept,
      added: after.length - kept,
      lost: Math.max(0, before.length - after.length)
    };
  }

  /** Start of the sentence containing pos: just after the previous sentence end or line break. */
  function sentenceStart(text, pos) {
    let s = pos;
    while (s > 0) {
      const ch = text[s - 1];
      if (ch === '\n') break;
      if (/\s/.test(ch) && /[.!?…]["”’)\]]*$/.test(text.slice(Math.max(0, s - 6), s - 1))) break;
      s--;
    }
    return s;
  }

  /** End of the sentence containing pos, after its closing punctuation and quotes. */
  function sentenceEnd(text, pos) {
    let e = pos;
    while (e < text.length && text[e] !== '\n' && !/[.!?…]/.test(text[e])) e++;
    while (e < text.length && /[.!?…"”’)\]]/.test(text[e])) e++;
    return e;
  }

  /**
   * Whether an edit removes a sentence: one whose words all lie inside
   * [start, end) and whose letters do not survive in the replacement. Fixing
   * the punctuation between two sentences keeps their words, so it passes;
   * so does "U.S." -> "US", where "S." only looks like a sentence.
   */
  function deletesSentence(text, start, end, replacement) {
    const kept = letters(replacement);
    const editWords = words(text.slice(start, end)).length;
    const replWords = words(replacement).length;
    const from = sentenceStart(text, start);
    const to = sentenceEnd(text, Math.max(start, end - 1));
    const region = text.slice(from, to);
    for (const m of region.matchAll(/[^.!?…\n]*[.!?…]+["”’)\]]*|[^.!?…\n]+/g)) {
      const a = from + m.index;
      const b = a + m[0].length;
      const own = words(m[0]);
      if (!own.length) continue;
      const outside = (a < start ? words(text.slice(a, Math.min(b, start))) : []).length +
        (b > end ? words(text.slice(Math.max(a, end), b)) : []).length;
      if (outside > 0) continue;
      if (kept.includes(letters(m[0]))) continue;
      // A one-word sentence whose word is corrected in place ("Realy?" -> "Really?", or the
      // "goverment." that follows "U.S."): the sentence is still there.
      if (own.length === 1 && editWords === 1 && replWords >= 1) continue;
      // A longer sentence that keeps its words in a new order (a dateline reformatted).
      if (own.length > 1 && editWords <= replWords && measure(m[0], replacement).removed < own.length) continue;
      return true;
    }
    return false;
  }

  /**
   * Whether replacing text[start, end) with `replacement` is a fix Galley may
   * apply. Returns { ok: true } or { ok: false, reason }.
   */
  function review(text, start, end, replacement) {
    if (replacement === null || replacement === undefined) return { ok: true };
    const original = text.slice(start, end);
    if (lineBreaks(replacement) < lineBreaks(original)) {
      return { ok: false, reason: 'It would remove a line or paragraph break.' };
    }
    // Punctuation, capitalization and spacing only: the same words, untouched.
    const bare = t => words(t).map(w => w.replace(/['-]/g, '')).join(' ');
    if (letters(original) === letters(replacement) && bare(original) === bare(replacement)) return { ok: true };
    // Hyphenating or unhyphenating the same words: "mother in law" <-> "mother-in-law".
    const joined = t => String(t).toLowerCase().replace(/(?<=[\p{L}\p{N}]) (?=[\p{L}\p{N}])/gu, '-');
    if (joined(original) === joined(replacement)) return { ok: true };
    if (deletesSentence(text, start, end, replacement)) {
      return { ok: false, reason: 'It would delete a whole sentence.' };
    }
    const m = measure(original, replacement);
    if (m.lost > LIMITS.wordsLost) {
      return { ok: false, reason: `It would remove ${m.lost} of your words.` };
    }
    if (m.removed + m.added > LIMITS.wordsChanged) {
      return { ok: false, reason: `It would rewrite your wording (${m.removed + m.added} words changed).` };
    }
    return { ok: true };
  }

  /**
   * Keep an issue's fix only if review() allows it. Otherwise the fix becomes
   * `suggestion`, shown to the author but never applied by Accept.
   */
  function protect(issue, text) {
    if (!issue || issue.replacement === null || issue.replacement === undefined) return issue;
    const verdict = review(text, issue.start, issue.end, issue.replacement);
    if (verdict.ok) return issue;
    // Beyond proofreading, so never more than a suggestion.
    const severity = issue.severity === 'error' || issue.severity === 'warning' ? 'suggestion' : issue.severity;
    return Object.assign({}, issue, { replacement: null, suggestion: issue.replacement, guard: verdict.reason, severity });
  }

  /**
   * Shrink an edit to the words that actually change, so "They was home" ->
   * "They were home" becomes "was" -> "were". Works on whole words.
   * Returns { trimStart, trimEnd, replacement }: characters dropped from each
   * end of the original, and the replacement for what is left.
   */
  function narrow(original, replacement) {
    let p = 0;
    const max = Math.min(original.length, replacement.length);
    while (p < max && original[p] === replacement[p]) p++;
    while (p > 0 && (WORD_CHAR.test(original[p - 1]) && (WORD_CHAR.test(original[p] || '') || WORD_CHAR.test(replacement[p] || '')))) p--;
    let s = 0;
    while (s < max - p && original[original.length - 1 - s] === replacement[replacement.length - 1 - s]) s++;
    const at = i => original[original.length - i] || '';
    const atRepl = i => replacement[replacement.length - i] || '';
    while (s > 0 && WORD_CHAR.test(at(s)) && (WORD_CHAR.test(at(s + 1)) || WORD_CHAR.test(atRepl(s + 1)))) s--;
    return { trimStart: p, trimEnd: s, replacement: replacement.slice(p, replacement.length - s) };
  }

  return { LIMITS, words, letters, measure, review, protect, narrow, sentenceStart };
}));
