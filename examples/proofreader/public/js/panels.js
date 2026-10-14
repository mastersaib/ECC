/* global window, document */
/**
 * Galley panels: tabs, the trends dashboard, documents and version history,
 * the activity log, the style sheet, export and the theme switch.
 */
(function () {
  'use strict';

  const { GalleyApp: app, GalleyEngine: Engine, GalleyHistory: History, GalleyAI: AI, GalleyExport: Exporter } = window;
  const { el, state } = app;
  const $ = sel => document.querySelector(sel);
  const hosted = Boolean(window.claude && typeof window.claude.use === 'function');

  const REASONS = {
    auto: 'Autosave', manual: 'Saved version', conflict: 'Teammate\'s wording (overlapping edit)',
    'before restore': 'Before restore', 'offline copy': 'Offline edits'
  };
  const ACTIONS = {
    created: 'created', saved: 'edited', deleted: 'deleted', restored: 'restored a version of',
    'ai-check': 'ran an AI check on', exported: 'exported', 'bulk-fix': 'applied fixes to', version: 'saved a version of'
  };

  function relative(iso) {
    const ms = Date.now() - Date.parse(iso);
    if (!Number.isFinite(ms)) return '';
    const min = Math.round(ms / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min} min ago`;
    const hours = Math.round(min / 60);
    if (hours < 24) return `${hours} h ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  async function namesFor(ids) {
    const unique = [...new Set(ids.filter(Boolean))].filter(id => state.names[id] === undefined);
    if (unique.length && state.store) Object.assign(state.names, await state.store.names(unique).catch(() => ({})));
  }

  function who(id) {
    if (!id) return state.store && state.store.kind === 'cloud' ? 'Someone' : 'You';
    if (state.store && id === state.store.me.id) return 'You';
    return state.names[id] || 'A teammate';
  }

  // ------------------------------------------------------------------ tabs

  let currentTab = 'proof';
  function showTab(name) {
    currentTab = name;
    for (const tab of document.querySelectorAll('[role="tab"]')) {
      const on = tab.dataset.tab === name;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    }
    for (const panel of document.querySelectorAll('.tab-panel')) panel.hidden = panel.id !== `tab-${name}`;
    try {
      localStorage.setItem('galley.tab', name);
    } catch (_err) {
      // per-viewer convenience only
    }
    if (name === 'dashboard') renderDashboard();
    if (name === 'history') renderHistory();
    if (name === 'sheet') renderSheet();
  }

  function bindTabs() {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    for (const tab of tabs) {
      tab.addEventListener('click', () => showTab(tab.dataset.tab));
      tab.addEventListener('keydown', event => {
        const i = tabs.indexOf(tab);
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          const next = tabs[(i + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
          next.focus();
          showTab(next.dataset.tab);
        }
      });
    }
  }

  // ------------------------------------------------------------- dashboard

  function niceMax(value) {
    if (value <= 0) return 10;
    const pow = 10 ** Math.floor(Math.log10(value));
    for (const step of [1, 2, 2.5, 5, 10]) if (step * pow >= value) return step * pow;
    return 10 * pow;
  }

  function lineChart(container, series) {
    const width = Math.max(280, container.clientWidth);
    const height = 220;
    const pad = { top: 16, right: 16, bottom: 30, left: 40 };
    const w = width - pad.left - pad.right;
    const h = height - pad.top - pad.bottom;
    const max = niceMax(Math.max(...series.map(p => p.rate)) * 1.1);
    const x = i => pad.left + (series.length === 1 ? w / 2 : (i / (series.length - 1)) * w);
    const y = v => pad.top + h - (v / max) * h;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Issues per 1,000 words over ${series.length} checks, from ${series[0].rate} to ${series[series.length - 1].rate}`);
    const add = (tag, attrs) => {
      const node = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
      svg.append(node);
      return node;
    };
    for (let t = 0; t <= 4; t++) {
      const value = (max / 4) * t;
      add('line', { x1: pad.left, x2: width - pad.right, y1: y(value), y2: y(value), class: 'grid' });
      const label = add('text', { x: pad.left - 8, y: y(value) + 4, class: 'tick', 'text-anchor': 'end' });
      label.textContent = Number.isInteger(value) ? value : value.toFixed(1);
    }
    const dateLabel = (i, anchor) => {
      const label = add('text', { x: x(i), y: height - 8, class: 'tick', 'text-anchor': anchor });
      label.textContent = new Date(series[i].at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };
    dateLabel(0, series.length === 1 ? 'middle' : 'start');
    if (series.length > 1) dateLabel(series.length - 1, 'end');
    const d = series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.rate).toFixed(1)}`).join(' ');
    add('path', { d, class: 'series-line' });
    if (series.length <= 40) {
      series.forEach((p, i) => add('circle', { cx: x(i), cy: y(p.rate), r: 4, class: 'series-dot' }));
    }
    const cross = add('line', { y1: pad.top, y2: pad.top + h, class: 'crosshair', visibility: 'hidden' });
    const focus = add('circle', { r: 5, class: 'series-focus', visibility: 'hidden' });
    const hit = add('rect', { x: pad.left, y: pad.top, width: w, height: h, fill: 'transparent' });
    const tip = el('div', { class: 'chart-tip', hidden: true });
    const move = event => {
      const box = svg.getBoundingClientRect();
      const px = event.clientX - box.left;
      const i = series.length === 1 ? 0 : Math.max(0, Math.min(series.length - 1, Math.round(((px - pad.left) / w) * (series.length - 1))));
      const p = series[i];
      cross.setAttribute('x1', x(i));
      cross.setAttribute('x2', x(i));
      cross.setAttribute('visibility', 'visible');
      focus.setAttribute('cx', x(i));
      focus.setAttribute('cy', y(p.rate));
      focus.setAttribute('visibility', 'visible');
      tip.hidden = false;
      tip.replaceChildren(
        el('strong', { text: `${p.rate} per 1,000 words` }),
        el('span', { text: `${new Date(p.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${p.words.toLocaleString()} words · ${p.total} findings` })
      );
      const left = Math.min(width - 190, Math.max(0, x(i) - 90));
      tip.style.left = `${left}px`;
      tip.style.top = `${Math.max(0, y(p.rate) - 64)}px`;
    };
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', () => {
      cross.setAttribute('visibility', 'hidden');
      focus.setAttribute('visibility', 'hidden');
      tip.hidden = true;
    });
    container.replaceChildren(svg, tip);
  }

  function renderDashboard() {
    const summary = History.summarize(state.history);
    const root = $('#dash-body');
    $('#dash-empty').hidden = summary.sessions > 0;
    root.hidden = summary.sessions === 0;
    if (!summary.sessions) return;
    const topCat = Object.entries(summary.categories).sort((a, b) => b[1] - a[1])[0];
    const change = summary.change === null
      ? 'First check'
      : summary.change <= 0 ? `${Math.abs(summary.change)}% fewer than your first check` : `${summary.change}% more than your first check`;
    $('#kpis').replaceChildren(
      kpi('Errors and warnings per 1,000 words', String(summary.currentRate), change, summary.change !== null && summary.change <= 0 ? 'good' : summary.change > 0 ? 'warn' : ''),
      kpi('Words checked', summary.wordsChecked.toLocaleString(), `${summary.sessions} recorded check${summary.sessions === 1 ? '' : 's'}`),
      kpi('Most frequent type', topCat ? Engine.CATEGORIES[topCat[0]] || topCat[0] : 'None', topCat ? `${topCat[1]} findings` : ''),
      kpi('Errors and warnings now', String(app.allIssues().filter(i => i.severity === 'error' || i.severity === 'warning').length), 'in the open document')
    );
    lineChart($('#trend-chart'), summary.series.slice(-60));
    $('#trend-table').replaceChildren(
      el('caption', { text: 'Issues per 1,000 words by check' }),
      el('tr', {}, [el('th', { text: 'Date' }), el('th', { text: 'Rate' }), el('th', { text: 'Words' })]),
      ...summary.series.slice(-60).map(p => el('tr', {}, [
        el('td', { text: new Date(p.at).toLocaleString() }), el('td', { text: String(p.rate) }), el('td', { text: String(p.words) })
      ]))
    );
    const cats = Object.entries(summary.categories).sort((a, b) => b[1] - a[1]);
    const maxCat = cats.length ? cats[0][1] : 1;
    $('#category-bars').replaceChildren(...cats.map(([cat, n]) => el('div', { class: `bar-row cat-${cat}` }, [
      el('span', { class: 'bar-label' }, [el('span', { class: 'dot', 'aria-hidden': 'true' }), Engine.CATEGORIES[cat] || cat]),
      el('span', { class: 'bar-track' }, [el('span', { class: 'bar', style: `width:${Math.max(2, (n / maxCat) * 100)}%` })]),
      el('span', { class: 'bar-value', text: n.toLocaleString() })
    ])));
    $('#recurring').replaceChildren(
      el('tr', {}, [el('th', { text: 'Issue type' }), el('th', { text: 'Times' }), el('th', { text: 'Checks' }), el('th', { text: 'Examples' })]),
      ...summary.topRules.map(rule => el('tr', {}, [
        el('td', { text: rule.label }), el('td', { class: 'num', text: String(rule.count) }),
        el('td', { class: 'num', text: String(rule.sessions) }),
        el('td', { class: 'examples', text: rule.samples.map(s => `“${s}”`).join(', ') })
      ]))
    );
    $('#ai-summary').hidden = !state.ai;
  }

  function kpi(label, value, note, tone) {
    return el('div', { class: `kpi${tone ? ` ${tone}` : ''}` }, [
      el('span', { class: 'kpi-label', text: label }),
      el('span', { class: 'kpi-value', text: value }),
      el('span', { class: 'kpi-note', text: note })
    ]);
  }

  async function explainPatterns() {
    if (!state.ai) return;
    const button = $('#ai-summary');
    const out = $('#ai-summary-out');
    const summary = History.summarize(state.history);
    const stats = Object.assign({}, summary, { series: summary.series.slice(-40) });
    const profile = Engine.resolveProfile(state.settings);
    button.disabled = true;
    out.hidden = false;
    out.replaceChildren(el('p', { class: 'muted', text: 'Claude is reading your history…' }));
    try {
      const prompt = AI.buildSummaryPrompt(stats, profile);
      const data = AI.parseJson(await state.ai.run(prompt, new AbortController().signal, { kind: 'summary', stats, options: app.pickDocSettings() }));
      out.replaceChildren(
        el('h3', { text: data.headline || 'Your patterns' }),
        el('p', { text: data.trend || '' }),
        el('ul', { class: 'patterns' }, (data.patterns || []).map(p => el('li', {}, [
          el('strong', { text: p.title }), el('span', { text: ` ${p.detail}` }),
          p.example ? el('q', { text: p.example }) : null
        ]))),
        (data.focus || []).length ? el('div', { class: 'focus' }, [
          el('h4', { text: 'Focus next' }), el('ol', {}, data.focus.map(f => el('li', { text: f })))
        ]) : null
      );
    } catch (err) {
      out.replaceChildren(el('p', { class: 'error', text: (err && err.message) || 'The summary failed. Try again.' }));
    } finally {
      button.disabled = false;
    }
  }

  // --------------------------------------------------------------- history

  function roleNote() {
    const s = state.store;
    if (!s) return '';
    if (s.kind === 'local') return 'Saved in this browser only. Open the hosted page on claude.ai to sync across devices and work with a team.';
    if (!s.me.canWrite) return 'View only. Ask the owner for Contributor access to edit and save.';
    if (s.me.canAdmin) return 'You can edit, restore versions and delete documents, and you can see everyone\'s activity.';
    return 'You can edit and save versions. Editors and the owner can delete documents and see everyone\'s activity.';
  }

  async function renderHistory() {
    $('#role-note').textContent = roleNote();
    renderDocs(state.docs || []);
    $('#versions-title').textContent = `Versions of “${state.title}”`;
    $('#version-form').hidden = !(state.store && state.store.me.canWrite);
    if (!state.store || !state.docId) return;
    const [versions, activity] = await Promise.all([
      state.store.listVersions(state.docId).catch(() => []),
      state.store.listActivity().catch(() => [])
    ]);
    await namesFor(versions.map(v => v.by).concat(activity.map(a => a.by)));
    $('#version-list').replaceChildren(...(versions.length ? versions.map(versionItem) : [el('li', { class: 'muted', text: 'No versions yet. Galley saves one every 15 minutes while you work.' })]));
    const titles = Object.fromEntries((state.docs || []).map(d => [d.id, d.title]));
    $('#activity-list').replaceChildren(...(activity.length ? activity.slice(0, 120).map(a => el('li', {}, [
      el('time', { datetime: a.at, text: relative(a.at) }),
      el('span', { text: `${who(a.by)} ${ACTIONS[a.action] || a.action} ${a.title || titles[a.docId] || 'a document'}${a.count ? ` (${a.count})` : ''}${a.findings !== undefined ? ` (${a.findings} finding${a.findings === 1 ? '' : 's'})` : ''}` })
    ])) : [el('li', { class: 'muted', text: 'No activity recorded yet.' })]));
  }

  function renderDocs(docs) {
    const list = $('#doc-list');
    if (!list) return;
    const canDelete = state.store && (state.store.kind === 'local' || state.store.me.canAdmin);
    namesFor(docs.map(d => d.updatedBy));
    list.replaceChildren(...docs.map(doc => {
      const current = doc.id === state.docId;
      const del = el('button', { class: 'btn small quiet', text: 'Delete' });
      del.addEventListener('click', async () => {
        if (del.dataset.armed !== 'yes') {
          del.dataset.armed = 'yes';
          del.textContent = 'Confirm delete';
          del.classList.add('danger');
          setTimeout(() => {
            del.dataset.armed = '';
            del.textContent = 'Delete';
            del.classList.remove('danger');
          }, 4000);
          return;
        }
        try {
          await state.store.deleteDoc(doc.id);
          if (current) {
            const next = (state.docs || []).find(d => d.id !== doc.id);
            if (next) await app.openDoc(next.id);
            else await app.newDoc({ title: 'Untitled manuscript', text: '' });
          }
        } catch (err) {
          app.toast(err.message);
        }
      });
      return el('li', { class: current ? 'current' : '' }, [
        el('div', { class: 'doc-main' }, [
          el('strong', { text: doc.title || 'Untitled manuscript' }),
          el('span', { class: 'muted', text: `${(doc.words || 0).toLocaleString()} words · ${relative(doc.updatedAt)}${state.store && state.store.kind === 'cloud' ? ` · ${who(doc.updatedBy)}` : ''}` })
        ]),
        el('div', { class: 'doc-actions' }, [
          current ? el('span', { class: 'badge quiet', text: 'Open' }) : el('button', {
            class: 'btn small', text: 'Open', onclick: async () => {
              await app.openDoc(doc.id);
              showTab('proof');
            }
          }),
          canDelete ? del : null
        ])
      ]);
    }));
  }

  function versionItem(v) {
    const preview = el('pre', { class: 'version-preview', hidden: true, text: (v.text || '').slice(0, 1200) });
    const restore = el('button', { class: 'btn small', text: 'Restore' });
    restore.addEventListener('click', async () => {
      if (restore.dataset.armed !== 'yes') {
        restore.dataset.armed = 'yes';
        restore.textContent = 'Confirm restore';
        setTimeout(() => {
          restore.dataset.armed = '';
          restore.textContent = 'Restore';
        }, 4000);
        return;
      }
      await state.store.addVersion(state.docId, { text: app.editor.text, title: state.title, reason: 'before restore' }).catch(() => {});
      app.editor.setText(v.text || '', true);
      app.onEdited();
      app.runCheck();
      state.store.log('restored', { docId: state.docId, title: state.title });
      app.toast('Version restored. The text it replaced is saved in History.');
      showTab('proof');
    });
    return el('li', {}, [
      el('div', { class: 'version-main' }, [
        el('strong', { text: v.note || REASONS[v.reason] || 'Version' }),
        el('span', { class: 'muted', text: `${relative(v.at)} · ${who(v.by)} · ${(v.words || 0).toLocaleString()} words` })
      ]),
      el('div', { class: 'doc-actions' }, [
        el('button', {
          class: 'btn small quiet', text: 'Preview', onclick: event => {
            preview.hidden = !preview.hidden;
            event.target.textContent = preview.hidden ? 'Preview' : 'Hide';
          }
        }),
        state.store.me.canWrite ? restore : null
      ]),
      preview
    ]);
  }

  function bindHistory() {
    $('#new-doc').addEventListener('click', async () => {
      try {
        await app.newDoc({ title: 'Untitled manuscript', text: '' });
        showTab('proof');
        $('#doc-title').focus();
      } catch (err) {
        app.toast(err.message);
      }
    });
    $('#load-sample').addEventListener('click', async () => {
      try {
        await app.newDoc({ title: app.sampleTitle, text: app.sampleText() });
        showTab('proof');
      } catch (err) {
        app.toast(err.message);
      }
    });
    $('#version-form').addEventListener('submit', async event => {
      event.preventDefault();
      const note = $('#version-note').value.trim();
      try {
        await state.store.addVersion(state.docId, { text: app.editor.text, title: state.title, reason: 'manual', note });
        state.store.log('version', { docId: state.docId, title: state.title });
        $('#version-note').value = '';
        app.toast('Version saved.');
        renderHistory();
      } catch (err) {
        app.toast(err.message);
      }
    });
  }

  // ------------------------------------------------------------ style sheet

  function renderSheet() {
    const profile = Engine.resolveProfile(state.settings);
    const guide = Engine.STYLE_GUIDES.find(g => g.id === profile.guideId);
    $('#sheet-title').textContent = `${profile.dialectName} · ${profile.guideShort === 'Dialect' ? 'Dialect conventions' : profile.guideName} · ${profile.mode === 'formal' ? 'Formal' : 'Creative'}${profile.poetry ? ' · Poetry' : ''}`;
    $('#sheet-summary').textContent = guide ? guide.summary : '';
    $('#sheet-notice').hidden = !profile.notice;
    $('#sheet-notice').textContent = profile.notice || '';
    $('#sheet-table').replaceChildren(...Engine.describeProfile(profile).map(([k, v]) => el('tr', {}, [el('th', { scope: 'row', text: k }), el('td', { text: v })])));
    const ai = state.ai ? (state.ai.kind === 'claude' ? 'The AI check runs on your own Claude account. Each check asks for your permission the first time.' : 'The AI check runs through this computer\'s server, which holds the API key.') : 'The AI check is off here: open the hosted page on claude.ai, or run the local server with an Anthropic API key.';
    $('#sheet-ai').textContent = ai;
  }

  // ---------------------------------------------------------------- export

  function slug(text) {
    return (text || 'manuscript').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'manuscript';
  }

  async function saveFile(filename, data, mime) {
    if (hosted) {
      const downloads = await window.claude.use('downloads').catch(() => null);
      if (!downloads) throw new Error('Downloads are not available in this view.');
      try {
        await downloads.save({ filename, data });
        return true;
      } catch (err) {
        if (err && err.code === 'declined') return false;
        throw new Error('The file could not be saved here.');
      }
    }
    const url = URL.createObjectURL(new Blob([data], { type: mime }));
    const link = el('a', { href: url, download: filename });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  }

  async function exportAs(kind) {
    const text = app.editor.text;
    const title = state.title;
    const doubleSpaced = $('#export-double').checked;
    const base = slug(title);
    const profile = Engine.resolveProfile(state.settings);
    const lang = profile.dialectId.startsWith('en-GB') ? 'en-GB' : profile.dialectId;
    const issues = app.allIssues().sort((a, b) => a.start - b.start);
    const jobs = {
      docx: () => [`${base}.docx`, Exporter.toDocx({ title, text, doubleSpaced, lang }), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      pdf: () => [`${base}.pdf`, Exporter.toPdf({ title, text, doubleSpaced }), 'application/pdf'],
      txt: () => [`${base}.txt`, text, 'text/plain'],
      'report-docx': () => [`${base}-proofreading-report.docx`, Exporter.toDocx({ title: `Proofreading report: ${title}`, text: Exporter.reportText(text, issues, profile), doubleSpaced: false, lang }), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      'report-txt': () => [`${base}-proofreading-report.txt`, Exporter.reportText(text, issues, profile), 'text/plain']
    };
    try {
      const [name, data, mime] = jobs[kind]();
      const saved = await saveFile(name, data, mime);
      if (saved) {
        app.toast(`Exported ${name}.`);
        if (state.store) state.store.log('exported', { docId: state.docId, title, detail: kind });
      }
    } catch (err) {
      app.toast(err.message);
    }
  }

  function bindExport() {
    const button = $('#export-btn');
    const menu = $('#export-menu');
    const close = () => {
      menu.hidden = true;
      button.setAttribute('aria-expanded', 'false');
    };
    button.addEventListener('click', () => {
      menu.hidden = !menu.hidden;
      button.setAttribute('aria-expanded', String(!menu.hidden));
      if (!menu.hidden) menu.querySelector('button').focus();
    });
    menu.addEventListener('click', event => {
      const item = event.target.closest('[data-export]');
      if (!item) return;
      close();
      exportAs(item.dataset.export);
    });
    document.addEventListener('click', event => {
      if (!event.target.closest('.export')) close();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !menu.hidden) {
        close();
        button.focus();
      }
    });
  }

  // ----------------------------------------------------------------- theme

  const THEMES = ['system', 'light', 'dark'];
  function applyTheme(theme) {
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    const button = $('#theme-toggle');
    button.textContent = theme === 'system' ? 'Theme: system' : theme === 'light' ? 'Theme: light' : 'Theme: dark';
  }

  function bindTheme() {
    const button = $('#theme-toggle');
    if (hosted) {
      button.hidden = true; // the claude.ai viewer owns light and dark there
      return;
    }
    let theme = 'system';
    try {
      theme = localStorage.getItem('galley.theme') || 'system';
    } catch (_err) {
      // default
    }
    applyTheme(theme);
    button.addEventListener('click', () => {
      theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
      applyTheme(theme);
      try {
        localStorage.setItem('galley.theme', theme);
      } catch (_err) {
        // per-viewer convenience only
      }
    });
  }

  // ------------------------------------------------------------------ boot

  window.GalleyPanels = {
    onCheck() {
      if (currentTab === 'sheet') renderSheet();
    },
    onHistory() {
      if (currentTab === 'dashboard') renderDashboard();
    },
    onDocs(docs) {
      renderDocs(docs);
    },
    onDocChange() {
      if (currentTab === 'history') renderHistory();
      if (currentTab === 'sheet') renderSheet();
    }
  };

  bindTabs();
  bindHistory();
  bindExport();
  bindTheme();
  $('#ai-summary').addEventListener('click', explainPatterns);
  window.addEventListener('resize', () => {
    if (currentTab === 'dashboard') renderDashboard();
  });
  let saved = 'proof';
  try {
    saved = localStorage.getItem('galley.tab') || 'proof';
  } catch (_err) {
    // default tab
  }
  showTab(['proof', 'dashboard', 'history', 'sheet'].includes(saved) ? saved : 'proof');
}());
