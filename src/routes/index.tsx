import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { processes, teams, type Team } from "@/lib/processes";
import {
  Trophy,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Check,
  X,
  Sparkles,
  ChevronRight,
  ListOrdered,
  Timer,
  Play,
  Shuffle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OIR — Order It Right" },
      { name: "description", content: "Order It Right (OIR): a team game where teams pick a security process and arrange the steps in the correct order." },
      { property: "og:title", content: "OIR — Order It Right" },
      { property: "og:description", content: "Teams pick a topic and race to arrange security process steps in the right order." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Game,
});

type Scores = Record<Team, number>;
type Phase = "idle" | "choosing" | "playing" | "reveal" | "done";

const TOTAL_ROUNDS = 5;
const TURN_SECONDS = 60;
const CHOICES_PER_TURN = 4;
const PERFECT_POINTS = 10;
const STORAGE_KEY = "oir-game-state-v4";

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

function pickChoices(used: number[]): number[] {
  const remaining = processes
    .map((_, i) => i)
    .filter((i) => !used.includes(i));
  return shuffle(remaining).slice(0, Math.min(CHOICES_PER_TURN, remaining.length));
}

function Game() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [turn, setTurn] = useState(0);
  const [scores, setScores] = useState<Scores>({ A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 });
  const [used, setUsed] = useState<number[]>([]);
  const [choices, setChoices] = useState<number[]>([]);
  const [currentIdx, setCurrentIdx] = useState<number | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [lastResult, setLastResult] = useState<{ perfect: boolean; correctPositions: number; timedOut: boolean } | null>(null);
  const [timeLeft, setTimeLeft] = useState(TURN_SECONDS);

  // Load persisted
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        setPhase(s.phase ?? "idle");
        setTurn(s.turn ?? 0);
        setScores(s.scores ?? { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 });
        setUsed(s.used ?? []);
        setChoices(s.choices ?? []);
        setCurrentIdx(s.currentIdx ?? null);
        setOrder(s.order ?? []);
      }
    } catch {}
  }, []);

  // Persist
  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ phase, turn, scores, used, choices, currentIdx, order }),
    );
  }, [phase, turn, scores, used, choices, currentIdx, order]);

  const totalTurns = TOTAL_ROUNDS * teams.length;
  const currentTeam: Team = teams[turn % teams.length];
  const currentRound = Math.floor(turn / teams.length) + 1;
  const currentProcess = currentIdx != null ? processes[currentIdx] : null;

  const startGame = () => {
    setScores({ A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 });
    setTurn(0);
    setUsed([]);
    setChoices(pickChoices([]));
    setCurrentIdx(null);
    setOrder([]);
    setLastResult(null);
    setPhase("choosing");
  };

  const chooseTopic = (idx: number) => {
    setCurrentIdx(idx);
    setOrder(shuffleSteps(processes[idx].steps));
    setTimeLeft(TURN_SECONDS);
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

  const submit = (timedOut = false) => {
    if (!currentProcess) return;
    const correctPositions = order.reduce(
      (acc, s, i) => acc + (s === currentProcess.steps[i] ? 1 : 0),
      0,
    );
    const perfect = correctPositions === currentProcess.steps.length;
    const points = perfect ? PERFECT_POINTS : 0;
    setScores((s) => ({ ...s, [currentTeam]: s[currentTeam] + points }));
    setLastResult({ perfect, correctPositions, timedOut });
    setPhase("reveal");
  };

  const nextTurn = () => {
    if (currentIdx != null) {
      const newUsed = [...used, currentIdx];
      setUsed(newUsed);
      if (turn + 1 >= totalTurns) {
        setCurrentIdx(null);
        setPhase("done");
        return;
      }
      setTurn(turn + 1);
      setCurrentIdx(null);
      setOrder([]);
      setLastResult(null);
      setChoices(pickChoices(newUsed));
      setPhase("choosing");
    }
  };

  // Timer
  useEffect(() => {
    if (phase !== "playing") return;
    if (timeLeft <= 0) {
      submit(true);
      return;
    }
    const id = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timeLeft]);

  const resetAll = () => {
    localStorage.removeItem(STORAGE_KEY);
    setPhase("idle");
    setTurn(0);
    setScores({ A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 });
    setUsed([]);
    setChoices([]);
    setCurrentIdx(null);
    setOrder([]);
    setLastResult(null);
  };

  const leaderboard = useMemo(
    () => (Object.entries(scores) as [Team, number][]).sort((a, b) => b[1] - a[1]),
    [scores],
  );

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
          showProgress={phase !== "idle"}
        />

        {phase === "idle" ? (
          <StartScreen onStart={startGame} />
        ) : (
          <div className="grid lg:grid-cols-[1fr_320px] gap-6 mt-8">
            <div className="min-h-[520px]">
              {phase === "choosing" && (
                <ChoiceCard
                  team={currentTeam}
                  round={currentRound}
                  totalRounds={TOTAL_ROUNDS}
                  choices={choices}
                  onPick={chooseTopic}
                  onReshuffle={() => setChoices(pickChoices(used))}
                />
              )}
              {phase === "playing" && currentProcess && (
                <PlayCard
                  team={currentTeam}
                  round={currentRound}
                  totalRounds={TOTAL_ROUNDS}
                  process={currentProcess}
                  order={order}
                  onMove={move}
                  onSubmit={() => submit(false)}
                  onShuffle={() => setOrder(shuffleSteps(currentProcess.steps))}
                  timeLeft={timeLeft}
                  totalTime={TURN_SECONDS}
                />
              )}
              {phase === "reveal" && currentProcess && lastResult && (
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
              currentTeam={phase === "choosing" || phase === "playing" ? currentTeam : null}
              upNext={phase === "reveal" && turn + 1 < totalTurns ? teams[(turn + 1) % teams.length] : null}
            />
          </div>
        )}
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
  showProgress,
}: {
  round: number;
  totalRounds: number;
  turn: number;
  totalTurns: number;
  onReset: () => void;
  showProgress: boolean;
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
              Round {round} of {totalRounds} · teams pick a topic then order the steps
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

      {showProgress && (
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
      )}
    </header>
  );
}

function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <div
      className="mt-10 rounded-2xl p-8 sm:p-12 border border-border shadow-2xl text-center"
      style={{ background: "var(--gradient-card)" }}
    >
      <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-primary font-semibold">
        <Sparkles className="w-4 h-4" /> Ready to play
      </div>
      <h2
        className="mt-4 text-4xl sm:text-6xl font-black tracking-tight bg-clip-text text-transparent"
        style={{ backgroundImage: "var(--gradient-hero)" }}
      >
        Order It Right
      </h2>
      <p className="mt-4 max-w-2xl mx-auto text-muted-foreground">
        Six teams · {TOTAL_ROUNDS} rounds. Each turn the team picks a security topic from the
        board, then arranges the {5} steps in the correct order before the timer runs out.
        Full marks only for a perfect order.
      </p>

      <div className="mt-8 grid sm:grid-cols-3 gap-3 max-w-2xl mx-auto text-left">
        <Rule icon={<Sparkles className="w-4 h-4" />} title="Team picks the topic" body={`${CHOICES_PER_TURN} options on the board each turn.`} />
        <Rule icon={<Timer className="w-4 h-4" />} title={`${TURN_SECONDS}s timer`} body="Lock in the order before it hits zero." />
        <Rule icon={<Trophy className="w-4 h-4" />} title={`${PERFECT_POINTS} pts for perfect`} body="Any mistake = 0 for that turn." />
      </div>

      <button
        onClick={onStart}
        className="mt-10 inline-flex items-center gap-3 px-8 py-4 rounded-2xl text-lg font-semibold shadow-lg transition-transform hover:scale-[1.03]"
        style={{
          background: "var(--gradient-hero)",
          color: "var(--primary-foreground)",
          boxShadow: "var(--shadow-glow)",
        }}
      >
        <Play className="w-5 h-5" fill="currentColor" /> Start game
      </button>
      <p className="mt-4 text-xs text-muted-foreground">
        Turn order: {teams.join(" → ")}
      </p>
    </div>
  );
}

function Rule({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="flex items-center gap-2 text-primary font-semibold text-sm">
        {icon} {title}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{body}</div>
    </div>
  );
}

function ChoiceCard({
  team,
  round,
  totalRounds,
  choices,
  onPick,
  onReshuffle,
}: {
  team: Team;
  round: number;
  totalRounds: number;
  choices: number[];
  onPick: (idx: number) => void;
  onReshuffle: () => void;
}) {
  return (
    <div
      className="rounded-2xl p-6 sm:p-8 border border-border shadow-2xl"
      style={{ background: "var(--gradient-card)" }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary font-semibold">
            <Sparkles className="w-4 h-4" /> Round {round} of {totalRounds}
          </div>
          <h2 className="mt-2 text-2xl sm:text-3xl font-bold leading-tight">
            Team {team}, pick your topic
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The team calls out an option — the host taps it to reveal the steps.
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

      <div className="mt-6 grid sm:grid-cols-2 gap-3">
        {choices.map((idx, i) => (
          <button
            key={idx}
            onClick={() => onPick(idx)}
            className="group text-left p-5 rounded-xl border border-border bg-card hover:border-primary transition-all hover:shadow-lg hover:scale-[1.02]"
          >
            <div className="flex items-center gap-4 py-4">
              <div
                className="w-16 h-16 rounded-xl grid place-items-center font-black text-3xl shrink-0"
                style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
              >
                {String.fromCharCode(65 + i)}
              </div>
              <div className="flex-1">
                <div className="font-semibold leading-snug text-lg">Mystery Box {String.fromCharCode(65 + i)}</div>
                <div className="text-xs text-muted-foreground mt-1">Pick blindly — reveal on selection</div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition" />
            </div>
          </button>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between flex-wrap gap-3">
        <button
          onClick={onReshuffle}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card/60 hover:bg-card text-sm font-medium transition"
        >
          <Shuffle className="w-4 h-4" /> Shuffle options
        </button>
        <div className="text-xs text-muted-foreground">
          {PERFECT_POINTS} pts if every step is in the correct place · 0 otherwise
        </div>
      </div>
    </div>
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
  timeLeft,
  totalTime,
}: {
  team: Team;
  round: number;
  totalRounds: number;
  process: { title: string; steps: string[] };
  order: string[];
  onMove: (i: number, dir: -1 | 1) => void;
  onSubmit: () => void;
  onShuffle: () => void;
  timeLeft: number;
  totalTime: number;
}) {
  const pct = Math.max(0, Math.min(100, (timeLeft / totalTime) * 100));
  const urgent = timeLeft <= 10;
  const timerColor = urgent ? "var(--destructive)" : "var(--primary)";
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
            Arrange all {process.steps.length} steps in the exact correct order.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-xl border font-mono font-bold tabular-nums text-lg transition",
              urgent ? "animate-pulse" : "",
            )}
            style={{
              borderColor: timerColor,
              color: timerColor,
              background: urgent ? "oklch(0.65 0.24 25 / 0.1)" : "oklch(0.72 0.18 195 / 0.08)",
            }}
            aria-label={`Time left ${timeLeft} seconds`}
          >
            <Timer className="w-4 h-4" />
            {String(Math.floor(timeLeft / 60)).padStart(1, "0")}:{String(timeLeft % 60).padStart(2, "0")}
          </div>
          <div
            className="w-16 h-16 rounded-2xl grid place-items-center text-3xl font-black shadow-lg"
            style={{
              background: "var(--gradient-hero)",
              color: "var(--primary-foreground)",
              boxShadow: "var(--shadow-glow)",
            }}
          >
            {team}
          </div>
        </div>
      </div>

      <div className="mt-4 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full transition-all duration-1000 ease-linear"
          style={{
            width: `${pct}%`,
            background: urgent
              ? "linear-gradient(90deg, var(--destructive), oklch(0.78 0.16 60))"
              : "var(--gradient-hero)",
          }}
        />
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
          {PERFECT_POINTS} pts only if every step is in the correct place
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
  result: { perfect: boolean; correctPositions: number; timedOut: boolean };
  isLast: boolean;
  onNext: () => void;
}) {
  const label = result.perfect
    ? "Perfect order!"
    : result.timedOut
      ? "Time's up!"
      : "Not quite";
  const labelColor = result.perfect
    ? "var(--success)"
    : result.timedOut
      ? "var(--destructive)"
      : "var(--accent)";
  const pointsAwarded = result.perfect ? PERFECT_POINTS : 0;
  return (
    <div
      className="rounded-2xl p-6 sm:p-8 border border-border shadow-2xl"
      style={{ background: "var(--gradient-card)" }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div
            className="text-xs uppercase tracking-widest font-semibold"
            style={{ color: labelColor }}
          >
            {label}
          </div>
          <h2 className="mt-1 text-2xl sm:text-3xl font-bold">{process.title}</h2>
          <p className="mt-1 text-muted-foreground">
            Team <span className="text-foreground font-semibold">{team}</span> placed{" "}
            <span className="text-foreground font-semibold">
              {result.correctPositions}/{process.steps.length}
            </span>{" "}
            correctly · earned{" "}
            <span
              className="font-bold"
              style={{ color: result.perfect ? "var(--success)" : "var(--destructive)" }}
            >
              +{pointsAwarded}
            </span>{" "}
            pts
          </p>
        </div>
        <div
          className="w-16 h-16 rounded-2xl grid place-items-center text-3xl font-black shadow-lg shrink-0"
          style={{
            background: result.perfect
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
