import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef } from "react";
import { processes } from "@/lib/processes";
import {
  Trophy,
  RotateCcw,
  Check,
  X,
  Sparkles,
  ChevronRight,
  ListOrdered,
  Timer,
  Play,
  Shuffle,
  Plus,
  Trash2,
  Users,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import sixImg from "@/assets/six.jpg";
import coverImg from "@/assets/cover.jpg";
import fourImg from "@/assets/four.jpg";
import singleImg from "@/assets/single.jpg";
import bowledImg from "@/assets/bowled.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OIR — Order It Right" },
      { name: "description", content: "Order It Right: a cricket-themed team game where teams arrange security process steps in the correct order." },
      { property: "og:title", content: "OIR — Order It Right" },
      { property: "og:description", content: "Teams pick a mystery topic and race to enter the correct step order — cricket shots for every score." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Game,
});

type Phase = "idle" | "choosing" | "playing" | "celebrate" | "reveal" | "done";

const TOTAL_ROUNDS = 4;
const TURN_SECONDS = 60;
const CHOICES_PER_TURN = 4;
const STORAGE_KEY = "oir-game-state-v6";

const DEFAULT_TEAMS = ["A", "B", "C", "D", "E", "F"];

// score by correct positions out of 5
const SCORE_TABLE: Record<number, number> = { 5: 6, 4: 5, 3: 4, 2: 2, 1: 1, 0: 0 };

type CelebrationTier = "six" | "cover" | "four" | "single" | "bowled" | "timeout";
const CELEBRATIONS: Record<CelebrationTier, { img: string; title: string; sub: string; color: string }> = {
  six:     { img: sixImg,    title: "SIXER!",         sub: "All 5 in order — Rohit Sharma launches it into the stands!", color: "var(--success)" },
  cover:   { img: coverImg,  title: "Classic Cover Drive!", sub: "3 correct — Kohli threads it through the covers for four!", color: "var(--primary)" },
  four:    { img: fourImg,   title: "Cracking Four!",  sub: "4 correct — pierces the field for a boundary!", color: "var(--primary-glow, var(--primary))" },
  single:  { img: singleImg, title: "Quick Single",    sub: "Nudged into the gap — every run counts.", color: "var(--accent)" },
  bowled:  { img: bowledImg, title: "Clean Bowled!",   sub: "No matches this over — better luck next ball.", color: "var(--destructive)" },
  timeout: { img: bowledImg, title: "Timed Out!",      sub: "The clock ran out before the answer was locked. No runs.", color: "var(--destructive)" },
};

function tierFor(correct: number, timedOutNoLock: boolean): CelebrationTier {
  if (timedOutNoLock) return "timeout";
  if (correct === 5) return "six";
  if (correct === 4) return "four";
  if (correct === 3) return "cover";
  if (correct === 2 || correct === 1) return "single";
  return "bowled";
}

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
  const remaining = processes.map((_, i) => i).filter((i) => !used.includes(i));
  return shuffle(remaining).slice(0, Math.min(CHOICES_PER_TURN, remaining.length));
}

function Game() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [teamsList, setTeamsList] = useState<string[]>(DEFAULT_TEAMS);
  const [turn, setTurn] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [used, setUsed] = useState<number[]>([]);
  const [choices, setChoices] = useState<number[]>([]);
  const [currentIdx, setCurrentIdx] = useState<number | null>(null);
  const [displayOrder, setDisplayOrder] = useState<string[]>([]); // shuffled steps shown to team
  const [inputs, setInputs] = useState<string[]>([]); // team's position entries
  const [lastResult, setLastResult] = useState<{ correct: number; points: number; tier: CelebrationTier; locked: boolean; finalOrder: string[] } | null>(null);
  const [timeLeft, setTimeLeft] = useState(TURN_SECONDS);
  const submittedRef = useRef(false);

  // Load persisted
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        setPhase(s.phase ?? "idle");
        setTeamsList(s.teamsList ?? DEFAULT_TEAMS);
        setTurn(s.turn ?? 0);
        setScores(s.scores ?? {});
        setUsed(s.used ?? []);
        setChoices(s.choices ?? []);
        setCurrentIdx(s.currentIdx ?? null);
        setDisplayOrder(s.displayOrder ?? []);
        setInputs(s.inputs ?? []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ phase, teamsList, turn, scores, used, choices, currentIdx, displayOrder, inputs }),
    );
  }, [phase, teamsList, turn, scores, used, choices, currentIdx, displayOrder, inputs]);

  const totalTurns = TOTAL_ROUNDS * teamsList.length;
  const currentTeam = teamsList[turn % Math.max(1, teamsList.length)] ?? "";
  const currentRound = Math.floor(turn / Math.max(1, teamsList.length)) + 1;
  const currentProcess = currentIdx != null ? processes[currentIdx] : null;

  const startGame = () => {
    if (teamsList.length < 2) return;
    const fresh: Record<string, number> = {};
    teamsList.forEach((t) => (fresh[t] = 0));
    setScores(fresh);
    setTurn(0);
    setUsed([]);
    setChoices(pickChoices([]));
    setCurrentIdx(null);
    setDisplayOrder([]);
    setInputs([]);
    setLastResult(null);
    setPhase("choosing");
  };

  const chooseTopic = (idx: number) => {
    const shown = shuffleSteps(processes[idx].steps);
    setCurrentIdx(idx);
    setDisplayOrder(shown);
    setInputs(shown.map(() => ""));
    setTimeLeft(TURN_SECONDS);
    setLastResult(null);
    submittedRef.current = false;
    setPhase("playing");
  };

  const evaluate = (locked: boolean) => {
    if (!currentProcess) return;
    if (submittedRef.current) return;
    submittedRef.current = true;

    // Build final ordering from inputs (only if locked)
    const size = currentProcess.steps.length;
    let correct = 0;
    let finalOrder: string[] = [];

    if (locked) {
      // Place steps by claimed position; unclaimed / duplicates fall through
      const slots: (string | null)[] = Array(size).fill(null);
      displayOrder.forEach((step, i) => {
        const raw = inputs[i]?.trim();
        const pos = raw ? parseInt(raw, 10) : NaN;
        if (!isNaN(pos) && pos >= 1 && pos <= size && slots[pos - 1] === null) {
          slots[pos - 1] = step;
        }
      });
      // Fill any remaining slots with leftover steps in display order (won't count as correct unless matches)
      const placed = new Set(slots.filter(Boolean) as string[]);
      const leftover = displayOrder.filter((s) => !placed.has(s));
      finalOrder = slots.map((s) => (s ?? leftover.shift() ?? "")) as string[];
      correct = finalOrder.reduce((acc, s, i) => acc + (s === currentProcess.steps[i] ? 1 : 0), 0);
    } else {
      correct = 0;
      finalOrder = displayOrder;
    }

    const points = locked ? (SCORE_TABLE[correct] ?? 0) : 0;
    const tier = tierFor(correct, !locked);

    setScores((s) => ({ ...s, [currentTeam]: (s[currentTeam] ?? 0) + points }));
    setLastResult({ correct, points, tier, locked, finalOrder });
    setPhase("celebrate");
  };

  const goToReveal = () => setPhase("reveal");

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
      setDisplayOrder([]);
      setInputs([]);
      setLastResult(null);
      setChoices(pickChoices(newUsed));
      setPhase("choosing");
    }
  };

  // Timer
  useEffect(() => {
    if (phase !== "playing") return;
    if (timeLeft <= 0) {
      evaluate(false);
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
    setScores({});
    setUsed([]);
    setChoices([]);
    setCurrentIdx(null);
    setDisplayOrder([]);
    setInputs([]);
    setLastResult(null);
  };

  const leaderboard = useMemo(
    () => teamsList.map((t) => [t, scores[t] ?? 0] as [string, number]).sort((a, b) => b[1] - a[1]),
    [scores, teamsList],
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
          <StartScreen
            teamsList={teamsList}
            setTeamsList={setTeamsList}
            onStart={startGame}
          />
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
                  displayOrder={displayOrder}
                  inputs={inputs}
                  setInputs={setInputs}
                  onLock={() => evaluate(true)}
                  timeLeft={timeLeft}
                  totalTime={TURN_SECONDS}
                />
              )}
              {phase === "reveal" && currentProcess && lastResult && (
                <RevealCard
                  team={currentTeam}
                  process={currentProcess}
                  finalOrder={lastResult.finalOrder}
                  correct={lastResult.correct}
                  points={lastResult.points}
                  locked={lastResult.locked}
                  isLast={turn + 1 >= totalTurns}
                  onNext={nextTurn}
                />
              )}
              {phase === "done" && <FinalCard leaderboard={leaderboard} onReset={resetAll} />}
            </div>

            <Leaderboard
              leaderboard={leaderboard}
              currentTeam={phase === "choosing" || phase === "playing" ? currentTeam : null}
              upNext={phase === "reveal" || phase === "celebrate" ? teamsList[(turn + 1) % teamsList.length] : null}
              teamsList={teamsList}
            />
          </div>
        )}
      </div>

      {phase === "celebrate" && lastResult && (
        <CelebrationOverlay
          team={currentTeam}
          correct={lastResult.correct}
          points={lastResult.points}
          tier={lastResult.tier}
          onContinue={goToReveal}
        />
      )}
    </div>
  );
}

function Header({
  round, totalRounds, turn, totalTurns, onReset, showProgress,
}: {
  round: number; totalRounds: number; turn: number; totalTurns: number; onReset: () => void; showProgress: boolean;
}) {
  const pct = totalTurns > 0 ? Math.min(100, (turn / totalTurns) * 100) : 0;
  return (
    <header>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl grid place-items-center shadow-lg" style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-glow)" }}>
            <ListOrdered className="w-6 h-6 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-hero)" }}>
              OIR — Order It Right
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Round {round} of {totalRounds} · cricket-scored security order game
            </p>
          </div>
        </div>
        <button onClick={onReset} className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-border bg-card/60 hover:bg-card transition">
          <RotateCcw className="w-4 h-4" /> Reset
        </button>
      </div>

      {showProgress && (
        <div className="mt-6">
          <div className="flex justify-between text-xs text-muted-foreground mb-2">
            <span>Turn {Math.min(turn + 1, totalTurns)} / {totalTurns}</span>
            <span>{Math.round(pct)}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full transition-all duration-500" style={{ width: `${pct}%`, background: "var(--gradient-hero)" }} />
          </div>
        </div>
      )}
    </header>
  );
}

function StartScreen({
  teamsList, setTeamsList, onStart,
}: {
  teamsList: string[]; setTeamsList: (t: string[]) => void; onStart: () => void;
}) {
  const [draft, setDraft] = useState("");
  const addTeam = () => {
    const name = draft.trim();
    if (!name) return;
    if (teamsList.includes(name)) return;
    setTeamsList([...teamsList, name]);
    setDraft("");
  };
  const removeTeam = (i: number) => setTeamsList(teamsList.filter((_, idx) => idx !== i));
  const renameTeam = (i: number, v: string) => {
    const next = [...teamsList];
    next[i] = v;
    setTeamsList(next);
  };

  return (
    <div className="mt-10 rounded-2xl p-8 sm:p-12 border border-border shadow-2xl" style={{ background: "var(--gradient-card)" }}>
      <div className="text-center">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-primary font-semibold">
          <Sparkles className="w-4 h-4" /> Ready to play
        </div>
        <h2 className="mt-4 text-4xl sm:text-6xl font-black tracking-tight bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-hero)" }}>
          Order It Right
        </h2>
        <p className="mt-4 max-w-2xl mx-auto text-muted-foreground">
          A cricket-scored team game — {TOTAL_ROUNDS} rounds, one turn per team per round.
        </p>
      </div>

      <div className="mt-10 grid md:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-border bg-card/60 p-5">
          <div className="flex items-center gap-2 text-primary font-semibold mb-3">
            <ListOrdered className="w-4 h-4" /> How to play
          </div>
          <ol className="space-y-2 text-sm">
            {[
              "The team on turn picks a Mystery Box — the topic stays hidden until they choose.",
              "5 process steps appear in a scrambled order with an input box beside each step.",
              "The team calls out the correct position (1–5) for every step. The host types it in.",
              `Lock the answer before the ${TURN_SECONDS}s timer runs out — otherwise it's 0 runs, no matter what's typed.`,
              "Scoring: 5 correct = 6 (SIX!) · 4 = 5 · 3 = 4 (cover drive!) · 2 = 2 · 1 = 1 · 0 = clean bowled.",
              `Play ${TOTAL_ROUNDS} rounds. Highest total wins — ties in the top 3 are shown together.`,
            ].map((t, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-6 h-6 shrink-0 rounded-md grid place-items-center text-xs font-bold" style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>{i + 1}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-2xl border border-border bg-card/60 p-5">
          <div className="flex items-center gap-2 text-primary font-semibold mb-3">
            <Users className="w-4 h-4" /> Teams ({teamsList.length})
          </div>
          <ul className="space-y-2 mb-3 max-h-64 overflow-auto pr-1">
            {teamsList.map((t, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-8 h-8 shrink-0 rounded-lg grid place-items-center font-bold text-xs" style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>{i + 1}</span>
                <input
                  value={t}
                  onChange={(e) => renameTeam(i, e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-border bg-background/60 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button onClick={() => removeTeam(i)} className="w-9 h-9 rounded-lg grid place-items-center border border-border hover:bg-destructive/10 hover:text-destructive transition" aria-label="Remove team">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTeam()}
              placeholder="New team name"
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-background/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button onClick={addTeam} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card hover:bg-accent hover:text-accent-foreground text-sm font-medium">
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Minimum 2 teams. You can rename any time before start.</p>
        </div>
      </div>

      <div className="mt-8 text-center">
        <button
          onClick={onStart}
          disabled={teamsList.length < 2}
          className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl text-lg font-semibold shadow-lg transition-transform hover:scale-[1.03] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)", boxShadow: "var(--shadow-glow)" }}
        >
          <Play className="w-5 h-5" fill="currentColor" /> Start game
        </button>
        <p className="mt-4 text-xs text-muted-foreground">Turn order: {teamsList.join(" → ")}</p>
      </div>
    </div>
  );
}

function ChoiceCard({
  team, round, totalRounds, choices, onPick, onReshuffle,
}: {
  team: string; round: number; totalRounds: number; choices: number[]; onPick: (idx: number) => void; onReshuffle: () => void;
}) {
  return (
    <div className="rounded-2xl p-6 sm:p-8 border border-border shadow-2xl" style={{ background: "var(--gradient-card)" }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary font-semibold">
            <Sparkles className="w-4 h-4" /> Round {round} of {totalRounds}
          </div>
          <h2 className="mt-2 text-2xl sm:text-3xl font-bold leading-tight">Team {team}, pick your box</h2>
          <p className="mt-1 text-sm text-muted-foreground">The team calls out a letter — the host taps to reveal.</p>
        </div>
        <div className="w-16 h-16 rounded-2xl grid place-items-center text-2xl font-black shadow-lg shrink-0" style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)", boxShadow: "var(--shadow-glow)" }}>
          {team.slice(0, 2).toUpperCase()}
        </div>
      </div>

      <div className="mt-6 grid sm:grid-cols-2 gap-3">
        {choices.map((idx, i) => (
          <button key={idx} onClick={() => onPick(idx)} className="group text-left p-5 rounded-xl border border-border bg-card hover:border-primary transition-all hover:shadow-lg hover:scale-[1.02]">
            <div className="flex items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-xl grid place-items-center font-black text-3xl shrink-0" style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
                {String.fromCharCode(65 + i)}
              </div>
              <div className="flex-1">
                <div className="font-semibold leading-snug text-lg">Mystery Box {String.fromCharCode(65 + i)}</div>
                <div className="text-xs text-muted-foreground mt-1">Pick blindly — revealed on selection</div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition" />
            </div>
          </button>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between flex-wrap gap-3">
        <button onClick={onReshuffle} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card/60 hover:bg-card text-sm font-medium transition">
          <Shuffle className="w-4 h-4" /> Shuffle options
        </button>
        <div className="text-xs text-muted-foreground">Runs: 5→6 · 4→5 · 3→4 · 2→2 · 1→1 · 0→bowled</div>
      </div>
    </div>
  );
}

function PlayCard({
  team, round, totalRounds, process, displayOrder, inputs, setInputs, onLock, timeLeft, totalTime,
}: {
  team: string; round: number; totalRounds: number;
  process: { title: string; steps: string[] };
  displayOrder: string[];
  inputs: string[];
  setInputs: (v: string[]) => void;
  onLock: () => void;
  timeLeft: number; totalTime: number;
}) {
  const pct = Math.max(0, Math.min(100, (timeLeft / totalTime) * 100));
  const urgent = timeLeft <= 10;
  const timerColor = urgent ? "var(--destructive)" : "var(--primary)";
  const setAt = (i: number, v: string) => {
    const digits = v.replace(/[^0-9]/g, "").slice(0, 1);
    const next = [...inputs];
    next[i] = digits;
    setInputs(next);
  };

  return (
    <div className="rounded-2xl p-6 sm:p-8 border border-border shadow-2xl" style={{ background: "var(--gradient-card)" }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary font-semibold">
            <Sparkles className="w-4 h-4" /> Round {round} of {totalRounds} · Team {team}
          </div>
          <h2 className="mt-2 text-2xl sm:text-3xl font-bold leading-tight">{process.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Type the correct position (1–{process.steps.length}) beside each step, then hit Lock.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div
            className={cn("flex items-center gap-2 px-3 py-2 rounded-xl border font-mono font-bold tabular-nums text-lg transition", urgent ? "animate-pulse" : "")}
            style={{ borderColor: timerColor, color: timerColor, background: urgent ? "oklch(0.65 0.24 25 / 0.1)" : "oklch(0.72 0.18 195 / 0.08)" }}
          >
            <Timer className="w-4 h-4" />
            {String(Math.floor(timeLeft / 60)).padStart(1, "0")}:{String(timeLeft % 60).padStart(2, "0")}
          </div>
          <div className="w-16 h-16 rounded-2xl grid place-items-center text-2xl font-black shadow-lg" style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)", boxShadow: "var(--shadow-glow)" }}>
            {team.slice(0, 2).toUpperCase()}
          </div>
        </div>
      </div>

      <div className="mt-4 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full transition-all duration-1000 ease-linear" style={{ width: `${pct}%`, background: urgent ? "linear-gradient(90deg, var(--destructive), oklch(0.78 0.16 60))" : "var(--gradient-hero)" }} />
      </div>

      <ol className="mt-6 space-y-2">
        {displayOrder.map((step, i) => (
          <li key={step} className="flex items-center gap-3 p-3 sm:p-4 rounded-xl border border-border bg-card">
            <div className="w-9 h-9 shrink-0 rounded-lg grid place-items-center font-bold text-sm bg-muted text-muted-foreground">
              {String.fromCharCode(65 + i)}
            </div>
            <div className="flex-1 font-medium">{step}</div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Pos</label>
              <input
                inputMode="numeric"
                value={inputs[i] ?? ""}
                onChange={(e) => setAt(i, e.target.value)}
                className="w-14 h-11 text-center rounded-lg border-2 border-border bg-background text-xl font-bold tabular-nums focus:outline-none focus:border-primary"
                placeholder="?"
                aria-label={`Position for ${step}`}
              />
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6 flex items-center gap-3 flex-wrap">
        <button
          onClick={onLock}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-semibold shadow-lg transition-transform hover:scale-[1.02]"
          style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)", boxShadow: "var(--shadow-glow)" }}
        >
          <Lock className="w-4 h-4" /> Lock answer
        </button>
        <div className="ml-auto text-xs text-muted-foreground">Timer expires with no lock = 0 runs.</div>
      </div>
    </div>
  );
}

function CelebrationOverlay({
  team, correct, points, tier, onContinue,
}: {
  team: string; correct: number; points: number; tier: CelebrationTier; onContinue: () => void;
}) {
  const c = CELEBRATIONS[tier];
  return (
    <div className="fixed inset-0 z-50 animate-fade-in">
      <img src={c.img} alt="" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, oklch(0.1 0.03 265 / 0.75), oklch(0.1 0.03 265 / 0.9))" }} />
      <div className="relative h-full w-full flex flex-col items-center justify-center text-center px-6 animate-scale-in">
        <div className="text-sm uppercase tracking-[0.4em] font-semibold" style={{ color: c.color }}>
          Team {team}
        </div>
        <h1 className="mt-4 text-6xl sm:text-8xl font-black tracking-tight drop-shadow-[0_4px_20px_rgba(0,0,0,0.6)]" style={{ color: c.color }}>
          {c.title}
        </h1>
        <p className="mt-6 max-w-2xl text-lg sm:text-2xl text-white/90">{c.sub}</p>

        <div className="mt-10 grid grid-cols-2 gap-6">
          <Stat label="Correct" value={`${correct}/5`} />
          <Stat label="Runs earned" value={`+${points}`} highlight={points > 0} />
        </div>

        <button
          onClick={onContinue}
          className="mt-12 inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-lg font-bold shadow-2xl transition-transform hover:scale-[1.05]"
          style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)", boxShadow: "var(--shadow-glow)" }}
        >
          See correct order <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur px-8 py-5 min-w-[180px]">
      <div className="text-xs uppercase tracking-widest text-white/70">{label}</div>
      <div className={cn("mt-1 text-4xl font-black tabular-nums", highlight ? "" : "text-white")} style={highlight ? { color: "var(--success)" } : {}}>
        {value}
      </div>
    </div>
  );
}

function RevealCard({
  team, process, finalOrder, correct, points, locked, isLast, onNext,
}: {
  team: string; process: { title: string; steps: string[] };
  finalOrder: string[]; correct: number; points: number; locked: boolean; isLast: boolean; onNext: () => void;
}) {
  return (
    <div className="rounded-2xl p-6 sm:p-8 border border-border shadow-2xl" style={{ background: "var(--gradient-card)" }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-widest font-semibold text-primary">Correct order</div>
          <h2 className="mt-1 text-2xl sm:text-3xl font-bold">{process.title}</h2>
          <p className="mt-1 text-muted-foreground">
            Team <span className="text-foreground font-semibold">{team}</span> placed{" "}
            <span className="text-foreground font-semibold">{correct}/{process.steps.length}</span>{" "}
            {locked ? "correctly" : "— but didn't lock in time"} · earned{" "}
            <span className="font-bold" style={{ color: points > 0 ? "var(--success)" : "var(--destructive)" }}>+{points}</span> runs
          </p>
        </div>
      </div>

      <div className="mt-6 grid sm:grid-cols-2 gap-4">
        <Column title="Team's order" items={finalOrder} correctItems={process.steps} showCheck />
        <Column title="Correct order" items={process.steps} accent />
      </div>

      <div className="mt-6 flex justify-end">
        <button onClick={onNext} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-semibold shadow-lg transition-transform hover:scale-[1.02]" style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)", boxShadow: "var(--shadow-glow)" }}>
          {isLast ? "See final results" : "Next team"} <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function Column({
  title, items, correctItems, showCheck, accent,
}: {
  title: string; items: string[]; correctItems?: string[]; showCheck?: boolean; accent?: boolean;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{title}</div>
      <ol className="space-y-2">
        {items.map((step, i) => {
          const ok = correctItems ? correctItems[i] === step : true;
          return (
            <li key={`${title}-${i}`} className={cn("flex items-center gap-3 p-3 rounded-lg border",
              accent ? "border-primary/40 bg-primary/5"
                : showCheck ? (ok ? "border-[color:var(--success)]/40 bg-[color:var(--success)]/5" : "border-destructive/40 bg-destructive/5")
                : "border-border bg-card",
            )}>
              <span className="w-7 h-7 shrink-0 rounded-md grid place-items-center text-xs font-bold bg-background/60 border border-border">{i + 1}</span>
              <span className="flex-1 text-sm font-medium">{step || <em className="text-muted-foreground">—</em>}</span>
              {showCheck && (ok ? <Check className="w-4 h-4 text-[color:var(--success)]" /> : <X className="w-4 h-4 text-destructive" />)}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Leaderboard({
  leaderboard, currentTeam, upNext, teamsList,
}: {
  leaderboard: [string, number][]; currentTeam: string | null; upNext: string | null; teamsList: string[];
}) {
  const max = Math.max(1, ...leaderboard.map(([, s]) => s));
  return (
    <aside className="rounded-2xl p-5 border border-border shadow-xl h-fit sticky top-6" style={{ background: "var(--gradient-card)" }}>
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
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn("w-7 h-7 shrink-0 grid place-items-center rounded-md text-xs font-bold", i === 0 || isCurrent ? "text-primary-foreground" : "bg-muted text-foreground")}
                    style={i === 0 || isCurrent ? { background: "var(--gradient-hero)" } : {}}>
                    {team.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">#{i + 1}</span>
                  <span className="text-sm font-medium truncate">{team}</span>
                  {isCurrent && <span className="text-[10px] uppercase tracking-widest text-primary font-semibold shrink-0">playing</span>}
                  {isNext && !isCurrent && <span className="text-[10px] uppercase tracking-widest text-accent font-semibold shrink-0">next</span>}
                </div>
                <span className="font-bold tabular-nums">{score}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full transition-all duration-500" style={{ width: `${(score / max) * 100}%`, background: i === 0 ? "var(--gradient-hero)" : "var(--muted-foreground)" }} />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 pt-4 border-t border-border text-xs text-muted-foreground">
        Turn order: {teamsList.join(" → ")}
      </div>
    </aside>
  );
}

function FinalCard({
  leaderboard, onReset,
}: {
  leaderboard: [string, number][]; onReset: () => void;
}) {
  // Group by score for ties, keep only top 3 distinct scores
  const groups: { rank: number; score: number; teams: string[] }[] = [];
  let rank = 0;
  let lastScore: number | null = null;
  leaderboard.forEach(([t, s]) => {
    if (s !== lastScore) {
      rank = groups.length + 1;
      groups.push({ rank, score: s, teams: [t] });
      lastScore = s;
    } else {
      groups[groups.length - 1].teams.push(t);
    }
  });
  const podium = groups.slice(0, 3);
  const winners = podium[0]?.teams ?? [];

  const medalColor = ["var(--gradient-hero)", "linear-gradient(135deg, oklch(0.85 0.05 260), oklch(0.7 0.05 260))", "linear-gradient(135deg, oklch(0.72 0.14 60), oklch(0.55 0.14 40))"];

  return (
    <div className="rounded-2xl p-8 border border-border shadow-2xl text-center" style={{ background: "var(--gradient-card)" }}>
      <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-primary font-semibold">
        <Trophy className="w-4 h-4" /> Game complete
      </div>
      <h2 className="mt-4 text-4xl sm:text-5xl font-black tracking-tight">
        {winners.length === 1 ? `Team ${winners[0]} wins!` : `Tied for 1st: ${winners.join(" & ")}`}
      </h2>
      <p className="mt-2 text-muted-foreground">
        {podium[0] ? `${podium[0].score} runs` : ""} across {TOTAL_ROUNDS} rounds
      </p>

      <div className="mt-8 grid sm:grid-cols-3 gap-3 max-w-3xl mx-auto">
        {podium.map((g, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card/60 p-5">
            <div className="mx-auto w-12 h-12 rounded-xl grid place-items-center font-black text-lg text-primary-foreground shadow-lg" style={{ background: medalColor[i] ?? "var(--muted)" }}>
              #{g.rank}
            </div>
            <div className="mt-3 text-lg font-bold">
              {g.teams.length === 1 ? `Team ${g.teams[0]}` : `Tied: ${g.teams.join(", ")}`}
            </div>
            <div className="text-primary font-semibold">{g.score} runs</div>
            {g.teams.length > 1 && (
              <div className="mt-1 text-[10px] uppercase tracking-widest text-accent font-semibold">
                {g.teams.length}-way tie
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 text-left max-w-lg mx-auto">
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Full standings</div>
        <ul className="space-y-1 text-sm">
          {leaderboard.map(([t, s], i) => (
            <li key={t} className="flex justify-between border-b border-border/50 py-1">
              <span>#{i + 1} · {t}</span>
              <span className="font-bold tabular-nums">{s}</span>
            </li>
          ))}
        </ul>
      </div>

      <button onClick={onReset} className="mt-8 inline-flex items-center gap-2 px-5 py-3 rounded-xl font-semibold shadow-lg transition-transform hover:scale-[1.02]" style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)", boxShadow: "var(--shadow-glow)" }}>
        <RotateCcw className="w-4 h-4" /> Play again
      </button>
    </div>
  );
}
