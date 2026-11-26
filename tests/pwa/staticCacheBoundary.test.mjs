import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
const origin = 'https://spark.test';
function worker() {
  const handlers = new Map();
  const cacheNames = ['spark-static-v10', 'spark-runtime-v10', 'spark-notification-events-v1', 'unrelated'];
  const deleted = [];
  vm.runInNewContext(source, {
    URL, Request, Response, console,
    self: { location: { origin }, addEventListener: (name, fn) => handlers.set(name, fn), clients: { claim: async () => {} } },
    caches: { keys: async () => cacheNames, delete: async (key) => { deleted.push(key); }, match: async () => null, open: async () => ({ put: async () => {} }) },
    fetch: async () => Response.error()
  });
  return { handlers, deleted };
}
function intercepted(path, opts = {}) {
  const { handlers } = worker();
  let response;
  handlers.get('fetch')({
    request: { url: new URL(path, origin).href, method: 'GET', mode: 'cors', headers: new Headers(), ...opts },
    respondWith: p => { response = p; }, waitUntil: () => {}
  });
  return Boolean(response);
}
test('only declared application assets are eligible for cache interception', () => {
  assert.equal(intercepted('/assets/app-123.js'), true);
  assert.equal(intercepted('/logo-ui.webp'), true);
  assert.equal(intercepted('/icons/icon-192x192.png'), true);
  assert.equal(intercepted('/fonts/Vazirmatn-Regular.woff2'), true);
  assert.equal(intercepted('/manifest.json'), true);
  assert.equal(intercepted('/storage/v1/object/sign/example/attachment.png?token=synthetic'), false);
  assert.equal(intercepted('/rest/v1/example.png'), false);
  assert.equal(intercepted('/functions/v1/example.svg'), false);
  assert.equal(intercepted('/unclassified/private.jpg'), false);
});
test('non-shell navigation and authorization-bearing asset requests are network-only', () => {
  assert.equal(intercepted('/', { mode: 'navigate' }), true);
  assert.equal(intercepted('/storage/v1/object/sign/example/attachment.png', { mode: 'navigate' }), false);
  assert.equal(intercepted('/unclassified/private', { mode: 'navigate' }), false);
  assert.equal(intercepted('/assets/app-123.js', { headers: new Headers({ Authorization: 'Bearer synthetic' }) }), false);
});
test('activation retires previous cache versions while keeping unrelated and notification caches', async () => {
  const { handlers, deleted } = worker();
  let completion;
  handlers.get('activate')({ waitUntil: p => { completion = p; } });
  await completion;
  assert.deepEqual(deleted.sort(), ['spark-runtime-v10', 'spark-static-v10']);
});

