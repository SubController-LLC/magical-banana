export type Verdict = "safe" | "explain" | "unknown";
export type Decision = "safe" | "out" | null;
export interface Judgment {
  verdict: Verdict;
  comment: string;
  source: "ai" | "unavailable";
}
export interface Explanation {
  id: string;
  text: string;
  audioId?: string;
  judgment?: Judgment;
  recommendation?: "safe" | "out" | "unknown";
  createdAt: number;
}
export interface Turn {
  id: string;
  playerId: string;
  from: string;
  to: string;
  kind: "answer" | "timeout";
  audioId?: string;
  initial?: Judgment;
  explanations: Explanation[];
  final: Decision;
  createdAt: number;
}
export interface Player {
  id: string;
  name: string;
}
export interface Game {
  id: string;
  players: Player[];
  seconds: number;
  seed: string;
  word: string;
  current: number;
  phase: "playing" | "paused" | "timeout" | "ended";
  deadline: number;
  remaining: number;
  turns: Turn[];
  createdAt: number;
}
export function newGame(
  names: string[],
  seconds: number,
  seed: string,
  now = Date.now(),
): Game {
  return {
    id: crypto.randomUUID(),
    players: names.map((name) => ({ id: crypto.randomUUID(), name })),
    seconds,
    seed,
    word: seed,
    current: 0,
    phase: "playing",
    deadline: now + seconds * 1000,
    remaining: seconds * 1000,
    turns: [],
    createdAt: now,
  };
}
export function losses(game: Game, playerId: string) {
  return game.turns.filter(
    (t) =>
      t.playerId === playerId && (t.kind === "timeout" || t.final === "out"),
  ).length;
}
export function pending(turn: Turn) {
  return (
    turn.kind === "answer" &&
    !turn.final &&
    (!turn.initial || turn.initial.verdict !== "safe")
  );
}
export type Action =
  | { type: "answer"; id: string; word: string; audioId?: string; now: number }
  | {
      type: "timeout" | "unrecognized";
      id: string;
      now: number;
      audioId?: string;
    }
  | { type: "pause"; now: number }
  | { type: "resume"; now: number }
  | { type: "end" }
  | { type: "initial"; id: string; judgment: Judgment }
  | { type: "explanation"; id: string; explanation: Explanation }
  | {
      type: "rejudge";
      id: string;
      explanationId: string;
      judgment: Judgment;
      recommendation: "safe" | "out" | "unknown";
    }
  | { type: "final"; id: string; decision: Decision };
export function reduceGame(g: Game, a: Action): Game {
  if (a.type === "pause")
    return g.phase === "playing"
      ? { ...g, phase: "paused", remaining: Math.max(0, g.deadline - a.now) }
      : g;
  if (a.type === "resume")
    return g.phase === "paused" || g.phase === "timeout"
      ? {
          ...g,
          phase: "playing",
          deadline:
            a.now + (g.phase === "timeout" ? g.seconds * 1000 : g.remaining),
        }
      : g;
  if (a.type === "end") return { ...g, phase: "ended" };
  if (
    a.type === "answer" ||
    a.type === "timeout" ||
    a.type === "unrecognized"
  ) {
    if (g.phase !== "playing") return g;
    if (a.type === "answer" && !a.word.trim()) return g;
    if (a.type === "timeout" && a.now < g.deadline) return g;
    const timeout = a.type === "timeout" || a.now >= g.deadline;
    const t: Turn = {
      id: a.id,
      playerId: g.players[g.current].id,
      from: g.word,
      to: timeout
        ? ""
        : a.type === "answer"
          ? a.word.trim()
          : "（聞き取り不明）",
      initial:
        a.type === "unrecognized"
          ? {
              verdict: "unknown",
              source: "unavailable",
              comment:
                "音声認識が不明瞭でした。あとで説明して、みんなで判定しよう！",
            }
          : undefined,
      kind: timeout ? "timeout" : "answer",
      audioId: a.audioId,
      explanations: [],
      final: null,
      createdAt: a.now,
    };
    return {
      ...g,
      turns: [...g.turns, t],
      word: timeout || a.type === "unrecognized" ? g.word : t.to,
      current: (g.current + 1) % g.players.length,
      phase: timeout ? "timeout" : "playing",
      deadline: a.now + g.seconds * 1000,
      remaining: g.seconds * 1000,
    };
  }
  return {
    ...g,
    turns: g.turns.map((t) => {
      if (t.id !== a.id || t.kind === "timeout") return t;
      if (a.type === "initial") return { ...t, initial: a.judgment };
      if (a.type === "final") return { ...t, final: a.decision };
      if (a.type === "explanation")
        return { ...t, explanations: [...t.explanations, a.explanation] };
      if (a.type === "rejudge")
        return {
          ...t,
          explanations: t.explanations.map((e) =>
            e.id === a.explanationId
              ? { ...e, judgment: a.judgment, recommendation: a.recommendation }
              : e,
          ),
        };
      return t;
    }),
  };
}
export function restored(g: Game): Game {
  return g.phase === "playing"
    ? {
        ...g,
        phase: "paused",
        remaining: Math.max(
          0,
          Math.min(g.seconds * 1000, g.deadline - Date.now()),
        ),
      }
    : g;
}

// A reload cannot resume in-flight network requests. Preserve the turn as reviewable.
export function recoverInterrupted(g: Game): Game {
  const interrupted: Judgment = {
    verdict: "unknown",
    source: "unavailable",
    comment:
      "ページの再読み込みでAI審議が中断しました。説明を保存して再審議するか、みんなで判定してください。",
  };
  return {
    ...restored(g),
    turns: g.turns.map((t) =>
      t.kind === "timeout"
        ? t
        : {
            ...t,
            initial: t.initial || interrupted,
            explanations: t.explanations.map((e) =>
              e.judgment
                ? e
                : { ...e, judgment: interrupted, recommendation: "unknown" },
            ),
          },
    ),
  };
}
