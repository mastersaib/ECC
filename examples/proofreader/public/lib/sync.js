/**
 * Sync state machine for one shared document.
 *
 * Every write carries { rev, baseRev, writeId }. A client remembers the
 * texts of recent revisions, so when another person's write arrives it can
 * three-way merge against the exact text that person started from, even
 * when both saved at the same moment and the store kept only the last
 * write. Pure functions: the page owns the store, this module owns the
 * decisions, and the tests drive two simulated clients through it.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./merge'));
  } else {
    root.GalleySync = factory(root.GalleyMerge);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Merge) {
  'use strict';

  const KEEP_REVS = 25;

  function randomId() {
    const bytes = new Uint8Array(8);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  function remember(revTexts, rev, text) {
    const next = revTexts.filter(([r]) => r !== rev).concat([[rev, text]]);
    return next.slice(-KEEP_REVS);
  }

  /** State for a document whose server copy is { text, rev, writeId }. */
  function create(remote) {
    const doc = remote || { text: '', rev: 0, writeId: null };
    return {
      synced: { text: doc.text || '', rev: doc.rev || 0, writeId: doc.writeId || null },
      revTexts: [[doc.rev || 0, doc.text || '']],
      ownWrites: []
    };
  }

  function textAt(state, rev) {
    const hit = state.revTexts.find(([r]) => r === rev);
    return hit ? hit[1] : null;
  }

  /**
   * A snapshot arrived. Returns the new state plus what the page should do:
   *   localText   - the text the editor should now show
   *   changed     - true when localText differs from the editor's text
   *   needsSave   - true when the merged result must be written back
   *   conflicts   - paragraphs both sides changed (local version kept)
   *   theirsText  - the other side's full text when conflicts > 0, so the
   *                 page can store it as a version
   */
  function onRemote(state, remote, localText) {
    const result = { state, localText, changed: false, needsSave: false, conflicts: 0, theirsText: null, fromOther: false };
    if (!remote) return result;
    if (state.ownWrites.includes(remote.writeId)) {
      result.state = Object.assign({}, state, {
        synced: { text: remote.text, rev: remote.rev, writeId: remote.writeId },
        revTexts: remember(state.revTexts, remote.rev, remote.text)
      });
      result.needsSave = localText !== remote.text;
      return result;
    }
    if (remote.rev === state.synced.rev && remote.writeId === state.synced.writeId) return result;
    result.fromOther = true;
    const revTexts = remember(state.revTexts, remote.rev, remote.text);
    const next = Object.assign({}, state, {
      synced: { text: remote.text, rev: remote.rev, writeId: remote.writeId },
      revTexts
    });
    result.state = next;
    // A write based on an older revision than ours was made without seeing
    // our last save (the store kept only the later write), so it must be
    // merged even when we have no unsaved edits.
    const concurrent = typeof remote.baseRev === 'number' && remote.baseRev < state.synced.rev;
    if (!concurrent && localText === state.synced.text) {
      result.localText = remote.text;
      result.changed = remote.text !== localText;
      return result;
    }
    const base = typeof remote.baseRev === 'number' ? textAt(state, remote.baseRev) : null;
    const merged = Merge.merge3(base !== null ? base : state.synced.text, localText, remote.text);
    result.localText = merged.text;
    result.changed = merged.text !== localText;
    result.needsSave = merged.text !== remote.text;
    result.conflicts = merged.conflicts;
    if (merged.conflicts) result.theirsText = remote.text;
    return result;
  }

  /** Build the document body for a save of localText. */
  function prepareWrite(state, localText, by, extra) {
    const writeId = randomId();
    const rev = state.synced.rev + 1;
    const doc = Object.assign({}, extra || {}, {
      text: localText,
      rev,
      baseRev: state.synced.rev,
      writeId,
      updatedBy: by || null,
      updatedAt: new Date().toISOString()
    });
    const next = Object.assign({}, state, {
      ownWrites: state.ownWrites.concat([writeId]).slice(-KEEP_REVS),
      revTexts: remember(state.revTexts, rev, localText)
    });
    return { state: next, doc };
  }

  return { create, onRemote, prepareWrite, randomId };
}));
