import { createClient } from "@supabase/supabase-js";

const url = process.env.SIGNAL_SUPABASE_URL;
const key = process.env.SIGNAL_SUPABASE_KEY;
if (!url || !key) throw new Error("Missing Signal Supabase validation configuration.");

const host = createClient(url, key, { auth: { persistSession: false } });
const guest = createClient(url, key, { auth: { persistSession: false } });
const call = async (client, name, args) => {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
};

await host.auth.signInAnonymously().then(({ error }) => { if (error) throw error; });
await guest.auth.signInAnonymously().then(({ error }) => { if (error) throw error; });
const room = await call(host, "create_room_for_game", { p_game_slug: "signal-spectrum", p_display_name: "Host QA" });
await call(guest, "join_room_by_code", { p_code: room.code, p_display_name: "Guest QA" });
await call(host, "signal_start_round", { p_room_id: room.id, p_spectrum: { left: "Quiet", right: "Loud" }, p_target: 70 });
const forbidden = await guest.rpc("signal_submit_clue", { p_room_id: room.id, p_clue: "concert" });
if (!forbidden.error) throw new Error("A non-keeper was allowed to submit a clue.");
await call(host, "signal_submit_clue", { p_room_id: room.id, p_clue: "concert" });
await call(host, "signal_submit_tune", { p_room_id: room.id, p_needle: 66 });
await call(guest, "signal_submit_intercept", { p_room_id: room.id, p_intercept: "right" });
const revealed = await call(host, "signal_reveal_round", { p_room_id: room.id });
if (revealed.status !== "reveal" || revealed.amber_score !== 4) throw new Error("Unexpected scored round result.");
console.log("LIVE_TURN_VALIDATION_OK");
