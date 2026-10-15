/* global window, document */
/**
 * Galley's mobile layer. Runs only inside the Capacitor app (Android now,
 * iOS next) and does nothing in a browser. It provides:
 *
 *   - export through the system share sheet (save to Files or Drive, mail,
 *     open in Word), since a WebView cannot download files
 *   - the AI check on the user's own Anthropic API key, kept encrypted by
 *     the SecureKey plugin and used with the official SDK
 *   - text from other apps (IncomingText plugin): the "Proofread" entry in
 *     the text-selection menu, which can hand corrected text back, and Share
 *   - the hardware back button, and saving when the app goes to background
 *
 * Plugins are reached through the Capacitor bridge the native shell injects
 * (window.Capacitor), so the page needs no bundler. A plugin the platform
 * lacks (IncomingText on iOS, for now) just turns its feature off.
 */
(function () {
  'use strict';

  const Cap = window.Capacitor;
  if (!Cap || typeof Cap.isNativePlatform !== 'function' || !Cap.isNativePlatform()) return;

  const AI = window.GalleyAI;
  // The native shell injects Capacitor.Plugins; there is no registerPlugin
  // without @capacitor/core's JavaScript, so a missing plugin is just null.
  const plugin = name => (Cap.Plugins && Cap.Plugins[name]) || null;
  const App = plugin('App');
  const Filesystem = plugin('Filesystem');
  const Share = plugin('Share');
  const SecureKey = plugin('SecureKey');
  const IncomingText = plugin('IncomingText');

  let apiKey = null;
  let sdk = null;
  // True in the window opened from another app's text-selection menu, which
  // lives in that app's task; selection describes what it was opened for:
  // { canReturn, truncated, failed, docId }, docId holding the selection.
  let selectionWindow = false;
  let selection = null;

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
    for (const child of [].concat(children || [])) if (child) node.append(child);
    return node;
  }

  function toBase64(data) {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  function app() {
    return window.GalleyApp;
  }

  /** Switch the AI backend; the style sheet describes it, so redraw it if open. */
  function useAi(backend) {
    app().setAi(backend);
    const panels = window.GalleyPanels;
    if (panels && panels.currentTab() === 'sheet') panels.renderSheet();
  }

  // ---------------------------------------------------------------- export

  /** Write the file to the app cache and offer it through the share sheet. */
  async function saveFile(filename, data) {
    if (!Filesystem || !Share) throw new Error('Saving files is not available in this version of the app.');
    const safeName = filename.replace(/[\\/:*?"<>|]+/g, '-');
    const written = await Filesystem.writeFile({
      path: `exports/${safeName}`,
      data: toBase64(data),
      directory: 'CACHE',
      recursive: true
    });
    try {
      await Share.share({ title: safeName, dialogTitle: 'Save or send', files: [written.uri] });
      return true;
    } catch (err) {
      if (/cancel/i.test(String(err && err.message))) return false;
      throw new Error('The share sheet could not open this file.');
    }
  }

  // -------------------------------------------------------------------- AI

  function loadSdk() {
    if (!sdk) {
      sdk = new Promise((resolve, reject) => {
        const script = el('script', { src: 'vendor/anthropic-sdk.js' });
        script.onload = () => (window.AnthropicSDK ? resolve(window.AnthropicSDK) : reject(new Error('The AI library did not load.')));
        script.onerror = () => {
          sdk = null;
          reject(new Error('The AI library is missing from this build. Run npm run android:sync.'));
        };
        document.head.append(script);
      });
    }
    return sdk;
  }

  function describeError(err, Anthropic) {
    const failure = (code, message) => Object.assign(new Error(message), { code });
    if (err && (err.code === 'refused')) return failure('refused', err.message);
    if (err && err.code === 'too_long') return failure('server', err.message);
    if (Anthropic) {
      if (err instanceof Anthropic.APIUserAbortError) return failure('cancelled', 'Stopped.');
      if (err instanceof Anthropic.AuthenticationError) return failure('server', 'Anthropic rejected this API key. Check it in AI settings.');
      if (err instanceof Anthropic.PermissionDeniedError) return failure('server', 'This API key cannot use the model Galley needs.');
      if (err instanceof Anthropic.RateLimitError) return failure('rate_limited', 'Rate limited.');
      if (err instanceof Anthropic.APIConnectionError) return failure('server', 'No connection to Anthropic. Check the internet connection and try again.');
      if (err instanceof Anthropic.APIError) return failure('server', `Anthropic returned an error (${err.status || 'unknown'}).`);
    }
    if (err instanceof SyntaxError || /JSON/.test(String(err && err.message))) return failure('invalid_json', 'Unreadable reply.');
    return failure('server', (err && err.message) || 'The AI check failed.');
  }

  function aiBackend() {
    if (!apiKey) return null;
    return {
      kind: 'device',
      async run(prompt, signal, body) {
        // Another Galley window (the selection menu's) may have replaced or
        // removed the key since this one loaded it.
        await loadKey();
        if (!apiKey) {
          useAi(null);
          throw Object.assign(new Error('No API key is saved on this phone. Add one in AI settings.'), { code: 'server' });
        }
        const Anthropic = await loadSdk();
        const schema = body && body.kind === 'summary' ? AI.SUMMARY_SCHEMA : AI.ISSUES_SCHEMA;
        try {
          const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
          const message = await client.beta.messages.stream(AI.buildRequest(prompt, schema), { signal }).finalMessage();
          return AI.readMessage(message);
        } catch (err) {
          throw describeError(err, Anthropic);
        }
      }
    };
  }

  async function loadKey() {
    if (!SecureKey) return;
    try {
      const result = await SecureKey.get();
      apiKey = result && result.value ? result.value : null;
    } catch (_err) {
      // The key store was briefly unavailable: keep what this window has.
    }
  }

  let dialog = null;
  function openAiSettings() {
    if (!dialog) {
      const input = el('input', {
        id: 'ai-key', type: 'password', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
        placeholder: 'sk-ant-…', 'aria-describedby': 'ai-key-help'
      });
      const status = el('p', { class: 'meta', role: 'status' });
      const remove = el('button', { class: 'btn quiet', type: 'button', text: 'Remove key' });
      dialog = el('dialog', { class: 'sheet-dialog', 'aria-labelledby': 'ai-dialog-title' }, [
        el('form', { method: 'dialog', class: 'dialog-body' }, [
          el('h2', { id: 'ai-dialog-title', text: 'AI check on this phone' }),
          el('p', {
            id: 'ai-key-help',
            text: 'Galley calls Claude with your own Anthropic API key. The key is encrypted with a key that never leaves this phone. The text you check is sent to Anthropic, and usage is billed to your Anthropic account. Create a key at console.anthropic.com.'
          }),
          el('label', { class: 'field', for: 'ai-key' }, [el('span', { text: 'Anthropic API key' })]),
          input,
          status,
          el('div', { class: 'dialog-actions' }, [
            remove,
            el('span', { class: 'grow' }),
            el('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: () => dialog.close() }),
            el('button', { class: 'btn primary', type: 'submit', value: 'save', text: 'Save' })
          ])
        ])
      ]);
      dialog.addEventListener('submit', async event => {
        event.preventDefault();
        const value = input.value.trim();
        if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(value)) {
          status.textContent = 'That does not look like an Anthropic API key. Keys start with sk-ant-.';
          return;
        }
        try {
          if (!SecureKey) throw new Error('Keys cannot be stored securely in this version of the app.');
          await SecureKey.set({ value });
          apiKey = value;
          input.value = '';
          useAi(aiBackend());
          dialog.close();
          app().toast('AI check is ready.', { label: 'Check now', run: () => app().runAiCheck() });
        } catch (err) {
          status.textContent = (err && err.message) || 'The key could not be saved.';
        }
      });
      remove.addEventListener('click', async () => {
        if (SecureKey) await SecureKey.clear().catch(() => {});
        apiKey = null;
        useAi(null);
        dialog.close();
        app().toast('API key removed from this phone.');
      });
      document.body.append(dialog);
    }
    dialog.querySelector('[role="status"]').textContent = apiKey ? 'A key is saved. Enter a new one to replace it.' : '';
    dialog.querySelector('.btn.quiet').hidden = !apiKey;
    dialog.showModal();
  }

  function describeAi() {
    return apiKey
      ? 'The AI check runs on your own Anthropic API key, stored encrypted on this phone. Checked text is sent to Anthropic.'
      : 'Add your Anthropic API key to turn on the AI check. It is stored encrypted on this phone.';
  }

  // --------------------------------------------------------- incoming text

  function returnBar() {
    let bar = document.getElementById('return-bar');
    if (!bar) {
      bar = el('div', { id: 'return-bar', class: 'return-bar', role: 'region', 'aria-label': 'Return to the other app' });
      document.querySelector('.editor-col').prepend(bar);
    }
    return bar;
  }

  /**
   * Close the selection window, sending text back when given. The selection
   * was only a scratch copy, so its document and history go first.
   */
  async function finishSelection(text) {
    if (selection && selection.docId) {
      const docId = selection.docId;
      if (app().state.docId === docId) app().state.dirty = false; // no save after deleting
      await app().forgetDoc(docId).catch(() => {});
    }
    return IncomingText.finish(text === undefined ? {} : { text });
  }

  /** The selection's document text, saving first when it is the open one. */
  async function selectionText() {
    await app().save();
    return app().editor.text;
  }

  async function replaceSelection() {
    if (app().state.docId !== selection.docId) {
      // The user opened another document meanwhile: show the selection's
      // own document before anything is sent back.
      if (!selection.docId || !(await app().openDoc(selection.docId))) {
        app().toast('The selection\'s document is gone, so there is nothing to send back.');
        return;
      }
      app().toast('This is the selection\'s document. Tap Replace selection again to send it back.');
      return;
    }
    const text = await selectionText();
    if (!selection.canReturn || text.length > 100000) {
      app().toast(selection.canReturn ? 'The corrected text is too long to send back. Copy it instead.' : 'That app does not accept changes back.');
      return;
    }
    finishSelection(text).catch(err => app().toast(err.message));
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_err) {
      // Older WebViews: copy through a temporary field.
      const field = el('textarea', { class: 'sr-only', 'aria-hidden': 'true' });
      field.value = text;
      document.body.append(field);
      field.select();
      const ok = document.execCommand('copy');
      field.remove();
      return ok;
    }
  }

  function showReturnBar() {
    const bar = returnBar();
    const canReturn = selection.canReturn && !selection.failed;
    let note = 'Proofreading a selection from another app. Galley deletes this copy when you return.';
    if (selection.failed) note = 'Galley could not save this text, so it cannot be proofread here.';
    else if (selection.truncated) note = 'The other app sent only part of a long selection, so it cannot be replaced. Copy the result instead.';
    else if (!canReturn) note = 'That app does not accept changes back. Copy the result instead.';
    let action = null;
    if (canReturn) {
      action = el('button', { class: 'btn primary', type: 'button', text: 'Replace selection', onclick: replaceSelection });
    } else if (!selection.failed) {
      action = el('button', {
        class: 'btn primary', type: 'button', text: 'Copy text',
        onclick: async () => app().toast((await copyText(await selectionText())) ? 'Copied.' : 'Copy failed. Select the text and copy it.')
      });
    }
    bar.replaceChildren(
      el('p', { text: note }),
      el('div', { class: 'row' }, [
        el('button', {
          class: 'btn', type: 'button', text: canReturn ? 'Cancel' : 'Done',
          onclick: () => finishSelection().catch(() => {})
        }),
        action
      ])
    );
    bar.hidden = false;
  }

  async function openIncoming(item) {
    if (!item) return;
    if (item.error) {
      app().toast(item.error);
      return;
    }
    if (!item.text) return;
    const when = new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const title = item.title || `${item.source === 'process' ? 'Selection' : 'Shared text'}, ${when}`;
    let docId = null;
    try {
      docId = await app().newDoc({ title, text: item.text });
    } catch (err) {
      app().toast(err.message || 'Galley could not save this text.');
    }
    const opened = Boolean(docId) && app().state.docId === docId;
    if (item.source !== 'process') {
      if (opened) {
        if (window.GalleyPanels) window.GalleyPanels.showTab('proof');
        app().toast(item.truncated ? 'Shared text opened as a new document (only the first 500,000 characters).' : 'Shared text opened as a new document.');
      }
      return;
    }
    if (window.GalleyPanels) window.GalleyPanels.showTab('proof');
    selection = { canReturn: Boolean(item.canReturn), truncated: Boolean(item.truncated), failed: !opened, docId: opened ? docId : null };
    if (opened) IncomingText.setReturnDoc({ docId }).catch(() => {});
    showReturnBar();
  }

  /** In the selection window after a restart, reopen the selection's document. */
  async function restoreSelection(host) {
    selection = { canReturn: Boolean(host.canReturn), truncated: false, failed: false, docId: host.docId };
    if (selection.docId && app().state.docId !== selection.docId) await app().openDoc(selection.docId);
    showReturnBar();
  }

  // ------------------------------------------------------------- lifecycle

  function closeOverlays() {
    if (dialog && dialog.open) {
      dialog.close();
      return true;
    }
    const menu = document.getElementById('export-menu');
    if (menu && !menu.hidden) {
      menu.hidden = true;
      const button = document.getElementById('export-btn');
      if (button) button.setAttribute('aria-expanded', 'false');
      return true;
    }
    const controls = document.querySelector('.controls.open');
    if (controls) {
      document.getElementById('settings-toggle').click();
      return true;
    }
    return false;
  }

  function onBack() {
    if (closeOverlays()) return;
    const panels = window.GalleyPanels;
    if (panels && panels.currentTab() !== 'proof') {
      panels.showTab('proof');
      return;
    }
    if (selectionWindow) {
      // The selection window lives in the other app's task: Back returns there.
      finishSelection().catch(() => {});
      return;
    }
    App.minimizeApp();
  }

  window.GalleyNative = {
    platform: Cap.getPlatform(),
    saveFile,
    aiBackend,
    openAiSettings,
    describeAi
  };

  document.documentElement.classList.add('native-app');
  const ready = loadKey();

  window.addEventListener('galley:ready', async () => {
    await ready;
    useAi(aiBackend());
    if (App) {
      App.addListener('backButton', onBack);
      App.addListener('pause', () => app().save());
      App.addListener('resume', async () => {
        await loadKey();
        useAi(aiBackend());
      });
    }
    if (IncomingText) {
      try {
        const host = await IncomingText.getHost();
        selectionWindow = Boolean(host && host.mode === 'process');
        if (selectionWindow && host.docId) await restoreSelection(host);
      } catch (_err) {
        // an older shell without getHost: incoming text still arrives below
      }
      IncomingText.addListener('incomingText', openIncoming);
    }
    // Exports only need to live until the share sheet has read them. Only the
    // main window clears them, so a selection window never removes a file
    // the main window is still sharing.
    if (Filesystem && !selectionWindow) Filesystem.rmdir({ path: 'exports', directory: 'CACHE', recursive: true }).catch(() => {});
  });
}());
