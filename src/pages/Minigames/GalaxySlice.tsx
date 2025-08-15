// src/components/minigames/GalaxySlice.tsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ref, runTransaction, get } from "firebase/database";
import { db } from "@/integrations/firebase/config";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * GalaxySlice - Fruit Ninja like mini-game
 *
 * - Mobile-first, pointer-based slicing
 * - Fruits and bombs spawn and arc across the playfield
 * - Slicing fruits increments score; slicing a bomb triggers "ad" state (you can watch ad to continue)
 * - Timer counts down; when time runs out you can watch an ad to continue (+10s)
 * - Win by reaching TARGET_SCORE within time
 * - Awarded once per day using same Firebase runTransaction pattern as your other games
 *
 * Notes: This uses no external assets — fruits are colored glowing circles with emojis.
 */

type GameState = "idle" | "playing" | "ad" | "win" | "lost";

const DEFAULT_GAME_ID = "galaxy-slice";
const GAME_REWARD = 0.2; // diamonds
const XP_REWARD = 2;
const START_TIME_SEC = 60;
const AD_CONTINUE_SECONDS = 10;
const TARGET_SCORE = 40; // reach this score to win

const todayStr = () => new Date().toISOString().split("T")[0];

// Fruit palette (distinct + galaxy glow)
const FRUIT_TYPES = [
  { id: "apple", color: "#EF4444", emoji: "🍎", score: 1 },
  { id: "blue", color: "#3B82F6", emoji: "🫐", score: 1 },
  { id: "orange", color: "#F97316", emoji: "🍊", score: 1 },
  { id: "kiwi", color: "#10B981", emoji: "🥝", score: 2 },
  { id: "starfruit", color: "#F59E0B", emoji: "⭐️", score: 3 },
];
const BOMB_TYPE = { id: "bomb", color: "#111827", emoji: "💣" };

type Fruit = {
  id: number;
  kind: string;
  color: string;
  emoji?: string;
  score: number;
  x: number; // px relative to container
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  size: number; // px diameter
  exploded?: boolean; // sliced
  isBomb?: boolean;
  spawnTime: number;
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);

// Firebase helpers (same as your other games)
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

const awardAndMarkDB = async (user: any, gameId: string) => {
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

// Utility: distance from line segment to point
function segPointDist(ax: number, ay: number, bx: number, by: number, px: number, py: number) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const c1 = vx * wx + vy * wy;
  const c2 = vx * vx + vy * vy;
  if (c2 <= 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, c1 / c2));
  const projx = ax + t * vx;
  const projy = ay + t * vy;
  return Math.hypot(px - projx, py - projy);
}

const GalaxySlice: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const gameId = id || DEFAULT_GAME_ID;

  // refs & state
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const fruitIdRef = useRef(1);
  const [fruits, setFruits] = useState<Fruit[]>([]);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(START_TIME_SEC);
  const [gameState, setGameState] = useState<GameState>("idle");
  const [slicePath, setSlicePath] = useState<{ x: number; y: number; t: number }[]>([]);
  const slicePathRef = useRef<{ x: number; y: number; t: number }[]>([]);
  const [isAwarded, setIsAwarded] = useState(false);
  const spawnTimerRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);

  // gameplay params
  const gravity = 1200; // px/s^2
  const spawnIntervalRange = [520, 920]; // ms
  const maxFruitsOnScreen = 10;
  const playSpawnBombChance = 0.12; // chance that a spawn is a bomb

  useEffect(() => {
    return () => {
      stopLoop();
      if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- timer helpers like other games -----
  const startCountdown = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
          // time's up => show ad modal
          setTimeout(() => setGameState((prev) => (prev === "playing" ? "ad" : prev)), 0);
          return 0;
        }
        return t - 1;
      });
    }, 1000) as unknown as number;
  };
  const stopCountdown = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  };

  // ----- spawn logic -----
  const scheduleNextSpawn = (min = spawnIntervalRange[0], max = spawnIntervalRange[1]) => {
    if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current);
    const delay = rand(min, max);
    spawnTimerRef.current = window.setTimeout(() => {
      spawnFruit();
      scheduleNextSpawn();
    }, delay);
  };

  function spawnFruit() {
    const container = containerRef.current;
    if (!container) return;
    // limit
    setFruits((prev) => {
      if (prev.length >= maxFruitsOnScreen) return prev;
      const rect = container.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;

      // spawn from bottom below view (y > height) and launch upwards
      const startX = rand(width * 0.08, width * 0.92);
      const startY = height + 24;
      // velocity so it arcs up and falls down; random angle
      const vx = rand(-300, 300); // px/s
      const vy = rand(-1200, -700); // px/s (negative = up)
      const size = Math.floor(rand(44, 66)); // diameter px

      const isBomb = Math.random() < playSpawnBombChance;
      const kindObj = isBomb ? BOMB_TYPE : FRUIT_TYPES[Math.floor(Math.random() * FRUIT_TYPES.length)];
      const idNum = fruitIdRef.current++;
      const f: Fruit = {
        id: idNum,
        kind: String(kindObj.id),
        color: String(kindObj.color),
        emoji: kindObj.emoji,
        score: isBomb ? 0 : (kindObj as any).score || 1,
        x: startX,
        y: startY,
        vx,
        vy,
        rotation: rand(-240, 240),
        size,
        exploded: false,
        isBomb,
        spawnTime: performance.now(),
      };
      return [...prev, f];
    });
  }

  // ----- game loop (physics & collision) -----
  const startLoop = () => {
    if (rafRef.current) return;
    lastTimeRef.current = performance.now();
    const loop = (now: number) => {
      const last = lastTimeRef.current || now;
      const dt = Math.max(0, Math.min(40, now - last)) / 1000; // clamp, seconds
      lastTimeRef.current = now;
      updatePhysics(dt);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  };

  const stopLoop = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTimeRef.current = null;
    }
  };

  const updatePhysics = (dt: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    setFruits((prev) => {
      const next: Fruit[] = [];
      for (const f of prev) {
        if (f.exploded) continue; // skip exploded ones (they animate out via CSS)
        // integrate
        const nvx = f.vx;
        const nvy = f.vy + gravity * dt;
        const nx = f.x + nvx * dt;
        const ny = f.y + nvy * dt;
        const nrot = f.rotation + 90 * dt;
        // keep on-screen a bit; remove if sufficiently below bottom and old
        const tooOld = performance.now() - f.spawnTime > 12000; // 12s lifespan max
        if (ny - f.size / 2 > h + 240 || tooOld) {
          // remove
          continue;
        }
        next.push({ ...f, x: nx, y: ny, vx: nvx, vy: nvy, rotation: nrot });
      }
      return next;
    });

    // prune slice path to recent points (for performance)
    const now = performance.now();
    slicePathRef.current = slicePathRef.current.filter((p) => now - p.t < 280);
    setSlicePath([...slicePathRef.current]);
    // check collisions between last slice segments and fruits
    if (slicePathRef.current.length >= 2 && fruits.length > 0) {
      const segA = slicePathRef.current[slicePathRef.current.length - 2];
      const segB = slicePathRef.current[slicePathRef.current.length - 1];
      checkSliceCollisions(segA.x, segA.y, segB.x, segB.y);
    }
  };

  // ----- collision detection: check slice segment against fruits -----
  const checkSliceCollisions = (ax: number, ay: number, bx: number, by: number) => {
    if (ax === bx && ay === by) return;
    const THRESHOLD_MULT = 0.6; // how forgiving the slice is relative to fruit radius
    setFruits((prev) => {
      let anyBomb = false;
      const changed = prev.map((f) => {
        if (f.exploded) return f;
        // distance from segment to fruit center
        const d = segPointDist(ax, ay, bx, by, f.x, f.y);
        const r = f.size / 2;
        if (d <= r * THRESHOLD_MULT) {
          // sliced
          if (f.isBomb) anyBomb = true;
          return { ...f, exploded: true };
        }
        return f;
      });
      if (anyBomb) {
        // slicing a bomb => immediate ad state (lost) - stop loop and countdown
        setTimeout(() => {
          stopLoop();
          stopCountdown();
          setGameState("ad");
        }, 80);
        // keep sliced flag so bomb animate
      }
      // increment score for fruits sliced (count all newly exploded non-bombs)
      const newly = changed.filter((f, i) => f.exploded && !prev[i].exploded && !f.isBomb);
      if (newly.length > 0) {
        const gained = newly.reduce((s, f) => s + (f.score || 1), 0);
        setScore((s) => s + gained);
      }
      return changed;
    });
  };

  // ----- pointer handlers (slice path) -----
  const onPointerDown = (ev: React.PointerEvent) => {
    if (gameState !== "playing") return;
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const t = performance.now();
    slicePathRef.current = [{ x, y, t }];
    setSlicePath([...slicePathRef.current]);
  };

  const onPointerMove = (ev: React.PointerEvent) => {
    if (gameState !== "playing") return;
    const container = containerRef.current;
    if (!container) return;
    if (!slicePathRef.current) slicePathRef.current = [];
    const rect = container.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const t = performance.now();
    // push with spacing to avoid too many points
    const last = slicePathRef.current[slicePathRef.current.length - 1];
    if (!last || Math.hypot(last.x - x, last.y - y) > 8) {
      slicePathRef.current.push({ x, y, t });
      setSlicePath([...slicePathRef.current]);
      // immediate collision check against fruits for snappy response
      if (slicePathRef.current.length >= 2) {
        const a = slicePathRef.current[slicePathRef.current.length - 2];
        const b = slicePathRef.current[slicePathRef.current.length - 1];
        checkSliceCollisions(a.x, a.y, b.x, b.y);
      }
    }
  };

  const onPointerUp = (ev: React.PointerEvent) => {
    try {
      (ev.target as Element).releasePointerCapture?.(ev.pointerId);
    } catch {}
    slicePathRef.current = [];
    setSlicePath([]);
  };

  // ----- start / stop game flow -----
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
    setFruits([]);
    setScore(0);
    setTimeLeft(START_TIME_SEC);
    setIsAwarded(false);
    setGameState("playing");
    // begin spawning and loop
    scheduleNextSpawn();
    startLoop();
    startCountdown();
  };

  const watchAdAndContinue = () => {
    toast.info(`Ad watched successfully! +${AD_CONTINUE_SECONDS}s`);
    setTimeLeft((t) => t + AD_CONTINUE_SECONDS);
    // resume
    setGameState("playing");
    startLoop();
    startCountdown();
  };

  // When win occurs
  useEffect(() => {
    if (gameState === "playing" && score >= TARGET_SCORE) {
      // achieved target
      stopLoop();
      stopCountdown();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score, gameState]);

  // helper to clear all fruits and reset
  const resetToIdle = () => {
    setFruits([]);
    setScore(0);
    setSlicePath([]);
    slicePathRef.current = [];
    setGameState("idle");
    stopLoop();
    stopCountdown();
    if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current);
  };

  // ----- UI rendering -----
  // compute slice polyline - condensed coordinates for SVG
  const sliceSvgPoints = slicePath.map((p) => `${(p.x / (containerRef.current?.clientWidth || 1)) * 100},${(p.y / (containerRef.current?.clientHeight || 1)) * 100}`).join(" ");

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col items-center">
      {/* Top Bar */}
      <div className="w-full max-w-3xl px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="glass-panel rounded-full px-3 py-2">
            <div className="font-mono text-lg">{timeLeft}s</div>
          </div>
          <div className="text-sm text-gray-300 hidden sm:block">Slice the cosmic fruits — avoid bombs!</div>
        </div>

        <div className="flex items-center gap-2">
          <div className="glass-panel rounded-full px-3 py-2 text-sm">
            <strong>♦ {GAME_REWARD}</strong>
          </div>
          <Button onClick={() => navigate(-1)} variant="outline" className="py-2 px-3">
            Exit
          </Button>
        </div>
      </div>

      {/* Play area */}
      <div className="relative flex-1 w-full px-3 pb-6 flex items-center justify-center">
        {/* galaxy background */}
        <div
          ref={containerRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative rounded-xl w-full max-w-4xl overflow-hidden touch-none"
          style={{
            // galaxy pattern background
            height: "min(calc(100vh - 140px), 780px)",
            background:
              "radial-gradient(ellipse at 10% 10%, rgba(99,102,241,0.08), transparent 4%), radial-gradient(ellipse at 90% 80%, rgba(236,72,153,0.05), transparent 6%), linear-gradient(180deg, #05060a 0%, #061022 100%)",
            border: "1px solid rgba(255,255,255,0.04)",
            boxShadow: "0 20px 40px rgba(2,6,23,0.8), inset 0 0 120px rgba(99,102,241,0.02)",
          }}
        >
          {/* subtle starfield */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage:
                "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
              backgroundSize: "20px 20px",
              opacity: 0.06,
              pointerEvents: "none",
            }}
          />

          {/* fruits layer */}
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {fruits.map((f) => {
              const left = f.x - f.size / 2;
              const top = f.y - f.size / 2;
              const transform = `translate(${left}px, ${top}px) rotate(${f.rotation}deg)`;
              const key = `fruit-${f.id}`;
              return (
                <div
                  key={key}
                  style={{
                    position: "absolute",
                    width: f.size,
                    height: f.size,
                    left: 0,
                    top: 0,
                    transform,
                    transformOrigin: "center",
                    pointerEvents: "auto",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {/* fruit visual */}
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: "999px",
                      background: `radial-gradient(circle at 30% 20%, rgba(255,255,255,0.22), ${f.color})`,
                      boxShadow: f.isBomb
                        ? "0 6px 18px rgba(255,80,80,0.08), inset 0 -6px 12px rgba(0,0,0,0.5)"
                        : `0 8px 32px ${f.color}40, inset 0 -8px 18px rgba(255,255,255,0.05)`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: Math.max(18, f.size * 0.42),
                      color: f.isBomb ? "#fff" : "transparent",
                      border: f.isBomb ? "2px solid rgba(255,255,255,0.06)" : "none",
                      // sliced animation
                      transformOrigin: "center",
                      // when exploded we mark via className for CSS animation
                      transition: f.exploded ? "transform 400ms ease, opacity 340ms ease" : undefined,
                      opacity: f.exploded ? 0 : 1,
                    }}
                  >
                    {/* emoji layer for flavor (hidden for fruits since we use color) */}
                    <span style={{ transform: f.exploded ? "scale(0.6)" : "scale(1)", display: f.isBomb ? "block" : "none" }}>
                      {f.emoji}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* slice SVG overlay - shows trail */}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          >
            {/* glow trail */}
            {slicePath.length >= 2 && (
              <>
                <polyline
                  points={sliceSvgPoints}
                  fill="none"
                  stroke="rgba(255,255,255,0.18)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ filter: "blur(4px) drop-shadow(0 4px 10px rgba(30,144,255,0.15))" }}
                />
                <polyline
                  points={sliceSvgPoints}
                  fill="none"
                  stroke="rgba(255,255,255,0.9)"
                  strokeWidth={1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}
          </svg>

          {/* top HUD inside play area */}
          <div style={{ position: "absolute", left: 12, top: 12 }}>
            <div className="glass-panel rounded-full px-3 py-2 text-sm" style={{ background: "rgba(0,0,0,0.45)" }}>
              Score: <span className="font-semibold ml-2">{score}</span>
            </div>
          </div>

          {/* small footer hint */}
          <div style={{ position: "absolute", right: 12, bottom: 12 }}>
            <div className="glass-panel rounded-full px-3 py-2 text-xs" style={{ background: "rgba(0,0,0,0.35)" }}>
              Swipe to slice • Avoid bombs
            </div>
          </div>
        </div>

        {/* overlays */}
        {gameState === "idle" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
            <div className="glass-panel p-6 rounded-2xl text-center max-w-[420px] w-full mx-4">
              <h2 className="text-2xl font-bold mb-2">Galaxy Slice</h2>
              <p className="text-sm text-gray-300 mb-2">Swipe to slice cosmic fruits. Avoid bombs.</p>
              <p className="text-sm text-gray-300 mb-4">Reach <strong>{TARGET_SCORE}</strong> points in <strong>{START_TIME_SEC}s</strong>.</p>
              <div className="flex gap-3 justify-center">
                <Button className="bg-blue-600" onClick={startGame}>Start</Button>
                <Button variant="outline" onClick={() => navigate(-1)}>Back</Button>
              </div>
            </div>
          </div>
        )}

        {gameState === "ad" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
            <div className="glass-panel p-6 rounded-2xl text-center max-w-[420px] w-full mx-4">
              <h2 className="text-2xl font-bold mb-2 text-red-400">Paused</h2>
              <p className="text-sm text-gray-300 mb-4">Watch an ad to continue the run (+{AD_CONTINUE_SECONDS}s).</p>
              <div className="flex gap-3 justify-center">
                <Button onClick={watchAdAndContinue} className="bg-green-600">Watch Ad</Button>
                <Button variant="outline" onClick={resetToIdle}>Restart</Button>
                <Button variant="ghost" onClick={() => navigate(-1)}>Exit</Button>
              </div>
            </div>
          </div>
        )}

        {gameState === "win" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
            <div className="glass-panel p-6 rounded-2xl text-center max-w-[420px] w-full mx-4">
              <h2 className="text-2xl font-bold mb-2 text-green-400">You Sliced It!</h2>
              <p className="text-sm text-gray-300 mb-2">♦ {GAME_REWARD} diamonds awarded</p>
              <p className="text-sm text-gray-300 mb-4">Great slicing — cosmic chef would be proud.</p>
              <div className="flex gap-3 justify-center">
                <Button onClick={() => resetToIdle()}>Play Again</Button>
                <Button variant="outline" onClick={() => navigate(-1)}>Exit</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GalaxySlice;
