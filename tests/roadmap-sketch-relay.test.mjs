import assert from "node:assert/strict";
import { test } from "node:test";
import { game } from "../src/lib/roadmap/games/sketch-relay.ts";

const players = [
  { id: "a", name: "Ari" }, { id: "b", name: "Bo" }, { id: "c", name: "Cory" },
];
const context = (actorId = "a", now = 1000, roster = players) => ({ actorId, hostId: "a", now, players: roster });
const act = (state, id, values = {}, actorId, now, roster) => game.act(state, context(actorId, now, roster), { id, values });
const choose = (passes = "1") => act(game.create(context()), "choose-passes", { passes });
const draw = () => act(choose(), "begin-1");
const clone = (value) => JSON.parse(JSON.stringify(value));
const stroke = (points = [[0, 0], [1, 1]]) => ({ color: "#211721", width: 4, points });
const save = (state, pen, now = 1100) => act(state, "stroke-1", { stroke: JSON.stringify(pen) }, "a", now);

test("setup requires 3–8 distinct players and a valid host selection", () => {
  assert.throws(() => game.create(context("a", 1000, players.slice(0, 2))), /3–8/);
  assert.throws(() => game.create(context("a", 1000, [...players, players[0]])), /different/);
  const extended = [...players, ...Array.from({ length: 5 }, (_, index) => ({ id: String(index), name: `Player ${index}` }))];
  const setup = game.create(context("a", 1000, extended));
  const ready = act(setup, "choose-passes", { passes: "2" }, "a", 1000, extended);
  assert.equal(ready.totalTurns, 16);
  assert.throws(() => game.create(context("a", 1000, [...extended, { id: "i", name: "Ira" }])), /3–8/);
  assert.throws(() => act(setup, "choose-passes", { passes: "2" }, "b", 1000, extended), /host/);
  assert.throws(() => act(setup, "choose-passes", { passes: "11" }, "a", 1000, extended), /one or two/);
});

test("artist exclusively receives the clue, viewers reconnect to immutable strokes, and outsiders are rejected", () => {
  const ready = choose();
  assert.equal(game.view(ready, context("a")).privateCards, undefined);
  assert.throws(() => act(ready, "begin-1", {}, "b"), /not available/);

  const active = draw();
  const clue = game.view(active, context("a")).privateCards[0].body;
  const guest = game.view(active, context("b"));
  assert.ok(clue.length);
  assert.equal(guest.privateCards, undefined);
  assert.ok(!JSON.stringify(guest).includes(clue));
  assert.equal(guest.drawing.strokeAction, undefined);
  assert.throws(() => act(active, "stroke-1", { stroke: JSON.stringify(stroke()) }, "b"), /artist/);
  assert.throws(() => act(active, "guess-1", { guess: clue }, "a"), /cannot guess/);
  assert.throws(() => act(active, "guess-1", { guess: clue }, "outsider"), /Only the players/);
  assert.throws(() => game.view(active, context("outsider")), /Only the players/);

  const painted = save(active, stroke([[0.684345, 0.235192], [1, 1]]));
  assert.deepEqual(active.strokes, []);
  const roomForGuest = game.view(clone(painted), context("b", 1200));
  assert.deepEqual(roomForGuest.drawing.strokes, [stroke([[0.6843, 0.2352], [1, 1]])]);
  assert.ok(!JSON.stringify(roomForGuest).includes(clue));
});

test("validates ink, widths, finite points, payload size, and pace while preserving a 50-stroke sketch", () => {
  const active = draw();
  for (const invalid of [
    { ...stroke(), color: "url(example)" }, { ...stroke(), width: 1000 },
    stroke([]), stroke([[-0.1, 0]]), stroke([[1.1, 1]]), stroke([["0.5", 1]]),
    stroke([[0, 1, 1]]), stroke(Array.from({ length: 151 }, () => [0, 0])),
  ]) {
    assert.throws(() => save(active, invalid), /available pen|inside the drawing/);
  }
  assert.throws(() => act(active, "stroke-1", { stroke: '{"width":4,"color":"#211721","points":[[1e999,0]]}' }, "a", 1100), /inside/);
  assert.throws(() => act(active, "stroke-1", { stroke: " ".repeat(15_001) }, "a", 1100), /large/);
  const first = save(active, stroke());
  assert.throws(() => save(first, stroke(), 1159), /moment/);

  let filled = active;
  for (let index = 0; index < 50; index += 1) {
    filled = save(filled, stroke(), 1100 + index * 60);
  }
  assert.equal(filled.strokes.length, 50);
  assert.equal(game.view(clone(filled), context("b", 4500)).drawing.strokes.length, 50);
  assert.equal(game.view(filled, context("a", 4500)).drawing.strokeAction, undefined);
  assert.throws(() => save(filled, stroke(), 5100), /sketch is full/);
  const undo = game.view(filled, context("a", 5100)).controls.find(({ label }) => label === "Undo last stroke");
  const hasRoom = act(filled, undo.id, {}, "a", 5100);
  assert.equal(hasRoom.strokes.length, 49);
  assert.equal(hasRoom.strokePoints, 98);
  assert.equal(save(hasRoom, stroke(), 5100).strokes.length, 50);

  const large = stroke(Array.from({ length: 150 }, () => [0.2345, 0.789]));
  let fullOfPoints = active;
  for (let index = 0; index < 20; index += 1) {
    fullOfPoints = save(fullOfPoints, large, 1100 + index * 60);
  }
  assert.equal(fullOfPoints.strokePoints, 3000);
  assert.throws(() => save(fullOfPoints, stroke(), 5100), /sketch is full/);
});

test("the active artist can undo only the latest saved stroke and expired or replayed undo is rejected", () => {
  const active = draw();
  const undoControl = (state, actor = "a", now = 1500) =>
    game.view(state, context(actor, now)).controls.find(({ label }) => label === "Undo last stroke");
  assert.equal(undoControl(active), undefined);

  const firstStroke = stroke([[0, 0]]);
  const lastStroke = stroke([[0.2, 0.3], [0.5, 0.5], [1, 1]]);
  const saved = clone(save(save(active, firstStroke), lastStroke, 1160));
  delete saved.strokeRevision; // A room saved before undo was introduced.
  const control = undoControl(saved);
  assert.ok(control);
  assert.equal(undoControl(saved, "b"), undefined);
  assert.throws(() => act(saved, control.id, {}, "b", 1500), /Only the active artist/);
  assert.equal(undoControl(saved, "a", saved.deadline), undefined);
  assert.throws(() => act(saved, control.id, {}, "a", saved.deadline), /Time has run out/);

  const undone = act(saved, control.id, {}, "a", 1500);
  assert.deepEqual(saved.strokes, [firstStroke, lastStroke]);
  assert.deepEqual(game.view(clone(undone), context("b", 1500)).drawing.strokes, [firstStroke]);
  assert.equal(undone.strokePoints, 1);
  assert.equal(undone.lastStrokeAt, saved.lastStrokeAt);
  assert.equal(game.view(undone, context("a", 1500)).drawing.strokeAction, "stroke-1");
  assert.throws(() => act(undone, control.id, {}, "a", 1500), /not available/);

  const redrawn = save(undone, lastStroke, 1560);
  assert.throws(() => act(redrawn, control.id, {}, "a", 1600), /not available/);
  const backToOne = act(redrawn, undoControl(redrawn).id, {}, "a", 1600);
  const empty = act(backToOne, undoControl(backToOne).id, {}, "a", 1700);
  assert.equal(empty.strokePoints, 0);
  assert.equal(undoControl(empty), undefined);
  assert.deepEqual(game.view(clone(empty), context("b", 1700)).drawing.strokes, []);
});

test("first matching description scores once, guesses have private feedback, and expiration takes no points", () => {
  const active = { ...draw(), promptStart: 0 };
  const incorrect = act(active, "guess-1", { guess: "snowman" }, "b", 1100);
  assert.match(game.view(incorrect, context("b", 1100)).detail, /didn’t match/);
  assert.doesNotMatch(game.view(incorrect, context("c", 1100)).detail, /didn’t match/);
  assert.ok(!JSON.stringify(incorrect).includes("snowman"));
  assert.throws(() => act(incorrect, "guess-1", { guess: "a snowman with a scarf" }, "b", 1700), /moment/);
  assert.throws(() => act(active, "guess-1", { guess: "!!!" }, "c", 1701), /Enter a guess/);
  assert.throws(() => act(active, "guess-1", { guess: "b".repeat(73) }, "c", 1701), /Enter a guess/);

  const solved = act(incorrect, "guess-1", { guess: "SCARF on a snow person!" }, "b", 1750);
  assert.deepEqual(solved.scores, { a: 1, b: 2, c: 0 });
  assert.match(game.view(solved, context("c", 1750)).cards[0].body, /snowman/);
  assert.throws(() => act(solved, "guess-1", { guess: "a snowman with a scarf" }, "c", 1750), /not available/);
  assert.throws(() => act(solved, "next-1", {}, "b"), /not available/);

  const deadline = active.deadline;
  assert.throws(() => act(active, "expire-1", {}, "b", deadline - 1), /still has time/);
  assert.throws(() => act(active, "guess-1", { guess: "snowman with a scarf" }, "b", deadline), /run out/);
  const expiredView = game.view(active, context("b", deadline));
  assert.equal(expiredView.controls[0].id, "expire-1");
  const expired = act(active, "expire-1", {}, "b", deadline);
  assert.deepEqual(expired.scores, { a: 0, b: 0, c: 0 });
  assert.equal(game.view(expired, context("b", deadline)).cards[0].body, "A snowman with a scarf");
});

test("rotates every artist in a full match, resets the drawing, and supports a shared first place", () => {
  let state = choose();
  for (const [index, artist] of players.entries()) {
    const turn = index + 1;
    const guessedBy = players[(index + 1) % players.length].id;
    const now = 10_000 * turn;
    assert.equal(state.strokes.length, 0);
    assert.equal(game.view(state, context(artist.id, now)).controls[0].id, `begin-${turn}`);
    state = act(state, `begin-${turn}`, {}, artist.id, now);
    if (turn > 1) assert.throws(() => act(state, `guess-${turn - 1}`, {}, guessedBy, now), /not available/);
    const clue = game.view(state, context(artist.id, now)).privateCards[0].body;
    state = act(state, `stroke-${turn}`, { stroke: JSON.stringify(stroke()) }, artist.id, now + 10);
    state = act(state, `guess-${turn}`, { guess: clue }, guessedBy, now + 100);
    assert.equal(game.view(state, context(guessedBy, now + 100)).drawing.strokes.length, 1);
    if (turn < players.length) state = act(state, `next-${turn}`, {}, "a", now + 200);
  }
  const final = game.view(clone(state), context("c", 40_000));
  assert.equal(final.finished, true);
  assert.deepEqual(final.controls, []);
  assert.deepEqual(final.standings.map((entry) => entry.score), [3, 3, 3]);
  assert.equal(final.cards[1].title, "Shared first place");
  assert.throws(() => act(state, "next-3", {}, "a", 40_000), /not available/);
  const skipped = act(choose(), "skip-1", {}, "a");
  assert.equal(skipped.result.kind, "skipped");
  assert.deepEqual(skipped.scores, { a: 0, b: 0, c: 0 });
});
