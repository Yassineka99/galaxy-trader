// src/components/minigames/GalaxyBlaster.tsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ref, runTransaction, get } from "firebase/database";
import { db } from "@/integrations/firebase/config";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * Galaxy Blaster (fixed)
 * - Timer ref + wrapper so RAF renders current timer
 * - Removed duplicate under-canvas HUD
 * - START_TIME = 30, TARGET_SCORE = 50_000
 * - Win modal includes "Exit to Profile" button (navigates to '/profile')
 */

// --- Config
const DEFAULT_GAME_ID = "galaxy-blaster";
const GAME_REWARD = 0.2; // diamonds
const XP_REWARD = 5;
const START_TIME = 30; // seconds (reduced per request)
const AD_CONTINUE_SECONDS = 30;
const TARGET_SCORE = 50000; // much higher per request
const BASE_SPAWN_INTERVAL_MS = 650;
const REWARD_FACTOR = 0.6; // makes game harder
const todayStr = () => new Date().toISOString().split("T")[0];

// --- Firebase helpers (unchanged pattern) ---
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

// --- Utilities & types ---
type Vec = { x: number; y: number };
type Enemy = {
  id: number;
  pos: Vec;
  vel: Vec;
  radius: number;
  hp: number;
  maxHp: number;
  hue: number;
  type: "small" | "medium" | "big";
  scoreValue: number;
  birth: number;
};
type Particle = {
  pos: Vec;
  vel: Vec;
  life: number;
  ttl: number;
  hue: number;
  size: number;
};

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

// --- Component ---
const GalaxyBlaster: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const gameId = id || DEFAULT_GAME_ID;

  // UI state
  const [gameState, setGameState] = useState<"idle" | "playing" | "ad" | "win" | "lost">("idle");
  const [combo, setCombo] = useState<number>(0);
  const [multiplier, setMultiplier] = useState<number>(1);
  const [showAdPrompt, setShowAdPrompt] = useState(false);
  const [isAwarded, setIsAwarded] = useState(false);
  const [, setTick] = useState(0); // used to force a React re-render

  // refs for game loop state (avoid stale closures inside RAF)
  const scoreRef = useRef<number>(0);
  const timeLeftRef = useRef<number>(START_TIME);
  const gameStateRef = useRef<typeof gameState>(gameState);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  // entities
  const enemiesRef = useRef<Record<number, Enemy>>({});
  const particlesRef = useRef<Particle[]>([]);
  const nextEnemyIdRef = useRef<number>(1);
  const spawnTimerRef = useRef<number>(0);
  const spawnIntervalRef = useRef<number>(BASE_SPAWN_INTERVAL_MS);
  const tickIntervalRef = useRef<number | null>(null);

  // responsive sizing
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: 600, h: 800 });

  // keep derived refs in sync
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // safe timeLeft setter that updates ref + state
  const [timeLeft, _setTimeLeft] = useState<number>(START_TIME);
  const setTimeLeftWithRef = (next: number) => {
    timeLeftRef.current = next;
    _setTimeLeft(next);
  };

  // forcing re-render when we need to reflect score changes in overlay controls
  const forceRender = () => setTick((t) => t + 1);

  // reset helper
  const resetGameState = () => {
    enemiesRef.current = {};
    particlesRef.current = [];
    nextEnemyIdRef.current = 1;
    spawnTimerRef.current = 0;
    spawnIntervalRef.current = BASE_SPAWN_INTERVAL_MS;
    scoreRef.current = 0;
    setCombo(0);
    setMultiplier(1);
    setTimeLeftWithRef(START_TIME);
    setIsAwarded(false);
    forceRender();
  };

  // start game (checks daily rules)
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
    resetGameState();
    setGameState("playing");
    gameStateRef.current = "playing";
    startTicker();
    startLoop();
  };

  // stop loop & timers
  const stopGame = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (tickIntervalRef.current) {
      window.clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    lastTimeRef.current = null;
  };

  // ad continue
  const watchAdAndContinue = () => {
    toast.info(`Ad watched successfully! +${AD_CONTINUE_SECONDS}s`);
    setShowAdPrompt(false);
    setGameState("playing");
    gameStateRef.current = "playing";
    setTimeLeftWithRef(timeLeftRef.current + AD_CONTINUE_SECONDS);
    startTicker();
    lastTimeRef.current = performance.now();
    startLoop();
  };

  // spawn enemy
  function spawnEnemy(now: number) {
    const id = nextEnemyIdRef.current++;
    const w = canvasSize.w;
    const h = canvasSize.h;
    const difficultyFactor = clamp(scoreRef.current / 800 + (START_TIME - timeLeftRef.current) / START_TIME, 0, 3);

    let type: Enemy["type"] = "small";
    if (Math.random() < 0.18 + difficultyFactor * 0.06) type = "big";
    else if (Math.random() < 0.34 + difficultyFactor * 0.12) type = "medium";

    const radius = type === "small" ? rand(10, 18) : type === "medium" ? rand(22, 32) : rand(36, 54);
    const hp = type === "small" ? 1 : type === "medium" ? 3 : 6;
    const baseValue = type === "small" ? 60 : type === "medium" ? 160 : 420;
    const scoreValue = Math.round(baseValue * REWARD_FACTOR);

    const edge = Math.random();
    let pos: Vec;
    let vel: Vec;
    if (edge < 0.6) {
      pos = { x: rand(radius, w - radius), y: -radius * 1.5 };
      vel = { x: rand(-0.3, 0.3) * (1 + difficultyFactor * 0.5), y: rand(0.8, 1.8 + difficultyFactor) };
    } else {
      const fromLeft = Math.random() < 0.5;
      pos = { x: fromLeft ? -radius * 1.5 : w + radius * 1.5, y: rand(radius, h * 0.7) };
      vel = { x: (fromLeft ? rand(0.8, 1.8) : rand(-1.8, -0.8)) * (1 + difficultyFactor * 0.45), y: rand(-0.2, 0.6) };
    }

    const hue = Math.floor(rand(200, 320));
    enemiesRef.current[id] = {
      id,
      pos,
      vel,
      radius,
      hp,
      maxHp: hp,
      hue,
      type,
      scoreValue,
      birth: now,
    };
  }

  // explosion particles
  function spawnExplosion(x: number, y: number, hue = 280, intensity = 12) {
    const arr: Particle[] = [];
    for (let i = 0; i < intensity; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(0.6, 4.5);
      arr.push({
        pos: { x, y },
        vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        life: 0,
        ttl: rand(480, 1100),
        hue,
        size: rand(1.6, 5.2),
      });
    }
    particlesRef.current.push(...arr);
    if (particlesRef.current.length > 600) particlesRef.current.splice(0, particlesRef.current.length - 600);
  }

  // hit logic (updates refs so loop sees new score immediately)
  function handleHitEnemy(enemyId: number, hitX: number, hitY: number) {
    const enemy = enemiesRef.current[enemyId];
    if (!enemy) return;
    enemy.hp -= 1;
    spawnExplosion(hitX, hitY, enemy.hue, 8);

    const base = enemy.scoreValue;
    const added = Math.round(base * multiplier);
    scoreRef.current += added;

    // Force a small React re-render so bottom UI / modal reflect new score when needed
    forceRender();

    // combo buildup slower
    setCombo((c) => {
      const nc = c + 1;
      const newMult = 1 + Math.min(3, Math.floor(nc / 4) * 0.18);
      setMultiplier(newMult);
      return nc;
    });

    if (enemy.hp <= 0) {
      spawnExplosion(enemy.pos.x, enemy.pos.y, enemy.hue, enemy.type === "small" ? 10 : enemy.type === "medium" ? 18 : 32);
      delete enemiesRef.current[enemyId];
    }
  }

  function handleMiss() {
    setCombo(0);
    setMultiplier(1);
  }

  // RAF loop
  function startLoop() {
    if (rafRef.current) return;
    lastTimeRef.current = performance.now();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    const loop = (t: number) => {
      const last = lastTimeRef.current || t;
      const dt = clamp((t - last) / 1000, 0, 0.055);
      lastTimeRef.current = t;

      updateGame(dt * 1000, t);
      renderGame(ctx);

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
  }

  function updateGame(dtMs: number, nowMs: number) {
    spawnTimerRef.current += dtMs;
    const difficulty = 1 + Math.min(2.0, scoreRef.current / 900 + (START_TIME - timeLeftRef.current) / START_TIME);
    const interval = Math.max(180, BASE_SPAWN_INTERVAL_MS / difficulty);
    spawnIntervalRef.current = interval;

    while (spawnTimerRef.current > spawnIntervalRef.current) {
      spawnTimerRef.current -= spawnIntervalRef.current;
      spawnEnemy(nowMs);
    }

    // move enemies
    Object.values(enemiesRef.current).forEach((e) => {
      e.pos.x += e.vel.x * (dtMs / 16);
      e.pos.y += e.vel.y * (dtMs / 16);
      e.pos.x += Math.sin((nowMs + e.birth) / 900 + e.id) * 0.08;
      if (e.pos.x < -120 || e.pos.x > canvasSize.w + 120 || e.pos.y > canvasSize.h + 120) {
        delete enemiesRef.current[e.id];
      }
    });

    // update particles
    particlesRef.current.forEach((p) => {
      p.life += dtMs;
      p.vel.x *= 0.995;
      p.vel.y *= 0.995;
      p.pos.x += p.vel.x * (dtMs / 16);
      p.pos.y += p.vel.y * (dtMs / 16);
    });
    particlesRef.current = particlesRef.current.filter((p) => p.life < p.ttl);

    // win check using scoreRef (always up-to-date)
    if (scoreRef.current >= TARGET_SCORE && gameStateRef.current === "playing") {
      setGameState("win");
      gameStateRef.current = "win";
      stopGame();
      (async () => {
        if (!isAwarded) {
          const ok = await awardAndMark(user, gameId);
          setIsAwarded(ok);
          if (ok) toast.success(`Nice! +${GAME_REWARD} diamonds awarded`);
          else toast.error("Failed to record reward. Try again later.");
        }
      })();
    }
  }

  // render everything on canvas and in-canvas HUD (only source of truth now)
  function renderGame(ctx: CanvasRenderingContext2D) {
    const w = canvasSize.w;
    const h = canvasSize.h;
    ctx.clearRect(0, 0, w, h);

    // background gradient / stars
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#050014");
    g.addColorStop(0.45, "#0b0820");
    g.addColorStop(1, "#0b1530");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const time = performance.now();
    for (let i = 0; i < 60; i++) {
      const sx = (Math.sin((i * 37.1 + time / 900) * 0.37) * 0.5 + 0.5) * w;
      const sy = (Math.cos((i * 21.7 + time / 700) * 0.47) * 0.5 + 0.5) * h;
      const r = (i % 6 === 0 ? 1.45 : 0.6) * (1 + ((i % 3) * 0.15));
      ctx.beginPath();
      ctx.fillStyle = i % 7 === 0 ? "rgba(255,255,255,0.85)" : "rgba(200,220,255,0.06)";
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // nebula
    const neb = ctx.createRadialGradient(w * 0.78, h * 0.18, 40, w * 0.6, h * 0.3, Math.max(w, h) * 0.9);
    neb.addColorStop(0, "rgba(180,140,255,0.12)");
    neb.addColorStop(0.4, "rgba(100,80,160,0.06)");
    neb.addColorStop(1, "rgba(20,10,40,0)");
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, w, h);

    // enemies
    Object.values(enemiesRef.current).forEach((e) => {
      const rad = e.radius;
      const halo = ctx.createRadialGradient(e.pos.x, e.pos.y, rad * 0.3, e.pos.x, e.pos.y, rad * 2.6);
      halo.addColorStop(0, `hsla(${e.hue}, 90%, 60%, 0.28)`);
      halo.addColorStop(0.5, `hsla(${e.hue}, 80%, 50%, 0.12)`);
      halo.addColorStop(1, `hsla(${e.hue}, 70%, 30%, 0)`);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(e.pos.x, e.pos.y, rad * 2.6, 0, Math.PI * 2);
      ctx.fill();

      const gg = ctx.createLinearGradient(e.pos.x - rad, e.pos.y - rad, e.pos.x + rad, e.pos.y + rad);
      gg.addColorStop(0, `hsla(${e.hue + 10}, 90%, 55%, 1)`);
      gg.addColorStop(0.6, `hsla(${e.hue - 40}, 75%, 40%, 1)`);
      gg.addColorStop(1, `hsla(${e.hue - 120}, 70%, 20%, 0.9)`);
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(e.pos.x, e.pos.y, rad, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.ellipse(e.pos.x - rad * 0.35, e.pos.y - rad * 0.35, rad * 0.5, rad * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();

      const hpW = rad * 1.8;
      const hpH = Math.max(3, Math.round(rad * 0.22));
      const left = e.pos.x - hpW / 2;
      const top = e.pos.y + rad + 6;
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(left, top, hpW, hpH);
      ctx.fillStyle = `hsl(${e.hue}, 90%, 60%)`;
      const pct = clamp(e.hp / e.maxHp, 0, 1);
      ctx.fillRect(left, top, hpW * pct, hpH);
    });

    // particles
    particlesRef.current.forEach((p) => {
      const alpha = 1 - p.life / p.ttl;
      const glow = ctx.createRadialGradient(p.pos.x, p.pos.y, 0, p.pos.x, p.pos.y, p.size * 6);
      glow.addColorStop(0, `hsla(${p.hue}, 95%, 60%, ${0.9 * alpha})`);
      glow.addColorStop(0.3, `hsla(${p.hue}, 95%, 45%, ${0.6 * alpha})`);
      glow.addColorStop(1, `hsla(${p.hue}, 95%, 40%, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, p.size * (1 + alpha * 0.8), 0, Math.PI * 2);
      ctx.fill();
    });

    // in-canvas HUD (single source of truth)
    ctx.font = `${Math.round(Math.min(w, h) * 0.045)}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.textAlign = "left";
    ctx.fillText(`Score: ${scoreRef.current.toLocaleString()}`, 18, 34);

    const cx = w - 64;
    const cy = 48;
    const outer = 28;
    ctx.beginPath();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.arc(cx, cy, outer, 0, Math.PI * 2);
    ctx.stroke();

    const pct = clamp(timeLeftRef.current / START_TIME, 0, 1);
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + pct * Math.PI * 2;
    const progGrad = ctx.createLinearGradient(cx - outer, cy - outer, cx + outer, cy + outer);
    progGrad.addColorStop(0, "#7c3aed");
    progGrad.addColorStop(1, "#06b6d4");
    ctx.strokeStyle = progGrad;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, outer, startAngle, endAngle);
    ctx.stroke();

    ctx.font = `${Math.round(Math.min(w, h) * 0.032)}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.max(0, Math.ceil(timeLeftRef.current))}s`, cx, cy + 6);

    if (combo > 0) {
      ctx.font = `${Math.round(Math.min(w, h) * 0.038)}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = "rgba(255,230,200,0.95)";
      ctx.textAlign = "center";
      ctx.fillText(`Combo x${Math.round(multiplier * 100) / 100}`, w / 2, 36);
    }

    if (scoreRef.current < TARGET_SCORE && gameStateRef.current === "playing") {
      ctx.font = `${Math.round(Math.min(w, h) * 0.028)}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = "rgba(220,220,255,0.5)";
      ctx.textAlign = "center";
      ctx.fillText(`Target ${TARGET_SCORE.toLocaleString()} — Reach it to win`, w / 2, h - 18);
    }
  }

  // pointer handler (tap)
  function handlePointerDown(ev: React.PointerEvent) {
    if (gameStateRef.current !== "playing") return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * (canvasRef.current!.width / rect.width);
    const y = (ev.clientY - rect.top) * (canvasRef.current!.height / rect.height);

    const enemies = Object.values(enemiesRef.current)
      .map((e) => ({ e, d2: (e.pos.x - x) ** 2 + (e.pos.y - y) ** 2 }))
      .sort((a, b) => a.d2 - b.d2);

    if (enemies.length === 0 || enemies[0].d2 > (enemies[0].e.radius + 18) ** 2) {
      handleMiss();
      spawnExplosion(x, y, Math.floor(rand(180, 320)), 6);
      return;
    }

    const nearest = enemies[0].e;
    handleHitEnemy(nearest.id, x, y);
  }

  // ticker: decrement timeLeft every second (updates ref + state)
  function startTicker() {
    if (tickIntervalRef.current) return;
    tickIntervalRef.current = window.setInterval(() => {
      const nt = Math.max(0, timeLeftRef.current - 1);
      setTimeLeftWithRef(nt);
      // if time up
      if (nt <= 0) {
        stopGame();
        setGameState("ad");
        gameStateRef.current = "ad";
        setShowAdPrompt(true);
        if (tickIntervalRef.current) {
          window.clearInterval(tickIntervalRef.current);
          tickIntervalRef.current = null;
        }
      }
    }, 1000);
  }

  // responsive canvas sizing
  useEffect(() => {
    const measure = () => {
      const availW = Math.min(window.innerWidth, 960);
      const availH = Math.min(window.innerHeight - 120, 900);
      const size = Math.floor(Math.min(availW * 0.93, availH * 0.86));
      setCanvasSize({ w: size, h: Math.round(size * 1.25) });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * 1.25 * dpr);
      canvas.style.width = `${size}px`;
      canvas.style.height = `${Math.round(size * 1.25)}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      stopGame();
      if (tickIntervalRef.current) window.clearInterval(tickIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // UI handlers
  const handleExitToProfile = () => {
    stopGame();
    navigate("/profile");
  };
  const handleExit = () => {
    stopGame();
    navigate(-1);
  };
  const handlePlayAgain = () => {
    resetGameState();
    setGameState("idle");
    gameStateRef.current = "idle";
    setShowAdPrompt(false);
  };

  // small helper for formatting
  const formatScore = (s: number) => s.toLocaleString();

  // render
  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col items-center">
      {/* Top bar */}
      <div className="w-full max-w-4xl px-3 py-3 flex items-center justify-between gap-3 z-0">
        <div className="flex items-center gap-3">
          <div className="glass-panel rounded-full px-3 py-2">
            <div className="font-mono text-lg">{gameState === "idle" ? "Ready" : gameState === "playing" ? "Playing" : gameState}</div>
          </div>
          <div className="hidden sm:block text-sm text-gray-300">Galaxy Blaster — Tap enemies to destroy them</div>
        </div>

        <div className="flex items-center gap-2">
          <div className="glass-panel rounded-full px-3 py-2 text-sm">
            <span className="text-yellow-300 font-semibold">♦ {GAME_REWARD}</span>
          </div>
          <Button variant="outline" onClick={handleExit} className="py-2 px-3">
            Exit
          </Button>
        </div>
      </div>

      {/* Canvas area (only HUD is in-canvas) */}
      <div className="flex-1 flex items-start justify-center w-full px-3 pb-6">
        <div className="relative" style={{ width: canvasSize.w }}>
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            style={{
              display: "block",
              borderRadius: 14,
              boxShadow: "0 12px 40px rgba(12,10,30,0.6)",
              touchAction: "manipulation",
              userSelect: "none",
            }}
          />

          {/* compact overlay only (score + target shown in-canvas mainly) */}
          <div style={{ position: "absolute", left: 12, top: 12, pointerEvents: "none" }} className="text-sm text-white/90">
            {/* keep minimal: show numeric score quickly without duplicating major HUD */}
            <div style={{ fontWeight: 700, fontFamily: "Inter, system-ui, sans-serif", fontSize: 18 }}>{formatScore(scoreRef.current)}</div>
          </div>
        </div>
      </div>

      {/* bottom area minimal (no timer/score duplication) */}
      <div className="w-full max-w-4xl px-3 pb-6 flex items-center justify-center gap-3">
        {gameState === "idle" && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
            <div className="glass-panel p-6 rounded-2xl text-center max-w-[520px] w-full mx-4">
              <h1 className="text-2xl sm:text-3xl font-bold mb-2">Galaxy Blaster</h1>
              <p className="text-sm text-gray-300 mb-4">Tap incoming cosmic threats. Build combos to increase your multiplier.</p>
              <p className="text-sm text-gray-300 mb-4">
                Reach <span className="font-semibold text-yellow-300">{TARGET_SCORE.toLocaleString()}</span> in {START_TIME}s to win.
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

        {(gameState === "lost") && (
          <div className="glass-panel p-3 rounded-2xl flex gap-3 items-center">
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Game Over</div>
              <div style={{ color: "rgba(220,220,255,0.8)" }}>Score: {formatScore(scoreRef.current)}</div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handlePlayAgain} className="bg-blue-600">
                Play Again
              </Button>
              <Button variant="outline" onClick={() => navigate(-1)}>
                Exit
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ad overlay */}
      {gameState === "ad" && showAdPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
          <div className="glass-panel p-6 rounded-2xl text-center max-w-[420px] w-full">
            <h3 className="text-2xl font-bold mb-2 text-red-300">Time's Up</h3>
            <p className="text-sm text-gray-300 mb-4">Watch an ad to gain +{AD_CONTINUE_SECONDS}s and continue your run.</p>
            <div className="flex gap-3 justify-center">
              <Button
                size="lg"
                onClick={() => {
                  // replace with real ad integration; call watchAdAndContinue() on success
                  watchAdAndContinue();
                }}
                className="bg-green-600"
              >
                Watch Ad to Continue
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAdPrompt(false);
                  setGameState("lost");
                  gameStateRef.current = "lost";
                }}
              >
                End Run
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* win modal: shows Play Again and Exit to Profile */}
      {gameState === "win" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="glass-panel p-6 rounded-2xl text-center max-w-[420px] w-full">
            <h3 className="text-2xl font-bold mb-2 text-green-300">You Win!</h3>
            <p className="text-sm text-gray-300 mb-4">Score: {formatScore(scoreRef.current)} — ♦ {GAME_REWARD} awarded (daily)</p>
            <div className="flex gap-3 justify-center">
              <Button onClick={handlePlayAgain} className="bg-blue-600">
                Play Again
              </Button>
              <Button variant="outline" onClick={handleExitToProfile}>
                Exit to Profile
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GalaxyBlaster;
