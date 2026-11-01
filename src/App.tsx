import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  Clock3,
  Flag,
  History,
  MessageCircle,
  Mic,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Square,
  Users,
  X,
} from "lucide-react";
import {
  newGame,
  reduceGame,
  restored,
  recoverInterrupted,
  losses,
  pending,
  type Game,
  type Action,
  type Turn,
  type Judgment,
} from "./game";
import { allGames, saveGame, saveAudio, getAudio, patchGame } from "./storage";
import { capture, type Capture } from "./recorder";
import { judge } from "./judge";
const labels = { safe: "セーフ", explain: "説明要求", unknown: "判定不能" };
const unavailable: Judgment = {
  verdict: "unknown",
  comment: "AI未接続。みんなの判定で決めよう！",
  source: "unavailable",
};
function Banana({ small = false }: { small?: boolean }) {
  return (
    <svg
      className={small ? "banana small" : "banana"}
      viewBox="0 0 200 200"
      aria-hidden="true"
    >
      <path
        d="M45 28c-5 76 51 129 119 91-21 72-116 75-142 8C9 92 18 56 45 28Z"
        fill="#f8d94e"
        stroke="#30372c"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path
        d="M45 28c1 58 34 98 88 97M29 129c22 28 59 31 94 13"
        fill="none"
        stroke="#b49b25"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path d="m40 30 1-15 12 3-6 16m115 85 9-7 7 9-12 7" fill="#30372c" />
      <circle cx="66" cy="111" r="4" />
      <circle cx="91" cy="122" r="4" />
      <path
        d="M68 129q7 9 15 2"
        stroke="#30372c"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
function Audio({ id, label }: { id?: string; label: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let alive = true;
    let u = "";
    if (id)
      void getAudio(id)
        .then((blob) => {
          if (blob && alive) {
            u = URL.createObjectURL(blob);
            setUrl(u);
          }
        })
        .catch(() => {});
    return () => {
      alive = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [id]);
  return id ? (
    <div className="audio">
      <span>{label}</span>
      {url ? (
        <audio controls src={url} preload="none" />
      ) : (
        <small>録音を準備中／保存されていません</small>
      )}
    </div>
  ) : null;
}
export function App() {
  const [game, setGame] = useState<Game | null>(null),
    gameRef = useRef<Game | null>(null);
  const [saved, setSaved] = useState<Game[]>([]),
    [loaded, setLoaded] = useState(false),
    [view, setView] = useState<"game" | "history">("game");
  const [names, setNames] = useState("プレイヤー1\nプレイヤー2\nプレイヤー3"),
    [seconds, setSeconds] = useState(8),
    [seed, setSeed] = useState("バナナ");
  const [word, setWord] = useState(""),
    wordRef = useRef(""),
    [now, setNow] = useState(Date.now()),
    [notice, setNotice] = useState(
      "説明できれば、セーフ。最後に決めるのはみんな！",
    );
  const [error, setError] = useState(""),
    [aiAvailable, setAiAvailable] = useState(false),
    [code, setCode] = useState(""),
    [aiEnabled, setAiEnabled] = useState(false);
  const [recording, setRecording] = useState(false),
    [starting, setStarting] = useState(false),
    [audioVersion, setAudioVersion] = useState(0);
  const recorder = useRef<Capture | null>(null),
    draftAudio = useRef<string | undefined>(undefined),
    captureEpoch = useRef(0),
    saveChain = useRef(Promise.resolve()),
    [reviewTab, setReviewTab] = useState<"pending" | "all">("pending");
  const apply = useCallback((a: Action, gameId?: string) => {
    const g = gameRef.current;
    if (!g || (gameId && g.id !== gameId)) {
      if (gameId)
        saveChain.current = saveChain.current
          .then(async () => {
            const updated = await patchGame(gameId, a);
            if (updated)
              setSaved((prev) =>
                [updated, ...prev.filter((item) => item.id !== gameId)].sort(
                  (a, b) => b.createdAt - a.createdAt,
                ),
              );
          })
          .catch(() => setError("AI判定を履歴に保存できませんでした。"));
      return;
    }
    const next = reduceGame(g, a);
    gameRef.current = next;
    setGame(next);
  }, []);
  useEffect(() => {
    void allGames()
      .then((games) => setSaved(games.map(recoverInterrupted)))
      .catch(() =>
        setError(
          "端末への保存が利用できません。プライベートブラウズや空き容量を確認してください。",
        ),
      )
      .finally(() => setLoaded(true));
    void fetch("/api/judge")
      .then((r) => r.json())
      .then((d) => setAiAvailable(d.enabled === true))
      .catch(() => {});
    return () => {
      recorder.current?.cancel();
    };
  }, []);
  useEffect(() => {
    if (!game) return;
    saveChain.current = saveChain.current
      .then(() => saveGame(game))
      .then(() =>
        setSaved((prev) =>
          [game, ...prev.filter((g) => g.id !== game.id)].sort(
            (a, b) => b.createdAt - a.createdAt,
          ),
        ),
      )
      .catch(() =>
        setError("履歴を保存できませんでした。空き容量を確認してください。"),
      );
  }, [game]);
  function updateWord(value: string) {
    wordRef.current = value;
    setWord(value);
  }
  const stopRecording = useCallback((id?: string) => {
    captureEpoch.current++;
    const rec = recorder.current;
    recorder.current = null;
    setRecording(false);
    setStarting(false);
    if (!rec) return;
    const audioId = id || crypto.randomUUID();
    if (!id) draftAudio.current = audioId;
    void rec
      .stop()
      .then(async (data) => {
        if (!data.blob.size) return;
        await saveAudio(audioId, data.blob);
        setAudioVersion((v) => v + 1);
      })
      .catch(() =>
        setError("録音の保存に失敗しました。文字の履歴は残ります。"),
      );
  }, []);
  const timeout = useCallback(() => {
    const g = gameRef.current;
    if (!g || g.phase !== "playing" || Date.now() < g.deadline) return;
    const audioId = recorder.current ? crypto.randomUUID() : draftAudio.current;
    stopRecording(audioId);
    apply({
      type: "timeout",
      id: crypto.randomUUID(),
      now: Date.now(),
      audioId,
    });
    draftAudio.current = undefined;
    wordRef.current = "";
    setWord("");
    setNotice("時間切れ！負け＋1。審議するか、次の人へ進もう。");
  }, [apply, stopRecording]);
  useEffect(() => {
    if (game?.phase !== "playing") return;
    const timer = setInterval(() => {
      setNow(Date.now());
      timeout();
    }, 80);
    return () => clearInterval(timer);
  }, [timeout, game?.phase]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden && gameRef.current?.phase === "playing") {
        if (Date.now() >= gameRef.current.deadline) timeout();
        else {
          stopRecording();
          apply({ type: "pause", now: Date.now() });
        }
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, [apply, stopRecording, timeout]);
  async function startRecording() {
    if (starting || recorder.current) return;
    const g = gameRef.current;
    if (!g || g.phase !== "playing") return;
    setStarting(true);
    const epoch = ++captureEpoch.current;
    try {
      const rec = await capture((text) => {
        if (captureEpoch.current === epoch) updateWord(text.slice(0, 80));
      }, setError);
      if (
        captureEpoch.current !== epoch ||
        gameRef.current?.phase !== "playing"
      ) {
        rec.cancel();
        return;
      }
      recorder.current = rec;
      setRecording(true);
    } catch {
      setError(
        "マイクを使えませんでした。ブラウザのマイク許可を確認するか、文字入力で続けてください。",
      );
    } finally {
      if (captureEpoch.current === epoch) setStarting(false);
    }
  }
  function unrecognized() {
    const g = gameRef.current;
    if (!g || g.phase !== "playing") return;
    if (Date.now() >= g.deadline) {
      timeout();
      return;
    }
    const audioId = recorder.current ? crypto.randomUUID() : draftAudio.current;
    stopRecording(audioId);
    apply({
      type: "unrecognized",
      id: crypto.randomUUID(),
      now: Date.now(),
      audioId,
    });
    draftAudio.current = undefined;
    updateWord("");
    setNotice("聞き取り不明の発言を審議待ちに追加。お題はそのまま、次の人へ！");
  }
  function submit() {
    const g = gameRef.current;
    const value = wordRef.current.trim();
    if (!g || g.phase !== "playing" || !value) return;
    if (Date.now() >= g.deadline) {
      timeout();
      return;
    }
    const id = crypto.randomUUID();
    const audioId = recorder.current ? crypto.randomUUID() : draftAudio.current;
    stopRecording(audioId);
    apply({ type: "answer", id, word: value, audioId, now: Date.now() });
    draftAudio.current = undefined;
    updateWord("");
    if (!aiEnabled) {
      apply({ type: "initial", id, judgment: unavailable }, g.id);
      return;
    }
    void judge(g.word, value, code).then((j) => {
      apply({ type: "initial", id, judgment: j }, g.id);
      if (gameRef.current?.id === g.id)
        setNotice(
          j.verdict === "explain"
            ? `AI審判：ちょっと待った！「${g.word} → ${value}」ってどういうこと？`
            : j.comment,
        );
    });
  }
  function start() {
    const players = names
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (players.length < 2 || players.length > 12) {
      setError("参加者は2〜12人で登録してください。");
      return;
    }
    if (players.some((n) => n.length > 20)) {
      setError("名前は20文字以内で入力してください。");
      return;
    }
    if (!seed.trim()) {
      setError("最初のお題を入力してください。");
      return;
    }
    const g = newGame(players, seconds, seed.trim());
    gameRef.current = g;
    setGame(g);
    setView("game");
    setError("");
    setNotice("準備はいい？最初の連想からスタート！");
    setNow(Date.now());
  }
  function openGame(g: Game) {
    stopRecording();
    draftAudio.current = undefined;
    updateWord("");
    const s = restored(g);
    gameRef.current = s;
    setGame(s);
    setView("game");
    setNow(Date.now());
  }
  function home() {
    stopRecording();
    gameRef.current = null;
    setGame(null);
    setView("game");
    draftAudio.current = undefined;
    updateWord("");
  }
  function pause() {
    const g = gameRef.current;
    if (g?.phase === "playing") {
      if (Date.now() >= g.deadline) {
        timeout();
        return;
      }
      stopRecording();
      apply({ type: "pause", now: Date.now() });
    }
  }
  const pendingCount = game?.turns.filter(pending).length || 0;
  const remaining = game
    ? Math.max(
        0,
        (game.phase === "playing" ? game.deadline - now : game.remaining) /
          1000,
      )
    : 0;
  return (
    <div className="shell">
      <header>
        <button
          className="brand"
          onClick={() => {
            if (game?.phase === "playing") pause();
            else home();
          }}
        >
          <Banana small />
          <span>
            マジカルバナナ<small>EXPLAIN IT. OWN IT.</small>
          </span>
        </button>
        <button
          className="navbutton"
          onClick={() => {
            pause();
            setView(view === "history" ? "game" : "history");
          }}
        >
          <History size={17} />
          あそんだ記録<span className="count">{saved.length}</span>
        </button>
      </header>
      {error && (
        <div className="error" role="alert">
          {error}
          <button aria-label="通知を閉じる" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {view === "history" ? (
        <main className="archive">
          <button className="back" onClick={() => setView("game")}>
            <ChevronLeft size={18} />
            戻る
          </button>
          <p className="eyebrow">THE AFTER PARTY</p>
          <h1>
            あの連想、
            <br />
            もう一度。
          </h1>
          <p className="muted">
            履歴と録音は、この端末・ブラウザに保存されています。
          </p>
          {saved.length === 0 ? (
            <div className="empty">
              まだ記録がありません。最初のゲームを始めよう！
            </div>
          ) : (
            saved.map((g) => (
              <button
                className="archive-item"
                key={g.id}
                onClick={() => openGame(g)}
              >
                <span>
                  <strong>{g.players.map((p) => p.name).join("・")}</strong>
                  <small>
                    {new Date(g.createdAt).toLocaleString("ja-JP")} ·{" "}
                    {g.turns.length}ターン · 審議待ち{" "}
                    {g.turns.filter(pending).length}
                  </small>
                </span>
                <ArrowUpRight />
              </button>
            ))
          )}
        </main>
      ) : !game ? (
        <main className="welcome">
          <section className="hero">
            <p className="eyebrow">
              <span className="dot" /> THE ASSOCIATION PARTY
            </p>
            <h1>
              その連想、
              <br />
              <span className="highlight">説明できたら</span>
              <br />
              アリでしょ。
            </h1>
            <p className="intro">
              正しさより、ひらめき。
              <br />
              ちょっと強引なくらいが、いちばん面白い。
            </p>
            <div className="mascot">
              <Banana />
              <div className="bubble">
                バナナ → 宇宙船？
                <br />
                <strong>その話、聞かせて！</strong>
                <Sparkles size={18} />
              </div>
              <span className="star">✳</span>
            </div>
            <div className="chips">
              <span>
                <Users size={15} />
                2〜12人
              </span>
              <span>
                <Mic size={15} />
                声でも文字でも
              </span>
              <span>
                <ShieldCheck size={15} />
                みんなが最終審判
              </span>
            </div>
          </section>
          <section className="setup card">
            <div className="section-head">
              <span className="eyebrow">LET’S PLAY</span>
              <span className="pill">スマホ1台でOK</span>
            </div>
            <h2>みんな、集まった？</h2>
            <p className="muted">順番にスマホを回して、連想をつなごう。</p>
            <label>
              参加する人 <span>1行に1人 / 2〜12人</span>
              <textarea
                value={names}
                onChange={(e) => setNames(e.target.value)}
                rows={4}
                maxLength={260}
              />
            </label>
            <div className="settings-row">
              <label>
                制限時間
                <select
                  value={seconds}
                  onChange={(e) => setSeconds(Number(e.target.value))}
                >
                  {[5, 8, 10, 15, 20].map((n) => (
                    <option key={n} value={n}>
                      {n}秒 / 人
                    </option>
                  ))}
                </select>
              </label>
              <label>
                最初のお題
                <input
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  maxLength={40}
                />
              </label>
            </div>
            <div className="ai-setting">
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={aiEnabled}
                  disabled={!aiAvailable}
                  onChange={(e) => setAiEnabled(e.target.checked)}
                />
                AI審判を呼ぶ
                <span className="pill">
                  {aiAvailable ? "接続設定済み" : "接続未設定"}
                </span>
              </label>
              {aiAvailable && aiEnabled ? (
                <label>
                  AI審判の合言葉
                  <input
                    type="password"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    autoComplete="off"
                  />
                </label>
              ) : (
                <small>みんなで「セーフ・アウト」を決めて遊べます。</small>
              )}
            </div>
            <button
              className="primary start"
              onClick={start}
              disabled={!loaded}
            >
              ゲームをはじめる
              <ArrowRight size={20} />
            </button>
            <p className="privacy">
              マイクはボタンを押すと使用します。録音は端末内に保存。文字起こしはブラウザ提供元、AI有効時は連想・説明の文字をAIサービスへ送信します。
            </p>
          </section>
          <section className="rules">
            <div>
              <span>01</span>
              <h3>つなげる</h3>
              <p>
                「バナナといったら？」
                <br />
                浮かんだ言葉を、次の人へ。
              </p>
            </div>
            <div>
              <span>02</span>
              <h3>ツッコミはあとで</h3>
              <p>
                不思議な連想もゲームは続行。
                <br />
                気になるものは審議待ちへ。
              </p>
            </div>
            <div>
              <span>03</span>
              <h3>説明できればセーフ</h3>
              <p>
                地元ネタも、面白いこじつけも。
                <br />
                みんなが納得したら、アリ！
              </p>
            </div>
          </section>
        </main>
      ) : (
        <main className="game-layout">
          <div className="game-main">
            <div className="section-head">
              <p className="eyebrow">
                {game.phase === "ended" ? "AFTER PARTY" : "NOW PLAYING"}{" "}
                <span className="divider">/</span> TURN {game.turns.length + 1}
              </p>
              <span className="pill">
                {aiEnabled ? "AI審判モード" : "参加者判定モード"}
              </span>
            </div>
            <section
              className={"play-card " + (game.phase === "ended" ? "ended" : "")}
            >
              <div className="section-head">
                <span className="player-tag">
                  <span className="avatar">{game.current + 1}</span>
                  {game.players[game.current].name} の番
                </span>
                <span className={"timer " + (remaining <= 3 ? "urgent" : "")}>
                  <Clock3 size={18} />
                  {game.phase === "ended" ? "終了" : `${remaining.toFixed(1)}s`}
                </span>
              </div>
              <div className="track">
                <div
                  style={{ width: `${(remaining / game.seconds) * 100}%` }}
                />
              </div>
              <p className="prompt">
                {game.phase === "ended"
                  ? "みんなの発想に、拍手！"
                  : "といったら…？"}
              </p>
              <h2 className="current-word">{game.word}</h2>
              {game.phase === "playing" ? (
                <>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      submit();
                    }}
                  >
                    <label className="sr-only" htmlFor="answer">
                      連想した言葉
                    </label>
                    <input
                      id="answer"
                      className="answer"
                      placeholder="連想した言葉を入力"
                      value={word}
                      maxLength={80}
                      onChange={(e) => updateWord(e.target.value)}
                      autoComplete="off"
                    />
                    <div className="answer-actions">
                      <button
                        type="button"
                        className={"mic " + (recording ? "recording" : "")}
                        disabled={starting}
                        onClick={() =>
                          recording ? stopRecording() : void startRecording()
                        }
                      >
                        {recording ? <Square size={20} /> : <Mic size={20} />}
                        <span>
                          {starting
                            ? "準備中"
                            : recording
                              ? "録音停止"
                              : "声で答える"}
                        </span>
                      </button>
                      <button
                        className="primary"
                        disabled={!word.trim() || starting}
                      >
                        つなぐ
                        <ArrowRight size={20} />
                      </button>
                    </div>
                  </form>
                  {(recording || draftAudio.current) && (
                    <button
                      className="recognition-fallback"
                      onClick={unrecognized}
                    >
                      文字起こしできない → 審議待ちで次へ
                    </button>
                  )}
                  <small className="hint">
                    {recording
                      ? "録音中。文字を確認して「つなぐ」で次の人へ。"
                      : "声で答える場合は、マイク → 発言 →「つなぐ」。"}
                  </small>
                </>
              ) : (
                <div className="pause-state">
                  <span className="pause-title">
                    {game.phase === "ended"
                      ? "おつかれさまでした！"
                      : game.phase === "timeout"
                        ? "時間切れ！負け＋1"
                        : "ちょっと、ひと休み。"}
                  </span>
                  <p>
                    {game.phase === "ended"
                      ? "審議を終えて、今日の名連想を振り返ろう。"
                      : "審議しても、先に次へ進んでもOK。"}
                  </p>
                  {game.phase !== "ended" && (
                    <button
                      className="primary"
                      onClick={() => {
                        setNow(Date.now());
                        apply({ type: "resume", now: Date.now() });
                      }}
                    >
                      <Play size={18} />
                      {game.phase === "timeout" ? "次の人へ" : "ゲームを再開"}
                    </button>
                  )}
                </div>
              )}
            </section>
            <div className="referee" role="status">
              <div className="ref-icon">
                <MessageCircle size={22} />
              </div>
              <div>
                <strong>
                  {aiEnabled ? "AI審判のひとこと" : "みんなの審判席"}
                </strong>
                <p>{notice}</p>
              </div>
              <span className="ref-star">✳</span>
            </div>
            <div className="game-controls">
              {game.phase === "playing" ? (
                <button onClick={pause}>
                  <Pause size={17} />
                  一時停止・審議
                </button>
              ) : game.phase !== "ended" ? (
                <button
                  onClick={() => {
                    stopRecording();
                    apply({ type: "end" });
                  }}
                >
                  <Flag size={17} />
                  ゲームを終了
                </button>
              ) : (
                <button onClick={home}>
                  <RotateCcw size={17} />
                  新しいゲーム
                </button>
              )}
              <span>
                審議待ち <strong>{pendingCount}</strong>件
              </span>
            </div>
            <section className="review">
              <div className="section-head">
                <div>
                  <p className="eyebrow">REVIEW ROOM</p>
                  <h2>その連想、聞かせて。</h2>
                </div>
                <span className="review-number">
                  {pendingCount.toString().padStart(2, "0")}
                </span>
              </div>
              {game.phase === "playing" ? (
                <div className="empty">
                  <MessageCircle size={24} />
                  <p>
                    今はリズムを楽しもう！
                    <br />
                    審議は一時停止・タイムアウト・終了後に。
                  </p>
                </div>
              ) : (
                <>
                  <div className="tabs">
                    <button
                      aria-pressed={reviewTab === "pending"}
                      onClick={() => setReviewTab("pending")}
                    >
                      審議待ち {pendingCount}
                    </button>
                    <button
                      aria-pressed={reviewTab === "all"}
                      onClick={() => setReviewTab("all")}
                    >
                      すべての履歴 {game.turns.length}
                    </button>
                  </div>
                  {game.turns.filter((t) => reviewTab === "all" || pending(t))
                    .length === 0 ? (
                    <div className="empty">
                      <Check size={24} />
                      <p>
                        {reviewTab === "pending"
                          ? "審議待ちはありません。ナイス連想！"
                          : "まだ連想の記録はありません。"}
                      </p>
                    </div>
                  ) : (
                    game.turns
                      .filter((t) => reviewTab === "all" || pending(t))
                      .slice()
                      .reverse()
                      .map((t) => (
                        <Review
                          key={t.id}
                          turn={t}
                          player={
                            game.players.find((p) => p.id === t.playerId)
                              ?.name || ""
                          }
                          apply={(a) => apply(a, game.id)}
                          aiEnabled={aiEnabled}
                          code={code}
                          onError={setError}
                          audioVersion={audioVersion}
                        />
                      ))
                  )}
                </>
              )}
            </section>
          </div>
          <aside>
            <div className="scoreboard card">
              <p className="eyebrow">PARTY MEMBERS</p>
              <h2>みんなのスコア</h2>
              <p className="muted">負けの数。少ないほど、いい感じ。</p>
              {game.players.map((p, i) => (
                <div
                  className={
                    "score " +
                    (i === game.current && game.phase !== "ended"
                      ? "active"
                      : "")
                  }
                  key={p.id}
                >
                  <span className="avatar">{i + 1}</span>
                  <span>
                    {p.name}
                    {i === game.current && game.phase !== "ended" && (
                      <small>いまのプレイヤー</small>
                    )}
                  </span>
                  <strong>
                    {losses(game, p.id)}
                    <small>敗</small>
                  </strong>
                </div>
              ))}
              <div className="score-note">
                <ShieldCheck size={19} />
                <p>
                  AIの「説明要求」は負けになりません。最終判定は、みんなで。
                </p>
              </div>
            </div>
            <div className="side-note">
              <Sparkles size={23} />
              <h3>ローカルネタ、大歓迎。</h3>
              <p>
                「うちの社長がさ…」
                <br />
                そんな説明が、今日の名場面になる。
              </p>
            </div>
            <Banana />
          </aside>
        </main>
      )}
      <footer>
        <span>
          MAGICAL BANANA <span className="footer-dot">●</span> GOOD VIBES, GREAT
          EXCUSES.
        </span>
        <span>説明できれば、セーフ。</span>
      </footer>
    </div>
  );
}
function Review({
  turn: t,
  player,
  apply,
  aiEnabled,
  code,
  onError,
  audioVersion,
}: {
  turn: Turn;
  player: string;
  apply: (a: Action) => void;
  aiEnabled: boolean;
  code: string;
  onError: (s: string) => void;
  audioVersion: number;
}) {
  const [open, setOpen] = useState(false),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [recording, setRecording] = useState(false),
    [starting, setStarting] = useState(false),
    [audioId, setAudioId] = useState<string | undefined>();
  const rec = useRef<Capture | null>(null),
    alive = useRef(true),
    generation = useRef(0),
    saving = useRef<Promise<void> | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
      rec.current?.cancel();
    };
  }, []);
  async function mic() {
    if (starting || saving.current) return;
    if (rec.current) {
      const r = rec.current;
      rec.current = null;
      setRecording(false);
      generation.current++;
      setStarting(true);
      saving.current = r
        .stop()
        .then(async (d) => {
          if (d.blob.size) {
            const id = crypto.randomUUID();
            await saveAudio(id, d.blob);
            if (alive.current) setAudioId(id);
          }
        })
        .catch(() => onError("説明音声を保存できませんでした。"))
        .finally(() => {
          saving.current = null;
          if (alive.current) setStarting(false);
        });
      await saving.current;
      return;
    }
    setStarting(true);
    const epoch = ++generation.current;
    try {
      const r = await capture((s) => {
        if (alive.current && generation.current === epoch)
          setText(s.slice(0, 1200));
      }, onError);
      if (!alive.current || generation.current !== epoch) {
        r.cancel();
        return;
      }
      rec.current = r;
      setRecording(true);
    } catch {
      onError("マイクを使えません。説明を文字で入力してください。");
    } finally {
      if (alive.current) setStarting(false);
    }
  }
  async function explain() {
    if (busy || recording || starting || !text.trim()) return;
    const id = crypto.randomUUID();
    const explanation = {
      id,
      text: text.trim(),
      audioId,
      createdAt: Date.now(),
    };
    apply({ type: "explanation", id: t.id, explanation });
    setText("");
    setAudioId(undefined);
    if (!aiEnabled) {
      apply({
        type: "rejudge",
        id: t.id,
        explanationId: id,
        judgment: unavailable,
        recommendation: "unknown",
      });
      setOpen(false);
      return;
    }
    setBusy(true);
    const j = await judge(t.from, t.to, code, explanation.text);
    apply({
      type: "rejudge",
      id: t.id,
      explanationId: id,
      judgment: j,
      recommendation: j.recommendation || "unknown",
    });
    if (alive.current) {
      setBusy(false);
      setOpen(false);
    }
  }
  return (
    <article className="review-card">
      <div className="section-head">
        <span className="muted">
          {player} ·{" "}
          {new Date(t.createdAt).toLocaleTimeString("ja-JP", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <span
          className={
            "pill verdict-" + (t.final || t.initial?.verdict || "unknown")
          }
        >
          {t.kind === "timeout"
            ? "タイムアウト"
            : t.final
              ? `参加者：${t.final === "safe" ? "セーフ" : "アウト"}`
              : t.initial
                ? labels[t.initial.verdict]
                : "AI判定待ち"}
        </span>
      </div>
      <h3>
        {t.from}
        <ArrowRight size={20} />
        {t.kind === "timeout" ? "時間切れ" : t.to}
      </h3>
      {t.kind === "answer" && (
        <>
          <p className="judge-comment">
            {t.initial?.comment || "AI審判に確認中。参加者は先に判定できます。"}
          </p>
          {t.initial?.verdict === "explain" && (
            <p className="question">AI審判がこの連想を疑っています！</p>
          )}
        </>
      )}
      <Audio
        key={`${t.audioId}-${audioVersion}`}
        id={t.audioId}
        label="元の発言"
      />
      {t.explanations.map((e, i) => (
        <div className="explanation" key={e.id}>
          <span className="eyebrow">EXPLANATION {i + 1}</span>
          <p>「{e.text}」</p>
          <Audio id={e.audioId} label="説明の録音" />
          {e.judgment ? (
            <p className="ai-comment">
              {e.judgment.source === "ai" ? "AIの参考意見" : "接続状況"}：
              {e.judgment.comment}
              {e.judgment.source === "ai" && (
                <small>
                  参考判定：
                  {e.recommendation === "safe"
                    ? "セーフ寄り"
                    : e.recommendation === "out"
                      ? "アウト寄り"
                      : "判定不能"}
                  。最終決定は参加者です。
                </small>
              )}
            </p>
          ) : (
            <p className="muted">参考意見を確認中…</p>
          )}
        </div>
      ))}
      {t.kind === "answer" && (
        <>
          <div className="review-actions">
            <button
              className="outline"
              onClick={() => setOpen(!open)}
              disabled={recording || starting || busy}
            >
              <Mic size={16} />
              説明する
            </button>
            <button
              className="safe"
              disabled={recording || starting}
              onClick={() =>
                apply({ type: "final", id: t.id, decision: "safe" })
              }
            >
              <Check size={16} />
              セーフにする
            </button>
            <button
              className="out"
              disabled={recording || starting}
              onClick={() =>
                apply({ type: "final", id: t.id, decision: "out" })
              }
            >
              <X size={16} />
              アウトにする
            </button>
          </div>
          {t.final && (
            <button
              className="text-button"
              onClick={() => apply({ type: "final", id: t.id, decision: null })}
            >
              判定を取り消す（負け数も再計算）
            </button>
          )}
          {open && (
            <div className="explain-form">
              <label>
                どうして、その連想になった？
                <textarea
                  rows={3}
                  maxLength={1200}
                  placeholder="例：昨日見た宇宙船の動画がバナナみたいな形だったから！"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <Audio id={audioId} label="今回の説明" />
              <div className="answer-actions">
                <button
                  className={"mic " + (recording ? "recording" : "")}
                  disabled={starting || busy}
                  onClick={() => void mic()}
                >
                  {recording ? <Square size={16} /> : <Mic size={16} />}{" "}
                  {starting
                    ? "準備・保存中"
                    : recording
                      ? "録音停止"
                      : "説明を録音"}
                </button>
                <button
                  className="primary"
                  disabled={busy || recording || starting || !text.trim()}
                  onClick={() => void explain()}
                >
                  {busy
                    ? "AI審議中…"
                    : aiEnabled
                      ? "説明を保存・AIに聞く"
                      : "説明を保存"}
                </button>
              </div>
              <small>
                文字起こしは修正できます。録音を止めてから保存してください。
              </small>
            </div>
          )}
        </>
      )}
    </article>
  );
}
