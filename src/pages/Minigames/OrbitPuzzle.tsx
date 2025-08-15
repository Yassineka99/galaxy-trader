// src/components/minigames/ConnectFlowGrid.tsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ref, runTransaction, get } from "firebase/database";
import { db } from "@/integrations/firebase/config";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type GameState = "idle" | "preview" | "playing" | "ad" | "win" | "locked";

const DEFAULT_GAME_ID = "connect-flow-grid";
const GAME_REWARD = 0.2; // diamonds
const XP_REWARD = 2;
const START_TIME_SEC = 20;
const AD_CONTINUE_SECONDS = 10;
const PREVIEW_MS = 1200;

const COLORS = [
  "#F43F5E", // red
  "#60A5FA", // blue
  "#F97316", // orange
  "#F472B6", // pink
  "#34D399", // green
  "#F59E0B", // amber
  "#A78BFA", // purple
  "#EAB308", // yellow-ish
];

const todayStr = () => new Date().toISOString().split("T")[0];

type Cell = { x: number; y: number };
type Pair = {
  id: number;
  color: string;
  a: Cell;
  b: Cell;
  connected: boolean;
  path?: Cell[]; // NOTE: we will NOT expose this to the UI on start (prevents revealing solution)
};

const neighbors = (c: Cell, size: number) => {
  const out: Cell[] = [];
  if (c.x > 0) out.push({ x: c.x - 1, y: c.y });
  if (c.x < size - 1) out.push({ x: c.x + 1, y: c.y });
  if (c.y > 0) out.push({ x: c.x, y: c.y - 1 });
  if (c.y < size - 1) out.push({ x: c.x, y: c.y + 1 });
  return out;
};
const cellEq = (a?: Cell, b?: Cell) => !!a && !!b && a.x === b.x && a.y === b.y;
const cellKey = (c: Cell) => `${c.x}_${c.y}`;

function bfsPath(start: Cell, goal: Cell, size: number, occupied: Set<string>) {
  const startKey = cellKey(start);
  const goalKey = cellKey(goal);
  if (startKey === goalKey) return [start];

  const q: Cell[] = [start];
  const came = new Map<string, string | null>();
  came.set(startKey, null);

  while (q.length) {
    const cur = q.shift()!;
    for (const nx of neighbors(cur, size)) {
      const k = cellKey(nx);
      if (came.has(k)) continue;
      if (k !== goalKey && occupied.has(k)) continue;
      came.set(k, cellKey(cur));
      if (k === goalKey) {
        const path: Cell[] = [];
        let curKey: string | null = goalKey;
        while (curKey) {
          const [xs, ys] = curKey.split("_").map(Number);
          path.push({ x: xs, y: ys });
          curKey = came.get(curKey) || null;
        }
        path.reverse();
        return path;
      }
      q.push(nx);
    }
  }
  return null;
}

function generateRoutedPairs(size = 7, pairCount = 6, attemptsLimit = 450): Pair[] {
  const cellsTotal = size * size;
  const maxPairs = Math.min(pairCount, Math.floor(cellsTotal / 4));
  for (let attempt = 0; attempt < attemptsLimit; attempt++) {
    const used = new Set<string>();
    const pairs: Pair[] = [];
    let id = 0;
    let safe = true;
    for (let p = 0; p < maxPairs; p++) {
      let a: Cell | null = null;
      let b: Cell | null = null;
      let tries = 0;
      while (!a && tries < 120) {
        tries++;
        const x = Math.floor(Math.random() * size);
        const y = Math.floor(Math.random() * size);
        if (!used.has(`${x}_${y}`)) a = { x, y };
      }
      tries = 0;
      while (!b && tries < 120) {
        tries++;
        const x = Math.floor(Math.random() * size);
        const y = Math.floor(Math.random() * size);
        const key = `${x}_${y}`;
        if (!used.has(key) && (Math.abs(x - (a?.x ?? 0)) + Math.abs(y - (a?.y ?? 0))) > 1) {
          b = { x, y };
        }
      }
      if (!a || !b) {
        safe = false;
        break;
      }
      used.add(cellKey(a));
      used.add(cellKey(b));
      pairs.push({ id: id++, color: COLORS[p % COLORS.length], a, b, connected: false });
    }
    if (!safe) continue;

    // route longest first
    pairs.sort((p1, p2) => (Math.abs(p2.a.x - p2.b.x) + Math.abs(p2.a.y - p2.b.y)) - (Math.abs(p1.a.x - p1.b.x) + Math.abs(p1.a.y - p1.b.y)));

    const occupied = new Set<string>();
    pairs.forEach((pp) => {
      occupied.add(cellKey(pp.a));
      occupied.add(cellKey(pp.b));
    });

    let failed = false;
    for (const pp of pairs) {
      occupied.delete(cellKey(pp.a));
      occupied.delete(cellKey(pp.b));
      const path = bfsPath(pp.a, pp.b, size, occupied);
      occupied.add(cellKey(pp.a));
      occupied.add(cellKey(pp.b));
      if (!path) {
        failed = true;
        break;
      }
      // store path temporarily so generation can check/mark occupancy
      pp.path = path;
      for (const c of path) occupied.add(cellKey(c));
    }
    if (failed) continue;

    // success: shuffle order to vary appearance
    for (let i = pairs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
    }
    return pairs;
  }

  // fallback
  const fallback: Pair[] = [];
  for (let i = 0; i < Math.min(pairCount, Math.floor(size * size / 6)); i++) {
    fallback.push({
      id: i,
      color: COLORS[i % COLORS.length],
      a: { x: i % size, y: Math.floor(i / size) },
      b: { x: (i + 2) % size, y: Math.floor((i + 2) / size) },
      connected: false,
    });
  }
  return fallback;
}

const ConnectFlowGrid: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const gameId = id || DEFAULT_GAME_ID;

  // mobile-friendly defaults
  const [gridSize] = useState<number>(7); // playable on mobile; reduce to 6 for easier
  const [pairCount] = useState<number>(6);

  // initially we generate solutions but DO NOT expose path in UI (prevents showing lines)
  const initialGenerated = generateRoutedPairs(gridSize, pairCount);
  const initialDisplay = initialGenerated.map((p) => ({ ...p, path: undefined, connected: false }));
  const [pairs, setPairs] = useState<Pair[]>(initialDisplay);

  const [occupiedMap, setOccupiedMap] = useState<Record<string, number>>({}); // permanent paths by pairId
  const [tempPath, setTempPath] = useState<Cell[] | null>(null);
  const tempPathRef = useRef<Cell[] | null>(null);
  const activePairRef = useRef<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(START_TIME_SEC);
  const intervalRef = useRef<number | null>(null);
  const previewTimeoutRef = useRef<number | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [gameState, setGameState] = useState<GameState>("idle");
  const [isAwarded, setIsAwarded] = useState(false);

  // Keep last generation's full routed solution in a ref (not shown)
  const solutionRef = useRef<Pair[] | null>(initialGenerated);

  // Firebase helpers
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

  // cleanup
  useEffect(() => {
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      if (previewTimeoutRef.current) window.clearTimeout(previewTimeoutRef.current);
    };
  }, []);

  // ensure touch action none for smooth dragging
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    el.style.touchAction = "none";
    return () => {
      try {
        el.style.touchAction = "";
      } catch {}
    };
  }, [boardRef.current]);

  const startTimer = () => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          if (intervalRef.current) {
            window.clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
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

  // Start Game: generate a new solvable board but do not expose routed paths
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
    const generated = generateRoutedPairs(gridSize, pairCount);
    // keep full solution privately in ref (not shown to player)
    solutionRef.current = generated.map((p) => ({ ...p }));
    // create display pairs WITHOUT exposing `path`
    const display = generated.map((p) => ({ ...p, path: undefined, connected: false }));
    setPairs(display);
    setOccupiedMap({});
    setTempPath(null);
    tempPathRef.current = null;
    activePairRef.current = null;
    setIsAwarded(false);
    setTimeLeft(START_TIME_SEC);
    setGameState("preview");

    previewTimeoutRef.current = window.setTimeout(() => {
      setGameState("playing");
      previewTimeoutRef.current = null;
      startTimer();
    }, PREVIEW_MS);
  };

  // convert client coords to cell
  const clientToCell = (clientX: number, clientY: number): Cell | null => {
    const el = boardRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const sx = rect.left;
    const sy = rect.top;
    const w = rect.width;
    const h = rect.height;
    const sizePx = Math.min(w, h);
    const offsetX = (w - sizePx) / 2;
    const offsetY = (h - sizePx) / 2;
    const localX = clientX - (sx + offsetX);
    const localY = clientY - (sy + offsetY);
    if (localX < 0 || localY < 0 || localX > sizePx || localY > sizePx) return null;
    const cellSize = sizePx / gridSize;
    const gx = Math.floor(localX / cellSize);
    const gy = Math.floor(localY / cellSize);
    return { x: Math.min(Math.max(gx, 0), gridSize - 1), y: Math.min(Math.max(gy, 0), gridSize - 1) };
  };

  useEffect(() => {
    tempPathRef.current = tempPath;
  }, [tempPath]);

  const onPointerDown = (ev: React.PointerEvent) => {
    if (gameState !== "playing") return;
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
    const c = clientToCell(ev.clientX, ev.clientY);
    if (!c) return;
    const hit = pairs.find((p) => cellEq(p.a, c) || cellEq(p.b, c));
    if (!hit) {
      setTempPath(null);
      tempPathRef.current = null;
      activePairRef.current = null;
      return;
    }
    if (hit.connected) {
      setTempPath(null);
      activePairRef.current = null;
      return;
    }
    activePairRef.current = hit.id;
    const startPath = [c];
    setTempPath(startPath);
    tempPathRef.current = startPath;
  };

  const onPointerMove = (ev: React.PointerEvent) => {
    if (gameState !== "playing") return;
    if (!tempPathRef.current || activePairRef.current === null) return;
    const c = clientToCell(ev.clientX, ev.clientY);
    if (!c) return;
    const last = tempPathRef.current[tempPathRef.current.length - 1];
    if (cellEq(last, c)) return;

    // allow backtrack
    if (tempPathRef.current.length >= 2) {
      const prev = tempPathRef.current[tempPathRef.current.length - 2];
      if (cellEq(prev, c)) {
        const np = tempPathRef.current.slice(0, -1);
        tempPathRef.current = np;
        setTempPath(np);
        return;
      }
    }

    // must be adjacent
    const manhattan = Math.abs(last.x - c.x) + Math.abs(last.y - c.y);
    if (manhattan !== 1) return;

    const key = cellKey(c);
    const occupyingPair = occupiedMap[key];
    const activePairId = activePairRef.current;
    const pt = pairs.find((p) => p.id === activePairId);
    const isOwnEndpoint = pt && (cellEq(pt.a, c) || cellEq(pt.b, c));
    if (occupyingPair !== undefined && occupyingPair !== activePairId && !isOwnEndpoint) {
      // can't step on other pair's path
      return;
    }

    const np = [...tempPathRef.current, c];
    tempPathRef.current = np;
    setTempPath(np);

    // if reached the other endpoint -> commit
    if (pt && (cellEq(pt.a, c) || cellEq(pt.b, c))) {
      commitTempPathAsPair(activePairId, np);
    }
  };

  const onPointerUp = (ev: React.PointerEvent) => {
    if (gameState !== "playing") return;
    try {
      (ev.target as Element).releasePointerCapture?.(ev.pointerId);
    } catch {}
    // cancel ephemeral path if not completed
    setTempPath(null);
    tempPathRef.current = null;
    activePairRef.current = null;
  };

  const onPointerCancel = (ev: React.PointerEvent) => {
    onPointerUp(ev);
  };

  const commitTempPathAsPair = (pairId: number, pathCells: Cell[]) => {
    const pair = pairs.find((p) => p.id === pairId);
    if (!pair) return;
    const startKey = cellKey(pair.a);
    const endKey = cellKey(pair.b);
    const pathKeys = new Set(pathCells.map(cellKey));
    if (!pathKeys.has(startKey) || !pathKeys.has(endKey)) {
      setTempPath(null);
      tempPathRef.current = null;
      activePairRef.current = null;
      return;
    }

    setPairs((prev) =>
      prev.map((p) =>
        p.id === pairId
          ? {
              ...p,
              connected: true,
              path: pathCells, // now expose path for the UI so it draws
            }
          : p
      )
    );

    setOccupiedMap((prev) => {
      const copy = { ...prev };
      for (const c of pathCells) {
        copy[cellKey(c)] = pairId;
      }
      return copy;
    });

    setTempPath(null);
    tempPathRef.current = null;
    activePairRef.current = null;
    toast.success("Connected!");

    // win check
    setTimeout(() => {
      setPairs((curr) => {
        const all = curr.every((p) => p.connected);
        if (all) {
          stopTimer();
          setGameState("win");
          if (!isAwarded) awardAndMark();
        }
        return curr;
      });
    }, 80);
  };

  const watchAdAndContinue = () => {
    toast.info(`Ad watched successfully! +${AD_CONTINUE_SECONDS}s`);
    setTimeLeft((t) => t + AD_CONTINUE_SECONDS);
    setGameState("playing");
    startTimer();
  };

  // UI helpers
  const gridTemplate = {
    gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${gridSize}, minmax(0, 1fr))`,
  } as React.CSSProperties;

  const connectedCount = pairs.filter((p) => p.connected).length;

  // responsive board sizing tuned for mobile:
  const boardStyle: React.CSSProperties = {
    width: "min(96vw, 760px)",
    height: "min(calc(100vh - 160px), 760px)", // leave room for top bar and modals
    maxWidth: 760,
    maxHeight: 760,
    margin: "0 auto",
  };

  // cell gap is small for mobile; this is intentionally conservative so cells stay tappable
  const gridGap = 6;

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center items-start justify-between px-3 sm:px-4 py-3 gap-3 z-10">
        <div className="flex items-center gap-3">
          <div className="glass-panel rounded-full px-3 py-2">
            <div className="font-mono text-lg">{timeLeft}s</div>
          </div>
          <div className="hidden sm:block text-sm text-gray-300">Connect matching colors — lines may not cross</div>
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

      {/* Game Area */}
      <div className="relative flex-1 flex items-center justify-center overflow-auto px-4 pb-6">
        <div className="absolute inset-0 bg-[radial-gradient(white,transparent_1px)] [background-size:20px_20px] opacity-6 pointer-events-none" />

        {/* Start */}
        {gameState === "idle" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-40 pointer-events-auto px-4">
            <div className="glass-panel p-6 sm:p-8 rounded-2xl text-center max-w-[540px] w-full">
              <h1 className="text-2xl sm:text-3xl font-bold mb-2">Flow — Connect Colors</h1>
              <p className="text-sm text-gray-300 mb-2">Connect each pair. Paths occupy cells and cannot cross.</p>
              <p className="text-sm text-gray-300 mb-4">
                You have <span className="font-semibold">{START_TIME_SEC} seconds</span>. If time expires you can watch an ad (+{AD_CONTINUE_SECONDS}s).
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

        {/* Preview */}
        {gameState === "preview" && (
          <div className="absolute inset-0 flex items-start justify-center pt-6 z-30 pointer-events-none px-4">
            <div className="glass-panel p-2 rounded-lg text-center">
              <p className="text-sm sm:text-base text-gray-200">Preview dots...</p>
            </div>
          </div>
        )}

        {/* Ad */}
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
                  setPairs(generateRoutedPairs(gridSize, pairCount).map(p => ({ ...p, path: undefined, connected: false })));
                  setOccupiedMap({});
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

        {/* Win */}
        {gameState === "win" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50 px-4">
            <div className="glass-panel p-6 sm:p-8 rounded-2xl text-center max-w-[420px] w-full">
              <h2 className="text-2xl sm:text-3xl font-bold mb-3 text-green-400">You Did It!</h2>
              <p className="text-lg text-yellow-300 mb-2">♦ {GAME_REWARD} diamonds earned</p>
              <p className="text-sm text-gray-300 mb-4">All pairs connected. Great job!</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={() => {
                  setGameState("idle");
                  const generated = generateRoutedPairs(gridSize, pairCount);
                  solutionRef.current = generated;
                  setPairs(generated.map(p => ({ ...p, path: undefined, connected: false })));
                  setOccupiedMap({});
                  setIsAwarded(false);
                  setTimeLeft(START_TIME_SEC);
                }} className="py-3 px-6">Play Again</Button>
                <Button variant="outline" onClick={() => navigate(-1)} className="py-3 px-4">Exit</Button>
              </div>
            </div>
          </div>
        )}

        {/* Board */}
        <div
          ref={boardRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          className="relative bg-slate-900 rounded-2xl p-3 touch-none"
          style={boardStyle}
        >
          <div
            className="absolute inset-3 bg-transparent rounded-xl"
            style={{
              display: "grid",
              gap: gridGap,
              padding: gridGap,
              ...gridTemplate,
            }}
          >
            {Array.from({ length: gridSize }).map((_, row) =>
              Array.from({ length: gridSize }).map((__, col) => {
                const key = `${col}_${row}`;
                const occupyingPairId = occupiedMap[key];
                const occupyingColor = occupyingPairId !== undefined ? pairs.find((p) => p.id === occupyingPairId)?.color : undefined;
                const inTemp =
                  tempPath &&
                  tempPath.some((c) => c.x === col && c.y === row) &&
                  activePairRef.current !== null &&
                  pairs.find((p) => p.id === activePairRef.current)?.color;
                const background =
                  occupyingColor ??
                  (inTemp ? `${pairs.find((p) => p.id === activePairRef.current)?.color}33` : "transparent");

                return (
                  <div
                    key={key}
                    className="flex items-center justify-center rounded-sm select-none"
                    style={{
                      background,
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    {/* endpoint */}
                    {pairs.find((p) => cellEq(p.a, { x: col, y: row }) || cellEq(p.b, { x: col, y: row })) ? (
                      <div
                        className="rounded-full shadow-md"
                        style={{
                          width: "62%",
                          height: "62%",
                          background: pairs.find((p) => cellEq(p.a, { x: col, y: row }) || cellEq(p.b, { x: col, y: row }))?.color,
                          boxShadow: `0 0 8px ${pairs.find((p) => cellEq(p.a, { x: col, y: row }) || cellEq(p.b, { x: col, y: row }))?.color}66, inset 0 -4px 8px #00000066`,
                        }}
                      />
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          {/* SVG overlay draws permanent paths (only after pair is connected) and temp path */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
            {/* permanent paths */}
            {pairs.map((pp) => {
              if (!pp.path || !pp.connected) return null;
              const points = pp.path.map((c) => {
                const cx = (c.x + 0.5) * (100 / gridSize);
                const cy = (c.y + 0.5) * (100 / gridSize);
                return `${cx},${cy}`;
              });
              return (
                <polyline
                  key={`perm-${pp.id}`}
                  points={points.join(" ")}
                  fill="none"
                  stroke={pp.color}
                  strokeWidth={8 * (100 / gridSize) / 12}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.6))" }}
                />
              );
            })}

            {/* temp path */}
            {tempPath && tempPath.length > 0 && (
              <>
                <polyline
                  points={tempPath
                    .map((c) => {
                      const cx = (c.x + 0.5) * (100 / gridSize);
                      const cy = (c.y + 0.5) * (100 / gridSize);
                      return `${cx},${cy}`;
                    })
                    .join(" ")}
                  fill="none"
                  stroke={activePairRef.current !== null ? pairs.find((p) => p.id === activePairRef.current)?.color || "white" : "white"}
                  strokeWidth={8 * (100 / gridSize) / 12}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {(() => {
                  const last = tempPath[tempPath.length - 1];
                  const cx = (last.x + 0.5) * (100 / gridSize);
                  const cy = (last.y + 0.5) * (100 / gridSize);
                  return <circle cx={cx} cy={cy} r={2.2 * (100 / gridSize) / 12} fill="white" />;
                })()}
              </>
            )}

            {/* endpoints */}
            {pairs.map((pp) => {
              const ax = (pp.a.x + 0.5) * (100 / gridSize);
              const ay = (pp.a.y + 0.5) * (100 / gridSize);
              const bx = (pp.b.x + 0.5) * (100 / gridSize);
              const by = (pp.b.y + 0.5) * (100 / gridSize);
              return (
                <g key={`dot-${pp.id}`}>
                  <circle cx={ax} cy={ay} r={3.8 * (100 / gridSize) / 12} fill={pp.color} stroke="rgba(255,255,255,0.06)" strokeWidth={0.35} />
                  <circle cx={bx} cy={by} r={3.8 * (100 / gridSize) / 12} fill={pp.color} stroke="rgba(255,255,255,0.06)" strokeWidth={0.35} />
                </g>
              );
            })}
          </svg>

          {/* bottom status */}
          <div className="absolute left-4 right-4 bottom-4 sm:bottom-6 flex items-center justify-between gap-3 pointer-events-none">
            <div className="bg-black/40 glass-panel rounded-full px-3 py-2 text-sm">
              Connected: <span className="font-semibold ml-2">{connectedCount}/{pairs.length}</span>
            </div>
            <div className="bg-black/40 glass-panel rounded-full px-3 py-2 text-sm">
              <span className="text-xs text-gray-300">Goal</span>
              <div className="font-semibold">Connect all pairs</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConnectFlowGrid;
