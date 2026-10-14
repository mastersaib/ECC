/* global window */
/**
 * Galley storage. Two implementations behind one interface:
 *
 *   LocalStore - this browser only (localStorage). Works offline and from
 *                file://. Other tabs see changes through the storage event.
 *   CloudStore - the shared workspace when the page is hosted on claude.ai:
 *                documents sync across devices and teammates, with version
 *                history, per-person activity logs and roles that follow
 *                the artifact's sharing levels (Viewer reads, Contributor
 *                edits, Editor and Owner also read everyone's activity).
 */
(function (root) {
  'use strict';

  const PREFIX = 'galley.';
  const MAX_LOCAL_VERSIONS = 30;
  const MAX_ACTIVITY = 300;
  const CLOUD_HISTORY_ENTRIES = 80;

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_err) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (_err) {
      return false;
    }
  }

  function newId() {
    return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  }

  function words(text) {
    return (String(text || '').match(/\S+/g) || []).length;
  }

  // ------------------------------------------------------------- local

  function createLocalStore() {
    const listeners = new Set();
    const docListeners = new Map();
    const onStorage = event => {
      if (!event.key || !event.key.startsWith(PREFIX)) return;
      if (event.key === `${PREFIX}docs`) listeners.forEach(fn => fn(listDocsNow()));
      const m = event.key.match(/^galley\.doc\.(.+)$/);
      if (m && docListeners.has(m[1])) {
        const doc = readJson(`doc.${m[1]}`, null);
        if (doc) docListeners.get(m[1]).forEach(fn => fn(doc));
      }
    };
    if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);

    function listDocsNow() {
      const index = readJson('docs', {});
      return Object.values(index).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    }

    function saveIndex(doc) {
      const index = readJson('docs', {});
      index[doc.id] = { id: doc.id, title: doc.title, updatedAt: doc.updatedAt, updatedBy: null, words: words(doc.text) };
      writeJson('docs', index);
      listeners.forEach(fn => fn(listDocsNow()));
    }

    function pushActivity(action, detail) {
      const log = readJson('activity', []);
      log.push(Object.assign({ at: new Date().toISOString(), by: null, action }, detail || {}));
      writeJson('activity', log.slice(-MAX_ACTIVITY));
    }

    return {
      kind: 'local',
      me: { id: null, canWrite: true, canAdmin: true },
      listDocs(cb) {
        listeners.add(cb);
        cb(listDocsNow());
        return () => listeners.delete(cb);
      },
      async createDoc(fields) {
        const id = newId();
        const doc = Object.assign({ id, title: 'Untitled manuscript', text: '', rev: 0, writeId: null }, fields, {
          updatedAt: new Date().toISOString()
        });
        writeJson(`doc.${id}`, doc);
        saveIndex(doc);
        pushActivity('created', { docId: id, title: doc.title });
        return id;
      },
      async deleteDoc(id) {
        const index = readJson('docs', {});
        const title = index[id] && index[id].title;
        delete index[id];
        writeJson('docs', index);
        try {
          localStorage.removeItem(`${PREFIX}doc.${id}`);
          localStorage.removeItem(`${PREFIX}versions.${id}`);
        } catch (_err) {
          // storage unavailable: nothing to remove
        }
        listeners.forEach(fn => fn(listDocsNow()));
        pushActivity('deleted', { docId: id, title });
      },
      async openDoc(id, onRemote) {
        const doc = readJson(`doc.${id}`, null);
        if (!docListeners.has(id)) docListeners.set(id, new Set());
        docListeners.get(id).add(onRemote);
        return { doc, close: () => docListeners.get(id).delete(onRemote) };
      },
      async writeDoc(id, body) {
        const doc = Object.assign({ id }, body);
        if (!writeJson(`doc.${id}`, doc)) throw new Error('This browser\'s storage is full. Export the manuscript and delete old documents.');
        saveIndex(doc);
      },
      async addVersion(id, version) {
        const list = readJson(`versions.${id}`, []);
        list.push(Object.assign({ id: newId(), at: new Date().toISOString(), by: null, words: words(version.text) }, version));
        writeJson(`versions.${id}`, list.slice(-MAX_LOCAL_VERSIONS));
      },
      async listVersions(id) {
        return readJson(`versions.${id}`, []).slice().reverse();
      },
      async log(action, detail) {
        pushActivity(action, detail);
      },
      async listActivity() {
        return readJson('activity', []).slice().reverse();
      },
      async loadHistory() {
        return readJson('history', []);
      },
      async saveHistory(log) {
        writeJson('history', log);
      },
      async names() {
        return {};
      }
    };
  }

  // ------------------------------------------------------------- cloud

  function compactHistory(log) {
    return log.slice(-CLOUD_HISTORY_ENTRIES).map(entry => {
      const rules = {};
      for (const [id, info] of Object.entries(entry.rules || {})) {
        rules[id] = { count: info.count, samples: (info.samples || []).slice(0, 1).map(s => s.slice(0, 40)) };
      }
      return Object.assign({}, entry, { rules });
    });
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  async function createCloudStore(db, user) {
    const me = {
      id: user ? await user.id() : null,
      canWrite: true,
      canAdmin: user ? await user.canEdit() : false
    };
    const can = user ? await user.can('data.write') : null;
    if (can === false) me.canWrite = false;
    const queues = new Map();
    const serial = (key, fn) => {
      const next = (queues.get(key) || Promise.resolve()).catch(() => {}).then(fn);
      queues.set(key, next);
      return next;
    };
    let activityDay = null;
    const dbError = err => {
      if (err && err.code === 'quota_exceeded') return new Error('The shared workspace is full. Delete old documents or versions.');
      if (err && err.code === 'invalid_argument') return new Error('You can read this workspace but not change it, or the document is too large to sync (about 250,000 characters).');
      return new Error((err && err.message) || 'The workspace could not be reached.');
    };

    async function appendActivity(action, detail) {
      if (!me.id || !me.canWrite) return;
      const day = today();
      const ref = db.doc(`activity/${me.id}/days/${day}`);
      await serial(ref.path, async () => {
        if (!activityDay || activityDay.day !== day) {
          const snap = await ref.get();
          activityDay = { day, events: snap.exists ? (snap.data().events || []).slice() : [] };
        }
        activityDay.events.push(Object.assign({ at: new Date().toISOString(), by: me.id, action }, detail || {}));
        activityDay.events = activityDay.events.slice(-MAX_ACTIVITY);
        await ref.set({ day, events: activityDay.events });
        await db.doc(`activity/${me.id}`).set({ lastAt: new Date().toISOString(), lastDay: day });
      }).catch(() => {});
    }

    return {
      kind: 'cloud',
      me,
      listDocs(cb, onError) {
        return db.collection('docs').orderBy('updatedAt', 'desc').limit(200).onSnapshot(snap => {
          cb(snap.docs.map(d => {
            const data = d.data();
            return { id: d.id, title: data.title, updatedAt: data.updatedAt, updatedBy: data.updatedBy, words: data.words || 0 };
          }));
        }, err => onError && onError(dbError(err)));
      },
      async createDoc(fields) {
        const ref = db.collection('docs').doc();
        const body = Object.assign({ title: 'Untitled manuscript', text: '', rev: 0, baseRev: 0, writeId: null }, fields, {
          updatedAt: new Date().toISOString(), updatedBy: me.id, words: words(fields && fields.text)
        });
        try {
          await ref.set(body);
        } catch (err) {
          throw dbError(err);
        }
        appendActivity('created', { docId: ref.id, title: body.title });
        return ref.id;
      },
      async deleteDoc(id) {
        try {
          await db.doc(`docs/${id}`).delete();
        } catch (err) {
          throw dbError(err);
        }
        appendActivity('deleted', { docId: id });
      },
      async openDoc(id, onRemote, onError) {
        const ref = db.doc(`docs/${id}`);
        const first = await ref.get();
        const unsubscribe = ref.onSnapshot(snap => {
          if (snap.exists) onRemote(Object.assign({ id }, snap.data()), snap.metadata);
        }, err => onError && onError(dbError(err)));
        return { doc: first.exists ? Object.assign({ id }, first.data()) : null, close: unsubscribe };
      },
      async writeDoc(id, body) {
        const ref = db.doc(`docs/${id}`);
        return serial(ref.path, async () => {
          try {
            await ref.set(Object.assign({}, body, { words: words(body.text) }));
          } catch (err) {
            throw dbError(err);
          }
        });
      },
      async addVersion(id, version) {
        try {
          await db.collection(`docs/${id}/versions`).add(Object.assign({
            at: new Date().toISOString(), by: me.id, words: words(version.text)
          }, version));
        } catch (err) {
          throw dbError(err);
        }
      },
      async listVersions(id) {
        const snap = await db.collection(`docs/${id}/versions`).orderBy('at', 'desc').limit(60).get();
        return snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
      },
      log: appendActivity,
      async listActivity() {
        const events = [];
        const readUser = async uid => {
          const days = await db.collection(`activity/${uid}/days`).get();
          for (const d of days.docs.slice(-7)) events.push(...(d.data().events || []));
        };
        if (me.canAdmin) {
          const people = await db.collection('activity').limit(50).get();
          await Promise.all(people.docs.map(p => readUser(p.id).catch(() => {})));
        } else if (me.id) {
          await readUser(me.id).catch(() => {});
        }
        return events.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 300);
      },
      async loadHistory() {
        if (!me.id) return readJson('history', []);
        try {
          const snap = await db.doc(`data/users/${me.id}/history`).get();
          return snap.exists ? (snap.data().log || []) : readJson('history', []);
        } catch (_err) {
          return readJson('history', []);
        }
      },
      async saveHistory(log) {
        writeJson('history', log);
        if (!me.id) return;
        const ref = db.doc(`data/users/${me.id}/history`);
        await serial(ref.path, () => ref.set({ log: compactHistory(log) })).catch(() => {});
      },
      async names(ids) {
        if (!user || !ids.length) return {};
        const profiles = await user.profiles(ids);
        const out = {};
        for (const id of ids) out[id] = (profiles[id] && profiles[id].name) || '';
        return out;
      }
    };
  }

  /**
   * Resolve the workspace: the shared cloud store when this page runs as a
   * claude.ai artifact with the db capability, otherwise this browser.
   */
  async function open() {
    const claude = typeof window !== 'undefined' ? window.claude : null;
    if (claude && typeof claude.use === 'function') {
      try {
        const [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
        if (db) return createCloudStore(db, user);
      } catch (_err) {
        // fall through to local
      }
    }
    return createLocalStore();
  }

  root.GalleyStore = { open, createLocalStore, readJson, writeJson, words };
}(typeof globalThis !== 'undefined' ? globalThis : this));
