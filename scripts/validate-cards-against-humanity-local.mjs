import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const status = process.env.SIGNAL_SUPABASE_URL && process.env.SIGNAL_SUPABASE_KEY
  ? ""
  : execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const statusValue = (name) => status.match(new RegExp(`^${name}=[\"']?([^\"'\\r\\n]+)`, "m"))?.[1];
const url = process.env.SIGNAL_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? statusValue("API_URL");
const key = process.env.SIGNAL_SUPABASE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? statusValue("PUBLISHABLE_KEY") ?? statusValue("ANON_KEY");
if (!url || !key) throw new Error("Local Supabase API configuration was not returned. Start the local stack first.");

const clients = ["Host QA", "Guest One QA", "Guest Two QA"].map(() => createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
}));
const [host, guestOne, guestTwo] = clients;
const names = ["Host QA", "Guest One QA", "Guest Two QA"];
const answersFor = (round) => names.map((name, index) => `round ${round} answer from player ${index + 1}`);

async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

async function expectRpcError(client, name, args, messageFragment) {
  const { error } = await client.rpc(name, args);
  assert.ok(error, `${name} should have been rejected`);
  assert.match(error.message, new RegExp(messageFragment, "i"));
}

for (const [index, client] of clients.entries()) {
  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw new Error(`Guest ${index + 1} sign-in failed: ${error.message}`);
  assert.ok(data.user?.id, `Guest ${index + 1} received an authenticated identity`);
}
const lateGuest = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { error: lateGuestAuthError } = await lateGuest.auth.signInAnonymously();
if (lateGuestAuthError) throw new Error(`Late guest sign-in failed: ${lateGuestAuthError.message}`);

const room = await rpc(host, "create_room_for_game", {
  p_game_slug: "cards-against-humanity",
  p_display_name: names[0],
});
await rpc(guestOne, "join_room_by_code", { p_code: room.code, p_display_name: names[1] });
await expectRpcError(host, "cah_start_game", { p_room_id: room.id, p_total_rounds: 3 }, "3 to 10 players");
await rpc(guestTwo, "join_room_by_code", { p_code: room.code, p_display_name: names[2] });

const channel = host.channel(`cah-acceptance:${room.id}`);
let resolveRealtime;
const realtimeUpdate = new Promise((resolve) => { resolveRealtime = resolve; });
channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${room.id}` }, (event) => {
  if (event.new.status === "cah_submitting") resolveRealtime(event.new.status);
});
await new Promise((resolve, reject) => {
  const deadline = setTimeout(() => reject(new Error("Room Realtime subscription did not become ready.")), 10000);
  channel.subscribe((status, error) => {
    if (status === "SUBSCRIBED") { clearTimeout(deadline); resolve(); }
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { clearTimeout(deadline); reject(new Error(`Room Realtime subscription failed: ${status}${error?.message ? ` (${error.message})` : ""}`)); }
  });
});

await expectRpcError(host, "cah_start_game", { p_room_id: room.id, p_total_rounds: 4 }, "3, 5, or 7");
await expectRpcError(host, "update_room_state", { p_room_id: room.id, p_status: "lobby", p_game_state: {} }, "managed by Cards Against Humanity");
let view = await rpc(host, "cah_start_game", { p_room_id: room.id, p_total_rounds: 3 });
assert.equal(view.phase, "submitting");
const returningMember = await rpc(host, "join_room_by_code", { p_code: room.code, p_display_name: names[0] });
assert.equal(returningMember.id, room.id, "an existing guest can rejoin its active room after reconnecting");
await expectRpcError(lateGuest, "join_room_by_code", { p_code: room.code, p_display_name: "Late Guest QA" }, "game already started");
const realtimeStatus = await new Promise((resolve) => {
  const deadline = setTimeout(() => resolve(null), 10000);
  realtimeUpdate.then((status) => { clearTimeout(deadline); resolve(status); });
});
assert.equal(realtimeStatus, "cah_submitting");

const roundPrompts = [];
const expectedScores = new Map(clients.map((client) => [client, 0]));
for (let round = 1; round <= 3; round += 1) {
  const answers = answersFor(round);
  const before = await Promise.all(clients.map((client) => rpc(client, "cah_get_view", { p_room_id: room.id })));
  assert.ok(before.every((item) => item.phase === "submitting" && item.responses.length === 0));
  roundPrompts.push(before[0].prompt);
  assert.ok(before.every((item) => item.prompt === before[0].prompt));

  for (let player = 0; player < clients.length; player += 1) {
    view = await rpc(clients[player], "cah_submit_answer", { p_room_id: room.id, p_answer: answers[player] });
    if (player < clients.length - 1) assert.equal(view.phase, "submitting");
    else assert.equal(view.phase, "voting");
  }

  const votingViews = await Promise.all(clients.map((client) => rpc(client, "cah_get_view", { p_room_id: room.id })));
  for (let player = 0; player < clients.length; player += 1) {
    const ownAnswer = answers[player];
    assert.equal(votingViews[player].phase, "voting");
    assert.equal(votingViews[player].responses.length, 2);
    assert.ok(votingViews[player].responses.every((item) => item.author === null && item.votes === null));
    assert.ok(votingViews[player].responses.every((item) => item.text !== ownAnswer));
  }

  const idsByAnswer = new Map();
  for (const item of votingViews.flatMap((item) => item.responses)) idsByAnswer.set(item.text, item.id);
  assert.equal(idsByAnswer.size, 3);
  await expectRpcError(host, "cah_cast_vote", { p_room_id: room.id, p_submission_id: idsByAnswer.get(answers[0]) }, "another player response");

  const targets = round === 1 ? [1, 2, 0] : [1, 0, 1];
  for (let player = 0; player < clients.length; player += 1) {
    const submissionId = idsByAnswer.get(answers[targets[player]]);
    assert.ok(submissionId, "each vote targets a response visible to that player");
    view = await rpc(clients[player], "cah_cast_vote", { p_room_id: room.id, p_submission_id: submissionId });
    if (player < clients.length - 1) assert.equal(view.phase, "voting");
    else assert.equal(view.phase, "reveal");
    if (player === 0) {
      await expectRpcError(host, "cah_cast_vote", { p_room_id: room.id, p_submission_id: idsByAnswer.get(answers[2]) }, "duplicate key|already voted");
    }
  }

  const revealedViews = await Promise.all(clients.map((client) => rpc(client, "cah_get_view", { p_room_id: room.id })));
  assert.ok(revealedViews.every((item) => item.phase === "reveal" && item.responses.length === 3));
  assert.ok(revealedViews.every((item) => item.responses.every((answer) => answer.author && Number.isInteger(answer.votes))));
  const scoreByName = new Map(revealedViews[0].scores.map((item) => [item.name, item.score]));
  if (round === 1) {
    for (const client of clients) expectedScores.set(client, expectedScores.get(client) + 1);
  } else {
    expectedScores.set(guestOne, expectedScores.get(guestOne) + 1);
  }
  assert.deepEqual(scoreByName.get(names[0]), expectedScores.get(host));
  assert.deepEqual(scoreByName.get(names[1]), expectedScores.get(guestOne));
  assert.deepEqual(scoreByName.get(names[2]), expectedScores.get(guestTwo));

  if (round < 3) {
    view = await rpc(host, "cah_next_round", { p_room_id: room.id });
    assert.equal(view.phase, "submitting");
    assert.equal(view.round, round + 1);
  }
}

assert.equal(new Set(roundPrompts).size, 3, "the same prompt is not reused in one game");
view = await rpc(host, "cah_next_round", { p_room_id: room.id });
assert.equal(view.phase, "complete");
assert.equal(view.round, 3);
const privateRead = await host.schema("private").from("cah_submissions").select("*").eq("room_id", room.id);
assert.ok(privateRead.error, "authenticated clients cannot read private submissions directly");
await Promise.all([...clients, lateGuest].map((client) => client.removeAllChannels()));
for (const client of [...clients, lateGuest]) client.realtime.disconnect();

console.log(JSON.stringify({
  ok: true,
  independentGuests: clients.length,
  reconnect: "existing member rejoins; new member is rejected after start",
  realtime: realtimeStatus,
  rounds: 3,
  uniquePrompts: new Set(roundPrompts).size,
  finalScores: Object.fromEntries([...expectedScores].map(([, score], index) => [names[index], score])),
}));
