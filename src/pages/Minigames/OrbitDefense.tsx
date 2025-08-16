// src/components/minigames/OrbitDefense.tsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ref, runTransaction, get } from "firebase/database";
import { db } from "@/integrations/firebase/config";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * OrbitDefense.tsx
 * - Improved destruction animation (particles)
 * - Better ship visuals + animated thruster
 * - Better bullets (glow + trail)
 * - Keeps previous reward/ad/timer/healthbar logic
 */

// ----- CONFIG -----
const DEFAULT_GAME_ID = "orbit-defense";
const GAME_REWARD = 0.2; // diamonds
const XP_REWARD = 4;
const START_TIME = 60; // seconds
const AD_CONTINUE_SECONDS = 15; // added seconds after watching ad
const TARGET_SCORE = 20000; // high goal
const BULLET_COOLDOWN_MS = 220;
const BASE_ASTEROID_SPAWN_MS = 700;
const MAX_ASTEROID = 12; // limit on screen
const todayStr = () => new Date().toISOString().split("T")[0];

// ----- Firebase helpers (same pattern) -----
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

// ----- Types -----
type Asteroid = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  hue: number;
};
type Bullet = {
  id: number;
  x: number;
  y: number;
  vy: number;
  radius: number;
};
type Particle = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  ttl: number;
  color: string;
  type?: "spark" | "smoke" | "shard";
};

// ----- Helpers -----
const rand = (a: number, b: number) => Math.random() * (b - a) + a;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ----- Component -----
const OrbitDefense: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const gameId = id || DEFAULT_GAME_ID;

  // game state
  const [gameState, setGameState] = useState<"idle" | "playing" | "ad" | "win" | "lost">("idle");
  const gameStateRef = useRef(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const [timeLeft, setTimeLeft] = useState<number>(START_TIME);
  const timeLeftRef = useRef<number>(START_TIME);
  const [isAwarded, setIsAwarded] = useState(false);
  const [showAdPrompt, setShowAdPrompt] = useState(false);

  // responsive canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: 520, h: 700 });

  // game loop refs
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);
  const spawnTimerRef = useRef<number>(0);
  const spawnIntervalRef = useRef<number>(BASE_ASTEROID_SPAWN_MS);

  // objects
  const asteroidsRef = useRef<Record<number, Asteroid>>({});
  const bulletsRef = useRef<Record<number, Bullet>>({});
  const particlesRef = useRef<Record<number, Particle>>({});
  const nextIdRef = useRef<number>(1);
  const scoreRef = useRef<number>(0);
  const shipXRef = useRef<number>(0);
  const shipRadiusRef = useRef<number>(28);
  const lastShotRef = useRef<number>(0);
  const lastMoveXRef = useRef<number | null>(null);

  // UI triggers
  const [, setTick] = useState(0);

  // keep timeLeftRef in sync
  useEffect(() => {
    timeLeftRef.current = timeLeft;
  }, [timeLeft]);

  // responsive measure
  useEffect(() => {
    const measure = () => {
      const maxW = Math.min(window.innerWidth - 36, 900);
      const maxH = Math.min(window.innerHeight - 160, 1100);
      const w = Math.floor(Math.min(560, maxW * 0.94));
      const h = Math.floor(Math.min(maxH * 0.92, Math.round(w * 1.36)));
      setCanvasSize({ w, h });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      shipXRef.current = w / 2;
      shipRadiusRef.current = Math.max(18, Math.round(w * 0.055));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // utilities to force React updates to show overlays
  const forceUI = () => setTick((t) => t + 1);

  // reset state
  const resetAll = () => {
    asteroidsRef.current = {};
    bulletsRef.current = {};
    particlesRef.current = {};
    scoreRef.current = 0;
    nextIdRef.current = 1;
    spawnTimerRef.current = 0;
    spawnIntervalRef.current = BASE_ASTEROID_SPAWN_MS;
    lastShotRef.current = 0;
    setTimeLeft(START_TIME);
    timeLeftRef.current = START_TIME;
    shipXRef.current = canvasSize.w / 2;
    setIsAwarded(false);
    forceUI();
  };

  // start game
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
    resetAll();
    setGameState("playing");
    startTimer();
    startLoop();
  };

  // helper to finish (win)
  const finishWin = async () => {
    if (gameStateRef.current !== "playing") {
      setGameState("win");
      return;
    }
    stopTimer();
    stopLoop();
    setGameState("win");
    if (!isAwarded) {
      const ok = await awardAndMark(user, gameId);
      setIsAwarded(ok);
      if (ok) toast.success(`Nice! +${GAME_REWARD} diamonds awarded`);
      else toast.error("Failed to record reward. Try again later.");
    }
  };

  // timer logic
  const startTimer = () => {
    stopTimer();
    const idt = window.setInterval(() => {
      setTimeLeft((t) => {
        const nt = Math.max(0, t - 1);
        timeLeftRef.current = nt;
        if (nt <= 0) {
          // show ad overlay
          stopLoop();
          setGameState("ad");
          setShowAdPrompt(true);
          stopTimer();
        }
        return nt;
      });
    }, 1000) as unknown as number;
    (startTimer as any)._id = idt;
  };
  const stopTimer = () => {
    const idt = (startTimer as any)._id;
    if (idt) {
      clearInterval(idt);
      (startTimer as any)._id = null;
    }
  };

  // ad continue
  const watchAdAndContinue = () => {
    toast.info(`Ad watched successfully! +${AD_CONTINUE_SECONDS}s`);
    setShowAdPrompt(false);
    setGameState("playing");
    setTimeLeft((t) => t + AD_CONTINUE_SECONDS);
    startTimer();
    lastRef.current = performance.now();
    startLoop();
  };

  // stop loop
  const stopLoop = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastRef.current = null;
  };

  // start loop
  const startLoop = () => {
    if (rafRef.current) return;
    lastRef.current = performance.now();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    const loop = (t: number) => {
      const last = lastRef.current || t;
      const dt = clamp((t - last) / 1000, 0, 0.05);
      lastRef.current = t;
      update(dt, t);
      render(ctx);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
  };

  // spawn asteroid
  const spawnAsteroid = (now: number) => {
    if (Object.keys(asteroidsRef.current).length >= MAX_ASTEROID) return;
    const idNum = nextIdRef.current++;
    const w = canvasSize.w;
    const sizeRoll = Math.random();
    const radius = sizeRoll < 0.65 ? rand(12, 20) : sizeRoll < 0.92 ? rand(20, 34) : rand(34, 54);
    const hp = Math.max(1, Math.ceil(radius / 12)); // determine hp
    const maxHp = hp;
    const x = rand(radius + 8, w - radius - 8);
    const vy = rand(0.6, 1.6) + (Math.min(1.5, scoreRef.current / 4000));
    const vx = rand(-0.35, 0.35);
    const hue = Math.floor(rand(190, 320));
    asteroidsRef.current[idNum] = {
      id: idNum,
      x,
      y: -radius - 14,
      vx,
      vy,
      radius,
      hp,
      maxHp,
      hue,
    };
  };

  // spawn bullets
  const fireBullet = (x: number) => {
    const now = Date.now();
    if (now - lastShotRef.current < BULLET_COOLDOWN_MS) return;
    lastShotRef.current = now;
    const idNum = nextIdRef.current++;
    bulletsRef.current[idNum] = {
      id: idNum,
      x,
      y: canvasSize.h - shipRadiusRef.current - 10,
      vy: -6.4,
      radius: 4,
    };
  };

  // spawn particles helpers
  const spawnExplosion = (x: number, y: number, hue: number, scale = 1, count = 14) => {
    for (let i = 0; i < count; i++) {
      const id = nextIdRef.current++;
      const ang = Math.random() * Math.PI * 2;
      const speed = rand(1.2, 5) * (0.6 + Math.random() * 0.8) * Math.min(2, scale);
      particlesRef.current[id] = {
        id,
        x,
        y,
        vx: Math.cos(ang) * speed + rand(-0.6, 0.6),
        vy: Math.sin(ang) * speed + rand(-0.6, 0.6),
        size: rand(1.6, 4.5) * (0.8 + Math.random() * 1.2) * Math.min(2, scale),
        life: 0,
        ttl: rand(420, 980),
        color: `hsla(${hue + rand(-30, 30)},80%,60%,1)`,
        type: "shard",
      };
    }
    // some smoke
    for (let s = 0; s < Math.round(count / 4); s++) {
      const id2 = nextIdRef.current++;
      particlesRef.current[id2] = {
        id: id2,
        x: x + rand(-6, 6),
        y: y + rand(-6, 6),
        vx: rand(-0.6, 0.6),
        vy: rand(-0.6, 0.2),
        size: rand(6, 14),
        life: 0,
        ttl: rand(700, 1400),
        color: "rgba(20,22,30,0.45)",
        type: "smoke",
      };
    }
  };

  const spawnHitSparks = (x: number, y: number, hue: number, n = 6) => {
    for (let i = 0; i < n; i++) {
      const id = nextIdRef.current++;
      const ang = rand(0, Math.PI * 2);
      const speed = rand(0.6, 2.6);
      particlesRef.current[id] = {
        id,
        x,
        y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed * 0.6 - 0.4,
        size: rand(0.8, 2.4),
        life: 0,
        ttl: rand(120, 340),
        color: `hsla(${hue + rand(-20, 20)},90%,65%,1)`,
        type: "spark",
      };
    }
  };

  // update physics
  const update = (dtSec: number, nowMs: number) => {
    // only update while playing
    if (gameStateRef.current !== "playing") return;

    const dt = dtSec * 1000;
    // spawn timer
    spawnTimerRef.current += dt;
    if (spawnTimerRef.current > spawnIntervalRef.current) {
      spawnTimerRef.current = 0;
      spawnAsteroid(nowMs);
      spawnIntervalRef.current = Math.max(220, BASE_ASTEROID_SPAWN_MS - Math.min(420, Math.floor(scoreRef.current / 30)));
    }

    // move asteroids
    Object.values(asteroidsRef.current).forEach((a) => {
      a.x += a.vx * (dt / 16);
      a.y += a.vy * (dt / 16);
      a.vx *= 0.999;
      if (a.y > canvasSize.h + 80) {
        delete asteroidsRef.current[a.id];
      }
    });

    // move bullets
    Object.values(bulletsRef.current).forEach((b) => {
      b.y += b.vy * (dt / 16);
      // spawn small trail particles behind bullet
      const pid = nextIdRef.current++;
      particlesRef.current[pid] = {
        id: pid,
        x: b.x + rand(-1, 1),
        y: b.y + 3 + rand(-1, 1),
        vx: rand(-0.3, 0.3),
        vy: rand(0.4, 1),
        size: rand(0.8, 1.6),
        life: 0,
        ttl: 220 + Math.random() * 120,
        color: "rgba(180,220,255,0.85)",
        type: "spark",
      };
      if (b.y < -30) delete bulletsRef.current[b.id];
    });

    // move particles
    Object.values(particlesRef.current).forEach((p) => {
      p.x += p.vx * (dt / 16);
      p.y += p.vy * (dt / 16);
      // smoke rises a bit slower
      if (p.type === "smoke") {
        p.vx *= 0.995;
        p.vy *= 0.995;
      } else {
        p.vx *= 0.995;
        p.vy += 0.002 * (dt / 16); // gravity tiny
      }
      p.life += dt;
      if (p.life >= p.ttl) delete particlesRef.current[p.id];
    });

    // collisions bullets <-> asteroids
    const bulletsList = Object.values(bulletsRef.current);
    const astList = Object.values(asteroidsRef.current);
    for (const b of bulletsList) {
      for (const a of astList) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const rr = a.radius + b.radius;
        if (dx * dx + dy * dy <= rr * rr) {
          // hit
          delete bulletsRef.current[b.id];
          a.hp -= 1;
          scoreRef.current += 12;
          spawnHitSparks(b.x, b.y, a.hue, 6);
          if (a.hp <= 0) {
            // capture radius for explosion scale
            const rad = a.radius;
            delete asteroidsRef.current[a.id];
            spawnExplosion(a.x, a.y, a.hue, rad / 32, Math.max(10, Math.round(rad / 2)));
            scoreRef.current += Math.round(rad * 18 + 60);
          }
          break;
        }
      }
    }

    // check win
    if (scoreRef.current >= TARGET_SCORE && gameStateRef.current === "playing") {
      finishWin();
      return;
    }
  };

  // render
  const render = (ctx: CanvasRenderingContext2D) => {
    const w = canvasSize.w;
    const h = canvasSize.h;
    ctx.clearRect(0, 0, w, h);

    // background: galaxy gradient
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#020012");
    g.addColorStop(0.45, "#070826");
    g.addColorStop(1, "#041126");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // subtle moving stars
    const t = performance.now();
    for (let i = 0; i < 45; i++) {
      const sx = (Math.sin((i * 13.3 + t / 800) * 0.42) * 0.5 + 0.5) * w;
      const sy = (Math.cos((i * 7.7 + t / 620) * 0.66) * 0.5 + 0.5) * h;
      const r = (i % 8 === 0) ? 1.5 : 0.5;
      ctx.beginPath();
      ctx.fillStyle = i % 6 === 0 ? "rgba(255,255,255,0.86)" : "rgba(200,220,255,0.06)";
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // nebula overlay
    const neb = ctx.createRadialGradient(w * 0.25, h * 0.18, 10, w * 0.32, h * 0.35, Math.max(w, h) * 0.9);
    neb.addColorStop(0, "rgba(130, 90, 240, 0.12)");
    neb.addColorStop(0.6, "rgba(30, 10, 60, 0.04)");
    neb.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, w, h);

    // draw particles (behind asteroids)
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    Object.values(particlesRef.current).forEach((p) => {
      const alpha = clamp(1 - p.life / p.ttl, 0, 1);
      ctx.beginPath();
      if (p.type === "smoke") {
        // soft circular smoke
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
        grad.addColorStop(0, `rgba(30,30,40,${0.12 * alpha})`);
        grad.addColorStop(1, `rgba(30,30,40,0)`);
        ctx.fillStyle = grad;
        ctx.arc(p.x, p.y, p.size * 1.8, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // spark / shard
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
        grad.addColorStop(0, p.color);
        grad.addColorStop(0.6, p.color.replace(/,1\)$/, `,${0.75 * alpha})`));
        grad.addColorStop(1, `rgba(0,0,0,0)`);
        ctx.fillStyle = grad;
        ctx.arc(p.x, p.y, p.size * (1 + 0.2 * Math.sin(p.life)), 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.restore();

    // draw asteroids + their health bars
    Object.values(asteroidsRef.current).forEach((a) => {
      // halo
      const halo = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, a.radius * 3.5);
      halo.addColorStop(0, `hsla(${a.hue}, 80%, 60%, 0.24)`);
      halo.addColorStop(1, `rgba(0,0,0,0)`);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.radius * 2.2, 0, Math.PI * 2);
      ctx.fill();

      // body texture
      const g2 = ctx.createLinearGradient(a.x - a.radius, a.y - a.radius, a.x + a.radius, a.y + a.radius);
      g2.addColorStop(0, `hsla(${a.hue + 10}, 70%, 60%, 1)`);
      g2.addColorStop(1, `hsla(${a.hue - 60}, 55%, 35%, 1)`);
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.radius, 0, Math.PI * 2);
      ctx.fill();

      // damage ring if hp < full
      if (a.hp > 0 && a.hp < a.maxHp) {
        ctx.strokeStyle = "rgba(255,200,120,0.9)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // --- draw mini health bar below asteroid ---
      const barW = Math.max(28, a.radius * 1.6);
      const barH = Math.max(5, Math.round(barW * 0.18));
      const bx = a.x - barW / 2;
      const by = a.y + a.radius + 8;

      // background bar
      ctx.beginPath();
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      roundRect(ctx, bx - 1, by - 1, barW + 2, barH + 2, barH); // slightly padded
      ctx.fill();

      // health fraction
      const frac = clamp(a.hp / Math.max(1, a.maxHp), 0, 1);
      const fgW = Math.max(1, barW * frac);

      // colored foreground with glow
      const barGrad = ctx.createLinearGradient(bx, by, bx + barW, by);
      barGrad.addColorStop(0, `hsla(${a.hue}, 90%, 60%, 1)`);
      barGrad.addColorStop(1, `hsla(${(a.hue + 50) % 360}, 70%, 50%, 1)`);
      ctx.fillStyle = barGrad;
      roundRect(ctx, bx, by, fgW, barH, barH * 0.8);
      ctx.fill();

      // subtle outline
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, barW, barH);
    });

    // draw bullets (glowy elongated)
    Object.values(bulletsRef.current).forEach((b) => {
      ctx.save();
      ctx.translate(b.x, b.y);
      // trail glow
      const gradTrail = ctx.createLinearGradient(0, -10, 0, 10);
      gradTrail.addColorStop(0, "rgba(200,240,255,0.0)");
      gradTrail.addColorStop(0.3, "rgba(200,240,255,0.5)");
      gradTrail.addColorStop(1, "rgba(200,240,255,0)");
      ctx.fillStyle = gradTrail;
      ctx.beginPath();
      ctx.ellipse(0, 4, b.radius * 1.1, b.radius * 2.6, Math.PI / 12, 0, Math.PI * 2);
      ctx.fill();

      // core
      const grad = ctx.createLinearGradient(-b.radius, -b.radius, b.radius, b.radius);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(1, "#9ad4ff");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 0, b.radius * 1.05, b.radius * 1.6, Math.PI / 12, 0, Math.PI * 2);
      ctx.fill();

      // small core highlight
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(-b.radius * 0.2, -b.radius * 0.15, b.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });

    // draw ship (improved design)
    const sx = shipXRef.current;
    const sr = shipRadiusRef.current;
    const sy = h - sr - 8;
    // hull
    ctx.save();
    ctx.translate(sx, sy);
    const hullGrad = ctx.createLinearGradient(-sr, -sr, sr, sr);
    hullGrad.addColorStop(0, "#eaf6ff");
    hullGrad.addColorStop(0.5, "#caa6ff");
    hullGrad.addColorStop(1, "#7ef0ff");
    ctx.fillStyle = hullGrad;
    ctx.beginPath();
    ctx.moveTo(0, -sr * 0.9);
    ctx.quadraticCurveTo(-sr * 1.2, -sr * 0.1, -sr * 0.6, sr * 0.75);
    ctx.lineTo(sr * 0.6, sr * 0.75);
    ctx.quadraticCurveTo(sr * 1.2, -sr * 0.1, 0, -sr * 0.9);
    ctx.closePath();
    ctx.fill();

    // cockpit glass
    ctx.beginPath();
    ctx.fillStyle = "rgba(8,10,30,0.08)";
    ctx.ellipse(0, -sr * 0.28, sr * 0.42, sr * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    // glass highlight
    ctx.beginPath();
    const g2 = ctx.createLinearGradient(-sr * 0.4, -sr * 0.6, sr * 0.4, -sr * 0.2);
    g2.addColorStop(0, "rgba(255,255,255,0.85)");
    g2.addColorStop(1, "rgba(255,255,255,0.0)");
    ctx.fillStyle = g2;
    ctx.ellipse(-sr * 0.08, -sr * 0.34, sr * 0.25, sr * 0.14, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // thruster flame (animated)
    const movePulse = lastMoveXRef.current !== null ? Math.abs(Math.sin(performance.now() / 160)) : 0.28;
    ctx.beginPath();
    const flameGrad = ctx.createLinearGradient(0, sr * 0.4, 0, sr * 1.8);
    flameGrad.addColorStop(0, "rgba(255,255,200,0.98)");
    flameGrad.addColorStop(0.4, "rgba(255,170,80,0.85)");
    flameGrad.addColorStop(1, "rgba(140,60,220,0.06)");
    ctx.fillStyle = flameGrad;
    ctx.ellipse(0, sr * (0.9 + movePulse * 0.6), sr * 0.36, sr * (0.48 + movePulse * 0.6), 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // draw HUD inside canvas (single score display)
    ctx.font = `${Math.round(Math.min(w, h) * 0.036)}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.textAlign = "left";
    ctx.fillText(`Score: ${scoreRef.current.toLocaleString()}`, 14, 32);

    // timer circle top-right
    const cx = w - 64;
    const cy = 44;
    const outer = 28;
    ctx.beginPath();
    ctx.lineWidth = 6;
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
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, outer, startAngle, endAngle);
    ctx.stroke();

    ctx.font = `${Math.round(Math.min(w, h) * 0.028)}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.max(0, Math.ceil(timeLeftRef.current))}s`, cx, cy + 6);

    // target hint at bottom center
    ctx.font = `${Math.round(Math.min(w, h) * 0.026)}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = "rgba(220,220,255,0.5)";
    ctx.textAlign = "center";
    if (scoreRef.current < TARGET_SCORE) {
      ctx.fillText(`Target ${TARGET_SCORE.toLocaleString()}`, w / 2, h - 14);
    } else {
      ctx.fillText(`Target reached - finishing...`, w / 2, h - 14);
    }
  };

  // helper to draw rounded rect path (does not fill/stroke itself)
  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const radius = Math.min(r, Math.min(w, h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  // pointer controls: drag to move ship; tap to fire
  const onPointerDown = (ev: React.PointerEvent) => {
    ev.currentTarget.setPointerCapture?.(ev.pointerId);
    moveShipTo(ev.clientX);
    fireBullet(shipXRef.current);
  };
  const onPointerMove = (ev: React.PointerEvent) => {
    if (ev.pressure === 0 && ev.buttons === 0) return;
    moveShipTo(ev.clientX);
  };
  const onPointerUp = (ev: React.PointerEvent) => {
    try {
      ev.currentTarget.releasePointerCapture?.(ev.pointerId);
    } catch {}
  };

  const moveShipTo = (clientX: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const localX = clientX - rect.left;
    const x = (localX / rect.width) * canvasSize.w;
    lastMoveXRef.current = x;
    shipXRef.current = clamp(x, shipRadiusRef.current + 6, canvasSize.w - shipRadiusRef.current - 6);
  };

  // cleanup on unmount
  useEffect(() => {
    return () => {
      stopLoop();
      stopTimer();
    };
  }, []);

  // helper exits
  const exitToProfile = () => {
    stopLoop();
    stopTimer();
    navigate("/profile");
  };
  const handleExit = () => {
    stopLoop();
    stopTimer();
    navigate(-1);
  };

  const handlePlayAgain = () => {
    resetAll();
    setGameState("idle");
  };

  // initial render
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) render(ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasSize]);

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col items-center">
      {/* Top bar */}
      <div className="w-full max-w-4xl px-3 py-3 flex items-center justify-between gap-3 z-10">
        <div className="flex items-center gap-3">
          <div className="glass-panel rounded-full px-3 py-2">
            <div className="font-mono text-lg">
              {gameState === "idle" ? "Ready" : gameState === "playing" ? "Playing" : gameState}
            </div>
          </div>
          <div className="hidden sm:block text-sm text-gray-300">Orbit Defense — protect the galaxy</div>
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

      {/* Game Canvas */}
      <div className="flex-1 flex items-center justify-center w-full px-3 pb-6">
        <div className="relative" style={{ width: canvasSize.w }}>
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            style={{
              display: "block",
              borderRadius: 14,
              boxShadow: "0 12px 40px rgba(12,10,30,0.6)",
              touchAction: "none",
            }}
          />
        </div>
      </div>

      {/* Bottom area */}
      <div className="w-full max-w-4xl px-3 pb-6 flex items-center justify-center gap-3">
        {/* Start Modal (above everything) */}
        {gameState === "idle" && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
            <div className="glass-panel p-6 sm:p-8 rounded-2xl text-center max-w-[540px] w-full mx-4">
              <h1 className="text-2xl sm:text-3xl font-bold mb-2">Orbit Defense</h1>
              <p className="text-sm text-gray-300 mb-2">
                Move your ship and shoot incoming asteroids. Bigger ones take multiple hits.
              </p>
              <p className="text-sm text-gray-300 mb-4">
                Reach <span className="font-semibold text-yellow-300">{TARGET_SCORE.toLocaleString()}</span> before the timer ends to win.
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

        {/* Ad Modal (over everything) */}
        {gameState === "ad" && showAdPrompt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
            <div className="glass-panel p-6 rounded-2xl text-center max-w-[420px] w-full">
              <h2 className="text-2xl font-bold mb-2 text-red-300">Time's Up!</h2>
              <p className="text-sm text-gray-300 mb-4">
                Watch an ad to gain <span className="text-green-300 font-semibold">+{AD_CONTINUE_SECONDS}s</span> and continue.
              </p>
              <div className="flex gap-3 justify-center">
                <Button size="lg" onClick={watchAdAndContinue} className="bg-green-600 hover:bg-green-700 py-3 px-6">
                  Watch Ad to Continue
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAdPrompt(false);
                    setGameState("lost");
                  }}
                  className="py-3 px-4"
                >
                  End Run
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Win Modal */}
        {gameState === "win" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className="glass-panel p-6 rounded-2xl text-center max-w-[420px] w-full">
              <h2 className="text-2xl font-bold mb-2 text-green-300">Victory!</h2>
              <p className="text-sm text-gray-300 mb-3">You reached the target. ♦ {GAME_REWARD} awarded (daily)</p>
              <div className="flex gap-3 justify-center">
                <Button onClick={handlePlayAgain} className="bg-blue-600">
                  Play Again
                </Button>
                <Button variant="outline" onClick={exitToProfile}>
                  Exit to Profile
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Lost Modal */}
        {gameState === "lost" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className="glass-panel p-6 rounded-2xl text-center max-w-[420px] w-full">
              <h2 className="text-2xl font-bold mb-2 text-rose-400">Run Ended</h2>
              <p className="text-sm text-gray-300 mb-3">Score: {scoreRef.current.toLocaleString()}</p>
              <div className="flex gap-3 justify-center">
                <Button onClick={handlePlayAgain} className="bg-blue-600">
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
    </div>
  );
};

export default OrbitDefense;
