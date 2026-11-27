import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SIGNAL_SUPABASE_URL;
const key = process.env.SIGNAL_SUPABASE_KEY;
if (!url || !key) throw new Error("Set the Supabase URL and publishable key for the acceptance target.");

const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const [host, guest, idle, outsider] = Array.from({ length: 4 }, client);
const anonymous = client();

async function rpc(actor, name, args) {
  const { data, error } = await actor.rpc(name, args);
  assert.ifError(error ? new Error(`${name}: ${error.message}`) : null);
  return data;
}

async function rejected(actor, name, args, reason) {
  const { error } = await actor.rpc(name, args);
  assert.ok(error, `${name} should reject the request`);
  if (reason) assert.match(error.message, reason);
}

async function signIn(actor) {
  const { data, error } = await actor.auth.signInAnonymously();
  assert.ifError(error);
  assert.ok(data.user.id);
}

await Promise.all([host, guest, idle, outsider].map(signIn));
const room = await rpc(host, "create_room_for_game", { p_game_slug: "pulse-vote", p_display_name: "Pulse Host QA" });
const roomArgs = { p_room_id: room.id };
const view = (actor) => rpc(actor, "pulse_vote_get_view", roomArgs);
const moveArgs = (action, roundId, value) => ({ ...roomArgs, p_action: action, p_round_id: roundId, p_value: value });
const move = (actor, action, roundId, value = null) => rpc(actor, "pulse_vote_move", moveArgs(action, roundId, value));
const joinArgs = { p_code: room.code, p_display_name: "Pulse Guest QA" };

await rejected(anonymous, "pulse_vote_get_view", roomArgs);
await rejected(outsider, "pulse_vote_get_view", roomArgs, /membership required/);
await rejected(outsider, "pulse_vote_move", moveArgs("vote", null, 0), /membership required/);
await rejected(host, "pulse_vote_move", moveArgs("start", null, 2), /3 to 8 players/);
await rpc(guest, "pulse_vote_join", joinArgs);
await rpc(idle, "pulse_vote_join", { ...joinArgs, p_display_name: "Pulse Idle QA" });
await rejected(host, "pulse_vote_move", moveArgs("start", null, 11), /between 1 and 10/);
await rejected(host, "pulse_vote_move", moveArgs("start", null, null), /between 1 and 10/);
await rejected(guest, "pulse_vote_move", moveArgs("start", null, 2), /Only the host/);
await rejected(host, "update_room_state", { ...roomArgs, p_status: "lobby", p_game_state: {} }, /managed by Pulse Vote/);

const changes = [];
const channel = guest.channel(`pulse-qa:${room.id}`).on("postgres_changes",
  { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${room.id}` },
  (event) => changes.push(event.new));
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Pulse Vote realtime subscription timed out.")), 10000);
    channel.subscribe((status, error) => {
      if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") clearTimeout(timeout);
      if (status === "SUBSCRIBED") resolve();
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(error ?? new Error(status));
    });
  });

  const first = await move(host, "start", null, 2);
  assert.equal(first.phase, "vote");
  assert.equal(first.players.length, 3);
  assert.equal(first.prompt.choices.length, 4);
  assert.equal(new Set(first.prompt.choices).size, 4);
  assert.equal(first.result, null);
  await rejected(outsider, "join_room_by_code", { ...joinArgs, p_display_name: "Pulse Outsider QA" }, /already started/);
  assert.equal((await rpc(guest, "pulse_vote_join", joinArgs)).id, room.id);
  await rejected(guest, "pulse_vote_move", moveArgs("close", first.roundId, null), /Only the host/);
  await rejected(host, "pulse_vote_move", moveArgs("next", first.roundId, null), /Reveal/);
  await rejected(guest, "pulse_vote_move", moveArgs("vote", first.roundId, 4), /Choose an answer/);

  assert.equal((await move(host, "vote", first.roundId, 0)).myChoice, 0);
  const duplicates = await Promise.all([1, 2, 3].map((choice) => move(host, "vote", first.roundId, choice)));
  assert.ok(duplicates.every((response) => response.myChoice === 0));
  const guestBeforeReveal = await view(guest);
  assert.equal(guestBeforeReveal.myChoice, null);
  assert.equal(guestBeforeReveal.result, null);
  assert.deepEqual(guestBeforeReveal.players.map((player) => player.score), [0, 0, 0]);
  const directRoom = await guest.from("rooms").select("status,game_state").eq("id", room.id).single();
  assert.ifError(directRoom.error);
  assert.deepEqual(directRoom.data.game_state, {});
  const privateTable = await guest.schema("private").from("pulse_vote_matches").select("ballots").eq("room_id", room.id);
  assert.ok(privateTable.error || privateTable.data.length === 0, "The private table must be inaccessible");

  await move(guest, "vote", first.roundId, 1);
  const results = await Promise.all([1, 2, 3].map(() => move(host, "close", first.roundId)));
  for (const result of results) {
    assert.deepEqual(result.result, { counts: [1, 1, 0, 0], winners: [0, 1] });
    assert.deepEqual(result.players.map((player) => player.score), [1, 1, 0]);
  }
  assert.equal((await view(idle)).myChoice, null);
  await rejected(idle, "pulse_vote_move", moveArgs("vote", first.roundId, 1), /Voting is closed/);
  await rejected(guest, "pulse_vote_move", moveArgs("next", first.roundId, null), /Only the host/);
  for (let attempt = 0; changes.length < 2 && attempt < 25; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.deepEqual(changes.map((event) => event.status), ["pulse_voting", "pulse_reveal"]);
  assert.ok(changes.every((event) => Object.keys(event.game_state).length === 0));

  const second = await move(host, "next", first.roundId);
  assert.notEqual(second.roundId, first.roundId);
  assert.notEqual(second.prompt.question, first.prompt.question);
  assert.equal(second.result, null);
  assert.equal(second.myChoice, null);
  await rejected(host, "pulse_vote_move", moveArgs("close", first.roundId, null), /round has changed/);
  const noVotes = await move(host, "close", second.roundId);
  assert.deepEqual(noVotes.result, { counts: [0, 0, 0, 0], winners: [] });
  const final = await move(host, "next", second.roundId);
  assert.equal(final.phase, "complete");
  assert.deepEqual(final.players.map((player) => player.rank), [1, 1, 3]);
  assert.deepEqual(final.players.map((player) => player.score), [1, 1, 0]);
  const fresh = await move(host, "start", second.roundId, 1);
  assert.equal(fresh.round, 1);
  assert.deepEqual(fresh.players.map((player) => player.score), [0, 0, 0]);
  await rejected(guest, "pulse_vote_move", moveArgs("vote", second.roundId, 2), /round has changed/);
} finally {
  await guest.removeChannel(channel);
  await guest.realtime.disconnect();
}

// Check the cap through the shared lifecycle, including a race for the final seat.
const capRoom = await rpc(host, "create_room_for_game", { p_game_slug: "pulse-vote", p_display_name: "Cap Host QA" });
const extras = Array.from({ length: 5 }, client);
await Promise.all(extras.map(signIn));
const contenders = [guest, idle, outsider, ...extras];
const capArgs = (index) => ({ p_code: capRoom.code, p_display_name: `Cap Guest ${index + 1}` });
for (const [index, actor] of contenders.slice(0, 6).entries()) {
  await rpc(actor, "join_room_by_code", capArgs(index));
}
const seatRace = await Promise.all(contenders.slice(6).map((actor, index) =>
  actor.rpc("join_room_by_code", capArgs(index + 6))));
assert.equal(seatRace.filter(({ error }) => !error).length, 1);
assert.match(seatRace.find(({ error }) => error).error.message, /room is full/);
assert.equal((await rpc(host, "pulse_vote_get_view", { p_room_id: capRoom.id })).players.length, 8);
console.log("PULSE_VOTE_RPC_VALIDATION_OK");
