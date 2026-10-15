/* global window, document, CSS */
/**
 * Galley app controller: settings, live checking, the findings list, fixes,
 * the AI pass and document sync. Dashboard, history, style sheet and export
 * live in panels.js and talk to this file through the `app` object.
 */
(function () {
  'use strict';

  const { GalleyEngine: Engine, GalleyAI: AI, GalleyHistory: History, GalleySync: Sync,
    GalleyStore: Store, GalleyEditor: EditorLib } = window;
  const $ = sel => document.querySelector(sel);

  const SAMPLE_TITLE = 'Sample: The Last Rehearsal';
  const SAMPLE = [
    'The rain had not stopped since tuesday. Mrs Okafor stood at the window of the old theatre, watching the the street below turn grey.',
    '',
    '"Your late," she said, without turning around. "The rehearsal started at 18:30."',
    '',
    '"I know, I know. The train was delayed - again." Daniel shook the water from his coat. "Their was an accident near the station, and they stopped every train for forty five minutes.',
    '',
    '"Anyway, I brought the costumes. Theyre in the van."',
    '',
    'She looked at him. Her eyes, the color of wet slate, gave nothing away. "Did you bring the programme notes, the lighting plan and the new script?"',
    '',
    '"Yes" he said. "Well, two of them."',
    '',
    '*Thud.* Somewhere backstage, a sandbag hit the floor.',
    '',
    'On October 14th 2026 the company would open in a theater that was 100 years old, and only 7 people had bought tickets. Its a miracle we\'re still here, she thought. Atleast the critics would be honest, irregardless of the weather.'
  ].join('\n');

  const DEFAULT_SETTINGS = { dialect: 'en-US', style: 'cmos', mode: 'creative', poetry: false, flow: true };
  const SEVERITY_LABEL = { error: 'Error', warning: 'Warning', suggestion: 'Suggestion', info: 'Note' };
  const MAX_CARDS = 250;

  const state = {
    settings: Object.assign({}, DEFAULT_SETTINGS, Store.readJson('settings', {})),
    store: null,
    docId: null,
    docHandle: null,
    sync: null,
    title: '',
    result: null,
    ruleIssues: [],
    aiIssues: [],
    ignored: new Set(),
    filter: 'all',
    activeId: null,
    dirty: false,
    saving: false,
    lastVersionAt: 0,
    history: [],
    ai: null,
    aiAbort: null,
    names: {}
  };

  // ------------------------------------------------------------ helpers

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'text') node.textContent = value;
      else if (key === 'class') node.className = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of [].concat(children || [])) {
      if (child) node.append(child);
    }
    return node;
  }

  function debounce(fn, ms) {
    let timer = null;
    const wrapped = (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), typeof ms === 'function' ? ms() : ms);
    };
    wrapped.cancel = () => clearTimeout(timer);
    return wrapped;
  }

  let toastTimer = null;
  function toast(message, action) {
    const box = $('#toast');
    box.replaceChildren(el('span', { text: message }));
    if (action) {
      box.append(el('button', {
        class: 'link', text: action.label, onclick: () => {
          box.hidden = true;
          action.run();
        }
      }));
    }
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      box.hidden = true;
    }, action ? 8000 : 4500);
  }

  function setStatus(text, tone) {
    const node = $('#sync-status');
    node.textContent = text;
    node.dataset.tone = tone || 'ok';
  }

  function saveSettings() {
    Store.writeJson('settings', state.settings);
  }

  // ------------------------------------------------------------- editor

  const editor = EditorLib.createEditor({
    textarea: $('#text'),
    backdrop: $('#backdrop'),
    highlights: $('#highlights'),
    onCaret: issue => {
      if (issue) activate(issue.id, { scrollCard: true });
    }
  });

  function allIssues() {
    return state.ruleIssues.concat(state.aiIssues).filter(i => !state.ignored.has(i.key));
  }

  function visibleIssues() {
    const list = allIssues();
    return state.filter === 'all' ? list : list.filter(i => i.category === state.filter);
  }

  function findIssue(id) {
    return allIssues().find(i => i.id === id) || null;
  }

  // ------------------------------------------------------------ checking

  function runCheck() {
    const text = editor.text;
    const started = performance.now();
    state.result = Engine.check(text, state.settings);
    state.ruleIssues = state.result.issues;
    state.aiIssues = AI.relocateIssues(text, state.aiIssues);
    const elapsed = Math.round(performance.now() - started);
    renderAll();
    $('#check-time').textContent = `Checked in ${elapsed} ms`;
    recordHistory();
  }

  const scheduleCheck = debounce(runCheck, () => (editor.text.length > 60000 ? 900 : 300));

  const recordHistory = debounce(() => {
    if (!state.result || !editor.text.trim()) return;
    const result = { issues: allIssues(), stats: state.result.stats, profile: state.result.profile };
    state.history = History.record(state.history, History.snapshot(result, { docId: state.docId }));
    if (state.store) state.store.saveHistory(state.history);
    if (window.GalleyPanels) window.GalleyPanels.onHistory();
  }, 4000);

  function renderAll() {
    const visible = visibleIssues();
    if (state.activeId && !visible.some(i => i.id === state.activeId)) state.activeId = null;
    editor.setIssues(visible, state.activeId);
    renderChips();
    renderCards(visible);
    renderFindingBar(visible);
    renderStats();
    $('#profile-notice').hidden = !state.result.profile.notice;
    $('#profile-notice').textContent = state.result.profile.notice || '';
    if (window.GalleyPanels) window.GalleyPanels.onCheck();
  }

  function renderStats() {
    const s = state.result.stats;
    $('#word-count').textContent = `${s.words.toLocaleString()} words`;
    $('#dialogue-share').textContent = s.dialogueShare ? `${s.dialogueShare}% dialogue` : '';
    $('#undo-fix').disabled = !editor.canUndo();
  }

  function renderChips() {
    const counts = {};
    const issues = allIssues();
    for (const issue of issues) counts[issue.category] = (counts[issue.category] || 0) + 1;
    const chips = [el('button', {
      class: `chip${state.filter === 'all' ? ' on' : ''}`, 'aria-pressed': String(state.filter === 'all'),
      onclick: () => setFilter('all')
    }, [`All `, el('b', { text: String(issues.length) })])];
    for (const [cat, label] of Object.entries(Engine.CATEGORIES)) {
      if (!counts[cat]) continue;
      chips.push(el('button', {
        class: `chip cat-${cat}${state.filter === cat ? ' on' : ''}`, 'aria-pressed': String(state.filter === cat),
        onclick: () => setFilter(state.filter === cat ? 'all' : cat)
      }, [el('span', { class: 'dot', 'aria-hidden': 'true' }), `${label} `, el('b', { text: String(counts[cat]) })]));
    }
    $('#chips').replaceChildren(...chips);
    const bySeverity = { error: 0, warning: 0, suggestion: 0, info: 0 };
    for (const issue of issues) bySeverity[issue.severity]++;
    $('#finding-count').textContent = issues.length
      ? `${bySeverity.error} errors, ${bySeverity.warning} warnings, ${bySeverity.suggestion + bySeverity.info} suggestions and notes`
      : 'No findings';
  }

  function setFilter(filter) {
    state.filter = filter;
    renderAll();
  }

  function contextFor(issue) {
    const text = editor.text;
    const before = text.slice(Math.max(0, issue.start - 28), issue.start).replace(/^\S*\s/, '');
    const after = text.slice(issue.end, issue.end + 28).replace(/\s\S*$/, '');
    return { before: before.replace(/\n/g, ' '), after: after.replace(/\n/g, ' ') };
  }

  function changeLine(issue) {
    const ctx = contextFor(issue);
    const parts = [el('span', { class: 'ctx', text: `…${ctx.before}` })];
    if (issue.text) parts.push(el('del', { text: issue.text }));
    if (issue.replacement !== null && issue.replacement !== undefined) {
      if (issue.replacement === '') parts.push(el('span', { class: 'mark-delete', title: 'Delete', text: '␡' }));
      else parts.push(el('ins', { text: issue.replacement, title: issue.start === issue.end ? 'Insert' : 'Replace with' }));
      if (issue.start === issue.end) parts.unshift(el('span', { class: 'caret', 'aria-hidden': 'true', text: '‸' }));
    }
    parts.push(el('span', { class: 'ctx', text: `${ctx.after}…` }));
    return el('p', { class: 'change' }, parts);
  }

  function renderCards(visible) {
    const list = visible.slice(0, MAX_CARDS);
    const cards = list.map(issue => {
      const canFix = issue.replacement !== null && issue.replacement !== undefined && (!state.store || state.store.me.canWrite);
      const card = el('li', {
        class: `card sev-${issue.severity} cat-${issue.category}${issue.id === state.activeId ? ' active' : ''}`,
        'data-id': issue.id, tabindex: '0',
        onclick: event => {
          if (event.target.closest('button, summary')) return;
          activate(issue.id, { select: true });
        },
        onkeydown: event => {
          if (event.key === 'Enter' && event.target === card) activate(issue.id, { select: true });
        }
      }, [
        el('div', { class: 'card-top' }, [
          el('span', { class: 'dot', 'aria-hidden': 'true' }),
          el('span', { class: 'cat', text: Engine.CATEGORIES[issue.category] || issue.category }),
          el('span', { class: `sev sev-${issue.severity}`, text: SEVERITY_LABEL[issue.severity] }),
          issue.source === 'ai' ? el('span', { class: 'badge', text: 'AI', title: 'Found by the AI check' }) : null,
          issue.inDialogue ? el('span', { class: 'badge quiet', text: 'dialogue' }) : null
        ]),
        el('p', { class: 'msg', text: issue.message }),
        changeLine(issue),
        issue.explanation ? el('details', {}, [el('summary', { text: 'Why' }), el('p', { text: issue.explanation })]) : null,
        el('div', { class: 'actions' }, [
          canFix ? el('button', { class: 'btn small primary', text: 'Accept', onclick: () => accept(issue.id) }) : null,
          el('button', {
            class: 'btn small', text: 'Stet', title: 'Stet: keep as written and hide similar findings',
            'aria-label': 'Stet: keep as written', onclick: () => stet(issue.id)
          })
        ])
      ]);
      return card;
    });
    $('#cards').replaceChildren(...cards);
    const more = visible.length - list.length;
    $('#cards-more').hidden = more <= 0;
    $('#cards-more').textContent = more > 0 ? `${more} more findings. Fix or filter some to see the rest.` : '';
    $('#empty').hidden = visible.length > 0;
    renderBulk(visible);
  }

  let bulkArmed = null;
  function renderBulk(visible) {
    const fixable = visible.filter(i => i.replacement !== null && i.replacement !== undefined);
    const box = $('#bulk');
    if (fixable.length < 2 || (state.store && !state.store.me.canWrite)) {
      box.replaceChildren();
      return;
    }
    const scope = state.filter === 'all' ? 'all' : Engine.CATEGORIES[state.filter].toLowerCase();
    const armed = bulkArmed && bulkArmed > Date.now();
    box.replaceChildren(el('button', {
      class: `btn small${armed ? ' danger' : ''}`,
      text: armed ? `Confirm: apply ${fixable.length} fixes` : `Accept all ${fixable.length} ${scope === 'all' ? '' : `${scope} `}fixes`,
      onclick: () => {
        if (!armed) {
          bulkArmed = Date.now() + 4000;
          renderBulk(visibleIssues());
          setTimeout(() => renderBulk(visibleIssues()), 4100);
          return;
        }
        bulkArmed = null;
        const before = editor.text;
        const { text, applied } = Engine.applyFixes(before, fixable);
        editor.setText(text, true);
        onEdited();
        runCheck();
        toast(`Applied ${applied} fixes.`, { label: 'Undo', run: undoFix });
        if (state.store) state.store.log('bulk-fix', { docId: state.docId, count: applied });
      }
    }));
  }

  function activate(id, opts) {
    state.activeId = id;
    editor.setActive(id);
    for (const card of document.querySelectorAll('#cards .card.active')) card.classList.remove('active');
    const card = document.querySelector(`#cards .card[data-id="${CSS.escape(id)}"]`);
    if (card) {
      card.classList.add('active');
      if (opts && opts.scrollCard) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    const issue = findIssue(id);
    if (issue && opts && opts.select) editor.select(issue, true);
    else if (issue) editor.reveal(issue);
    renderFindingBar(visibleIssues());
  }

  // Phones: the findings list sits below the editor, so a docked bar shows the
  // current finding with its actions and steps through the rest.
  const compact = window.matchMedia ? window.matchMedia('(max-width: 900px)') : { matches: false };

  function renderFindingBar(visible) {
    const bar = $('#finding-bar');
    const show = compact.matches && visible.length > 0;
    bar.hidden = !show;
    document.body.classList.toggle('has-finding-bar', show);
    if (!show) return;
    let index = visible.findIndex(i => i.id === state.activeId);
    if (index < 0) {
      index = 0;
      state.activeId = visible[0].id;
      editor.setActive(state.activeId);
    }
    const issue = visible[index];
    const canFix = issue.replacement !== null && issue.replacement !== undefined && (!state.store || state.store.me.canWrite);
    bar.className = `finding-bar cat-${issue.category}`;
    $('#fb-meta').textContent = `${index + 1} of ${visible.length} \u00b7 ${Engine.CATEGORIES[issue.category] || issue.category}${issue.source === 'ai' ? ' \u00b7 AI' : ''}`;
    $('#fb-msg').textContent = issue.message;
    $('#fb-change').replaceChildren(changeLine(issue));
    $('#fb-accept').disabled = !canFix;
    $('#fb-accept').dataset.id = issue.id;
    $('#fb-stet').dataset.id = issue.id;
  }

  function step(delta) {
    const list = visibleIssues();
    if (!list.length) return;
    const index = list.findIndex(i => i.id === state.activeId);
    const next = list[(index + delta + list.length) % list.length];
    activate(next.id, { scrollCard: true, select: true });
  }

  function accept(id) {
    const issue = findIssue(id);
    if (!issue || issue.replacement === null || issue.replacement === undefined) return;
    if (editor.text.slice(issue.start, issue.end) !== issue.text) {
      runCheck();
      return;
    }
    const list = visibleIssues();
    const index = list.findIndex(i => i.id === id);
    editor.replaceRange(issue.start, issue.end, issue.replacement);
    state.aiIssues = state.aiIssues.filter(i => i.id !== id);
    onEdited();
    runCheck();
    const after = visibleIssues();
    if (after.length) activate(after[Math.min(index, after.length - 1)].id, { scrollCard: true });
  }

  function stet(id) {
    const issue = findIssue(id);
    if (!issue) return;
    state.ignored.add(issue.key);
    renderAll();
    toast(`Stet: "${issue.text || issue.message}" will not be flagged again in this session.`, {
      label: 'Undo', run: () => {
        state.ignored.delete(issue.key);
        renderAll();
      }
    });
  }

  function undoFix() {
    if (editor.undo()) {
      onEdited();
      runCheck();
    }
  }

  // ------------------------------------------------------------- saving

  function onEdited() {
    state.dirty = true;
    if (state.store) {
      Store.writeJson(`mirror.${state.docId}`, { text: editor.text, baseRev: state.sync ? state.sync.synced.rev : 0, at: Date.now() });
    }
    setStatus(state.store && state.store.kind === 'cloud' ? 'Syncing…' : 'Saving…', 'busy');
    scheduleSave();
  }

  const scheduleSave = debounce(() => save(), 1200);

  async function save() {
    if (!state.store || !state.docId || !state.dirty) return;
    if (!state.store.me.canWrite) {
      setStatus('View only', 'muted');
      return;
    }
    if (state.saving) {
      scheduleSave();
      return;
    }
    state.saving = true;
    const text = editor.text;
    const prepared = Sync.prepareWrite(state.sync, text, state.store.me.id, {
      title: state.title, settings: pickDocSettings()
    });
    // Record the write id before awaiting: the store echoes our own write
    // through the snapshot listener, possibly before writeDoc resolves.
    state.sync = prepared.state;
    try {
      await state.store.writeDoc(state.docId, prepared.doc);
      state.dirty = editor.text !== text;
      Store.writeJson(`mirror.${state.docId}`, null);
      setStatus(state.store.kind === 'cloud' ? 'Synced' : 'Saved on this device', 'ok');
      if (Date.now() - state.lastVersionAt > 15 * 60 * 1000) {
        state.lastVersionAt = Date.now();
        state.store.addVersion(state.docId, { text, title: state.title, reason: 'auto' }).catch(() => {});
        state.store.log('saved', { docId: state.docId, title: state.title });
      }
    } catch (err) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      setStatus(offline ? 'Offline: changes kept on this device' : err.message, offline ? 'warn' : 'error');
    } finally {
      state.saving = false;
      if (state.dirty) scheduleSave();
    }
  }

  function pickDocSettings() {
    const { dialect, style, mode, poetry } = state.settings;
    return { dialect, style, mode, poetry };
  }

  async function onRemoteDoc(remote) {
    if (!state.sync) return;
    const r = Sync.onRemote(state.sync, remote, editor.text);
    state.sync = r.state;
    if (r.changed) {
      editor.setText(r.localText);
      runCheck();
    }
    if (r.fromOther) {
      if (remote.title && document.activeElement !== $('#doc-title')) {
        state.title = remote.title;
        $('#doc-title').value = remote.title;
      }
      const who = await nameOf(remote.updatedBy);
      if (r.conflicts && r.theirsText) {
        state.store.addVersion(state.docId, { text: r.theirsText, title: state.title, reason: 'conflict', by: remote.updatedBy }).catch(() => {});
        toast(`${who} edited ${r.conflicts === 1 ? 'a paragraph' : `${r.conflicts} paragraphs`} you were also changing. Your wording is kept; theirs is saved in History.`);
      } else if (r.changed) {
        toast(`${who} saved changes. They are merged into your copy.`);
      }
    }
    if (r.needsSave) onEdited();
  }

  async function nameOf(id) {
    if (!id) return 'A teammate';
    if (state.names[id] === undefined && state.store) {
      Object.assign(state.names, await state.store.names([id]).catch(() => ({})));
    }
    return state.names[id] || 'A teammate';
  }

  // ---------------------------------------------------------- documents

  async function openDoc(id) {
    if (state.docHandle) state.docHandle.close();
    if (state.dirty) await save();
    const handle = await state.store.openDoc(id, onRemoteDoc, err => setStatus(err.message, 'error'));
    if (!handle.doc) return false;
    state.docHandle = handle;
    state.docId = id;
    state.sync = Sync.create(handle.doc);
    state.title = handle.doc.title || 'Untitled manuscript';
    state.aiIssues = [];
    state.ignored.clear();
    state.lastVersionAt = Date.now();
    if (handle.doc.settings) Object.assign(state.settings, handle.doc.settings);
    syncControls();
    $('#doc-title').value = state.title;
    editor.setText(handle.doc.text || '');
    Store.writeJson(`current.${state.store.kind}`, id);
    restoreMirror(handle.doc);
    setStatus(state.store.kind === 'cloud' ? (state.store.me.canWrite ? 'Synced' : 'View only') : 'Saved on this device', 'ok');
    runCheck();
    if (window.GalleyPanels) window.GalleyPanels.onDocChange();
    return true;
  }

  /** Recover edits made offline that never reached the store. */
  function restoreMirror(doc) {
    const mirror = Store.readJson(`mirror.${doc.id}`, null);
    if (!mirror || mirror.text === doc.text) return;
    if (mirror.baseRev === (doc.rev || 0)) {
      editor.setText(mirror.text);
      onEdited();
      toast('Restored edits that had not been saved yet.');
    } else {
      state.store.addVersion(doc.id, { text: mirror.text, title: doc.title, reason: 'offline copy' }).catch(() => {});
      Store.writeJson(`mirror.${doc.id}`, null);
      toast('Edits made offline were saved in History, because the document changed meanwhile.');
    }
  }

  async function newDoc(fields) {
    const id = await state.store.createDoc(Object.assign({ settings: pickDocSettings() }, fields));
    await openDoc(id);
    return id;
  }

  async function chooseInitialDoc(docs) {
    // Text typed while the workspace was still connecting becomes its own document.
    const typedEarly = editor.text !== SAMPLE && editor.text.trim();
    if (typedEarly && state.store.me.canWrite) {
      return newDoc({ title: $('#doc-title').value.trim() || 'Untitled manuscript', text: editor.text });
    }
    const remembered = Store.readJson(`current.${state.store.kind}`, null);
    const target = docs.find(d => d.id === remembered) || docs[0];
    if (target) return openDoc(target.id);
    if (!state.store.me.canWrite) {
      editor.setText('');
      setStatus('View only: no shared documents yet', 'muted');
      runCheck();
      return false;
    }
    const carry = editor.text.trim() ? editor.text : SAMPLE;
    return newDoc({ title: carry === SAMPLE ? SAMPLE_TITLE : state.title || 'Untitled manuscript', text: carry });
  }

  async function useStore(store) {
    if (state.docHandle) state.docHandle.close();
    if (state.unsubscribeDocs) state.unsubscribeDocs();
    state.store = store;
    state.docHandle = null;
    state.history = await store.loadHistory();
    let first = true;
    state.unsubscribeDocs = store.listDocs(docs => {
      state.docs = docs;
      if (first) {
        first = false;
        chooseInitialDoc(docs);
      }
      if (window.GalleyPanels) window.GalleyPanels.onDocs(docs);
    }, err => setStatus(err.message, 'error'));
    document.body.dataset.store = store.kind;
    $('#text').readOnly = !store.me.canWrite;
  }

  // ------------------------------------------------------------------ AI

  async function detectAi() {
    if (window.GalleyNative) return window.GalleyNative.aiBackend();
    const claude = window.claude;
    if (claude && typeof claude.use === 'function') {
      const sample = await claude.use('sample').catch(() => null);
      if (sample) {
        return {
          kind: 'claude',
          async run(prompt, signal) {
            return sample.json(AI.asSingleInput(prompt), { signal, modelTier: 'default' });
          }
        };
      }
      return null;
    }
    if (!/^https?:$/.test(window.location.protocol)) return null;
    try {
      const res = await fetch('api/status');
      const status = res.ok ? await res.json() : null;
      if (!status || !status.ai) return null;
    } catch (_err) {
      return null;
    }
    return {
      kind: 'server',
      async run(prompt, signal, body) {
        const res = await fetch('api/ai', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw Object.assign(new Error(data.error || `Server error ${res.status}`), { code: 'server' });
        return data;
      }
    };
  }

  const AI_ERRORS = {
    not_granted: 'Claude access was not allowed for this page. You can change that in the page\'s permissions menu.',
    sampling_disabled: 'Claude is not available for this account.',
    rate_limited: 'Claude is busy or your usage limit was reached. Try again later.',
    refused: 'Claude declined to review this passage.',
    prompt_too_large: 'This passage is too long for one AI request.',
    invalid_json: 'Claude\'s answer could not be read. Try again.',
    session_expired: 'Sign in to claude.ai again to use the AI check.'
  };

  function aiMessage(err) {
    if (err && AI_ERRORS[err.code]) return AI_ERRORS[err.code];
    if (err && err.code === 'server') return err.message;
    return 'The AI check failed. Try again in a moment.';
  }

  function setAiStatus(text, running) {
    const box = $('#ai-status');
    box.hidden = !text;
    box.replaceChildren(el('span', { text: text || '' }));
    if (running) box.append(el('button', { class: 'link', text: 'Stop', onclick: () => state.aiAbort && state.aiAbort.abort() }));
    $('#ai-check').disabled = Boolean(running);
  }

  async function runAiCheck() {
    if (!state.ai || state.aiAbort) return;
    const text = editor.text;
    if (!text.trim()) return;
    const chunks = AI.chunkText(text);
    const abort = new AbortController();
    state.aiAbort = abort;
    const found = [];
    let dropped = 0;
    try {
      for (let n = 0; n < chunks.length; n++) {
        const chunk = chunks[n];
        setAiStatus(chunks.length > 1 ? `Claude is reading part ${n + 1} of ${chunks.length}…` : 'Claude is reading the passage…', true);
        const findings = state.ruleIssues
          .filter(i => i.start >= chunk.offset && i.end <= chunk.offset + chunk.text.length)
          .map(i => ({ text: i.text, message: i.message }));
        const profile = Engine.resolveProfile(state.settings);
        const prompt = AI.buildProofreadPrompt({ text: chunk.text, profile, flow: state.settings.flow, findings });
        const parsed = await state.ai.run(prompt, abort.signal, {
          kind: 'proofread', text: chunk.text, options: pickDocSettings(), flow: state.settings.flow, findings
        });
        const located = AI.locateIssues(text, chunk, parsed);
        found.push(...located.issues);
        dropped += located.dropped;
      }
      state.aiIssues = AI.relocateIssues(editor.text, found);
      runCheck();
      const extra = dropped ? ` ${dropped} could not be matched to the text and were skipped.` : '';
      setAiStatus(`Claude added ${state.aiIssues.length} finding${state.aiIssues.length === 1 ? '' : 's'}.${extra}`, false);
      if (state.store) state.store.log('ai-check', { docId: state.docId, findings: state.aiIssues.length });
    } catch (err) {
      if (err && (err.code === 'cancelled' || err.name === 'AbortError')) setAiStatus('AI check stopped.', false);
      else setAiStatus(aiMessage(err), false);
    } finally {
      state.aiAbort = null;
      $('#ai-check').disabled = false;
    }
  }

  // ------------------------------------------------------------ controls

  function buildSelects() {
    const dialect = $('#dialect');
    const groups = { us: 'American spelling family', uk: 'British spelling family' };
    for (const [family, label] of Object.entries(groups)) {
      const group = el('optgroup', { label });
      for (const d of Engine.DIALECTS.filter(x => x.family === family)) group.append(el('option', { value: d.id, text: d.name }));
      dialect.append(group);
    }
    for (const g of Engine.STYLE_GUIDES) $('#style').append(el('option', { value: g.id, text: g.name }));
  }

  function syncControls() {
    const dialect = Engine.DIALECTS.find(d => d.id === state.settings.dialect);
    const guide = Engine.STYLE_GUIDES.find(g => g.id === state.settings.style);
    $('#settings-summary').textContent = [
      dialect ? dialect.name : '', guide ? guide.short : '',
      state.settings.mode === 'formal' ? 'Formal' : 'Creative', state.settings.poetry ? 'Poetry' : ''
    ].filter(Boolean).join(' \u00b7 ');
    $('#dialect').value = state.settings.dialect;
    $('#style').value = state.settings.style;
    $('#poetry').checked = Boolean(state.settings.poetry);
    $('#ai-flow').checked = Boolean(state.settings.flow);
    for (const btn of document.querySelectorAll('[data-mode]')) {
      btn.setAttribute('aria-checked', String(btn.dataset.mode === state.settings.mode));
    }
    const lang = state.settings.dialect.startsWith('en-GB') ? 'en-GB' : state.settings.dialect;
    editor.setLang(lang);
  }

  function changeSetting(key, value) {
    state.settings[key] = value;
    if (key === 'style') {
      const guide = Engine.STYLE_GUIDES.find(g => g.id === value);
      if (guide && guide.settings.register === 'formal') state.settings.mode = 'formal';
    }
    saveSettings();
    syncControls();
    runCheck();
    if (key !== 'flow') {
      state.dirty = true;
      scheduleSave();
    }
  }

  function bindControls() {
    $('#dialect').addEventListener('change', e => changeSetting('dialect', e.target.value));
    $('#style').addEventListener('change', e => changeSetting('style', e.target.value));
    $('#poetry').addEventListener('change', e => changeSetting('poetry', e.target.checked));
    $('#ai-flow').addEventListener('change', e => changeSetting('flow', e.target.checked));
    for (const btn of document.querySelectorAll('[data-mode]')) {
      btn.addEventListener('click', () => changeSetting('mode', btn.dataset.mode));
    }
    $('#text').addEventListener('input', () => {
      onEdited();
      scheduleCheck();
    });
    $('#doc-title').addEventListener('change', e => {
      state.title = e.target.value.trim() || 'Untitled manuscript';
      state.dirty = true;
      scheduleSave();
    });
    $('#ai-check').addEventListener('click', () => (window.GalleyNative && !state.ai ? window.GalleyNative.openAiSettings() : runAiCheck()));
    $('#settings-toggle').addEventListener('click', () => {
      const open = $('#settings-toggle').getAttribute('aria-expanded') !== 'true';
      $('#settings-toggle').setAttribute('aria-expanded', String(open));
      document.querySelector('.controls').classList.toggle('open', open);
    });
    $('#fb-prev').addEventListener('click', () => step(-1));
    $('#fb-next').addEventListener('click', () => step(1));
    $('#fb-accept').addEventListener('click', event => accept(event.currentTarget.dataset.id));
    $('#fb-stet').addEventListener('click', event => stet(event.currentTarget.dataset.id));
    if (compact.addEventListener) compact.addEventListener('change', () => renderFindingBar(visibleIssues()));
    $('#prev-issue').addEventListener('click', () => step(-1));
    $('#next-issue').addEventListener('click', () => step(1));
    $('#undo-fix').addEventListener('click', undoFix);
    $('#smart-quotes').addEventListener('click', () => {
      const next = Engine.smartQuotes(editor.text);
      if (next === editor.text) return toast('Quotes and apostrophes are already curly.');
      editor.setText(next, true);
      onEdited();
      runCheck();
      return toast('Converted straight quotes to curly quotes.', { label: 'Undo', run: undoFix });
    });
    document.addEventListener('keydown', event => {
      if (!event.altKey) return;
      if (event.key === 'ArrowDown') step(1);
      else if (event.key === 'ArrowUp') step(-1);
      else if (event.key === 'Enter' && state.activeId) accept(state.activeId);
      else if (event.key === 'Backspace' && state.activeId) stet(state.activeId);
      else return;
      event.preventDefault();
    });
    window.addEventListener('online', () => {
      if (state.dirty) save();
    });
    window.addEventListener('offline', () => setStatus('Offline: changes kept on this device', 'warn'));
  }

  // ---------------------------------------------------------------- boot

  async function boot() {
    buildSelects();
    syncControls();
    bindControls();
    editor.setText(SAMPLE);
    $('#doc-title').value = SAMPLE_TITLE;
    runCheck();
    const hosted = window.claude && typeof window.claude.use === 'function';
    if (hosted) setStatus('Connecting to the shared workspace…', 'busy');
    const [store, ai] = await Promise.all([Store.open(), detectAi()]);
    setAi(ai);
    await useStore(store);
    window.dispatchEvent(new CustomEvent('galley:ready'));
  }

  /** Switch the AI transport; the mobile app offers the button even before a key is set. */
  function setAi(ai) {
    state.ai = ai;
    document.body.dataset.ai = ai ? ai.kind : (window.GalleyNative ? 'device' : 'none');
  }

  window.GalleyApp = {
    state,
    editor,
    el,
    toast,
    runCheck,
    allIssues,
    openDoc,
    newDoc,
    onEdited,
    save,
    setStatus,
    pickDocSettings,
    sampleText: () => SAMPLE,
    sampleTitle: SAMPLE_TITLE,
    activate,
    setAi,
    step,
    runAiCheck
  };

  boot();
}());
