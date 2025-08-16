// src/components/minigames/SlidePuzzle.tsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ref, runTransaction, get } from "firebase/database";
import { db } from "@/integrations/firebase/config";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type GameState = "idle" | "preview" | "playing" | "win" | "locked" | "ad";

const DEFAULT_GAME_ID = "slide-puzzle";
const GAME_REWARD = 0.2; // diamonds
const XP_REWARD = 2;
const PREVIEW_MS = 1200;

const TOTAL_SECONDS = 90; // 1 min 30 sec
const AD_CONTINUE_SECONDS = 60; // watch ad => +60s

const todayStr = () => new Date().toISOString().split("T")[0];

// image asset (assumes src/assets/character.png exists)
const IMAGE_URL = new URL("../../assets/minigames/slidepuzzle/Logo.png", import.meta.url).href;

// grid
const ROWS = 3;
const COLS = 3;
const TOTAL = ROWS * COLS;
const MISSING_INDEX = TOTAL - 1; // bottom-right

// layout constants
const INNER_PADDING_PX = 6;
const GRID_GAP_PX = 6;

const hasPlayedToday = async (user: any, gameId: string) => {
  if (!user) return false;
  try {
    const snap = await get(ref(db, `users/${user.uid}/minigames/${gameId}`));
    const val = snap.val();
    return !!(val && val.lastPlayed === todayStr());
  } catch (e) {
    console.warn("hasPlayedToday error", e);
    return false;
  }
};

const awardAndMark = async (user: any, gameId: string) => {
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
};

// shuffle utility producing solvable 3x3 states (with null blank)
function shuffleSolvable(): Array<number | null> {
  const arr = Array.from({ length: TOTAL }, (_, i) => i).filter((i) => i !== MISSING_INDEX);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const toArrayWithNull = (order: number[], blankPos: number) => {
    const out: Array<number | null> = [];
    let idx = 0;
    for (let pos = 0; pos < TOTAL; pos++) {
      if (pos === blankPos) out.push(null);
      else out.push(order[idx++]);
    }
    return out;
  };
  for (let attempts = 0; attempts < 200; attempts++) {
    const blankPos = Math.floor(Math.random() * TOTAL);
    const candidate = toArrayWithNull(arr, blankPos);
    const flat = candidate.filter((v) => v !== null) as number[];
    let inv = 0;
    for (let i = 0; i < flat.length; i++) {
      for (let j = i + 1; j < flat.length; j++) {
        if (flat[i] > flat[j]) inv++;
      }
    }
    const solvable = inv % 2 === 0; // odd width check
    const solved = candidate.every((v, idx) => {
      if (idx === MISSING_INDEX) return v === null;
      return v === idx;
    });
    if (solvable && !solved) return candidate;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  const simple = Array.from({ length: TOTAL }, (_, i) => (i === MISSING_INDEX ? null : i));
  if (simple[0] !== null && simple[1] !== null) {
    [simple[0], simple[1]] = [simple[1], simple[0]];
  }
  return simple;
}

const SlidePuzzle: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const gameId = id || DEFAULT_GAME_ID;

  const boardContainerRef = useRef<HTMLDivElement | null>(null);

  // board state: each position holds the tile's correctIndex number or null (blank)
  const [board, setBoard] = useState<Array<number | null>>(() =>
    Array.from({ length: TOTAL }, (_, i) => (i === MISSING_INDEX ? null : i))
  );

  const [gameState, setGameState] = useState<GameState>("idle");
  const [previewing, setPreviewing] = useState(false);
  const previewRef = useRef<number | null>(null);
  const [isAwarded, setIsAwarded] = useState(false);

  // Timer
  const [timeLeft, setTimeLeft] = useState<number>(TOTAL_SECONDS);
  const intervalRef = useRef<number | null>(null);

  // DOM measured tile sizes & offsets
  const [tileSize, setTileSize] = useState<{ w: number; h: number; leftOffsets: number[]; topOffsets: number[] }>({
    w: 0,
    h: 0,
    leftOffsets: [],
    topOffsets: [],
  });

  const blankIndex = board.findIndex((v) => v === null);
  const isSolved = board.every((v, idx) => {
    if (idx === MISSING_INDEX) return v === null;
    return v === idx;
  });

  // measure tile positions
  const measureLayout = () => {
    const container = boardContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const innerW = rect.width - 2 * INNER_PADDING_PX;
    const innerH = rect.height - 2 * INNER_PADDING_PX;
    const totalGapW = (COLS - 1) * GRID_GAP_PX;
    const totalGapH = (ROWS - 1) * GRID_GAP_PX;
    const tileW = Math.floor((innerW - totalGapW) / COLS);
    const tileH = Math.floor((innerH - totalGapH) / ROWS);

    const leftOffsets: number[] = [];
    const topOffsets: number[] = [];
    for (let c = 0; c < COLS; c++) {
      const left = INNER_PADDING_PX + c * (tileW + GRID_GAP_PX);
      leftOffsets.push(left);
    }
    for (let r = 0; r < ROWS; r++) {
      const top = INNER_PADDING_PX + r * (tileH + GRID_GAP_PX);
      topOffsets.push(top);
    }
    setTileSize({ w: tileW, h: tileH, leftOffsets, topOffsets });
  };

  useEffect(() => {
    measureLayout();
    const onResize = () => measureLayout();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardContainerRef.current]);

  useEffect(() => {
    return () => {
      if (previewRef.current) window.clearTimeout(previewRef.current);
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, []);

  // timer handling
  const startTimer = () => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          if (intervalRef.current) {
            window.clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          // move to ad state if currently playing
          setTimeout(() => setGameState((prev) => (prev === "playing" ? "ad" : prev)), 0);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  };

  const stopTimer = () => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // reveal final piece and award when solved
  useEffect(() => {
    if (gameState === "playing" && isSolved) {
      setGameState("locked");
      stopTimer();
      window.setTimeout(async () => {
        // place final tile visually
        setBoard((b) => {
          const nb = [...b];
          nb[MISSING_INDEX] = MISSING_INDEX;
          return nb;
        });
        setGameState("win");
        if (!isAwarded) {
          const ok = await awardAndMark(user, gameId);
          setIsAwarded(ok);
          if (ok) toast.success(`Nice! +${GAME_REWARD} diamonds awarded`);
          else toast.error("Failed to record reward. Try again later.");
        }
      }, 320);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSolved, gameState]);

  // keyboard arrow control (moves blank)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (gameState !== "playing") return;
      const col = (i: number) => i % COLS;
      const row = (i: number) => Math.floor(i / COLS);
      const b = blankIndex;
      if (b < 0) return;
      let target = -1;
      if (e.key === "ArrowUp") {
        const r = row(b);
        if (r < ROWS - 1) target = b + COLS;
      } else if (e.key === "ArrowDown") {
        const r = row(b);
        if (r > 0) target = b - COLS;
      } else if (e.key === "ArrowLeft") {
        const c = col(b);
        if (c < COLS - 1) target = b + 1;
      } else if (e.key === "ArrowRight") {
        const c = col(b);
        if (c > 0) target = b - 1;
      }
      if (target >= 0) {
        e.preventDefault();
        swapTiles(target, b);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gameState, blankIndex, board]);

  // start the game: shuffle then preview then play + timer
  const startGame = async () => {
    if (!user) {
      toast.error("Please sign in to play");
      return;
    }
    const played = await hasPlayedToday(user, gameId);
    if (played) {
      toast.error("You already played this mini-game today. Come back tomorrow!");
      return;
    }
    const shuffled = shuffleSolvable();
    setBoard(shuffled);
    setIsAwarded(false);
    setTimeLeft(TOTAL_SECONDS);
    setGameState("preview");
    setPreviewing(true);
    if (previewRef.current) window.clearTimeout(previewRef.current);
    previewRef.current = window.setTimeout(() => {
      setPreviewing(false);
      setGameState("playing");
      previewRef.current = null;
      startTimer();
    }, PREVIEW_MS);
  };

  // move tile into blank if adjacent
  const swapTiles = (tileIdx: number, blankIdx: number) => {
    const tileRow = Math.floor(tileIdx / COLS);
    const tileCol = tileIdx % COLS;
    const blankRow = Math.floor(blankIdx / COLS);
    const blankCol = blankIdx % COLS;
    const manhattan = Math.abs(tileRow - blankRow) + Math.abs(tileCol - blankCol);
    if (manhattan !== 1) return;
    setBoard((prev) => {
      const copy = [...prev];
      [copy[tileIdx], copy[blankIdx]] = [copy[blankIdx], copy[tileIdx]];
      return copy;
    });
  };

  const onTileClick = (idx: number) => {
    if (gameState !== "playing") return;
    const b = board.findIndex((v) => v === null);
    if (b < 0) return;
    swapTiles(idx, b);
  };

  // reset to idle (used by Play Again)
  const resetToIdle = () => {
    setBoard(Array.from({ length: TOTAL }, (_, i) => (i === MISSING_INDEX ? null : i)));
    setGameState("idle");
    setIsAwarded(false);
    setTimeLeft(TOTAL_SECONDS);
    stopTimer();
  };

  // ad flow: watch ad => add seconds, resume play
  const watchAdAndContinue = () => {
    toast.info(`Ad watched successfully! +${AD_CONTINUE_SECONDS}s`);
    setTimeLeft((t) => t + AD_CONTINUE_SECONDS);
    setGameState("playing");
    startTimer();
  };

  // helpers for tile layout
  const positionForIndex = (index: number) => {
    if (!tileSize.leftOffsets.length || !tileSize.topOffsets.length) return { left: 0, top: 0 };
    const col = index % COLS;
    const row = Math.floor(index / COLS);
    const left = tileSize.leftOffsets[col];
    const top = tileSize.topOffsets[row];
    return { left, top };
  };

  const findTilePosition = (correctIndex: number) => board.findIndex((v) => v === correctIndex);

  const formatTime = (s: number) => {
    const mm = Math.floor(s / 60)
      .toString()
      .padStart(2, "0");
    const ss = Math.floor(s % 60)
      .toString()
      .padStart(2, "0");
    return `${mm}:${ss}`;
  };

  // prepare tiles list for stable keys
  const tiles = Array.from({ length: TOTAL }, (_, i) => i).filter((i) => i !== MISSING_INDEX);

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col items-center">
      {/* Top bar */}
      <div className="w-full max-w-3xl px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="glass-panel rounded-full px-3 py-2">
            <div className="font-mono text-lg">{formatTime(timeLeft)}</div>
          </div>
          <div className="hidden sm:block text-sm text-gray-300">Arrange the tiles to complete the image</div>
        </div>

        <div className="flex items-center gap-2">
          <div className="glass-panel rounded-full px-3 py-2 text-sm">
            <span className="text-yellow-300 font-semibold">♦ {GAME_REWARD}</span>
          </div>
          <Button variant="outline" onClick={() => navigate(-1)} className="py-2 px-3">
            Exit
          </Button>
        </div>
      </div>

      {/* Game area */}
      <div className="relative flex-1 flex items-center justify-center w-full px-3 pb-6">
        <div className="max-w-md w-full">
          {/* Board container (outer with padding) */}
          <div
            className="relative mx-auto"
            style={{
              width: "min(92vw, 480px)",
              aspectRatio: "1 / 1",
              backgroundColor: "#0b1220",
              borderRadius: 12,
              padding: 10,
              boxShadow: "inset 0 0 60px rgba(124,58,237,0.03)",
            }}
          >
            {/* inner grid */}
            <div
              ref={boardContainerRef}
              className="relative rounded-md overflow-hidden touch-none"
              style={{
                width: "100%",
                height: "100%",
                padding: INNER_PADDING_PX,
                boxSizing: "border-box",
                backgroundColor: "rgba(255,255,255,0.02)",
              }}
            >
              {/* preview overlay */}
              {previewing && (
                <div
                  className="absolute inset-0 rounded-md pointer-events-none"
                  style={{
                    backgroundImage: `url(${IMAGE_URL})`,
                    backgroundSize: `${COLS * 100}% ${ROWS * 100}%`,
                    backgroundPosition: `0% 0%`,
                    opacity: 0.12,
                    transition: "opacity 240ms",
                  }}
                />
              )}

              {/* tiles (absolutely positioned) */}
              {tiles.map((correctIndex) => {
                const posIndex = findTilePosition(correctIndex);
                const isVisible = posIndex !== -1;
                const { left, top } = isVisible ? positionForIndex(posIndex) : { left: 0, top: 0 };
                const showFinal = board[MISSING_INDEX] === MISSING_INDEX && correctIndex === MISSING_INDEX;
                const col = correctIndex % COLS;
                const row = Math.floor(correctIndex / COLS);
                const bgPos = `${(col / (COLS - 1)) * 100}% ${(row / (ROWS - 1)) * 100}%`;

                return (
                  <button
                    key={`tile-${correctIndex}`}
                    onClick={() => {
                      if (gameState !== "playing") return;
                      const b = board.findIndex((v) => v === null);
                      if (b < 0) return;
                      const tilePos = findTilePosition(correctIndex);
                      if (tilePos === -1) return;
                      swapTiles(tilePos, b);
                    }}
                    aria-label={`tile-${correctIndex}`}
                    className="absolute shadow-md rounded-md focus:outline-none"
                    style={{
                      left,
                      top,
                      width: tileSize.w,
                      height: tileSize.h,
                      border: "1px solid rgba(255,255,255,0.04)",
                      transition:
                        "left 220ms cubic-bezier(.2,.9,.2,1), top 220ms cubic-bezier(.2,.9,.2,1), opacity 260ms, transform 260ms",
                      pointerEvents: isVisible && gameState === "playing" ? "auto" : "none",
                      overflow: "hidden",
                      backgroundColor: "transparent",
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        backgroundImage: `url(${IMAGE_URL})`,
                        backgroundSize: `${COLS * 100}% ${ROWS * 100}%`,
                        backgroundPosition: bgPos,
                        backgroundRepeat: "no-repeat",
                        transform: showFinal ? "scale(0.92)" : "scale(1)",
                        opacity: isVisible ? 1 : 0,
                      }}
                    />
                  </button>
                );
              })}

              {/* blank placeholder (invisible but for positioning) */}
              {blankIndex >= 0 && (
                <div
                  style={{
                    position: "absolute",
                    left: positionForIndex(blankIndex).left,
                    top: positionForIndex(blankIndex).top,
                    width: tileSize.w,
                    height: tileSize.h,
                    pointerEvents: "none",
                    transition: "left 220ms, top 220ms",
                  }}
                />
              )}
            </div>
          </div>

          {/* controls - NO Restart button anywhere */}
          <div className="mt-4 flex gap-3 justify-center">
            {gameState === "idle" && (
              <Button size="lg" onClick={startGame} className="bg-blue-600 px-6 py-3">
                Start Puzzle
              </Button>
            )}

            {(gameState === "win" || gameState === "locked") && (
              <>
                <Button onClick={() => resetToIdle()} className="bg-blue-600">
                  Play Again
                </Button>
                <Button variant="outline" onClick={() => navigate(-1)}>
                  Exit
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* AD MODAL: full-screen overlay that sits above the game */}
      {gameState === "ad" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="glass-panel p-6 rounded-2xl text-center max-w-[420px] w-full mx-4">
            <h3 className="text-2xl font-bold mb-2 text-red-300">Time's Up</h3>
            <p className="text-sm text-gray-300 mb-4">Watch an ad to get +1 minute and continue the puzzle.</p>
            <div className="flex gap-3 justify-center">
              <Button onClick={watchAdAndContinue} className="bg-green-600">
                Watch Ad to Continue
              </Button>
              <Button variant="outline" onClick={() => navigate(-1)}>
                Exit
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* WIN modal (keeps above content but below ad) */}
      {gameState === "win" && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 pointer-events-auto">
          <div className="glass-panel p-6 rounded-2xl text-center max-w-[420px] w-full mx-4">
            <h3 className="text-2xl font-bold mb-2 text-green-300">Perfect!</h3>
            <p className="text-sm text-gray-300 mb-4">You completed the image. ♦ {GAME_REWARD} awarded (daily).</p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => resetToIdle()} className="bg-blue-600">
                Play Again
              </Button>
              <Button variant="outline" onClick={() => navigate(-1)}>
                Exit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SlidePuzzle;
