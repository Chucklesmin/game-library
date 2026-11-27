import assert from "node:assert/strict";
import test from "node:test";
import { game } from "../src/lib/roadmap/games/caption-clash.ts";

const players = [
  { id: "host-id", name: "Morgan" },
  { id: "sam-id", name: "Sam" },
  { id: "jay-id", name: "Jay" },
  { id: "cam-id", name: "Cam" },
];
const host = players[0].id;
const context = (actorId = host, now = 0, roster = players) => ({
  players: roster,
  actorId,
  hostId: host,
  now,
});

function act(state, id, values = {}, actorId = host, now = 0) {
  return game.act(state, context(actorId, now), { id, values });
}

function begin() {
  return act(game.create(context()), "choose_rounds", { rounds: "3" });
}

function ballotFor(state, actorId, answer) {
  const view = game.view(state, context(actorId));
  const card = view.cards.find((entry) => entry.body === answer);
  const option = view.controls.find(({ id }) => id === "vote")?.fields[0].options
    .find(({ label }) => card && label === `${card.title} · ${card.body}`);
  assert.ok(option, `expected a ballot option for ${answer}`);
  return option.value;
}

test("setup is host-only and room sizes and round values are enforced", () => {
  assert.throws(() => game.create(context(players[1].id)), /Only the host/);
  assert.throws(() => game.create(context(host, 0, players.slice(0, 2))), /3 to 10/);
  const maxPlayers = [...players, ...Array.from({ length: 6 }, (_, index) => ({ id: `extra-${index}`, name: "Extra" }))];
  assert.equal(game.create(context(host, 0, maxPlayers)).phase, "setup");
  assert.throws(() => game.create(context(host, 0, [...maxPlayers, { id: "overflow", name: "Overflow" }])), /3 to 10/);
  const state = game.create(context());
  assert.deepEqual(game.view(state, context(players[1].id)).controls, []);
  assert.throws(() => act(state, "choose_rounds", { rounds: "3" }, players[1].id), /Only the host/);
  assert.throws(() => act(state, "choose_rounds", { rounds: "10" }), /3, 5, or 7/);
  assert.throws(() => act(state, "choose_rounds", { rounds: "3" }, "outsider-id"), /not part/);
  assert.equal(act(state, "choose_rounds", { rounds: "5" }).rounds, 5);
  assert.equal(act(state, "choose_rounds", { rounds: "7" }).rounds, 7);
});

test("submission and ballot views are private and immutable", () => {
  const [, sam, jay, cam] = players;
  const initial = begin();
  assert.throws(() => act(initial, "submit", { answer: " " }), /1 to 180/);
  assert.throws(() => act(initial, "submit", { answer: "x".repeat(181) }), /1 to 180/);
  assert.throws(() => act(initial, "vote", { ballot: "spoof" }), /unavailable/);
  const submitted = act(initial, "submit", { answer: " Secret host answer " });
  assert.deepEqual(initial.submissions, {});
  assert.equal(game.view(submitted, context()).privateCards[0].body, "Secret host answer");
  const guestSubmission = game.view(submitted, context(sam.id));
  assert.doesNotMatch(JSON.stringify(guestSubmission), /Secret host answer/);
  for (const forbidden of [submitted.seed, sam.id, host]) {
    assert.ok(!JSON.stringify(guestSubmission).includes(forbidden));
  }
  assert.throws(() => act(submitted, "submit", { answer: "Overwrite" }), /already locked/);
  assert.throws(() => act(submitted, "close"), /Wait until/);
  let state = act(submitted, "submit", { answer: "Sam answer" }, sam.id);
  state = act(state, "submit", { answer: "Jay answer" }, jay.id);
  state = act(state, "pass", {}, cam.id);

  assert.equal(state.phase, "voting");
  const camView = game.view(state, context(cam.id));
  assert.equal(camView.cards.length, 3);
  assert.deepEqual(camView.cards.map(({ title }) => title), ["Answer A", "Answer B", "Answer C"]);
  assert.ok(camView.cards.every((card) => !card.items));
  const choices = camView.controls.find(({ id }) => id === "vote").fields[0].options;
  assert.deepEqual(choices.map(({ label }) => label), camView.cards.map(({ title, body }) => `${title} · ${body}`));
  const hostChoices = game.view(state, context()).controls.find(({ id }) => id === "vote").fields[0].options;
  assert.ok(hostChoices.every(({ label }) => !label.includes("Secret host answer")));
  for (const forbidden of [state.seed, host, sam.id, jay.id]) {
    assert.ok(!JSON.stringify(camView).includes(forbidden));
  }
  const ownBallot = ballotFor(state, cam.id, "Secret host answer");
  assert.throws(() => act(state, "vote", { ballot: ownBallot }), /another player/);
  assert.throws(() => act(state, "vote", { ballot: "does-not-exist" }), /another player/);
  const chosen = ballotFor(state, host, "Sam answer");
  state = act(state, "vote", { ballot: chosen });
  const receipt = game.view(state, context()).privateCards[1];
  assert.equal(receipt.title, "Your locked vote");
  assert.match(receipt.body, /^Answer [A-C] · Sam answer$/);
  assert.ok(!JSON.stringify(game.view(state, context(jay.id))).includes("Your locked vote"));
  assert.throws(() => act(state, "abstain"), /already locked/);
  const reloaded = JSON.parse(JSON.stringify(state));
  assert.deepEqual(game.view(reloaded, context()), game.view(state, context()));
});

test("four players finish three rounds with a tie, a scoreless round, and a single winner", () => {
  const [, sam, jay, cam] = players;
  let state = begin();
  const prompts = [];
  prompts.push(game.view(state, context()).heading);
  assert.match(game.view(state, context()).detail, /You’re the reader/);
  state = act(state, "submit", { answer: "Cactus" });
  state = act(state, "submit", { answer: "Cloud" }, sam.id);
  state = act(state, "submit", { answer: "Saturn" }, jay.id);
  state = act(state, "pass", {}, cam.id);
  const staleBallot = ballotFor(state, host, "Cloud");
  state = act(state, "vote", { ballot: staleBallot });
  state = act(state, "vote", { ballot: ballotFor(state, sam.id, "Cactus") }, sam.id);
  state = act(state, "abstain", {}, jay.id);
  state = act(state, "abstain", {}, cam.id);
  const firstReveal = game.view(state, context(sam.id));
  assert.equal(firstReveal.phase, "reveal");
  assert.equal(firstReveal.cards.filter((card) => card.items[0].includes("+1 point")).length, 2);
  assert.equal(firstReveal.standings[0].score, 1);
  assert.equal(firstReveal.standings[1].score, 1);
  assert.ok(firstReveal.cards.some((card) => card.title.includes(sam.name)));
  assert.throws(() => act(state, "advance", {}, sam.id), /Only the host/);
  assert.throws(() => act(state, "close"), /unavailable/);
  state = act(state, "advance");
  prompts.push(game.view(state, context()).heading);
  assert.match(game.view(state, context(sam.id)).detail, /You’re the reader/);

  state = act(state, "close", {}, host, 60_000);
  assert.equal(game.view(state, context()).heading, "No points this round");
  assert.equal(state.scores[host], 1);
  assert.equal(state.scores[sam.id], 1);
  state = act(state, "advance");
  prompts.push(game.view(state, context()).heading);
  assert.equal(new Set(prompts).size, 3);
  assert.match(game.view(state, context(jay.id)).detail, /You’re the reader/);

  state = act(state, "submit", { answer: "Marble" });
  state = act(state, "submit", { answer: "Kite" }, sam.id);
  state = act(state, "pass", {}, jay.id);
  state = act(state, "pass", {}, cam.id);
  assert.throws(() => act(state, "vote", { ballot: staleBallot }), /another player/);
  state = act(state, "abstain");
  state = act(state, "vote", { ballot: ballotFor(state, sam.id, "Marble") }, sam.id);
  state = act(state, "vote", { ballot: ballotFor(state, jay.id, "Marble") }, jay.id);
  state = act(state, "abstain", {}, cam.id);
  state = act(state, "advance");
  const finalView = game.view(state, context());
  assert.equal(finalView.finished, true);
  assert.equal(finalView.heading, "Morgan wins!");
  assert.deepEqual(finalView.standings.map(({ score }) => score), [2, 1, 0, 0]);
  assert.throws(() => act(state, "advance"), /unavailable/);

  const replay = game.create(context());
  assert.equal(replay.seed.length, 64);
  assert.notEqual(replay.seed, state.seed);
  assert.ok(Object.values(replay.scores).every((score) => score === 0));
});

test("deadlines support absent players and a zero-ballot reveal", () => {
  const [, sam, jay] = players;
  let state = begin();
  state = act(state, "submit", { answer: "First answer" });
  state = act(state, "submit", { answer: "Second answer" }, sam.id);
  assert.throws(() => act(state, "submit", { answer: "Late answer" }, jay.id, 60_000), /window has closed/);
  assert.throws(() => act(state, "close", {}, sam.id, 60_000), /Only the host/);
  assert.deepEqual(game.view(state, context(host, 60_000)).controls.map(({ id }) => id), ["close"]);
  state = act(state, "close", {}, host, 60_000);
  const option = game.view(state, context(jay.id, 60_000)).controls[0].fields[0].options[0].value;
  assert.throws(() => act(state, "vote", { ballot: option }, jay.id, 105_000), /window has closed/);
  state = act(state, "close", {}, host, 105_000);
  assert.equal(game.view(state, context()).heading, "No points this round");
  assert.ok(Object.values(state.scores).every((score) => score === 0));
});
