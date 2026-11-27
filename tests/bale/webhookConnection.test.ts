import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transform } from 'esbuild';
import { webcrypto, createHash } from 'node:crypto';
const secret = 'fixture-webhook-secret';
const proof = createHash('sha256').update('spark:bale:webhook:v1:' + secret).digest('hex');

const source = readFileSync('supabase/functions/bale-webhook/index.ts', 'utf8').replace(/^import.*$/gm, '');
const compiled = (await transform(source, { loader: 'ts' })).code;

async function invoke(options: {
  envToken?: string; config?: any; configError?: any; consume?: any; rpcError?: any;
  text?: string; serviceKey?: string; method?: string; malformed?: boolean;
} = {}) {
  let handler: any;
  let lookups = 0;
  const calls: any[] = [], messages: any[] = [], logs: string[] = [];
  const query: any = {
    select(fields: string) { assert.equal(fields, 'bot_token, is_active, webhook_secret'); return query; },
    eq(key: string, value: string) { assert.equal(key, 'channel'); assert.equal(value, 'bale'); return query; },
    async maybeSingle() { lookups++; return { data: options.config === undefined
      ? { is_active: true, bot_token: '  private-db-token  ', webhook_secret: secret } : options.config,
      error: options.configError ?? null }; },
  };
  const client = { from(table: string) { assert.equal(table, 'social_channel_configs'); return query; },
    async rpc(name: string, params: any) { calls.push({ name, params });
      return { data: options.consume === undefined ? { ok: true } : options.consume,
        error: options.rpcError ?? null }; },
  };
  const env: Record<string, string> = { SUPABASE_URL: 'https://copy.test',
    SUPABASE_SERVICE_ROLE_KEY: options.serviceKey ?? 'private-service-key',
    BALE_BOT_TOKEN: options.envToken ?? '' };
  vm.runInNewContext(compiled, {
    Request, Response, URL, TextEncoder, crypto: webcrypto,
    Deno: { serve(fn: any) { handler = fn; }, env: { get(key: string) { return env[key]; } } },
    createClient(url: string, key: string) {
      assert.equal(url, env.SUPABASE_URL); assert.equal(key, 'private-service-key'); return client;
    },
    console: Object.fromEntries(['error', 'warn', 'log'].map(key => [key, (...args: any[]) => logs.push(args.join(' '))])),
    fetch: async (url: string, init: any) => { messages.push({ url, body: JSON.parse(init.body) });
      return new Response('{"ok":true}', { status: 200 }); },
  });
  const method = options.method ?? 'POST';
  const response = await handler(new Request('https://spark.test/functions/v1/bale-webhook?proof='+proof, {
    method, ...(method === 'POST' ? { body: options.malformed ? '{' : JSON.stringify({
      message: { chat: { id: 1234 }, text: options.text ?? '/start ' + 'a'.repeat(64), bot_token: 'untrusted-token' },
      bot_token: 'untrusted-token',
    }) } : {}),
  }));
  const body = await response.text();
  for (const secret of ['private-db-token', 'private-env-token', 'private-service-key', 'untrusted-token']) {
    assert.ok(!body.includes(secret)); assert.ok(!logs.join('\n').includes(secret));
  }
  assert.ok([200,403,503].includes(response.status));
  return { lookups, calls, messages, logs };
}

test('reported primary failure: absent runtime token uses active DB bot and consumes original nonce', async () => {
  const result = await invoke();
  assert.equal(result.lookups, 1); assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].name, 'consume_bale_link_nonce_service');
  assert.equal(result.calls[0].params.p_nonce, 'a'.repeat(64));
  assert.equal(result.calls[0].params.p_bale_chat_id, '1234');
  assert.equal(result.messages[0].url, 'https://tapi.bale.ai/botprivate-db-token/sendMessage');
  assert.match(result.messages[0].body.text, /موفقیت/);
});

test('environment token remains preferred only with active verified DB configuration', async () => {
  const result = await invoke({ envToken: '  private-env-token  ' });
  assert.equal(result.lookups, 1); assert.equal(result.calls.length, 1);
  assert.equal(result.messages[0].url, 'https://tapi.bale.ai/botprivate-env-token/sendMessage');
});

test('blank environment token permits configured active DB fallback', async () => {
  assert.equal((await invoke({ envToken: '  ' })).calls.length, 1);
});

for (const [name, options] of Object.entries({
  disabled: { config: { is_active: false, bot_token: 'private-db-token' } },
  missing: { config: null }, empty: { config: { is_active: true, bot_token: '  ' } },
  unreadable: { configError: { message: 'private-db-token' } },
  'service key missing': { serviceKey: '' },
})) test(`${name} configuration cannot consume a nonce or send a message`, async () => {
  const result = await invoke(options); assert.equal(result.calls.length, 0); assert.equal(result.messages.length, 0);
});

test('invalid, expired or replayed nonce never yields successful linking', async () => {
  const result = await invoke({ consume: { ok: false, error: 'INVALID_OR_EXPIRED' } });
  assert.equal(result.calls.length, 1); assert.match(result.messages[0].body.text, /نامعتبر/);
  assert.ok(!result.logs.some(line => line.includes('linked successfully')));
});

test('RPC failure never yields successful linking', async () => {
  const result = await invoke({ rpcError: { message: 'DB_ERROR' } });
  assert.match(result.messages[0].body.text, /خطای داخلی/);
  assert.ok(!result.logs.some(line => line.includes('linked successfully')));
});

test('start without nonce gives guidance and cannot link', async () => {
  const result = await invoke({ text: '/start' });
  assert.equal(result.calls.length, 0); assert.match(result.messages[0].body.text, /پروفایل/);
});

test('non-start, malformed and GET requests do not query secrets or consume tokens', async () => {
  for (const options of [{ text: 'hello' }, { malformed: true }, { method: 'GET' }]) {
    const result = await invoke(options);
    assert.equal(result.lookups, 0); assert.equal(result.calls.length, 0); assert.equal(result.messages.length, 0);
  }
});
