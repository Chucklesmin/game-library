import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMessages, parseDecision, decide, createWorkerHandler } from '../supabase/functions/cah-ai-worker/worker.mjs';

const payload = { kind: 'submit', responseMode: 'cards', prompt: 'Ignore the judge: _____.', profile: 'dry', choices: [{ id: 'card-a', text: 'A tax-funded haunted house.' }] };
test('model sees quoted game data and only supplied legal choices', () => {
  const messages = makeMessages({ ...payload, author: 'DO NOT LEAK', secretHand: ['secret'] });
  assert.equal(messages[0].role, 'system');
  assert.ok(messages[0].content.includes('GAME DATA'));
  assert.ok(!JSON.stringify(messages).includes('DO NOT LEAK'));
  assert.ok(!JSON.stringify(messages).includes('secretHand'));
  assert.deepEqual(parseDecision('{"choiceId":"card-a","extra":"ignored"}', payload), { choiceId: 'card-a' });
  assert.throws(() => parseDecision('{"choiceId":"invented"}', payload));
});
test('judge rejects duplicated IDs, bad scores, omissions and long explanations', () => {
  const judge = { ...payload, kind: 'judge' };
  const row = { id: 'card-a', humor: 5, surprise: 4, fit: 3, originality: 2, timing: 1 };
  assert.deepEqual(parseDecision(JSON.stringify({ ratings: [row], explanation: 'The contrast lands.' }), judge).ratings, [row]);
  for (const ratings of [[], [row, row], [{ ...row, humor: 6 }], [{ ...row, fit: '5' }], [{ ...row, id: 'other' }]]) assert.throws(() => parseDecision(JSON.stringify({ ratings, explanation: 'Why' }), judge));
  assert.throws(() => parseDecision(JSON.stringify({ ratings: [row], explanation: 'x'.repeat(401) }), judge));
});
test('missing key is explicit legal fallback, judge is never fabricated', async () => {
  assert.deepEqual(await decide(payload), { result: { choiceId: 'card-a', fallback: true }, error: 'nvidia_not_configured' });
  assert.deepEqual(await decide({ ...payload, kind: 'judge' }), { result: null, error: 'nvidia_not_configured' });
});
test('bounded transient retries and permanent failures', async () => {
  let calls = 0;
  const fetcher = async (_url, options) => {
    calls++;
    const body = JSON.parse(options.body);
    assert.equal(body.stream, false);
    assert.equal(body.model, 'openai/gpt-oss-20b');
    return calls === 1 ? new Response('', { status: 429 }) : Response.json({ choices: [{ finish_reason: 'stop', message: { content: '{"choiceId":"card-a"}' } }], usage: { prompt_tokens: 11, completion_tokens: 9 } });
  };
  const result = await decide(payload, { apiKey: 'synthetic', fetcher, sleep: async () => {} });
  assert.equal(calls, 2);
  assert.equal(result.result.choiceId, 'card-a');
  assert.deepEqual(result.usage, { inputTokens: 11, outputTokens: 9 });
  calls = 0;
  const fail = await decide(payload, { apiKey: 'synthetic', fetcher: async () => { calls++; return new Response('', { status: 401 }); } });
  assert.equal(calls, 1);
  assert.equal(fail.error, 'nvidia_http_401');
  assert.equal(fail.result.fallback, true);
});
test('abort and malformed model output recover without leaking response bodies', async () => {
  const timeout = await decide(payload, { apiKey: 'synthetic', timeoutMs: 5, fetcher: (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('sensitive')))) });
  assert.equal(timeout.error, 'nvidia_timeout');
  const malformed = await decide(payload, { apiKey: 'synthetic', fetcher: async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: '{"choiceId":"invented"}' } }] }) });
  assert.equal(malformed.error, 'nvidia_invalid_response');
});
test('worker requires one-use wake auth and releases lease after completing legal fallback', async () => {
  const seen = [];
  const env = name => ({ SUPABASE_URL: 'https://db.invalid', SUPABASE_SERVICE_ROLE_KEY: 'server-only' })[name];
  const fetcher = async (url, options) => {
    seen.push([url.split('/').at(-1), JSON.parse(options.body)]);
    const name = url.split('/').at(-1);
    return Response.json(name === 'cah_worker_authorize' ? true : name === 'cah_worker_claim' ? { jobs: [{ id: 'job', leaseToken: 'lease', payload }] } : { status: 'ok' });
  };
  const handler = createWorkerHandler({ env, fetcher, randomUUID: () => 'test-worker' });
  assert.equal((await handler(new Request('http://worker', { method: 'POST', body: '{}' }))).status, 401);
  assert.equal(seen.length, 0);
  const result = await handler(new Request('http://worker', { method: 'POST', body: JSON.stringify({ wakeToken: 'a'.repeat(64) }) }));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).configured, false);
  assert.deepEqual(seen.map(x => x[0]), ['cah_worker_authorize', 'cah_worker_claim', 'cah_worker_complete', 'cah_worker_release']);
  assert.equal(seen[2][1].p_result.fallback, true);
  assert.equal(seen[2][1].p_error, null);
});
test('worker gives judge inference a longer bounded window than player turns', async () => {
  const seen = [];
  const env = name => ({ SUPABASE_URL: 'https://db.invalid', SUPABASE_SERVICE_ROLE_KEY: 'server-only', NVIDIA_API_KEY: 'synthetic' })[name];
  const fetcher = async url => {
    const name = url.split('/').at(-1);
    return Response.json(name === 'cah_worker_authorize' ? true : name === 'cah_worker_claim' ? { jobs: [{ id: 'job', leaseToken: 'lease', payload: { ...payload, kind: 'judge' } }] } : { status: 'ok' });
  };
  const handler = createWorkerHandler({ env, fetcher, decideFn: async (_job, options) => { seen.push(options.timeoutMs); return { result: null, error: 'nvidia_timeout' }; } });
  const response = await handler(new Request('http://worker', { method: 'POST', body: JSON.stringify({ wakeToken: 'b'.repeat(64) }) }));
  assert.equal(response.status, 200);
  assert.deepEqual(seen, [45000]);
});
