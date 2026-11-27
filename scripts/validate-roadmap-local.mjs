import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { roadmapCatalog } from "../src/lib/roadmap/catalog.ts";

const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
const app = new URL(process.env.ROADMAP_LOCAL_APP ?? "http://127.0.0.1:3100");
const database = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:55421");
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!key || !loopback.has(app.hostname) || !loopback.has(database.hostname)) {
  throw new Error("Set the local Supabase public key and use loopback URLs only.");
}

async function player(number) {
  const client = createClient(database.href, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw error;
  return { client, token: data.session.access_token, id: data.user.id, name: `Roadmap guest ${number}` };
}

async function api(slug, actor, body, room, expected = 200) {
  const url = new URL(`/api/games/${slug}`, app);
  if (room) url.searchParams.set("room", room);
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: actor ? { Authorization: `Bearer ${actor.token}`, "Content-Type": "application/json" } : {},
    body: body && JSON.stringify(body),
  });
  const result = await response.json();
  assert.equal(response.status, expected, `${slug}: ${result.error ?? response.status}`);
  assert.match(response.headers.get("cache-control"), /no-store/);
  if (expected === 200) {
    assert.deepEqual(Object.keys(result).sort(),
      ["id", "code", "revision", "players", "hostId", "isHost", "turn", "game"].sort());
  }
  return result;
}

function move(slug, actor, room, action, values = {}, expected = 200) {
  return api(slug, actor, {
    operation: "move", room: room.id, turn: room.turn, action, values,
  }, undefined, expected);
}

async function watchUpdates(client, room) {
  await client.realtime.setAuth();
  const revisions = [];
  const channel = client.channel(`roadmap-qa:${room}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "roadmap_room_updates", filter: `id=eq.${room}` },
      ({ new: row }) => revisions.push(row.revision));
  try {
    await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error("Room revision listener did not register.")), 15000);
      channel.on("system", {}, (event) => {
        if (event.extension !== "postgres_changes") return;
        clearTimeout(deadline);
        if (event.status === "ok") resolve();
        else reject(new Error(event.message ?? "Room revision listener failed."));
      }).subscribe((status, error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(deadline);
          reject(error ?? new Error(status));
        }
      });
    });
  } catch (error) {
    await client.removeChannel(channel);
    await client.realtime.disconnect();
    throw error;
  }
  return { revisions, close: async () => {
    await client.removeChannel(channel);
    await client.realtime.disconnect();
  } };
}

assert.equal(roadmapCatalog.length, 14, "The Library includes all fourteen planned titles.");
const hostPage = await fetch(app);
assert.equal(hostPage.status, 200);
const html = await hostPage.text();
for (const game of roadmapCatalog) assert.ok(html.includes(`/games/${game.slug}`), `Missing home entry for ${game.slug}`);

const [host, ...guests] = await Promise.all(Array.from({ length: 5 }, (_, index) => player(index + 1)));
const outsider = guests.at(-1);

for (const game of roadmapCatalog) {
  const { slug, minimumPlayers, maximumPlayers } = game;
  const page = await fetch(new URL(`/games/${slug}`, app));
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes(game.title));
  let room = await api(slug, host, { operation: "create", name: host.name });
  assert.equal(room.players.length, 1);
  await move(slug, host, room, "$start", {}, 409);
  await api(slug, null, undefined, room.id, 401);
  await api(slug, outsider, undefined, room.id, 404);
  if (maximumPlayers === 2) {
    const results = await Promise.allSettled(guests.slice(0, 2)
      .map((guest) => api(slug, guest, { operation: "join", name: guest.name, code: room.code })));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1, "only one final seat");
    assert.match(results.find((result) => result.status === "rejected").reason.message, /full/i);
  } else {
    await Promise.all(guests.slice(0, minimumPlayers - 1)
      .map((guest) => api(slug, guest, { operation: "join", name: guest.name, code: room.code })));
  }

  const lobby = await api(slug, host, undefined, room.id);
  assert.equal(lobby.players.length, minimumPlayers);
  const participant = guests.find((guest) => lobby.players.some((player) => player.id === guest.id));
  await move(slug, participant, lobby, "$start", {}, 409);
  room = await move(slug, host, lobby, "$start");
  assert.ok(room.game && room.turn);
  assert.equal(room.revision, lobby.revision + 1);
  await move(slug, host, lobby, "$start", {}, 409);
  await api(slug, outsider, { operation: "join", name: outsider.name, code: room.code }, undefined, 409);

  const rejoined = await api(slug, participant, { operation: "join", name: "Changed name", code: room.code });
  assert.ok(rejoined.players.some(({ name }) => name === participant.name));
  assert.equal(rejoined.revision, room.revision);
  const privateTable = await participant.client.rpc("roadmap_load", { p_id: room.id, p_slug: slug, p_actor: participant.id });
  assert.ok(privateTable.error, "public client cannot load raw internal state");
  const withoutServer = await participant.client.rpc("roadmap_server_load", { p_id: room.id, p_slug: slug });
  assert.match(withoutServer.error?.message ?? "", /server authentication required/i);
  const normalSignal = await participant.client.from("roadmap_room_updates").select("id,revision").eq("id", room.id);
  assert.equal(normalSignal.error, null);
  assert.deepEqual(normalSignal.data, [{ id: room.id, revision: room.revision }]);
  const deniedSignal = await outsider.client.from("roadmap_room_updates").select("id,revision").eq("id", room.id);
  assert.equal(deniedSignal.error, null);
  assert.deepEqual(deniedSignal.data, []);

  if (slug === "crowd-call") {
    const everyone = [host, ...guests.slice(0, minimumPlayers - 1)];
    const watch = await watchUpdates(participant.client, room.id);
    try {
      const snapshots = await Promise.all(everyone.map((actor) => api(slug, actor, undefined, room.id)));
      await Promise.all(everyone.map((actor, index) => {
        const snapshot = snapshots[index];
        const control = snapshot.game.controls.find(({ label }) => /lock prediction/i.test(label));
        const field = control.fields[0];
        return move(slug, actor, snapshot, control.id, { [field.name]: field.options[index % field.options.length].value });
      }));
      room = await api(slug, host, undefined, room.id);
      assert.equal(room.revision, lobby.revision + 1 + everyone.length);
      const close = room.game.controls.find(({ label }) => /open voting/i.test(label));
      const vote = await move(slug, host, room, close.id);
      assert.match(vote.game.phase, /voting/i);
      await move(slug, host, room, close.id, {}, 409);
      for (let retry = 0; !watch.revisions.includes(vote.revision) && retry < 40; retry++) {
        await new Promise((resolve) => setTimeout(resolve, 125));
      }
      assert.ok(watch.revisions.includes(vote.revision), "A second member received the committed revision over Realtime.");
    } finally {
      await watch.close();
    }
  } else {
    const playerViews = await Promise.all(lobby.players.map(async ({ id }) => {
      const actor = [host, ...guests].find((person) => person.id === id);
      return { actor, snapshot: await api(slug, actor, undefined, room.id) };
    }));
    const available = playerViews.find(({ snapshot }) => snapshot.game.controls.length > 0);
    assert.ok(available, "At least one member can make the first game move.");
    const { actor, snapshot } = available;
    const control = snapshot.game.controls[0];
    const values = Object.fromEntries((control.fields ?? []).map((field) => [
      field.name, field.type === "select" ? field.options[0].value : "Local game room check",
    ]));
    const next = await move(slug, actor, snapshot, control.id, values);
    assert.equal(next.revision, room.revision + 1);
  }
  console.log(`${game.title}: Library link, route, seat gate, authenticated start, first move, rejoin and room privacy passed`);
}
