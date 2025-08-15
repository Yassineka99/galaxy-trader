// src/components/minigames/CometCatch.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ref, runTransaction, get } from "firebase/database";
import { db } from "@/integrations/firebase/config";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type GameState = "idle" | "playing" | "ad" | "win" | "lose";

const DEFAULT_GAME_ID = "catch";
const GAME_REWARD = 0.5; // diamonds
const HEARTS_START = 3;
const XP_REWARD = 2;
const GAME_DURATION_MS = 60000; // 60 seconds (updated)
const TARGET_SCORE = 80; // higher target (updated)
const SPAWN_INTERVAL_MS = 480; // slightly faster spawn to balance longer game
const MIN_CARD_SIZE = 72; // visual reference for responsive sizing

const todayStr = () => new Date().toISOString().split("T")[0];

// assets
const BASKET_URL = new URL("../../assets/minigames/catch/basket.png", import.meta.url).href;
const GEM_URL = new URL("../../assets/minigames/catch/gem.png", import.meta.url).href;
const COMET_URL = new URL("../../assets/minigames/catch/comet.png", import.meta.url).href;
const BOMB_URL = new URL("../../assets/minigames/catch/bomb.png", import.meta.url).href;
const BG_URL = new URL("../../assets/minigames/catch/catch-bg.png", import.meta.url).href;

type SpawnType = "gem" | "comet" | "bomb";

type Falling = {
  id: number;
  type: SpawnType;
  x: number; // px
  y: number; // px
  size: number; // px
  speed: number; // px per second
};

const CometCatch: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const gameId = id || DEFAULT_GAME_ID;

  // UI + game state
  const [gameState, setGameState] = useState<GameState>("idle");
  const [hearts, setHearts] = useState<number>(HEARTS_START);
  const [score, setScore] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(GAME_DURATION_MS);
  const [isAwarded, setIsAwarded] = useState(false);

  // keep a ref mirror of score to avoid stale closures
  const scoreRef = useRef<number>(score);
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  // objects
  const [falling, setFalling] = useState<Falling[]>([]);

  // refs for animation & control
  const gameAreaRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const spawnIntervalRef = useRef<number | null>(null);
  const nextIdRef = useRef<number>(1);
  const runningRef = useRef<boolean>(false);

  // basket position (px)
  const basketXRef = useRef<number>(0);
  const basketWRef = useRef<number>(120);
  const basketHRef = useRef<number>(60);

  // for dragging
  const draggingRef = useRef<boolean>(false);
  const dragOffsetRef = useRef<number>(0);

  // ==== Firebase helpers ====
  const hasPlayedToday = async (): Promise<boolean> => {
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

  const awardAndMark = async () => {
    if (!user) return;
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
      setIsAwarded(true);
      toast.success(`Nice! +${GAME_REWARD} diamonds awarded`);
    } catch (err) {
      console.error("awardAndMark error", err);
      toast.error("Failed to record reward. Try again later.");
    }
  };

  // ==== Helpers ====
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

  const getGameDims = () => {
    const ga = gameAreaRef.current;
    if (!ga) return { w: 360, h: 640 };
    return { w: ga.clientWidth, h: ga.clientHeight };
  };

  // position basket in center on init / resize
  useEffect(() => {
    const handleResize = () => {
      const { w } = getGameDims();
      const bw = Math.max(Math.floor(w * 0.28), 72); // basket width relative to screen
      basketWRef.current = bw;
      basketHRef.current = Math.floor(bw * 0.5);
      basketXRef.current = (w - bw) / 2;
      // force a render for layout reactiveness
      setFalling((f) => [...f]);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Clear loops on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (spawnIntervalRef.current) window.clearInterval(spawnIntervalRef.current);
    };
  }, []);

  // ==== Spawn logic ====
  const spawnObject = () => {
    const { w } = getGameDims();
    const rand = Math.random();
    let type: SpawnType = "gem";
    if (rand < 0.12) type = "bomb"; // ~12%
    else if (rand < 0.42) type = "comet"; // ~30%
    else type = "gem"; // ~58%

    const size = Math.floor(clamp(w * (type === "gem" ? 0.11 : type === "comet" ? 0.14 : 0.12), 36, 120));
    const speed = Math.floor((type === "bomb" ? 220 : type === "comet" ? 300 : 240) * (0.9 + Math.random() * 0.6)); // px/s
    const x = Math.floor(Math.random() * (w - size));
    const id = nextIdRef.current++;

    const item: Falling = { id, type, x, y: -size, size, speed };
    setFalling((prev) => [...prev, item]);
  };

  // ==== Game loop ====
  const loop = (ts: number) => {
    if (!runningRef.current) {
      lastTsRef.current = null;
      return;
    }
    if (!lastTsRef.current) lastTsRef.current = ts;
    const dt = Math.min(60, ts - lastTsRef.current); // ms
    lastTsRef.current = ts;
    const dtSec = dt / 1000;

    const { h } = getGameDims();

    // update falling objects
    setFalling((prev) => {
      const next: Falling[] = [];
      for (const item of prev) {
        const ny = item.y + item.speed * dtSec;
        // check collision with basket
        const basketY = h - basketHRef.current - 16; // small margin from bottom
        const bx = basketXRef.current;
        const bw = basketWRef.current;
        const bh = basketHRef.current;
        const collided =
          ny + item.size >= basketY && // reached basket Y
          ny <= basketY + bh && // vertical overlap
          item.x + item.size >= bx &&
          item.x <= bx + bw; // horizontal overlap

        if (collided) {
          // apply effects — use functional updater to keep scoreRef synced
          if (item.type === "gem") {
            setScore((s) => {
              const ns = s + 1;
              scoreRef.current = ns;
              return ns;
            });
          } else if (item.type === "comet") {
            setScore((s) => {
              const ns = s + 2;
              scoreRef.current = ns;
              return ns;
            });
          } else if (item.type === "bomb") {
            setHearts((hh) => {
              const n = hh - 1;
              if (n <= 0) {
                // pause loops and show ad modal
                pauseGame();
                setGameState("ad");
                return 0;
              }
              return n;
            });
          }
          // collected — don't push to next
          continue;
        }

        // drop off screen
        if (ny > h + 200) {
          continue; // remove it
        }

        next.push({ ...item, y: ny });
      }
      return next;
    });

    // decrease timer (use functional update and then evaluate with scoreRef)
    setTimeLeft((prev) => {
      const nextT = Math.max(0, prev - dt);
      if (nextT <= 0) {
        // time expired -> evaluate win/lose using latest scoreRef
        pauseGame();
        if (scoreRef.current >= TARGET_SCORE) {
          setGameState("win");
          if (!isAwarded) awardAndMark();
        } else {
          setGameState("lose");
        }
      }
      return nextT;
    });

    // check immediate win (reach target before time) — use scoreRef to avoid stale reads
    if (scoreRef.current >= TARGET_SCORE) {
      pauseGame();
      setGameState("win");
      if (!isAwarded) awardAndMark();
      return;
    }

    rafRef.current = requestAnimationFrame(loop);
  };

  const startLoops = () => {
    if (runningRef.current) return;
    runningRef.current = true;
    lastTsRef.current = null;
    rafRef.current = requestAnimationFrame(loop);
    spawnIntervalRef.current = window.setInterval(spawnObject, SPAWN_INTERVAL_MS);
  };

  const pauseGame = () => {
    runningRef.current = false;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (spawnIntervalRef.current) {
      window.clearInterval(spawnIntervalRef.current);
      spawnIntervalRef.current = null;
    }
  };

  // ==== Start / Restart / Controls ====
  const startGame = async () => {
    if (!user) {
      toast.error("Please sign in to play");
      return;
    }
    const already = await hasPlayedToday();
    if (already) {
      toast.error("You already played this mini-game today. Come back tomorrow!");
      return;
    }

    setHearts(HEARTS_START);
    setScore(0);
    scoreRef.current = 0;
    setTimeLeft(GAME_DURATION_MS);
    setFalling([]);
    nextIdRef.current = 1;
    setIsAwarded(false);
    setGameState("playing");

    // ensure basket centered
    const { w } = getGameDims();
    basketWRef.current = Math.max(Math.floor(w * 0.28), 72);
    basketHRef.current = Math.floor(basketWRef.current * 0.5);
    basketXRef.current = (w - basketWRef.current) / 2;

    startLoops();
  };

  const restartGame = () => {
    pauseGame();
    setGameState("idle");
    setFalling([]);
    setScore(0);
    scoreRef.current = 0;
    setTimeLeft(GAME_DURATION_MS);
    setHearts(HEARTS_START);
  };

  // resume after ad
  const watchAdAndContinue = () => {
    // simulate ad
    toast.info("Ad watched — +1 heart");
    setHearts(1);
    setTimeLeft((t) => Math.max(t, 1000)); // give at least some time if zero
    setGameState("playing");
    startLoops();
  };

  // handle pointer (drag) on basket area
  useEffect(() => {
    const area = gameAreaRef.current;
    if (!area) return;

    const onPointerDown = (ev: PointerEvent) => {
      if (gameState !== "playing") return;
      (ev.target as Element).setPointerCapture?.(ev.pointerId);
      draggingRef.current = true;
      const rect = area.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      dragOffsetRef.current = px - basketXRef.current;
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (!draggingRef.current) return;
      const rect = area.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const newX = clamp(px - dragOffsetRef.current, 0, Math.max(0, rect.width - basketWRef.current));
      basketXRef.current = newX;
      setFalling((f) => [...f]);
    };

    const onPointerUp = (ev: PointerEvent) => {
      draggingRef.current = false;
      try {
        (ev.target as Element).releasePointerCapture?.(ev.pointerId);
      } catch {}
    };

    area.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      area.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [gameState]);

  // keyboard left/right for desktop
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (gameState !== "playing") return;
      const { w } = getGameDims();
      const step = Math.max(24, Math.floor(w * 0.06));
      if (e.key === "ArrowLeft") {
        basketXRef.current = clamp(basketXRef.current - step, 0, Math.max(0, w - basketWRef.current));
        setFalling((f) => [...f]);
      } else if (e.key === "ArrowRight") {
        basketXRef.current = clamp(basketXRef.current + step, 0, Math.max(0, w - basketWRef.current));
        setFalling((f) => [...f]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gameState]);

  // UI derived
  const brokenHearts = useMemo(() => {
    return Array.from({ length: HEARTS_START }).map((_, i) => (i < hearts ? "❤" : "💔"));
  }, [hearts]);

  // small helper to format seconds
  const secondsLeft = Math.ceil(timeLeft / 1000);

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col">
      {/* Topbar */}
      <div className="flex items-center justify-between px-4 py-3 gap-3 z-10">
        <div className="glass-panel rounded-full px-3 py-2 flex items-center gap-3">
          <div className="flex items-center gap-2 select-none">
            {brokenHearts.map((h, i) => (
              <span key={i} className={`text-lg sm:text-2xl ${i < hearts ? "text-red-500" : "text-gray-400"}`}>
                {h}
              </span>
            ))}
          </div>
          <div className="text-sm text-gray-300 hidden sm:block">Hearts</div>
        </div>

        <div className="flex items-center gap-3">
          <div className="glass-panel rounded-full px-3 py-2 text-sm">
            <span className="text-yellow-300 font-semibold">♦ {GAME_REWARD}</span>
          </div>

          <div className="glass-panel rounded-full px-3 py-2 text-sm">
            <span className="font-medium">{score} pts</span>
            <span className="text-gray-400 ml-2">• {secondsLeft}s</span>
          </div>

          <Button variant="outline" onClick={() => { pauseGame(); navigate(-1); }}>
            Exit
          </Button>
        </div>
      </div>

      {/* Game Area */}
      <div ref={gameAreaRef} className="relative flex-1 overflow-hidden touch-none">
        {/* background */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-40"
          style={{ backgroundImage: `url(${BG_URL})` }}
          aria-hidden
        />

        {/* objects layer */}
        <div className="absolute inset-0 pointer-events-none">
          {falling.map((it) => (
            <div
              key={it.id}
              style={{
                position: "absolute",
                left: it.x,
                top: it.y,
                width: it.size,
                height: it.size,
                transformOrigin: "center",
                willChange: "transform, top",
                transition: "transform 0.06s linear",
                zIndex: 10,
              }}
            >
              <img
                src={it.type === "gem" ? GEM_URL : it.type === "comet" ? COMET_URL : BOMB_URL}
                alt={it.type}
                draggable={false}
                className="w-full h-full object-contain select-none pointer-events-none"
              />
            </div>
          ))}
        </div>

        {/* basket */}
        <div
          className="absolute left-0 bottom-4 z-20"
          style={{
            left: basketXRef.current,
            width: basketWRef.current,
            height: basketHRef.current,
            touchAction: "none",
          }}
        >
          <img
            src={BASKET_URL}
            alt="basket"
            draggable={false}
            className="w-full h-full object-contain select-none"
          />
        </div>

        {/* Start overlay */}
        {gameState === "idle" && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
            <div className="glass-panel rounded-2xl text-center p-6 max-w-sm w-full">
              <h2 className="text-2xl font-bold mb-2">Comet Catch</h2>
              <p className="text-sm text-gray-300 mb-3">Catch gems and comets — avoid bombs. Reach <span className="font-semibold">{TARGET_SCORE}</span> points in <span className="font-semibold">{GAME_DURATION_MS/1000}s</span>.</p>
              <div className="flex gap-3 justify-center">
                <Button onClick={startGame} className="bg-blue-600 hover:bg-blue-700 py-3 px-6">Start</Button>
                <Button variant="outline" onClick={() => navigate(-1)} className="py-3 px-4">Back</Button>
              </div>
            </div>
          </div>
        )}

        {/* Ad overlay (out of hearts) */}
        {gameState === "ad" && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className="glass-panel rounded-2xl text-center p-6 max-w-sm w-full">
              <h2 className="text-2xl font-bold mb-2 text-red-400">Out of Hearts</h2>
              <p className="text-sm text-gray-300 mb-4">Watch an ad to continue with 1 heart.</p>
              <div className="flex gap-3 justify-center">
                <Button onClick={watchAdAndContinue} className="bg-green-600 hover:bg-green-700 py-3 px-6">Watch Ad</Button>
                <Button variant="outline" onClick={restartGame} className="py-3 px-4">Restart</Button>
                <Button variant="ghost" onClick={() => navigate(-1)} className="py-3 px-4 text-gray-300">Exit</Button>
              </div>
            </div>
          </div>
        )}

        {/* Win overlay */}
        {gameState === "win" && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className="glass-panel rounded-2xl text-center p-6 max-w-sm w-full">
              <h2 className="text-2xl font-bold mb-2 text-green-400">You Win!</h2>
              <p className="text-sm text-yellow-300 mb-3">♦ {GAME_REWARD} earned</p>
              <p className="text-sm text-gray-300 mb-4">Great job — you reached the target score!</p>
              <div className="flex gap-3 justify-center">
                <Button onClick={() => { setGameState("idle"); setFalling([]); setScore(0); scoreRef.current = 0; setTimeLeft(GAME_DURATION_MS); setHearts(HEARTS_START); }} className="py-3 px-6">Play Again</Button>
                <Button variant="outline" onClick={() => navigate(-1)} className="py-3 px-4">Exit</Button>
              </div>
            </div>
          </div>
        )}

        {/* Lose overlay */}
        {gameState === "lose" && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className="glass-panel rounded-2xl text-center p-6 max-w-sm w-full">
              <h2 className="text-2xl font-bold mb-2 text-red-400">Time's Up</h2>
              <p className="text-sm text-gray-300 mb-4">You scored {score} points. Try again to reach {TARGET_SCORE}.</p>
              <div className="flex gap-3 justify-center">
                <Button onClick={restartGame} className="py-3 px-6">Try Again</Button>
                <Button variant="outline" onClick={() => navigate(-1)} className="py-3 px-4">Exit</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CometCatch;
