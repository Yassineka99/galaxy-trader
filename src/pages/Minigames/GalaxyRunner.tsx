// src/components/minigames/GalaxyRunner.tsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ref, runTransaction, get } from "firebase/database";
import { db } from "@/integrations/firebase/config";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * GalaxyRunner.tsx
 * - Time-only survival (30s)
 * - 3 hearts life system; watch ad to restore hearts
 * - Fixed freeze after watching ad by synchronizing gameStateRef before restarting loops
 * - Fixed: player cannot go above the top of the canvas while jumping
 */

// --------- CONFIG ----------
type GameState = "idle" | "playing" | "ad" | "win" | "lost";

const DEFAULT_GAME_ID = "galaxy-runner";
const GAME_REWARD = 0.2;
const XP_REWARD = 3;
const START_TIME = 30; // seconds to survive
const HEARTS_START = 3;
const INVULN_MS = 900;
const AD_CONTINUE_SECONDS = 10;
const todayStr = () => new Date().toISOString().split("T")[0];

// --------- Firebase helpers (same style) ----------
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

// --------- helpers ----------
const rand = (a: number, b: number) => Math.random() * (b - a) + a;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type Obstacle = { id: number; x: number; y: number; w: number; h: number; speed: number; hue: number };

const GalaxyRunner: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const gameId = id || DEFAULT_GAME_ID;

  // canvas & sizing
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 640, h: 260 });

  // loop refs
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);

  // game state
  const [gameState, setGameState] = useState<GameState>("idle");
  const gameStateRef = useRef<GameState>("idle");
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // obstacles and ids
  const obstaclesRef = useRef<Record<number, Obstacle>>({});
  const nextIdRef = useRef<number>(1);

  // player physics
  const playerYRef = useRef<number>(0);
  const playerVyRef = useRef<number>(0);
  const groundedRef = useRef<boolean>(true);
  const playerXRef = useRef<number>(0);

  // hearts & invulnerability
  const heartsRef = useRef<number>(HEARTS_START);
  const invulnerableUntilRef = useRef<number>(0);
  const [, setHeartsTick] = useState(0); // UI tick for React re-render

  // time countdown
  const [timeLeft, setTimeLeft] = useState<number>(START_TIME);
  const timeLeftRef = useRef<number>(START_TIME);
  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);
  const countdownIntervalRef = useRef<number | null>(null);

  // spawn
  const spawnTimerRef = useRef<number>(0);

  // animation for player (legs offset)
  const animTimerRef = useRef<number>(0);

  // responsive measure
  useEffect(() => {
    const measure = () => {
      const maxW = Math.min(window.innerWidth - 32, 900);
      const w = Math.floor(Math.min(760, maxW * 0.94));
      const h = Math.floor(Math.max(160, Math.round(w * 0.36)));
      setSize({ w, h });
      const c = canvasRef.current;
      if (!c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      const ctx = c.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      playerXRef.current = Math.round(w * 0.12);

      // ensure player starts at ground if needed
      const groundY = h - Math.max(28, Math.round(h * 0.18));
      playerYRef.current = groundY - 12;
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // countdown functions
  const startCountdown = () => {
    stopCountdown();
    const idt = window.setInterval(() => {
      setTimeLeft((t) => {
        const nt = Math.max(0, t - 1);
        timeLeftRef.current = nt;
        if (nt <= 0 && gameStateRef.current === "playing") {
          // win
          stopLoop();
          stopCountdown();
          setGameState("win");
          (async () => {
            if (user) {
              const ok = await awardAndMark(user, gameId);
              if (ok) toast.success(`Nice! +${GAME_REWARD} diamonds awarded`);
            }
          })();
        }
        return nt;
      });
    }, 1000);
    countdownIntervalRef.current = idt as unknown as number;
  };
  const stopCountdown = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  };

  // reset
  const resetGameState = () => {
    obstaclesRef.current = {};
    nextIdRef.current = 1;
    playerYRef.current = 0;
    playerVyRef.current = 0;
    groundedRef.current = true;
    playerXRef.current = Math.round(size.w * 0.12);
    animTimerRef.current = 0;
    spawnTimerRef.current = 0;
    setTimeLeft(START_TIME);
    timeLeftRef.current = START_TIME;
    heartsRef.current = HEARTS_START;
    invulnerableUntilRef.current = 0;
    setHeartsTick((t) => t + 1);
    // ensure player sits on ground
    const groundY = size.h - Math.max(28, Math.round(size.h * 0.18));
    playerYRef.current = groundY - 12;
  };

  // ----- Start / Resume flows (set gameStateRef BEFORE starting loops) -----
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
    resetGameState();
    gameStateRef.current = "playing";
    setGameState("playing");
    startCountdown();
    lastRef.current = performance.now();
    startLoop();
  };

  const showAdModalForHearts = () => {
    // freeze loop & timer and set state/ref to ad
    stopLoop();
    stopCountdown();
    gameStateRef.current = "ad";
    setGameState("ad");
  };

  const watchAdAndContinue = () => {
    // restore hearts
    heartsRef.current = HEARTS_START;
    invulnerableUntilRef.current = performance.now() + INVULN_MS;
    setHeartsTick((t) => t + 1);
    toast.info("Ad watched — hearts restored.");
    // ensure ref is updated before restarting loops to avoid freeze
    gameStateRef.current = "playing";
    setGameState("playing");
    lastRef.current = performance.now();
    startCountdown();
    startLoop();
  };

  // ----- Loop / physics -----
  const startLoop = () => {
    if (rafRef.current) return;
    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);
  };

  const stopLoop = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastRef.current = null;
  };

  const loop = (t: number) => {
    const last = lastRef.current ?? t;
    const dt = Math.min(0.05, (t - last) / 1000);
    lastRef.current = t;
    update(dt);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) render(ctx);
    if (gameStateRef.current === "playing") rafRef.current = requestAnimationFrame(loop);
  };

  // spawning obstacles
  const spawnObstacle = () => {
    const id = nextIdRef.current++;
    const w = Math.round(rand(18, 36) + size.w * 0.02);
    const h = Math.round(rand(18, 36) + size.w * 0.02);
    const groundTop = size.h - Math.max(28, Math.round(size.h * 0.18));
    const isFlying = Math.random() < 0.18;
    const y = isFlying ? rand(12, Math.max(12, groundTop - 80)) : groundTop - h;
    const hue = Math.floor(rand(180, 300));
    const speed = Math.round(size.w * (0.45 + Math.random() * 0.12));
    obstaclesRef.current[id] = { id, x: size.w + 20 + rand(0, 80), y, w, h, speed, hue };
  };

  // update physics & collisions (includes top-clamp so player never goes off top)
  const update = (dt: number) => {
    if (gameStateRef.current !== "playing") return;

    // player physics
    const gravity = size.h * 2.6;
    playerVyRef.current += gravity * dt;
    playerYRef.current += playerVyRef.current * dt;

    const groundY = size.h - Math.max(28, Math.round(size.h * 0.18));

    // --- TOP CLAMP FIX ---
    // compute an appropriate minimal bottom-y (py) so the drawn sprite never goes out of canvas.
    // we approximate player's body/head sizes (same logic as drawPlayer)
    const sizeBase = Math.round(size.h * 0.18);
    const bodyH = sizeBase * 0.6;
    const headR = sizeBase * 0.22;
    // the minimum allowed py (bottom y of the sprite) is bodyH + headR + small padding
    const minPlayerPy = Math.max(6, Math.round(bodyH + headR + 6));
    if (playerYRef.current < minPlayerPy) {
      // clamp and remove upward velocity so sprite doesn't keep trying to go up
      playerYRef.current = minPlayerPy;
      if (playerVyRef.current < 0) playerVyRef.current = 0;
    }
    // ------------------------

    if (playerYRef.current >= groundY - 12) {
      playerYRef.current = groundY - 12;
      playerVyRef.current = 0;
      groundedRef.current = true;
    } else {
      groundedRef.current = false;
    }

    // spawn cadence
    spawnTimerRef.current += dt * 1000;
    const interval = Math.max(520, 1000 - Math.floor((START_TIME - timeLeftRef.current) * 14));
    if (spawnTimerRef.current >= interval) {
      spawnTimerRef.current = 0;
      spawnObstacle();
    }

    // move obstacles, collision
    const obs = Object.values(obstaclesRef.current);
    for (const o of obs) {
      o.x -= o.speed * dt;
      if (o.x + o.w < -32) {
        delete obstaclesRef.current[o.id];
      } else {
        // collision
        const px = playerXRef.current || Math.round(size.w * 0.12);
        const py = playerYRef.current || (groundY - 12);
        const pW = Math.round(size.w * 0.12);
        const pH = Math.round(size.h * 0.18);
        const playerBox = { left: px - pW * 0.25, top: py - pH, right: px + pW * 0.75, bottom: py };
        const obsBox = { left: o.x, top: o.y, right: o.x + o.w, bottom: o.y + o.h };
        const collide =
          playerBox.left < obsBox.right &&
          playerBox.right > obsBox.left &&
          playerBox.top < obsBox.bottom &&
          playerBox.bottom > obsBox.top;
        if (collide) {
          const now = performance.now();
          if (now < invulnerableUntilRef.current) {
            // ignore if invulnerable
          } else {
            // take damage
            heartsRef.current = Math.max(0, heartsRef.current - 1);
            setHeartsTick((t) => t + 1);
            invulnerableUntilRef.current = now + INVULN_MS;
            // clear obstacles so player isn't immediately re-hit
            obstaclesRef.current = {};
            if (heartsRef.current <= 0) {
              // freeze and prompt ad
              showAdModalForHearts();
              return;
            } else {
              toast.error(`Hit! ${heartsRef.current} hearts left`);
            }
          }
        }
      }
    }

    // animate player legs
    animTimerRef.current += dt;
  };

  // draw the player (procedural galaxy-themed runner)
  const drawPlayer = (ctx: CanvasRenderingContext2D, px: number, py: number) => {
    const sizeBase = Math.round(size.h * 0.18);
    const headR = sizeBase * 0.22;
    const bodyW = sizeBase * 0.52;
    const bodyH = sizeBase * 0.6;
    const bodyX = px;
    const bodyY = py - bodyH;

    const g = ctx.createLinearGradient(bodyX, bodyY, bodyX + bodyW, bodyY + bodyH);
    g.addColorStop(0, "#9b7cff");
    g.addColorStop(0.5, "#6ee7f7");
    g.addColorStop(1, "#a78bfa");
    ctx.fillStyle = g;
    roundRectPath(ctx, bodyX, bodyY, bodyW, bodyH, 8);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = "#ffffff";
    ctx.arc(bodyX + bodyW * 0.6, bodyY - headR * 0.2, headR, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = "rgba(8,10,30,0.12)";
    ctx.ellipse(bodyX + bodyW * 0.56, bodyY - headR * 0.18, headR * 0.6, headR * 0.42, -0.25, 0, Math.PI * 2);
    ctx.fill();

    const legOffset = Math.sin(animTimerRef.current * 18) * Math.min(6, sizeBase * 0.06);
    ctx.fillStyle = "#e6f4ff";
    ctx.beginPath();
    ctx.ellipse(bodyX + bodyW * 0.22, bodyY + bodyH * 0.9 + legOffset, bodyW * 0.18, bodyH * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(bodyX + bodyW * 0.62, bodyY + bodyH * 0.9 - legOffset, bodyW * 0.18, bodyH * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();

    if (!groundedRef.current) {
      const flameGrad = ctx.createLinearGradient(bodyX + bodyW * 0.3, bodyY + bodyH, bodyX + bodyW * 0.3, bodyY + bodyH + 22);
      flameGrad.addColorStop(0, "rgba(255,220,120,0.9)");
      flameGrad.addColorStop(1, "rgba(160,60,220,0.04)");
      ctx.fillStyle = flameGrad;
      ctx.beginPath();
      ctx.ellipse(bodyX + bodyW * 0.4, bodyY + bodyH + 8 + legOffset * 0.6, bodyW * 0.24, 12 + Math.abs(legOffset) * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const radius = Math.min(r, Math.min(w, h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  // draw
  const render = (ctx: CanvasRenderingContext2D) => {
    const w = size.w;
    const h = size.h;
    ctx.clearRect(0, 0, w, h);

    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#020014");
    g.addColorStop(0.6, "#07103a");
    g.addColorStop(1, "#02021a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const t = performance.now();
    for (let i = 0; i < 36; i++) {
      const sx = (Math.sin((i * 10.7 + t / 520) * 0.32) * 0.5 + 0.5) * w;
      const sy = (Math.cos((i * 6.1 + t / 640) * 0.52) * 0.5 + 0.5) * h;
      const r = (i % 9 === 0) ? 1.4 : 0.45;
      ctx.beginPath();
      ctx.fillStyle = i % 6 === 0 ? "rgba(255,255,255,0.92)" : "rgba(210,220,255,0.04)";
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const groundY = size.h - Math.max(28, Math.round(size.h * 0.18));
    ctx.fillStyle = "rgba(8,10,20,0.64)";
    ctx.fillRect(0, groundY, w, size.h - groundY);

    Object.values(obstaclesRef.current).forEach((o) => {
      const grad = ctx.createLinearGradient(o.x, o.y, o.x + o.w, o.y + o.h);
      grad.addColorStop(0, `hsla(${o.hue + 10},70%,65%,1)`);
      grad.addColorStop(1, `hsla(${(o.hue - 60 + 360) % 360},60%,32%,1)`);
      ctx.fillStyle = grad;
      roundRectPath(ctx, o.x, o.y, o.w, o.h, Math.min(8, o.w * 0.18));
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    const px = playerXRef.current || Math.round(w * 0.12);
    const py = playerYRef.current || (groundY - 12);
    drawPlayer(ctx, px, py);

    // HUD: hearts (canvas top-left)
    const heartSize = Math.round(Math.min(w, h) * 0.034);
    ctx.font = `${heartSize}px Inter, system-ui, sans-serif`;
    ctx.textBaseline = "top";
    for (let i = 0; i < HEARTS_START; i++) {
      const x = 12 + i * (heartSize + 6);
      const y = 8;
      const active = i < heartsRef.current;
      ctx.fillStyle = active ? "#ff6b6b" : "rgba(255,255,255,0.12)";
      ctx.fillText("❤", x, y);
      if (!active) {
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillText("❤", x, y);
        ctx.globalAlpha = 1;
      }
    }

    // timer top-right circle
    const cx = w - 64;
    const cy = 36;
    const outer = 22;
    ctx.beginPath();
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.arc(cx, cy, outer, 0, Math.PI * 2);
    ctx.stroke();
    const pct = clamp(timeLeftRef.current / START_TIME, 0, 1);
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + pct * Math.PI * 2;
    const pg = ctx.createLinearGradient(cx - outer, cy - outer, cx + outer, cy + outer);
    pg.addColorStop(0, "#7c3aed");
    pg.addColorStop(1, "#06b6d4");
    ctx.strokeStyle = pg;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, outer, startAngle, endAngle);
    ctx.stroke();
    ctx.font = `${Math.round(Math.min(w, h) * 0.032)}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.max(0, Math.ceil(timeLeftRef.current))}s`, cx, cy + 6);

    ctx.font = `${Math.round(Math.min(w, h) * 0.024)}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = "rgba(200,210,255,0.28)";
    ctx.textAlign = "center";
    ctx.fillText(`Survive ${START_TIME}s`, w / 2, size.h - 10);

    if (performance.now() < invulnerableUntilRef.current) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 4;
      const drawW = Math.round(size.h * 0.18);
      ctx.arc(px + drawW / 2, py - drawW / 2, Math.max(drawW, drawW) * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  // input: jump
  const doJump = () => {
    if (groundedRef.current) {
      playerVyRef.current = -Math.max(220, size.h * 1.05);
      groundedRef.current = false;
    } else {
      if (playerVyRef.current > -size.h * 1.6) playerVyRef.current -= size.h * 0.35;
    }
    animTimerRef.current = 0;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        if (gameStateRef.current === "idle") startGame();
        else if (gameStateRef.current === "playing") doJump();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onPointerDown = (ev: React.PointerEvent) => {
    ev.currentTarget.setPointerCapture?.(ev.pointerId);
    if (gameStateRef.current === "idle") startGame();
    else if (gameStateRef.current === "playing") doJump();
  };
  const onPointerUp = (ev: React.PointerEvent) => {
    try { ev.currentTarget.releasePointerCapture?.(ev.pointerId); } catch {}
  };

  // handlers
  const handleExit = () => {
    stopLoop();
    stopCountdown();
    navigate(-1);
  };
  const handlePlayAgain = () => {
    resetGameState();
    setGameState("idle");
  };

  // cleanup
  useEffect(() => {
    return () => {
      stopLoop();
      stopCountdown();
    };
  }, []);

  // UI
  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col items-center">
      {/* Top bar */}
      <div className="w-full max-w-4xl px-3 py-3 flex items-center justify-between gap-3 z-10">
        <div className="flex items-center gap-3">
          <div className="glass-panel rounded-full px-3 py-2">
            <div className="font-mono text-lg">{gameState === "idle" ? "Ready" : gameState === "playing" ? "Playing" : gameState}</div>
          </div>
          <div className="hidden sm:block text-sm text-gray-300">Galaxy Runner — tap to jump</div>
        </div>

        <div className="flex items-center gap-2">
          <div className="glass-panel rounded-full px-3 py-2 text-sm">
            <span className="text-yellow-300 font-semibold">♦ {GAME_REWARD}</span>
          </div>
          <Button variant="outline" onClick={handleExit} className="py-2 px-3">Exit</Button>
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex-1 flex items-center justify-center w-full px-3 pb-6">
        <div className="relative" style={{ width: size.w }}>
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            style={{
              display: "block",
              borderRadius: 12,
              boxShadow: "0 12px 40px rgba(12,10,30,0.6)",
              touchAction: "none",
            }}
          />
        </div>
      </div>

      {/* Modals (high z above canvas) */}
      {gameState === "idle" && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/72 px-4">
          <div className="glass-panel p-6 sm:p-8 rounded-2xl text-center max-w-[520px] w-full">
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">Galaxy Runner</h1>
            <p className="text-sm text-gray-300 mb-2">Tap or press Space to jump. Avoid obstacles and survive for <strong>{START_TIME}s</strong>.</p>
            <p className="text-sm text-gray-300 mb-4">You have <span className="text-red-400 font-semibold">{HEARTS_START} hearts</span>. Each hit costs 1 heart.</p>
            <div className="flex gap-3 justify-center">
              <Button size="lg" onClick={startGame} className="bg-blue-600 py-3 px-6">Start</Button>
              <Button variant="outline" onClick={handleExit}>Back</Button>
            </div>
          </div>
        </div>
      )}

      {gameState === "ad" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/82 px-4">
          <div className="glass-panel p-6 rounded-2xl text-center max-w-[420px] w-full">
            <h2 className="text-2xl font-bold mb-2 text-red-300">Out of Hearts</h2>
            <p className="text-sm text-gray-300 mb-4">Watch an ad to restore <span className="text-green-300 font-semibold">{HEARTS_START} hearts</span> and continue.</p>
            <div className="flex gap-3 justify-center">
              <Button size="lg" onClick={watchAdAndContinue} className="bg-green-600 py-3 px-6">Watch Ad to Continue</Button>
              <Button variant="outline" onClick={() => setGameState("lost")}>End Run</Button>
            </div>
          </div>
        </div>
      )}

      {gameState === "win" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 px-4">
          <div className="glass-panel p-6 rounded-2xl text-center max-w-[420px] w-full">
            <h2 className="text-2xl font-bold mb-2 text-green-300">You Survived!</h2>
            <p className="text-sm text-yellow-300 mb-3">♦ {GAME_REWARD} awarded</p>
            <div className="flex gap-3 justify-center">
              <Button onClick={handlePlayAgain} className="bg-blue-600">Play Again</Button>
              <Button variant="outline" onClick={() => navigate("/profile")}>Exit to Profile</Button>
            </div>
          </div>
        </div>
      )}

      {gameState === "lost" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 px-4">
          <div className="glass-panel p-6 rounded-2xl text-center max-w-[420px] w-full">
            <h2 className="text-2xl font-bold mb-2 text-rose-400">Run Ended</h2>
            <div className="flex gap-3 justify-center">
              <Button onClick={handlePlayAgain} className="bg-blue-600">Play Again</Button>
              <Button variant="outline" onClick={() => navigate(-1)}>Exit</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GalaxyRunner;
