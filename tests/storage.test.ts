import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { newGame, reduceGame, recoverInterrupted, losses } from "../src/game";
import {
  saveGame,
  allGames,
  patchGame,
  saveAudio,
  getAudio,
} from "../src/storage";
test("audio and metadata survive storage reload; late judgments update an archived game", async () => {
  const g = reduceGame(newGame(["A", "B"], 8, "バナナ", 1000), {
    type: "answer",
    id: "a",
    word: "宇宙船",
    audioId: "voice",
    now: 2000,
  });
  await saveGame(g);
  const blob = new Blob(["recorded bytes"], { type: "audio/webm" });
  await saveAudio("voice", blob);
  assert.equal(await (await getAudio("voice"))?.text(), "recorded bytes");
  await patchGame(g.id, {
    type: "initial",
    id: "a",
    judgment: { verdict: "explain", source: "ai", comment: "その話聞かせて" },
  });
  let saved = (await allGames()).find((s) => s.id === g.id)!;
  assert.equal(saved.turns[0].initial?.verdict, "explain");
  assert.equal(saved.turns[0].audioId, "voice");
  await patchGame(g.id, { type: "final", id: "a", decision: "out" });
  saved = (await allGames()).find((s) => s.id === g.id)!;
  assert.equal(losses(saved, saved.players[0].id), 1);
});
test("interrupted AI requests recover as unknown with review history preserved", () => {
  let g = reduceGame(newGame(["A", "B"], 8, "バナナ", 1000), {
    type: "answer",
    id: "a",
    word: "宇宙船",
    now: 2000,
  });
  g = reduceGame(g, {
    type: "explanation",
    id: "a",
    explanation: {
      id: "e",
      text: "動画を見た",
      audioId: "audio",
      createdAt: 2000,
    },
  });
  const recovered = recoverInterrupted(g);
  assert.equal(recovered.phase, "paused");
  assert.equal(recovered.turns[0].initial?.verdict, "unknown");
  assert.equal(recovered.turns[0].explanations[0].recommendation, "unknown");
  assert.equal(recovered.turns[0].explanations[0].audioId, "audio");
  assert.equal(losses(recovered, recovered.players[0].id), 0);
});
