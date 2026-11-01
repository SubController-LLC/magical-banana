import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newGame,
  reduceGame,
  losses,
  pending,
  restored,
  type Game,
} from "../src/game";
const initial = () => newGame(["A", "B"], 8, "バナナ", 1000);
const answered = () =>
  reduceGame(initial(), { type: "answer", id: "a", word: "宇宙船", now: 2000 });
test("explanation request never stops play or adds a loss", () => {
  let g = answered();
  g = reduceGame(g, {
    type: "initial",
    id: "a",
    judgment: { verdict: "explain", comment: "どういうこと？", source: "ai" },
  });
  assert.equal(g.phase, "playing");
  assert.equal(g.current, 1);
  assert.equal(g.word, "宇宙船");
  assert.equal(losses(g, g.players[0].id), 0);
  assert.ok(pending(g.turns[0]));
  g = reduceGame(g, { type: "answer", id: "b", word: "星", now: 3000 });
  assert.equal(g.turns.length, 2);
  assert.equal(g.current, 0);
});
test("timeout only counts once, late submission becomes timeout", () => {
  let g = reduceGame(initial(), { type: "timeout", id: "t", now: 9000 });
  assert.equal(g.phase, "timeout");
  assert.equal(losses(g, g.players[0].id), 1);
  g = reduceGame(g, { type: "timeout", id: "t2", now: 10000 });
  assert.equal(g.turns.length, 1);
  assert.equal(g.current, 1);
  assert.equal(g.word, "バナナ");
  const late = reduceGame(initial(), {
    type: "answer",
    id: "a",
    word: "黄色",
    now: 9000,
  });
  assert.equal(late.turns[0].kind, "timeout");
  assert.equal(losses(late, late.players[0].id), 1);
});
test("verdict edits recalculate, repeated out is idempotent, AI cannot override participants", () => {
  let g = answered();
  const set = (decision: "safe" | "out" | null) => {
    g = reduceGame(g, { type: "final", id: "a", decision });
  };
  set("out");
  set("out");
  assert.equal(losses(g, g.players[0].id), 1);
  set("safe");
  assert.equal(losses(g, g.players[0].id), 0);
  g = reduceGame(g, {
    type: "initial",
    id: "a",
    judgment: { verdict: "explain", comment: "異議！", source: "ai" },
  });
  assert.equal(g.turns[0].final, "safe");
  assert.equal(pending(g.turns[0]), false);
  set(null);
  assert.ok(pending(g.turns[0]));
  assert.equal(losses(g, g.players[0].id), 0);
});
test("explanations preserve original judgment, audio, and repeated explanations", () => {
  let g = reduceGame(initial(), {
    type: "answer",
    id: "a",
    word: "宇宙船",
    audioId: "original",
    now: 2000,
  });
  g = reduceGame(g, {
    type: "initial",
    id: "a",
    judgment: { verdict: "explain", comment: "待った！", source: "ai" },
  });
  for (const id of ["e1", "e2"])
    g = reduceGame(g, {
      type: "explanation",
      id: "a",
      explanation: {
        id,
        text: "動画がバナナの形",
        audioId: id,
        createdAt: 3000,
      },
    });
  g = reduceGame(g, {
    type: "rejudge",
    id: "a",
    explanationId: "e1",
    judgment: { verdict: "safe", comment: "その説明ならアリ！", source: "ai" },
    recommendation: "safe",
  });
  assert.equal(g.turns[0].audioId, "original");
  assert.equal(g.turns[0].initial?.verdict, "explain");
  assert.equal(g.turns[0].explanations.length, 2);
  assert.equal(g.turns[0].explanations[0].recommendation, "safe");
  assert.equal(g.turns[0].final, null);
  assert.ok(pending(g.turns[0]));
});
test("paused clock resumes from remaining time; timeout advances player", () => {
  let g = reduceGame(initial(), { type: "pause", now: 4000 });
  assert.equal(g.remaining, 5000);
  g = reduceGame(g, { type: "resume", now: 20000 });
  assert.equal(g.deadline, 25000);
  g = reduceGame(g, { type: "timeout", id: "t", now: 25000 });
  g = reduceGame(g, { type: "resume", now: 40000 });
  assert.equal(g.deadline, 48000);
  assert.equal(g.current, 1);
});
test("unknown stays pending; finished games allow decisions and retain losses", () => {
  let g = answered();
  g = reduceGame(g, {
    type: "initial",
    id: "a",
    judgment: { verdict: "unknown", comment: "聞こえない", source: "ai" },
  });
  assert.ok(pending(g.turns[0]));
  g = reduceGame(g, { type: "end" });
  g = reduceGame(g, { type: "final", id: "a", decision: "out" });
  assert.equal(losses(g, g.players[0].id), 1);
  assert.equal(g.phase, "ended");
  assert.equal(
    reduceGame(g, { type: "answer", id: "b", word: "黄色", now: 3000 }),
    g,
  );
});
test("safe initial judgments stay in history without requiring review", () => {
  let g = answered();
  g = reduceGame(g, {
    type: "initial",
    id: "a",
    judgment: { verdict: "safe", comment: "アリ！", source: "ai" },
  });
  assert.equal(pending(g.turns[0]), false);
  g = reduceGame(g, { type: "final", id: "a", decision: "out" });
  assert.equal(losses(g, g.players[0].id), 1);
});
test("reload pauses active game", () => {
  const g = restored(newGame(["A", "B"], 8, "バナナ"));
  assert.equal(g.phase, "paused");
  assert.ok(g.remaining <= 8000);
});

test("recognition failure queues unknown without loss and keeps the last known prompt", () => {
  const g = reduceGame(initial(), {
    type: "unrecognized",
    id: "u",
    now: 2000,
    audioId: "voice",
  });
  assert.equal(g.phase, "playing");
  assert.equal(g.current, 1);
  assert.equal(g.word, "バナナ");
  assert.equal(g.turns[0].initial?.verdict, "unknown");
  assert.equal(losses(g, g.players[0].id), 0);
  assert.ok(pending(g.turns[0]));
  assert.equal(g.turns[0].audioId, "voice");
});
