import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { processes, teams, type Team } from "@/lib/processes";
import { Shield, Trophy, ArrowUp, ArrowDown, RotateCcw, Check, X, Sparkles, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Order Up! — Security Process Ordering Game" },
      { name: "description", content: "A team-based game to master the correct order of security and IAM processes." },
      { property: "og:title", content: "Order Up! — Security Process Ordering Game" },
      { property: "og:description", content: "Race your team to arrange security process steps in the right order." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Game,
});

type Scores = Record<Team, number>;
type Phase = "setup" | "playing" | "reveal" | "done";

const STORAGE_KEY = "order-game-state-v1";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  // Ensure it's not already sorted
  if (a.every((v, i) => v === arr[i])) return shuffle(arr);
  return a;
}

function Game() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [currentTeam, setCurrentTeam] = useState<Team>("A");
  const [roundIndex, setRoundIndex] = useState(0);
  const [scores, setScores] = useState<Scores>({ A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 });
  const [order, setOrder] = useState<string[]>([]);
  const [lastResult, setLastResult] = useState<{ correct: number; total: number } | null>(null);

  // Load persisted state
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.scores) setScores(s.scores);
        if (typeof s.roundIndex === "number") setRoundIndex(s.roundIndex);
        if (s.currentTeam) setCurrentTeam(s.currentTeam);
      }
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ scores, roundIndex, currentTeam }));
  }, [scores, roundIndex, currentTeam]);

  const current = processes[roundIndex];
  const totalRounds = processes.length;

  const startRound = (team: Team) => {
    setCurrentTeam(team);
    setOrder(shuffle(current.steps));
    setLastResult(null);
    setPhase("playing");
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };

  const submit = () => {
    const correct = order.reduce((acc, s, i) => acc + (s === current.steps[i] ? 1 : 0), 0);
    const perfect = correct === current.steps.length;
    const points = perfect ? 5 : correct; // 1 per correct position, +bonus implicit
    setScores((s) => ({ ...s, [currentTeam]: s[currentTeam] + points }));
    setLastResult({ correct: points, total: current.steps.length });
    setPhase("reveal");
  };

  const nextRound = () => {
    if (roundIndex + 1 >= totalRounds) {
      setPhase("done");
      return;
    }
    setRoundIndex(roundIndex + 1);
    setPhase("setup");
    setOrder([]);
    setLastResult(null);
  };

  const resetAll = () => {
    setScores({ A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 });
    setRoundIndex(0);
    setPhase("setup");
    setOrder([]);
    setLastResult(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const leaderboard = useMemo(
    () => (Object.entries(scores) as [Team, number][]).sort((a, b) => b[1] - a[1]),
    [scores],
  );

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      {/* Ambient background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(circle at 15% 10%, oklch(0.72 0.18 195 / 0.25), transparent 45%), radial-gradient(circle at 85% 80%, oklch(0.68 0.22 320 / 0.25), transparent 50%)",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <Header roundIndex={roundIndex} totalRounds={totalRounds} onReset={resetAll} />

        <div className="grid lg:grid-cols-[1fr_320px] gap-6 mt-8">
          <div className="min-h-[520px]">
            {phase === "setup" && (
              <SetupCard
                process={current}
                roundIndex={roundIndex}
                totalRounds={totalRounds}
                onStart={startRound}
              />
            )}
            {phase === "playing" && (
              <PlayCard
                team={currentTeam}
                process={current}
                order={order}
                onMove={move}
                onSubmit={submit}
                onShuffle={() => setOrder(shuffle(current.steps))}
              />
            )}
            {phase === "reveal" && lastResult && (
              <RevealCard
                team={currentTeam}
                process={current}
                userOrder={order}
                result={lastResult}
                isLast={roundIndex + 1 >= totalRounds}
                onNext={nextRound}
              />
            )}
            {phase === "done" && <FinalCard leaderboard={leaderboard} onReset={resetAll} />}
          </div>

          <Leaderboard leaderboard={leaderboard} currentTeam={phase === "playing" ? currentTeam : null} />
        </div>
      </div>
    </div>
  );
}

function Header({ roundIndex, totalRounds, onReset }: { roundIndex: number; totalRounds: number; onReset: () => void }) {
  const pct = Math.min(100, (roundIndex / totalRounds) * 100);
  return (
    <header>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl grid place-items-center shadow-lg"
            style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}
          >
            <Shield className="w-6 h-6 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <div>
            <h1
              className="text-2xl sm:text-3xl font-bold tracking-tight bg-clip-text text-transparent"
              style={{ backgroundImage: "var(--gradient-hero)" }}
            >
              Order Up!
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Security process ordering — team edition</p>
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
          <span>Round {Math.min(roundIndex + 1, totalRounds)} / {totalRounds}</span>
          <span>{Math.round(pct)}% complete</span>
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

function SetupCard({
  process,
  roundIndex,
  totalRounds,
  onStart,
}: {
  process: { title: string; steps: string[] };
  roundIndex: number;
  totalRounds: number;
  onStart: (t: Team) => void;
}) {
  return (
    <div
      className="rounded-2xl p-6 sm:p-8 border border-border shadow-2xl"
      style={{ background: "var(--gradient-card)" }}
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary font-semibold">
        <Sparkles className="w-4 h-4" /> Round {roundIndex + 1} of {totalRounds}
      </div>
      <h2 className="mt-3 text-3xl sm:text-4xl font-bold leading-tight">{process.title}</h2>
      <p className="mt-3 text-muted-foreground">
        Pick the team playing this round. They'll see the {process.steps.length} steps in random order and must arrange them correctly.
      </p>

      <div className="mt-6">
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Choose team</div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {teams.map((t) => (
            <button
              key={t}
              onClick={() => onStart(t)}
              className="group relative aspect-square rounded-xl border border-border bg-card hover:border-primary transition-all overflow-hidden"
            >
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "var(--gradient-hero)" }}
              />
              <div className="relative h-full grid place-items-center">
                <span className="text-3xl font-black tracking-tight group-hover:text-primary-foreground transition-colors">
                  {t}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 text-xs text-muted-foreground">
        Scoring: <span className="text-foreground font-semibold">1 point</span> per step in the correct position ·{" "}
        <span className="text-foreground font-semibold">+bonus</span> for a perfect 5/5.
      </div>
    </div>
  );
}

function PlayCard({
  team,
  process,
  order,
  onMove,
  onSubmit,
  onShuffle,
}: {
  team: Team;
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
          <div className="text-xs uppercase tracking-widest text-primary font-semibold">Now playing</div>
          <h2 className="mt-1 text-2xl sm:text-3xl font-bold">{process.title}</h2>
        </div>
        <div
          className="w-14 h-14 rounded-xl grid place-items-center text-2xl font-black shadow-lg"
          style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)", boxShadow: "var(--shadow-glow)" }}
        >
          {team}
        </div>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">Reorder the steps from first to last, then submit.</p>

      <ol className="mt-6 space-y-2">
        {order.map((step, i) => (
          <li
            key={step}
            className="flex items-center gap-3 p-3 sm:p-4 rounded-xl border border-border bg-card hover:border-primary/60 transition-all group"
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
          style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)", boxShadow: "var(--shadow-glow)" }}
        >
          Lock in answer <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={onShuffle}
          className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-border bg-card/60 hover:bg-card font-medium transition"
        >
          <RotateCcw className="w-4 h-4" /> Reshuffle
        </button>
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
  result: { correct: number; total: number };
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
          <div className="text-xs uppercase tracking-widest font-semibold" style={{ color: perfect ? "var(--success)" : "var(--accent)" }}>
            {perfect ? "Perfect order!" : "Results"}
          </div>
          <h2 className="mt-1 text-2xl sm:text-3xl font-bold">{process.title}</h2>
          <p className="mt-1 text-muted-foreground">
            Team <span className="text-foreground font-semibold">{team}</span> earned{" "}
            <span className="text-foreground font-semibold">+{result.correct}</span> points
            {perfect && " (5 correct + bonus)"}
          </p>
        </div>
        <div
          className="w-14 h-14 rounded-xl grid place-items-center text-2xl font-black shadow-lg"
          style={{
            background: perfect ? "linear-gradient(135deg, var(--success), var(--primary-glow))" : "var(--gradient-hero)",
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
          style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)", boxShadow: "var(--shadow-glow)" }}
        >
          {isLast ? "See final results" : "Next round"} <ChevronRight className="w-4 h-4" />
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
              {showCheck && (ok ? <Check className="w-4 h-4 text-[color:var(--success)]" /> : <X className="w-4 h-4 text-destructive" />)}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Leaderboard({ leaderboard, currentTeam }: { leaderboard: [Team, number][]; currentTeam: Team | null }) {
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
        {leaderboard.map(([team, score], i) => (
          <li key={team}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "w-7 h-7 grid place-items-center rounded-md text-xs font-bold",
                    i === 0 ? "text-primary-foreground" : "bg-muted text-foreground",
                  )}
                  style={i === 0 ? { background: "var(--gradient-hero)" } : {}}
                >
                  {team}
                </span>
                <span className="text-xs text-muted-foreground">#{i + 1}</span>
                {currentTeam === team && (
                  <span className="text-[10px] uppercase tracking-widest text-accent font-semibold">playing</span>
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
        ))}
      </ul>
    </aside>
  );
}

function FinalCard({ leaderboard, onReset }: { leaderboard: [Team, number][]; onReset: () => void }) {
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
      <p className="mt-2 text-muted-foreground">Final score: {winScore} points across {processes.length} rounds.</p>

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
        style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)", boxShadow: "var(--shadow-glow)" }}
      >
        <RotateCcw className="w-4 h-4" /> Play again
      </button>
    </div>
  );
}
