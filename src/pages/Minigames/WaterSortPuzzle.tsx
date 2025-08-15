// src/components/minigames/Match3Game.tsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ref, runTransaction, get } from "firebase/database";
import { db } from "@/integrations/firebase/config";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type GameState = "idle" | "playing" | "ad" | "win" | "locked";

const DEFAULT_GAME_ID = "match3";
const GAME_REWARD = 0.2; // diamonds
const XP_REWARD = 2;
// <-- Updated duration to 80 seconds
const START_TIME_SEC = 80;
const AD_CONTINUE_SECONDS = 10;
const todayStr = () => new Date().toISOString().split("T")[0];

// Distinct candy colors (more contrast)
const CANDY_COLORS = [
  "#EF4444", // bright red
  "#3B82F6", // strong blue
  "#F59E0B", // orange amber
  "#10B981", // green
  "#8B5CF6", // purple
  "#06B6D4", // cyan/teal
];

type Candy = number | null; // index into CANDY_COLORS, or null for empty

// Board dimensions (mobile-friendly)
const ROWS = 8;
const COLS = 8;

// scoring
const BASE_SCORE_PER_TILE = 10;
const TARGET_SCORE = 800; // adjust to tune difficulty

const randInt = (n: number) => Math.floor(Math.random() * n);

function emptyBoard(rows = ROWS, cols = COLS): Candy[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
}

/**
 * createBoard:
 * Fill board randomly but avoid immediate starting matches (no initial runs >=3)
 */
function createBoard(): Candy[][] {
  const board = emptyBoard();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let attempts = 0;
      while (true) {
        const color = randInt(CANDY_COLORS.length);
        board[r][c] = color;
        const hor = checkMatchAt(board, r, c, true);
        const ver = checkMatchAt(board, r, c, false);
        if (!hor && !ver) break;
        attempts++;
        if (attempts > 12) break; // fallback
      }
    }
  }
  return board;
}

function checkMatchAt(board: Candy[][], r: number, c: number, horizontal: boolean) {
  const val = board[r][c];
  if (val === null) return false;
  let count = 1;
  if (horizontal) {
    for (let cc = c - 1; cc >= 0 && board[r][cc] === val; cc--) count++;
    for (let cc = c + 1; cc < COLS && board[r][cc] === val; cc++) count++;
  } else {
    for (let rr = r - 1; rr >= 0 && board[rr][c] === val; rr--) count++;
    for (let rr = r + 1; rr < ROWS && board[rr][c] === val; rr++) count++;
  }
  return count >= 3;
}

function findAllMatches(board: Candy[][]): Set<string> {
  const marked = new Set<string>();
  // horizontal
  for (let r = 0; r < ROWS; r++) {
    let runVal: Candy = null;
    let runStart = 0;
    for (let c = 0; c <= COLS; c++) {
      const v = c < COLS ? board[r][c] : null;
      if (v !== null && v === runVal) {
      } else {
        const runLen = c - runStart;
        if (runVal !== null && runLen >= 3) {
          for (let k = runStart; k < runStart + runLen; k++) marked.add(`${r}_${k}`);
        }
        runVal = v;
        runStart = c;
      }
    }
  }
  // vertical
  for (let c = 0; c < COLS; c++) {
    let runVal: Candy = null;
    let runStart = 0;
    for (let r = 0; r <= ROWS; r++) {
      const v = r < ROWS ? board[r][c] : null;
      if (v !== null && v === runVal) {
      } else {
        const runLen = r - runStart;
        if (runVal !== null && runLen >= 3) {
          for (let k = runStart; k < runStart + runLen; k++) marked.add(`${k}_${c}`);
        }
        runVal = v;
        runStart = r;
      }
    }
  }
  return marked;
}

function removeMatches(board: Candy[][], matches: Set<string>): number {
  let removed = 0;
  matches.forEach((key) => {
    const [r, c] = key.split("_").map(Number);
    if (board[r][c] !== null) {
      board[r][c] = null;
      removed++;
    }
  });
  return removed;
}

function collapseBoard(board: Candy[][]) {
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][c] !== null) {
        board[write][c] = board[r][c];
        if (write !== r) board[r][c] = null;
        write--;
      }
    }
    for (let r = write; r >= 0; r--) board[r][c] = null;
  }
}

function refillBoard(board: Candy[][]) {
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (board[r][c] === null) board[r][c] = randInt(CANDY_COLORS.length);
    }
  }
}

function swapCells(board: Candy[][], r1: number, c1: number, r2: number, c2: number) {
  const tmp = board[r1][c1];
  board[r1][c1] = board[r2][c2];
  board[r2][c2] = tmp;
}

// Firebase helpers (same style)
async function hasPlayedToday(user: any, gameId: string) {
  if (!user) return false;
  try {
    const snap = await get(ref(db, `users/${user.uid}/minigames/${gameId}`));
    const val = snap.val();
    return !!(val && val.lastPlayed === todayStr());
  } catch (e) {
    console.warn("hasPlayedToday error", e);
    return false;
  }
}
async function awardAndMarkDB(user: any, gameId: string) {
  if (!user) return false;
  try {
    await runTransaction(ref(db, `users/${user.uid}`), (current) => {
      const data = current || {};
      const mg = data.minigames || {};
      if (mg[gameId] && mg[gameId].lastPlayed === todayStr()) return data;
      return {
        ...data,
        diamonds: (data.diamonds || 0) + GAME_REWARD,
        xp: (data.xp || 0) + XP_REWARD,
        minigames: {
          ...(data.minigames || {}),
          [gameId]: { lastPlayed: todayStr(), reward: GAME_REWARD },
        },
      };
    });
    return true;
  } catch (err) {
    console.error("awardAndMark error", err);
    return false;
  }
}

// small helper sleep
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// Component
const Match3Game: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const gameId = id || DEFAULT_GAME_ID;

  const [board, setBoard] = useState<Candy[][]>(() => createBoard());
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [gameState, setGameState] = useState<GameState>("idle");
  const [score, setScore] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(START_TIME_SEC);
  const intervalRef = useRef<number | null>(null);
  const [isAwarded, setIsAwarded] = useState(false);

  // animation states
  const [removing, setRemoving] = useState<Set<string>>(new Set()); // coordinates being removed (fade)
  const [newTiles, setNewTiles] = useState<Set<string>>(new Set()); // coords that just refilled (drop animation)
  const animatingRef = useRef(false); // block input during animation

  useEffect(() => {
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, []);

  const startTimer = () => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          window.clearInterval(intervalRef.current!);
          intervalRef.current = null;
          setTimeout(() => setGameState((prev) => (prev === "playing" ? "ad" : prev)), 0);
          return 0;
        }
        return t - 1;
      });
    }, 1000) as unknown as number;
  };
  const stopTimer = () => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const startGame = async () => {
    if (!user) {
      toast.error("Please sign in to play");
      return;
    }
    const already = await hasPlayedToday(user, gameId);
    if (already) {
      toast.error("You already played this mini-game today. Come back tomorrow!");
      return;
    }
    setBoard(createBoard());
    setSelected(null);
    setScore(0);
    setIsAwarded(false);
    setTimeLeft(START_TIME_SEC);
    setGameState("playing");
    startTimer();
  };

  const watchAdAndContinue = () => {
    toast.info(`Ad watched successfully! +${AD_CONTINUE_SECONDS}s`);
    setTimeLeft((t) => t + AD_CONTINUE_SECONDS);
    setGameState("playing");
    startTimer();
  };

  // This function runs the full resolve-match -> collapse -> refill loop with animations.
  // It expects the board already contains the board AFTER swap (swap applied).
  const resolveMatchesAnimated = async (mutableBoard: Candy[][]) => {
    animatingRef.current = true;
    try {
      let totalRemovedOverall = 0;
      let comboCount = 0;

      while (true) {
        const matches = findAllMatches(mutableBoard);
        if (matches.size === 0) break;

        // set removing so UI animates fade/scale
        setRemoving(new Set(matches));
        // wait for fade animation
        await sleep(250);

        // remove matched tiles
        const removed = removeMatches(mutableBoard, matches);
        totalRemovedOverall += removed;

        // clear removing (they are now null in board)
        setRemoving(new Set());
        // collapse
        collapseBoard(mutableBoard);

        // before refill, compute empty positions to know which will be new tiles
        const emptyBefore: string[] = [];
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (mutableBoard[r][c] === null) emptyBefore.push(`${r}_${c}`);
          }
        }

        // refill
        refillBoard(mutableBoard);

        // after refill, mark newly filled positions for drop animation
        const newly: string[] = [];
        for (const key of emptyBefore) {
          const [r, c] = key.split("_").map(Number);
          if (mutableBoard[r][c] !== null) newly.push(key);
        }
        setNewTiles(new Set(newly));

        // push board snapshot to UI so it displays dropped tiles (they will animate)
        setBoard((prev) => {
          // create deep copy to trigger re-render
          return mutableBoard.map((row) => [...row]);
        });

        // wait for drop animation
        await sleep(350);

        // clear newTiles
        setNewTiles(new Set());

        comboCount++;
        // small inter-step delay for cascading feel
        await sleep(80);
      }

      // scoring: base per tile times combo multiplier
      if (totalRemovedOverall > 0) {
        const gained = Math.floor(totalRemovedOverall * BASE_SCORE_PER_TILE * (1 + Math.max(0, comboCount - 1) * 0.25));
        setScore((s) => {
          const ns = s + gained;
          if (ns >= TARGET_SCORE && gameState !== "win") {
            // win
            stopTimer();
            setGameState("win");
            (async () => {
              if (!isAwarded) {
                const ok = await awardAndMarkDB(user, gameId);
                if (ok) {
                  setIsAwarded(true);
                  toast.success(`Nice! +${GAME_REWARD} diamonds awarded`);
                } else {
                  toast.error("Failed to record reward. Try again later.");
                }
              }
            })();
          }
          return ns;
        });
      }
    } finally {
      animatingRef.current = false;
    }
  };

  // attempt swap: if swap produces no matches we revert; otherwise resolve with animation
  const attemptSwapAndResolve = async (r1: number, c1: number, r2: number, c2: number) => {
    if (animatingRef.current) return;
    // make copy
    const nb = board.map((row) => [...row]);
    swapCells(nb, r1, c1, r2, c2);
    const matches = findAllMatches(nb);
    if (matches.size === 0) {
      // no match -> revert swap visually (instant). You could add a small shake animation here.
      setBoard(nb); // show attempted swap then revert after short delay for visual feedback
      await sleep(140);
      const reverted = nb.map((row) => [...row]);
      swapCells(reverted, r1, c1, r2, c2);
      setBoard(reverted);
      return;
    }
    // commit swap to board then resolve with animations
    setBoard(nb);
    await resolveMatchesAnimated(nb);
  };

  const onCellTap = (r: number, c: number) => {
    if (gameState !== "playing") return;
    if (animatingRef.current) return;
    if (!selected) {
      if (board[r][c] === null) return;
      setSelected({ r, c });
      return;
    }
    if (selected.r === r && selected.c === c) {
      setSelected(null);
      return;
    }
    const manhattan = Math.abs(selected.r - r) + Math.abs(selected.c - c);
    if (manhattan !== 1) {
      if (board[r][c] !== null) setSelected({ r, c });
      return;
    }
    // perform swap + resolution
    attemptSwapAndResolve(selected.r, selected.c, r, c);
    setSelected(null);
  };

  // responsive sizes
  const gridMaxWidth = Math.min(window.innerWidth * 0.96, 440);
  const gap = 6;

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col">
      {/* inline styles for animations */}
      <style>{`
        @keyframes removeFade {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(0.6); opacity: 0; }
        }
        @keyframes dropIn {
          0% { transform: translateY(-140%); opacity: 0; }
          60% { transform: translateY(6%); opacity: 1; }
          100% { transform: translateY(0); opacity: 1; }
        }
        .candy-remove {
          animation: removeFade 240ms ease forwards;
        }
        .candy-drop {
          animation: dropIn 380ms cubic-bezier(.18,.9,.25,1) forwards;
        }
      `}</style>

      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center items-start justify-between px-3 sm:px-4 py-3 gap-3 z-10">
        <div className="flex items-center gap-3">
          <div className="glass-panel rounded-full px-3 py-2">
            <div className="font-mono text-lg">{timeLeft}s</div>
          </div>
          <div className="hidden sm:block text-sm text-gray-300">Match 3+ to score — reach {TARGET_SCORE} points</div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="glass-panel rounded-full px-3 py-2 text-sm">
            <span className="text-yellow-300 font-semibold">♦ {GAME_REWARD}</span>
          </div>
          <Button variant="outline" onClick={() => navigate(-1)} className="min-h-[40px] py-2 px-3">
            Exit
          </Button>
        </div>
      </div>

      {/* Game area */}
      <div className="relative flex-1 flex items-center justify-center overflow-auto px-3 pb-6">
        {/* Start modal */}
        {gameState === "idle" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-40 pointer-events-auto px-4">
            <div className="glass-panel p-6 sm:p-8 rounded-2xl text-center max-w-[460px] w-full">
              <h1 className="text-2xl sm:text-3xl font-bold mb-2">Match 3 — Sweet Burst</h1>
              <p className="text-sm text-gray-300 mb-2">Swap adjacent candies to make 3+ matches. Cascades score more!</p>
              <p className="text-sm text-gray-300 mb-4">
                Score <span className="font-semibold">{TARGET_SCORE}</span> points in <span className="font-semibold">{START_TIME_SEC}s</span>. Watch an ad to continue (+{AD_CONTINUE_SECONDS}s).
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button size="lg" onClick={startGame} className="bg-blue-600 hover:bg-blue-700 py-3 px-6 min-w-[160px]">
                  Start Game
                </Button>
                <Button variant="outline" onClick={() => navigate(-1)} className="py-3 px-4">
                  Back
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Ad modal */}
        {gameState === "ad" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50 px-4">
            <div className="glass-panel p-6 sm:p-8 rounded-2xl text-center max-w-[420px] w-full">
              <h2 className="text-2xl sm:text-3xl font-bold mb-3 text-red-400">Time's Up!</h2>
              <p className="text-sm sm:text-base text-gray-300 mb-4">
                Watch an ad to get <span className="text-green-300 font-semibold">+{AD_CONTINUE_SECONDS}s</span> and continue.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button size="lg" onClick={watchAdAndContinue} className="bg-green-600 hover:bg-green-700 py-3 px-6">
                  Watch Ad to Continue
                </Button>
                <Button variant="outline" onClick={() => {
                  setGameState("idle");
                  setBoard(createBoard());
                  stopTimer();
                }} className="py-3 px-4">
                  Restart
                </Button>
                <Button variant="ghost" onClick={() => navigate(-1)} className="py-3 px-4 text-gray-300">
                  Exit
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Win modal */}
        {gameState === "win" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50 px-4">
            <div className="glass-panel p-6 sm:p-8 rounded-2xl text-center max-w-[420px] w-full">
              <h2 className="text-2xl sm:text-3xl font-bold mb-3 text-green-400">Sweet Victory!</h2>
              <p className="text-lg text-yellow-300 mb-2">♦ {GAME_REWARD} diamonds earned</p>
              <p className="text-sm text-gray-300 mb-4">You reached the target score — nice job!</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={() => {
                  setBoard(createBoard());
                  setScore(0);
                  setTimeLeft(START_TIME_SEC);
                  setIsAwarded(false);
                  setGameState("idle");
                }} className="py-3 px-6">Play Again</Button>
                <Button variant="outline" onClick={() => navigate(-1)} className="py-3 px-4">Exit</Button>
              </div>
            </div>
          </div>
        )}

        {/* Board UI */}
        <div
          className="bg-slate-900 rounded-2xl p-3"
          style={{
            width: gridMaxWidth,
            maxWidth: 560,
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${COLS}, 1fr)`,
              gap,
              touchAction: "manipulation",
            }}
          >
            {board.map((row, r) =>
              row.map((val, c) => {
                const key = `${r}_${c}`;
                const isSelected = !!selected && selected.r === r && selected.c === c;
                const isRemoving = removing.has(key);
                const isNew = newTiles.has(key);
                return (
                  <button
                    key={key}
                    onClick={() => onCellTap(r, c)}
                    className="rounded-lg flex items-center justify-center"
                    style={{
                      width: "100%",
                      aspectRatio: "1 / 1",
                      background: "rgba(255,255,255,0.02)",
                      border: isSelected ? "2px solid rgba(96,165,250,0.95)" : "1px solid rgba(255,255,255,0.04)",
                      boxShadow: "inset 0 -4px 8px rgba(0,0,0,0.5)",
                      padding: 6,
                      touchAction: "manipulation",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    {val !== null ? (
                      <div
                        className={`${isRemoving ? "candy-remove" : ""} ${isNew ? "candy-drop" : ""}`}
                        style={{
                          width: "86%",
                          height: "86%",
                          borderRadius: 12,
                          background: `linear-gradient(180deg, ${CANDY_COLORS[val]} 0%, ${darken(CANDY_COLORS[val], 0.14)} 100%)`,
                          boxShadow: "0 6px 12px rgba(0,0,0,0.45), inset 0 -6px 12px rgba(255,255,255,0.06)",
                        }}
                        aria-hidden
                      />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>

          {/* score and controls */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="glass-panel rounded-full px-3 py-2 text-sm">
              Score: <span className="font-semibold ml-2">{score}</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => {
                setBoard(createBoard());
                setScore(0);
                setTimeLeft(START_TIME_SEC);
                setSelected(null);
                setGameState("idle");
                stopTimer();
              }}>New</Button>
              <Button size="sm" variant="outline" onClick={() => {
                // quick debug: trigger a cascade if exists
                setBoard((b) => {
                  const cp = b.map((r) => [...r]);
                  const matches = findAllMatches(cp);
                  if (matches.size > 0) {
                    removeMatches(cp, matches);
                    collapseBoard(cp);
                    refillBoard(cp);
                  }
                  return cp;
                });
              }}>Debug</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function darken(hex: string, amount = 0.12) {
  const c = hex.replace("#", "");
  const num = parseInt(c, 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  r = Math.max(0, Math.floor(r * (1 - amount)));
  g = Math.max(0, Math.floor(g * (1 - amount)));
  b = Math.max(0, Math.floor(b * (1 - amount)));
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

export default Match3Game;
