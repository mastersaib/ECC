/**
 * Paragraph-level three-way merge for collaborative editing.
 *
 * When two people edit the same document, each save carries the text it
 * started from (base). Paragraphs only one side changed merge cleanly; a
 * paragraph both sides changed differently keeps the local edit and the
 * caller stores the other side as a version, so nothing is ever lost.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GalleyMerge = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_CELLS = 16e6;

  /**
   * Longest-common-subsequence map from a's indices to b's (-1 = unmatched).
   * Common prefix and suffix are trimmed first, so local edits stay cheap.
   */
  function lcsMap(a, b) {
    const map = new Array(a.length).fill(-1);
    let pre = 0;
    while (pre < a.length && pre < b.length && a[pre] === b[pre]) {
      map[pre] = pre;
      pre++;
    }
    let sufA = a.length - 1;
    let sufB = b.length - 1;
    while (sufA >= pre && sufB >= pre && a[sufA] === b[sufB]) {
      map[sufA] = sufB;
      sufA--;
      sufB--;
    }
    const n = sufA - pre + 1;
    const m = sufB - pre + 1;
    if (n <= 0 || m <= 0) return map;
    if ((n + 1) * (m + 1) > MAX_CELLS) return map; // too large to align: treat middle as replaced
    const width = m + 1;
    const dp = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i * width + j] = a[pre + i] === b[pre + j]
          ? dp[(i + 1) * width + j + 1] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[pre + i] === b[pre + j]) {
        map[pre + i] = pre + j;
        i++;
        j++;
      } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
        i++;
      } else {
        j++;
      }
    }
    return map;
  }

  function sameLines(x, y) {
    return x.length === y.length && x.every((line, k) => line === y[k]);
  }

  /**
   * merge3(base, mine, theirs) -> { text, conflicts, theirsConflicts }
   * conflicts counts regions both sides changed; in those regions the
   * local text wins and theirsConflicts lists what the other side wrote.
   */
  function merge3(base, mine, theirs) {
    if (mine === theirs) return { text: mine, conflicts: 0, theirsConflicts: [] };
    if (base === mine) return { text: theirs, conflicts: 0, theirsConflicts: [] };
    if (base === theirs) return { text: mine, conflicts: 0, theirsConflicts: [] };
    const B = base.split('\n');
    const M = mine.split('\n');
    const T = theirs.split('\n');
    const toMine = lcsMap(B, M);
    const toTheirs = lcsMap(B, T);
    const out = [];
    const theirsConflicts = [];
    let conflicts = 0;
    let bi = 0;
    let mi = 0;
    let ti = 0;
    const flush = (bEnd, mEnd, tEnd) => {
      const b = B.slice(bi, bEnd);
      const mChunk = M.slice(mi, mEnd);
      const tChunk = T.slice(ti, tEnd);
      if (sameLines(mChunk, tChunk) || sameLines(b, tChunk)) {
        out.push(...mChunk);
      } else if (sameLines(b, mChunk)) {
        out.push(...tChunk);
      } else {
        out.push(...mChunk);
        conflicts++;
        theirsConflicts.push(tChunk.join('\n'));
      }
    };
    for (let k = 0; k < B.length; k++) {
      if (toMine[k] < 0 || toTheirs[k] < 0) continue;
      if (toMine[k] < mi || toTheirs[k] < ti) continue;
      flush(k, toMine[k], toTheirs[k]);
      out.push(B[k]);
      bi = k + 1;
      mi = toMine[k] + 1;
      ti = toTheirs[k] + 1;
    }
    flush(B.length, M.length, T.length);
    return { text: out.join('\n'), conflicts, theirsConflicts };
  }

  return { merge3, lcsMap };
}));
