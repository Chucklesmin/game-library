import assert from 'node:assert/strict';
import { execFileSync, execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

// This acceptance script deliberately controls the disposable local worker only.
const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
assert.equal(status.API_URL, 'http://127.0.0.1:55421');
const client = createClient(status.API_URL, status.PUBLISHABLE_KEY ?? status.ANON_KEY, { auth: { persistSession: false } });
const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sql = query => execFileSync('docker', ['exec', '-i', 'supabase_db_game-library', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-Atc', query], { encoding: 'utf8' }).trim();
const rpc = async (name, args = {}, db = client) => {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
};
const wait = async (roomId, predicate, label) => {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const view = await rpc('cah_get_view', { p_room_id: roomId });
    if (predicate(view)) return view;
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error(`Timed out waiting for ${label}`);
};
const endpoint = `${status.API_URL}/functions/v1/cah-ai-worker`;
const callWorker = wakeToken => fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wakeToken }) });
const { error: signInError } = await client.auth.signInAnonymously();
if (signInError) throw signInError;
assert.equal((await callWorker('x')).status, 401);
assert.ok((await client.rpc('cah_worker_authorize', { p_token: 'a'.repeat(64) })).error);
assert.ok((await client.rpc('cah_worker_reserve_budget', { p_attempts: 2 })).error);

// Capability consumption/replay and concurrency lease are enforced in Postgres.
sql("update private.cah_worker_settings set worker_url=null,running_until=null; delete from private.cah_worker_wakes; insert into private.cah_worker_wakes values(encode(extensions.digest(repeat('a',64),'sha256'),'hex'),now()+interval '1 minute');");
const oneUse = await callWorker('a'.repeat(64));
assert.equal(oneUse.status, 200);
assert.equal((await oneUse.json()).configured, false, 'this script verifies the local unconfigured-provider path');
assert.equal((await callWorker('a'.repeat(64))).status, 401, 'a consumed wake cannot run again');
sql("update private.cah_worker_settings set daily_limit=2; delete from private.cah_worker_budget where day=(now() at time zone 'UTC')::date;");
assert.equal(await rpc('cah_worker_reserve_budget', { p_attempts: 2 }, service), true);
assert.equal(await rpc('cah_worker_reserve_budget', { p_attempts: 1 }, service), false);
sql('update private.cah_worker_settings set daily_limit=200;');

try {
  sql("update private.cah_worker_settings set worker_url='http://kong:8000/functions/v1/cah-ai-worker';");
  const room = await rpc('create_room_for_game', { p_game_slug: 'cards-against-humanity', p_display_name: 'Worker acceptance' });
  const args = { p_room_id: room.id };
  await rpc('cah_add_bot', { ...args, p_profile: 'dry' });
  await rpc('cah_add_bot', { ...args, p_profile: 'topical' });
  await rpc('cah_configure', { ...args, p_pack_slug: 'after-hours', p_response_mode: 'cards', p_scoring_mode: 'crowd' });
  await rpc('cah_start_game', { ...args, p_total_rounds: 3 });
  for (let round = 1; round <= 3; round++) {
    let view = await rpc('cah_get_view', args);
    assert.equal(view.hand.length, 7);
    await rpc('cah_submit_card', { ...args, p_card_id: view.hand[0].id });
    view = await wait(room.id, v => v.phase === 'voting', 'automatic bot submissions');
    assert.equal(view.responses.length, 2);
    assert.equal(view.aiStatus.fallbackUsed, true);
    assert.ok(view.responses.every(row => row.author === null));
    await rpc('cah_cast_vote', { ...args, p_submission_id: view.responses[0].id });
    view = await wait(room.id, v => v.phase === 'reveal', 'automatic bot votes');
    assert.equal(view.round, round);
    assert.ok(view.scores.some(s => s.score > 0));
    await rpc('cah_next_round', args);
  }
  assert.equal((await rpc('cah_get_view', args)).phase, 'complete');
  await rpc('cah_configure', { ...args, p_pack_slug: 'after-hours', p_response_mode: 'cards', p_scoring_mode: 'judge' });
  let view = await rpc('cah_start_game', { ...args, p_total_rounds: 3 });
  await rpc('cah_submit_card', { ...args, p_card_id: view.hand[0].id });
  view = await wait(room.id, v => v.judge.status === 'failed', 'explicit unconfigured NVIDIA judge failure');
  assert.equal(view.phase, 'voting');
  assert.equal(view.responses.length, 0);
  assert.equal(view.judge.explanation, null);
  await rpc('cah_judge_fallback', args);
  view = await rpc('cah_get_view', args);
  assert.equal(view.responses.length, 2);
  await rpc('cah_cast_vote', { ...args, p_submission_id: view.responses[0].id });
  await wait(room.id, v => v.phase === 'reveal', 'judge-to-crowd recovery');
  console.log(JSON.stringify({ result: 'PASS', checks: ['real Edge runtime auth and replay denial', 'service-only worker RPCs', 'daily budget reservation', 'pg_net automatic submissions and votes', 'three full rounds and final scores', 'private hands and anonymous votes', 'NVIDIA missing-key failure and explicit crowd recovery'], provider: 'unconfigured local fallback; not live NVIDIA inference' }, null, 2));
} finally {
  // Leave the local worker enabled for browser QA only; this is a disposable DB.
  await client.auth.signOut();
}
