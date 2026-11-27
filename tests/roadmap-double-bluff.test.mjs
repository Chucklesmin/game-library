import assert from "node:assert/strict";
import test from "node:test";
import { game } from "../src/lib/roadmap/games/double-bluff.ts";

const players = [{ id: "june", name: "June" }, { id: "robin", name: "Robin" }];
const context = (seat = 0) => ({ players, actorId: players[seat].id, hostId: players[0].id, now: 1000 });
const next = (state, actor, id, values = {}) => game.act(state, context(actor), { id, values });
const controls = (state, actor) => game.view(state, context(actor)).controls;
const choose = (state, actor, prefix) => controls(state, actor).find(({ id }) => id.startsWith(prefix));
const newGame = () => game.create(context());

test("Double Bluff requires two distinct members and gives each a private hand and inspection", () => {
  assert.throws(() => game.create({ ...context(), players: [players[0]] }), /exactly two/);
  assert.throws(() => game.create({ ...context(), players: [...players, { id: "extra", name: "Extra" }] }), /exactly two/);
  assert.throws(() => game.create({ ...context(), players: [players[0], players[0]] }), /different players/);
  assert.throws(() => game.create({ ...context(), actorId: "outsider" }), /Join this duel/);
  const initial = { ...newGame(), counts: [0, 4] };
  const june = game.view(initial, context(0));
  const robin = game.view(initial, context(1));
  assert.deepEqual(june.cards, robin.cards);
  assert.equal(june.privateCards.length, 2);
  assert.equal(robin.privateCards.length, 2);
  assert.match(june.privateCards[0].body, /^0 /);
  assert.match(robin.privateCards[0].body, /^4 /);
  assert.equal(june.privateCards[1].items.length, 4);
  assert.equal(robin.privateCards[1].items.length, 4);
  assert.equal(june.privateCards[1].items.some((label) => robin.privateCards[1].items.includes(label)), false);
  assert.equal(robin.controls.length, 0);
  assert.deepEqual(game.view(JSON.parse(JSON.stringify(initial)), context(0)), june);
  assert.throws(() => game.view(initial, { ...context(), actorId: "outsider" }), /Only the two players/);
});

test("Double Bluff accepts only current-turn held higher cards and does not expose unplayed cards", () => {
  const initial = { ...newGame(), hands: [[1, 3, 5, 7], [2, 4, 6, 8]] };
  const opening = choose(initial, 0, "claim");
  assert.throws(() => next(initial, 1, opening.id, { rank: "2" }), /Wait for your opponent/);
  for (const rank of ["2", "9", "01", "1.0", ""]) {
    assert.throws(() => next(initial, 0, opening.id, { rank }), /held card/);
  }
  assert.throws(() => next(initial, 0, "challenge-1-0"), /unavailable/);
  const played = next(initial, 0, opening.id, { rank: "5" });
  assert.deepEqual(initial.hands[0], [1, 3, 5, 7]);
  assert.deepEqual(played.hands[0], [1, 3, 7]);
  const counter = choose(played, 1, "claim");
  assert.deepEqual(counter.fields[0].options.map(({ value }) => value), ["6", "8"]);
  assert.throws(() => next(played, 1, counter.id, { rank: "4" }), /higher/);
  const countered = next(played, 1, counter.id, { rank: "8" });
  const view = game.view(countered, context(0));
  assert.deepEqual(view.controls.map(({ label }) => label), ["Challenge the claim"]);
  assert.match(view.detail, /no higher card/);
  assert.equal(view.cards.at(-1).items.length, 2);
  assert.match(view.cards.at(-1).items[1], /^Robin · At least 8 /);
  assert.equal(view.cards.some(({ title }) => title === "Claim history"), false);
  assert.equal(view.privateCards[1].items.some((line) => /^At least (2|4|6|8) /.test(line)), false);

  const reveal = next(countered, 0, choose(countered, 0, "challenge").id);
  const recap = game.view(JSON.parse(JSON.stringify(reveal)), context(1));
  const history = recap.cards.find(({ title }) => title === "Claim history");
  assert.match(history.items[0], /^1\. June opened with: At least 5 /);
  assert.match(history.items[1], /^2\. Robin countered with: At least 8 /);
  assert.equal(history.items[2], "3. June challenged");
  assert.equal(recap.privateCards, undefined);
  assert.throws(() => next(countered, 0, opening.id, { rank: "7" }), /unavailable/);
  assert.throws(() => game.act(countered, { ...context(), actorId: "outsider" }, { id: "challenge-1-2", values: {} }), /Only the two players/);
});

test("Double Bluff challenge publishes just the relevant evidence and scores both verdict branches", () => {
  const initial = { ...newGame(), hands: [[1, 3, 5, 7], [2, 4, 6, 8]] };
  for (const [counts, score, result] of [[[3, 4], [1, 0], "Claim stands"], [[2, 3], [0, 1], "Bluff called"]]) {
    const played = next({ ...initial, counts }, 0, "claim-1-0", { rank: "7" });
    const reveal = next(played, 1, "challenge-1-1");
    assert.deepEqual(reveal.scores, score);
    const june = game.view(reveal, context(0));
    const robin = game.view(JSON.parse(JSON.stringify(reveal)), context(1));
    assert.equal(june.heading, result);
    assert.deepEqual(june, robin);
    assert.equal(june.privateCards, undefined);
    const proof = june.cards.find(({ title }) => title === "Parcel inspection");
    assert.match(proof.body, new RegExp(`· ${counts[0] + counts[1]} .+ found$`));
    assert.match(proof.items[0], new RegExp(`^June opened ${counts[0]} `));
    assert.match(proof.items[1], new RegExp(`^Robin opened ${counts[1]} `));
    assert.throws(() => next(reveal, 1, "challenge-1-1"), /closed/);
    const newRound = next(reveal, 1, choose(reveal, 1, "next").id);
    assert.equal(newRound.turn, 1);
    assert.equal(newRound.round, 2);
    assert.throws(() => next(newRound, 1, "claim-1-0", { rank: "7" }), /unavailable/);
  }
});

test("Double Bluff terminates a full five-round duel with alternating openers and unique scenarios", () => {
  let state = newGame();
  const titles = new Set();
  for (let round = 1; round <= 5; round += 1) {
    const opener = (round - 1) % 2;
    const opponent = 1 - opener;
    assert.equal(state.round, round);
    assert.equal(state.opener, opener);
    const before = game.view(state, context(opener));
    assert.match(before.heading, /opening claim/);
    titles.add(before.cards[0].title);
    state = { ...state, counts: [4, 4] };
    const claim = choose(state, opener, "claim");
    state = next(state, opener, claim.id, { rank: claim.fields[0].options[0].value });
    state = next(state, opponent, choose(state, opponent, "challenge").id);
    if (round < 5) state = next(state, opener, choose(state, opener, "next").id);
  }
  assert.equal(titles.size, 5);
  assert.deepEqual(state.scores, [3, 2]);
  const final = game.view(state, context(1));
  assert.equal(final.finished, true);
  assert.equal(final.heading, "June wins the duel");
  assert.deepEqual(final.controls, []);
  assert.throws(() => next(state, 1, "next-5-1"), /closed/);
});
