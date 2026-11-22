// Minimal IndexedDB wrapper. Stores: kv (keys, meta, encrypted state), photos (encrypted images).
const NAME = 'ledger';
const VERSION = 1;
let dbp = null;

function openDb() {
  return (dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(NAME, VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}

function tx(store, mode, fn) {
  return openDb().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const get = (store, key) => tx(store, 'readonly', (s) => s.get(key));
export const put = (store, key, val) => tx(store, 'readwrite', (s) => s.put(val, key));
export const del = (store, key) => tx(store, 'readwrite', (s) => s.delete(key));
export const keys = (store) => tx(store, 'readonly', (s) => s.getAllKeys());
export const clear = (store) => tx(store, 'readwrite', (s) => s.clear());

export async function destroy() {
  if (dbp) (await dbp).close();
  dbp = null;
  await new Promise((resolve, reject) => {
    const r = indexedDB.deleteDatabase(NAME);
    r.onsuccess = resolve;
    r.onerror = () => reject(r.error);
    r.onblocked = resolve;
  });
}
