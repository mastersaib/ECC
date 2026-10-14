/* global window, CSS */
/**
 * The manuscript editor: a plain textarea (native typing, undo, spellcheck,
 * IME and screen-reader support) over a mirrored backdrop that draws the
 * highlights. Both share font, padding and wrapping, so marks line up with
 * the text; the backdrop follows the textarea's scroll position.
 */
(function (root) {
  'use strict';

  function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escapeAttr(text) {
    return escapeHtml(text).replace(/"/g, '&quot;');
  }

  /** Visible range for an issue; insertions are drawn on the character before them. */
  function displayRange(issue, text) {
    let start = issue.start;
    let end = issue.end;
    if (end === start) {
      if (start > 0 && text[start - 1] !== '\n') start -= 1;
      else end = Math.min(text.length, start + 1);
    }
    return [start, end];
  }

  function createEditor(opts) {
    const { textarea, backdrop, highlights } = opts;
    const coarse = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    let issues = [];
    let activeId = null;
    const undoStack = [];

    function syncScroll() {
      backdrop.scrollTop = textarea.scrollTop;
      backdrop.scrollLeft = textarea.scrollLeft;
    }

    function syncGutter() {
      const gutter = textarea.offsetWidth - textarea.clientWidth;
      highlights.style.setProperty('--gutter', `${Math.max(0, gutter)}px`);
    }

    function render() {
      const text = textarea.value;
      const sorted = issues.slice().sort((a, b) => a.start - b.start || a.end - b.end);
      let html = '';
      let pos = 0;
      for (const issue of sorted) {
        const [start, end] = displayRange(issue, text);
        if (start < pos || end > text.length) continue;
        const cls = `m cat-${issue.category} sev-${issue.severity}${issue.source === 'ai' ? ' ai' : ''}${issue.id === activeId ? ' active' : ''}`;
        html += `${escapeHtml(text.slice(pos, start))}<mark class="${cls}" data-id="${escapeAttr(issue.id)}">${escapeHtml(text.slice(start, end))}</mark>`;
        pos = end;
      }
      // The trailing newline keeps a final empty line the same height as the textarea's.
      html += `${escapeHtml(text.slice(pos))}\n`;
      highlights.innerHTML = html;
      syncGutter();
      syncScroll();
    }

    function issueAt(pos) {
      const text = textarea.value;
      let best = null;
      for (const issue of issues) {
        const [start, end] = displayRange(issue, text);
        if (pos >= start && pos <= end) {
          if (issue.id === activeId) return issue;
          if (!best || end - start < best.span) best = { issue, span: end - start };
        }
      }
      return best ? best.issue : null;
    }

    function reveal(issue) {
      const mark = highlights.querySelector(`mark[data-id="${CSS.escape(issue.id)}"]`);
      if (!mark) return;
      const top = mark.offsetTop - textarea.clientHeight / 3;
      if (mark.offsetTop < textarea.scrollTop + 24 || mark.offsetTop > textarea.scrollTop + textarea.clientHeight - 48) {
        textarea.scrollTop = Math.max(0, top);
      }
      syncScroll();
    }

    function select(issue, focus) {
      if (!issue) return;
      if (focus && !coarse) textarea.focus({ preventScroll: true });
      try {
        textarea.setSelectionRange(issue.start, issue.end);
      } catch (_err) {
        // selection is best-effort
      }
      reveal(issue);
    }

    function replaceRange(start, end, replacement) {
      undoStack.push({ text: textarea.value, caret: textarea.selectionStart });
      if (undoStack.length > 100) undoStack.shift();
      textarea.setRangeText(replacement, start, end, 'end');
    }

    function setText(text, keepUndo) {
      if (keepUndo) undoStack.push({ text: textarea.value, caret: textarea.selectionStart });
      const caret = textarea.selectionStart;
      const scroll = textarea.scrollTop;
      textarea.value = text;
      const at = Math.min(caret, text.length);
      try {
        textarea.setSelectionRange(at, at);
      } catch (_err) {
        // ignore
      }
      textarea.scrollTop = scroll;
    }

    function undo() {
      const last = undoStack.pop();
      if (!last) return false;
      textarea.value = last.text;
      try {
        textarea.setSelectionRange(last.caret, last.caret);
      } catch (_err) {
        // ignore
      }
      return true;
    }

    textarea.addEventListener('scroll', syncScroll);
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => {
        syncGutter();
        syncScroll();
      });
    }
    const caretHandler = () => {
      if (!opts.onCaret) return;
      const issue = issueAt(textarea.selectionStart);
      opts.onCaret(issue);
    };
    textarea.addEventListener('click', caretHandler);
    textarea.addEventListener('keyup', event => {
      if (/^(Arrow|Home|End|Page)/.test(event.key)) caretHandler();
    });

    return {
      get text() {
        return textarea.value;
      },
      setIssues(list, active) {
        issues = list;
        activeId = active || null;
        render();
      },
      setActive(id) {
        activeId = id;
        for (const el of highlights.querySelectorAll('mark.active')) el.classList.remove('active');
        if (id) {
          const el = highlights.querySelector(`mark[data-id="${CSS.escape(id)}"]`);
          if (el) el.classList.add('active');
        }
      },
      select,
      reveal,
      replaceRange,
      setText,
      undo,
      canUndo: () => undoStack.length > 0,
      render,
      setLang(lang) {
        textarea.setAttribute('lang', lang);
      }
    };
  }

  root.GalleyEditor = { createEditor, displayRange, escapeHtml };
}(typeof globalThis !== 'undefined' ? globalThis : this));
