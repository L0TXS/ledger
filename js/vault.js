// Key management, encrypted storage, PIN, photos, and backups.
//
// Key hierarchy
//   deviceKey  non-extractable AES key kept by the browser (IndexedDB). Never exported.
//   dataKey    random 256-bit key that encrypts the notes and photos.
//   meta.wrapped = seal(deviceKey, pin ? seal(pinKey, dataKey) : dataKey)
// With a PIN set, the data can't be decrypted without the PIN, even by someone
// who copies the browser's storage.

import * as db from './db.js';
import * as c from './crypto.js';
import { b64e, b64d } from './util.js';

const PIN_ITER = 400_000;
const BACKUP_ITER = 600_000;
const MAX_FREE_TRIES = 5;

let rawKey = null;
let dataKey = null;
let meta = null;
export let state = null;

async function deviceKey(create = false) {
  let k = await db.get('kv', 'deviceKey');
  if (!k && create) {
    k = await c.newDeviceKey();
    await db.put('kv', 'deviceKey', k);
  }
  if (!k) throw new Error('This device\'s key is missing. Erase and restore from a backup.');
  return k;
}

export async function init() {
  meta = (await db.get('kv', 'meta')) || null;
  return { firstRun: !meta, hasPin: !!meta?.pin };
}

export const isUnlocked = () => !!dataKey && !!state;
export const hasPin = () => !!meta?.pin;
export const lockedOutMs = () => Math.max(0, (meta?.lockUntil || 0) - Date.now());

export async function create(initialState) {
  await deviceKey(true);
  rawKey = c.rand(32);
  dataKey = await c.importAes(rawKey);
  meta = { wrapped: null, pin: null, fails: 0, lockUntil: 0 };
  await rewrap(null);
  state = initialState;
  await saveNow();
}

async function rewrap(pin) {
  const dk = await deviceKey();
  let inner = rawKey;
  if (pin) {
    const salt = c.rand(16);
    inner = await c.seal(await c.pbkdf2Key(pin, salt, PIN_ITER), rawKey);
    meta.pin = { salt, iter: PIN_ITER };
  } else {
    meta.pin = null;
  }
  meta.wrapped = await c.seal(dk, inner);
  await db.put('kv', 'meta', meta);
}

async function openWithPin(pin) {
  let inner = await c.unseal(await deviceKey(), meta.wrapped);
  if (meta.pin) {
    const pk = await c.pbkdf2Key(String(pin ?? ''), meta.pin.salt, meta.pin.iter);
    inner = await c.unseal(pk, inner); // throws on wrong PIN
  }
  return inner;
}

/** Returns true on success, false on a wrong PIN. */
export async function unlock(pin) {
  if (lockedOutMs() > 0) return false;
  let inner;
  try {
    inner = await openWithPin(pin);
  } catch (e) {
    if (!meta.pin) throw e;
    meta.fails = (meta.fails || 0) + 1;
    if (meta.fails >= MAX_FREE_TRIES) {
      meta.lockUntil = Date.now() + Math.min(30_000 * 2 ** (meta.fails - MAX_FREE_TRIES), 15 * 60_000);
    }
    await db.put('kv', 'meta', meta);
    return false;
  }
  meta.fails = 0;
  meta.lockUntil = 0;
  await db.put('kv', 'meta', meta);
  rawKey = inner;
  dataKey = await c.importAes(rawKey);
  const blob = await db.get('kv', 'state');
  state = blob ? JSON.parse(c.decText(await c.unseal(dataKey, blob))) : null;
  return true;
}

export async function verifyPin(pin) {
  try { await openWithPin(pin); return true; } catch { return false; }
}

/** Pass null to remove the PIN. */
export async function setPin(pin) {
  await rewrap(pin || null);
}

let saving = Promise.resolve();
// Every change is written straight away (the state is small), so closing the app
// a moment after an edit can't lose it. Writes are queued so they land in order.
export function save() {
  return saveNow();
}
export function saveNow() {
  if (!dataKey || !state) return saving;
  const snapshot = JSON.stringify(state);
  const key = dataKey;
  saving = saving.then(async () => db.put('kv', 'state', await c.seal(key, c.encText(snapshot))));
  return saving;
}

const photoUrls = new Map();
function dropPhotoUrl(id) {
  const u = photoUrls.get(id);
  if (u) URL.revokeObjectURL(u);
  photoUrls.delete(id);
}

export async function lock() {
  await saveNow();
  for (const id of [...photoUrls.keys()]) dropPhotoUrl(id);
  rawKey = null;
  dataKey = null;
  state = null;
}

export async function setPhoto(id, blob) {
  dropPhotoUrl(id);
  if (!blob) return db.del('photos', id);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await db.put('photos', id, await c.seal(dataKey, bytes));
}

export async function photoUrl(id) {
  if (photoUrls.has(id)) return photoUrls.get(id);
  const blob = await db.get('photos', id);
  if (!blob || !dataKey) return null;
  const url = URL.createObjectURL(new Blob([await c.unseal(dataKey, blob)], { type: 'image/jpeg' }));
  photoUrls.set(id, url);
  return url;
}

export async function exportBackup(password) {
  await saveNow();
  const photos = {};
  for (const id of await db.keys('photos')) {
    photos[id] = b64e(await c.unseal(dataKey, await db.get('photos', id)));
  }
  const salt = c.rand(16);
  const key = await c.pbkdf2Key(password, salt, BACKUP_ITER);
  const data = await c.seal(key, c.encText(JSON.stringify({ state, photos })));
  return JSON.stringify({
    format: 'ledger-backup',
    version: 1,
    created: new Date().toISOString(),
    kdf: { name: 'PBKDF2-SHA256', iterations: BACKUP_ITER, salt: b64e(salt) },
    cipher: 'AES-256-GCM',
    data: b64e(data)
  });
}

export async function readBackup(text, password) {
  let o;
  try { o = JSON.parse(text); } catch { throw new Error('That isn\'t a Ledger backup file.'); }
  if (o?.format !== 'ledger-backup') throw new Error('That isn\'t a Ledger backup file.');
  const key = await c.pbkdf2Key(password, b64d(o.kdf.salt), o.kdf.iterations);
  let plain;
  try { plain = await c.unseal(key, b64d(o.data)); } catch { throw new Error('Wrong password, or the file is damaged.'); }
  return JSON.parse(c.decText(plain));
}

/** Replaces everything with the contents of a decrypted backup. */
export async function restore(parsed) {
  for (const id of [...photoUrls.keys()]) dropPhotoUrl(id);
  await db.clear('photos');
  for (const [id, b64] of Object.entries(parsed.photos || {})) {
    await db.put('photos', id, await c.seal(dataKey, b64d(b64)));
  }
  state = parsed.state;
  await saveNow();
}

export async function eraseEverything() {
  rawKey = null; dataKey = null; state = null; meta = null;
  for (const id of [...photoUrls.keys()]) dropPhotoUrl(id);
  await db.destroy();
}
