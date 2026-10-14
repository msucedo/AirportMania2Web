// Keeps the whole game on the device so it plays offline. Ours: no part of the original.
// The list of files comes from precache.json; tools/build-precache.mjs writes the build's version
// below, so that a new build is a new worker and replaces what the old one kept.
const VERSION = '__VERSION__';
const PREFIX = 'am2web-';
const AT_ONCE = 6;

async function tell(message) {
  for (const client of await self.clients.matchAll({ includeUncontrolled: true })) client.postMessage(message);
}

async function keep() {
  const { version, files } = await (await fetch('precache.json', { cache: 'no-store' })).json();
  if (version !== VERSION) throw new Error('the list is of another build');
  // What older builds kept goes first: a phone may not have room for two at once.
  const old = (await caches.keys()).filter((name) => name.startsWith(PREFIX) && name !== PREFIX + VERSION);
  await Promise.all(old.map((name) => caches.delete(name)));
  const cache = await caches.open(PREFIX + VERSION);
  // What an interrupted keeping left is not fetched again.
  const have = new Set((await cache.keys()).map((request) => request.url));
  const missing = files.filter((file) => !have.has(new URL(file, self.registration.scope).href));
  let done = files.length - missing.length;
  await tell({ type: 'keeping', done, total: files.length });
  for (let k = 0; k < missing.length; k += AT_ONCE) {
    await Promise.all(
      missing.slice(k, k + AT_ONCE).map(async (file) => {
        const response = await fetch(file, { cache: 'reload' });
        if (!response.ok) throw new Error(`${file}: ${response.status}`);
        await cache.put(new URL(file, self.registration.scope).href, response);
        done += 1;
      }),
    );
    await tell({ type: 'keeping', done, total: files.length });
  }
  await tell({ type: 'kept' });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    keep()
      .then(() => self.skipWaiting())
      .catch(async (error) => {
        await tell({ type: 'failed', reason: String(error) });
        throw error;
      }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = (await caches.keys()).filter((name) => name.startsWith(PREFIX) && name !== PREFIX + VERSION);
      await Promise.all(names.map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      // The page is the same whatever its parameters.
      const page = request.mode === 'navigate' && url.href.split('?')[0] === self.registration.scope;
      const key = page ? new URL('index.html', self.registration.scope).href : url.origin + url.pathname;
      const kept = await (await caches.open(PREFIX + VERSION)).match(key);
      if (kept) return kept;
      return fetch(request);
    })(),
  );
});
