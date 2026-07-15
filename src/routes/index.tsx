import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { processes, teams, type Team } from "@/lib/processes";
import { Trophy, ArrowUp, ArrowDown, RotateCcw, Check, X, Sparkles, ChevronRight, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OIR — Order It Right" },
      { name: "description", content: "Order It Right (OIR): a team game to arrange security process steps in the correct order." },
      { property: "og:title", content: "OIR — Order It Right" },
      { property: "og:description", content: "Teams take turns arranging security process steps in the right order." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Game;
});

type Scores = Record<Team, number>;
type Phase = "playing" | "reveal" | "done";

const TOTAL_ROUNDS = 5;
const STORAGE_KEY = "oir-game-state-v3";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shuffleSteps(steps: string[]): string[] {
  let s = shuffle(steps);
  if (s.every((v, i) => v === steps[i])) s = shuffleSteps(steps);
  return s;
}

function buildQueue(): number[] {
  // Pick TOTAL_ROUNDS * teams.length unique processes from the pool
  const needed = TOTAL_ROUNDS * teams.length;
  const pool = shuffle(processes.map((_, i) => i));
  return pool.slice(0, needed);
}

function Game() {
  const [queue, setQueue] = useState<number[]>([]);
  const [turn, setTurn] = useState(0); // 0..(TOTAL_ROUNDS*teams.length - 1)
  const [phase, setPhase] = useState<Phase>("playing");
  const [scores, setScores] = useState<Scores>({ A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 });
  const [order, setOrder] = useState<string[]>([]);
  const [lastResult, setLastResult] = useState<{ points: number; correctPositions: number } | null>(null);

  // Load persisted state
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (Array.isArray(s.queue) && s.queue.length) {
          setQueue(s.queue);
          setTurn(s.turn ?? 0);
          setScores(s.scores ?? { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 });
          setOrder(s.order ?? []);
          setPhase(s.phase ?? "playing");
          return;
        }
      }
    } catch {}
    const q = buildQueue();
    setQueue(q);
    setOrder(shuffleSteps(processes[q[0]].steps));
  }, []);

  // Persist
  useEffect(() => {
    if (!queue.length) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ queue, turn, scores, order, phase }),
    );
  }, [queue, turn, scores, order, phase]);

  const totalTurns = TOTAL_ROUNDS * teams.length;
  const currentTeam: Team = teams[turn % teams.length];
  const currentRound = Math.floor(turn / teams.length) + 1;
  const currentProcess = queue.length ? processes[queue[turn]] : null;

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };

  const submit = () => {
    if (!currentProcess) return;
    const correctPositions = order.reduce((acc, s, i) => acc + (s === currentProcess.steps[i] ? 1 : 0), 0);
    const perfect = correctPositions === currentProcess.steps.length;
    const points = perfect ? correctPositions + 2 : correctPositions;
    setScores((s) => ({ ...s, [currentTeam]: s[currentTeam] + points }));
    setLastResult({ points, correctPositions });
    setPhase("reveal");
  };

  const nextTurn = () => {
    if (turn + 1 >= totalTurns) {
      setPhase("done");
      return;
    }
    const nextIdx = turn + 1;
    setTurn(nextIdx);
    setOrder(shuffleSteps(processes[queue[nextIdx]].steps));
    setLastResult(null);
    setPhase("playing");
  };

  const resetAll = () => {
    const q = buildQueue();
    setQueue(q);
    setTurn(0);
    setScores({ A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 });
    setOrder(shuffleSteps(processes[q[0]].steps));
    setLastResult(null);
    setPhase("playing");
    localStorage.removeItem(STORAGE_KEY);
  };

  const leaderboard = useMemo(
    () => (Object.entries(scores) as [Team, number][]).sort((a, b) => b[1] - a[1]),
    [scores],
  );

  if (!currentProcess) return null;

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(circle at 15% 10%, oklch(0.72 0.18 195 / 0.25), transparent 45%), radial-gradient(circle at 85% 80%, oklch(0.68 0.22 320 / 0.25), transparent 50%)",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <Header
          round={Math.min(currentRound, TOTAL_ROUNDS)}
          totalRounds={TOTAL_ROUNDS}
          turn={turn}
          totalTurns={totalTurns}
          onReset={resetAll}
        />

        <div className="grid lg:grid-cols-[1fr_320px] gap-6 mt-8">
          <div className="min-h-[520px]">
            {phase === "playing" && (
              <PlayCard
                team={currentTeam}
                round={currentRound}
                totalRounds={TOTAL_ROUNDS}
                process={currentProcess}
                order={order}
                onMove={move}
                onSubmit={submit}
                onShuffle={() => setOrder(shuffleSteps(currentProcess.steps))}
              />
            )}
            {phase === "reveal" && lastResult && (
              <RevealCard
                team={currentTeam}
                process={currentProcess}
                userOrder={order}
                result={lastResult}
                isLast={turn + 1 >= totalTurns}
                onNext={nextTurn}
              />
            )}
            {phase === "done" && <FinalCard leaderboard={leaderboard} onReset={resetAll} />}
          </div>

          <Leaderboard
            leaderboard={leaderboard}
            currentTeam={phase === "playing" ? currentTeam : null}
            upNext={phase === "reveal" && turn + 1 < totalTurns ? teams[(turn + 1) % teams.length] : null}
          />
        </div>
      </div>
    </div>
  );
}

function Header({
  round,
  totalRounds,
  turn,
  totalTurns,
  onReset,
}: {
  round: number;
  totalRounds: number;
  turn: number;
  totalTurns: number;
  onReset: () => void;
}) {
  const pct = Math.min(100, (turn / totalTurns) * 100);
  return (
    <header>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-xl grid place-items-center shadow-lg"
            style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}
          >
            <ListOrdered className="w-6 h-6 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <div>
            <h1
              className="text-2xl sm:text-3xl font-bold tracking-tight bg-clip-text text-transparent"
              style={{ backgroundImage: "var(--gradient-hero)" }}
            >
              OIR — Order It Right
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Round {round} of {totalRounds} · teams take turns in order
            </p>
          </div>
        </div>
        <button
          onClick={onReset}
          className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-border bg-card/60 hover:bg-card transition"
        >
          <RotateCcw className="w-4 h-4" /> Reset game
        </button>
      </div>

      <div className="mt-6">
        <div className="flex justify-between text-xs text-muted-foreground mb-2">
          <span>
            Turn {Math.min(turn + 1, totalTurns)} / {totalTurns}
          </span>
          <span>{Math.round(pct)}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${pct}%`, background: "var(--gradient-hero)" }}
          />
        </div>
      </div>
    </header>
  );
}

function PlayCard({
  team,
  round,
  totalRounds,
  process,
  order,
  onMove,
  onSubmit,
  onShuffle,
}: {
  team: Team;
  round: number;
  totalRounds: number;
  process: { title: string; steps: string[] };
  order: string[];
  onMove: (i: number, dir: -1 | 1) => void;
  onSubmit: () => void;
  onShuffle: () => void;
}) {
  return (
    <div
      className="rounded-2xl p-6 sm:p-8 border border-border shadow-2xl"
      style={{ background: "var(--gradient-card)" }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary font-semibold">
            <Sparkles className="w-4 h-4" /> Round {round} of {totalRounds} · Team {team}
          </div>
          <h2 className="mt-2 text-2xl sm:text-3xl font-bold leading-tight">{process.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Reorder the {process.steps.length} steps from first to last, then lock it in.
          </p>
        </div>
        <div
          className="w-16 h-16 rounded-2xl grid place-items-center text-3xl font-black shadow-lg shrink-0"
          style={{
            background: "var(--gradient-hero)",
            color: "var(--primary-foreground)",
            boxShadow: "var(--shadow-glow)",
          }}
        >
          {team}
        </div>
      </div>

      <ol className="mt-6 space-y-2">
        {order.map((step, i) => (
          <li
            key={step}
            className="flex items-center gap-3 p-3 sm:p-4 rounded-xl border border-border bg-card hover:border-primary/60 transition-all"
          >
            <div
              className="w-9 h-9 shrink-0 rounded-lg grid place-items-center font-bold text-sm"
              style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
            >
              {i + 1}
            </div>
            <div className="flex-1 font-medium">{step}</div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onMove(i, -1)}
                disabled={i === 0}
                aria-label="Move up"
                className="w-9 h-9 rounded-lg grid place-items-center border border-border bg-background/50 hover:bg-accent hover:text-accent-foreground disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
              <button
                onClick={() => onMove(i, 1)}
                disabled={i === order.length - 1}
                aria-label="Move down"
                className="w-9 h-9 rounded-lg grid place-items-center border border-border bg-background/50 hover:bg-accent hover:text-accent-foreground disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <ArrowDown className="w-4 h-4" />
              </button>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6 flex items-center gap-3 flex-wrap">
        <button
          onClick={onSubmit}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-semibold shadow-lg transition-transform hover:scale-[1.02]"
          style={{
            background: "var(--gradient-hero)",
            color: "var(--primary-foreground)",
            boxShadow: "var(--shadow-glow)",
          }}
        >
          Lock in answer <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={onShuffle}
          className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-border bg-card/60 hover:bg-card font-medium transition"
        >
          <RotateCcw className="w-4 h-4" /> Reshuffle
        </button>
        <div className="ml-auto text-xs text-muted-foreground">
          Scoring: 1 pt per correct position · +2 bonus for a perfect run
        </div>
      </div>
    </div>
  );
}

function RevealCard({
  team,
  process,
  userOrder,
  result,
  isLast,
  onNext,
}: {
  team: Team;
  process: { title: string; steps: string[] };
  userOrder: string[];
  result: { points: number; correctPositions: number };
  isLast: boolean;
  onNext: () => void;
}) {
  const perfect = userOrder.every((s, i) => s === process.steps[i]);
  return (
    <div
      className="rounded-2xl p-6 sm:p-8 border border-border shadow-2xl"
      style={{ background: "var(--gradient-card)" }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div
            className="text-xs uppercase tracking-widest font-semibold"
            style={{ color: perfect ? "var(--success)" : "var(--accent)" }}
          >
            {perfect ? "Perfect order!" : "Results"}
          </div>
          <h2 className="mt-1 text-2xl sm:text-3xl font-bold">{process.title}</h2>
          <p className="mt-1 text-muted-foreground">
            Team <span className="text-foreground font-semibold">{team}</span> got{" "}
            <span className="text-foreground font-semibold">
              {result.correctPositions}/{process.steps.length}
            </span>{" "}
            in place · earned <span className="text-foreground font-semibold">+{result.points}</span> pts
          </p>
        </div>
        <div
          className="w-16 h-16 rounded-2xl grid place-items-center text-3xl font-black shadow-lg shrink-0"
          style={{
            background: perfect
              ? "linear-gradient(135deg, var(--success), var(--primary-glow))"
              : "var(--gradient-hero)",
            color: "var(--primary-foreground)",
          }}
        >
          {team}
        </div>
      </div>

      <div className="mt-6 grid sm:grid-cols-2 gap-4">
        <Column title="Team answer" items={userOrder} correctItems={process.steps} showCheck />
        <Column title="Correct order" items={process.steps} accent />
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={onNext}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-semibold shadow-lg transition-transform hover:scale-[1.02]"
          style={{
            background: "var(--gradient-hero)",
            color: "var(--primary-foreground)",
            boxShadow: "var(--shadow-glow)",
          }}
        >
          {isLast ? "See final results" : "Next team"} <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function Column({
  title,
  items,
  correctItems,
  showCheck,
  accent,
}: {
  title: string;
  items: string[];
  correctItems?: string[];
  showCheck?: boolean;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{title}</div>
      <ol className="space-y-2">
        {items.map((step, i) => {
          const ok = correctItems ? correctItems[i] === step : true;
          return (
            <li
              key={`${title}-${i}`}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border",
                accent
                  ? "border-primary/40 bg-primary/5"
                  : showCheck
                    ? ok
                      ? "border-[color:var(--success)]/40 bg-[color:var(--success)]/5"
                      : "border-destructive/40 bg-destructive/5"
                    : "border-border bg-card",
              )}
            >
              <span className="w-7 h-7 shrink-0 rounded-md grid place-items-center text-xs font-bold bg-background/60 border border-border">
                {i + 1}
              </span>
              <span className="flex-1 text-sm font-medium">{step}</span>
              {showCheck &&
                (ok ? (
                  <Check className="w-4 h-4 text-[color:var(--success)]" />
                ) : (
                  <X className="w-4 h-4 text-destructive" />
                ))}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Leaderboard({
  leaderboard,
  currentTeam,
  upNext,
}: {
  leaderboard: [Team, number][];
  currentTeam: Team | null;
  upNext: Team | null;
}) {
  const max = Math.max(1, ...leaderboard.map(([, s]) => s));
  return (
    <aside
      className="rounded-2xl p-5 border border-border shadow-xl h-fit sticky top-6"
      style={{ background: "var(--gradient-card)" }}
    >
      <div className="flex items-center gap-2">
        <Trophy className="w-5 h-5 text-primary" />
        <h3 className="font-semibold tracking-tight">Leaderboard</h3>
      </div>
      <ul className="mt-4 space-y-3">
        {leaderboard.map(([team, score], i) => {
          const isCurrent = currentTeam === team;
          const isNext = upNext === team;
          return (
            <li key={team}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "w-7 h-7 grid place-items-center rounded-md text-xs font-bold",
                      i === 0 || isCurrent ? "text-primary-foreground" : "bg-muted text-foreground",
                    )}
                    style={i === 0 || isCurrent ? { background: "var(--gradient-hero)" } : {}}
                  >
                    {team}
                  </span>
                  <span className="text-xs text-muted-foreground">#{i + 1}</span>
                  {isCurrent && (
                    <span className="text-[10px] uppercase tracking-widest text-primary font-semibold">
                      playing
                    </span>
                  )}
                  {isNext && !isCurrent && (
                    <span className="text-[10px] uppercase tracking-widest text-accent font-semibold">
                      up next
                    </span>
                  )}
                </div>
                <span className="font-bold tabular-nums">{score}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${(score / max) * 100}%`,
                    background: i === 0 ? "var(--gradient-hero)" : "var(--muted-foreground)",
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 pt-4 border-t border-border text-xs text-muted-foreground">
        Turn order: {teams.join(" → ")}
      </div>
    </aside>
  );
}

function FinalCard({
  leaderboard,
  onReset,
}: {
  leaderboard: [Team, number][];
  onReset: () => void;
}) {
  const [winTeam, winScore] = leaderboard[0];
  return (
    <div
      className="rounded-2xl p-8 border border-border shadow-2xl text-center"
      style={{ background: "var(--gradient-card)" }}
    >
      <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-primary font-semibold">
        <Trophy className="w-4 h-4" /> Game complete
      </div>
      <h2 className="mt-4 text-5xl font-black tracking-tight">Team {winTeam} wins!</h2>
      <p className="mt-2 text-muted-foreground">
        Final score: {winScore} points across {TOTAL_ROUNDS} rounds.
      </p>

      <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-lg mx-auto">
        {leaderboard.map(([t, s], i) => (
          <div key={t} className="rounded-xl border border-border bg-card/60 p-4">
            <div className="text-xs text-muted-foreground">#{i + 1}</div>
            <div className="text-2xl font-bold">Team {t}</div>
            <div className="text-primary font-semibold">{s} pts</div>
          </div>
        ))}
      </div>

      <button
        onClick={onReset}
        className="mt-8 inline-flex items-center gap-2 px-5 py-3 rounded-xl font-semibold shadow-lg transition-transform hover:scale-[1.02]"
        style={{
          background: "var(--gradient-hero)",
          color: "var(--primary-foreground)",
          boxShadow: "var(--shadow-glow)",
        }}
      >
        <RotateCcw className="w-4 h-4" /> Play again
      </button>
    </div>
  );
}
