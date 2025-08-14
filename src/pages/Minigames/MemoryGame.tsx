// src/components/minigames/MemoryGame.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ref, runTransaction, get } from "firebase/database";
import { db } from "@/integrations/firebase/config";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type GameState = "idle" | "preview" | "playing" | "ad" | "win" | "locked";

const DEFAULT_GAME_ID = "memory-game";
const GAME_REWARD = 0.2; // diamonds
const HEARTS_START = 3;
const FLIP_BACK_DELAY = 800; // ms (after mismatch)
const FLIP_LOCK_DELAY = 250; // ms between flips to prevent spam
const PREVIEW_MS = 3000; // show cards for 3 seconds at start
const XP_REWARD = 2;

const todayStr = () => new Date().toISOString().split("T")[0];

const assetNames = [
  "hole",
  "galaxy",
  "moon",
  "naz",
  "neptune",
  "rock",
  "rocket",
  "ship",
  "star",
] as const;
type AssetName = (typeof assetNames)[number];

type Card = {
  id: number;
  key: string; // pair key
  img: string;
  flipped: boolean;
  matched: boolean;
};

const loadImageUrl = (name: AssetName) =>
  new URL(`../../assets/memory/${name}.png`, import.meta.url).href;

function buildDeck(): Card[] {
  // 9 unique -> 18 cards (pairs)
  const pairs = assetNames.map((name) => ({
    key: name,
    img: loadImageUrl(name),
  }));

  // duplicate and shuffle
  const doubled = [...pairs, ...pairs]
    .map((p, idx) => ({
      id: idx,
      key: p.key,
      img: p.img,
      flipped: false,
      matched: false,
    }))
    .sort(() => Math.random() - 0.5);

  return doubled;
}

const MemoryGame: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const gameId = id || DEFAULT_GAME_ID;

  const [gameState, setGameState] = useState<GameState>("idle");
  const [deck, setDeck] = useState<Card[]>(() => buildDeck());
  const [flippedIndexes, setFlippedIndexes] = useState<number[]>([]);
  const [hearts, setHearts] = useState<number>(HEARTS_START);
  const [isAwarded, setIsAwarded] = useState<boolean>(false);
  const [lockFlip, setLockFlip] = useState<boolean>(false);
  const lastFlipRef = useRef<number>(0);
  const previewTimeoutRef = useRef<number | null>(null);

  // ==== Firebase helpers (same style as RunGame) ====
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

  // ==== Derived counts ====
  const matchedCount = useMemo(
    () => deck.filter((c) => c.matched).length,
    [deck]
  );
  const totalCards = deck.length;

  // cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (previewTimeoutRef.current) window.clearTimeout(previewTimeoutRef.current);
    };
  }, []);

  // ==== Start game flow (with preview) ====
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
    // create new deck and show all cards face-up for a short preview
    const newDeck = buildDeck();
    const previewDeck = newDeck.map((c) => ({ ...c, flipped: true, matched: false }));
    setDeck(previewDeck);
    setFlippedIndexes([]);
    setHearts(HEARTS_START);
    setIsAwarded(false);
    setLockFlip(true);
    setGameState("preview");

    // after PREVIEW_MS, flip all non-matched cards back and enter playing
    previewTimeoutRef.current = window.setTimeout(() => {
      setDeck((d) =>
        d.map((c) => {
          if (c.matched) return { ...c, flipped: true };
          return { ...c, flipped: false };
        })
      );
      setLockFlip(false);
      setGameState("playing");
      previewTimeoutRef.current = null;
    }, PREVIEW_MS);
  };

  // ==== Handle flip logic ====
  const handleFlip = (index: number) => {
    // only allow flips while actually playing
    if (gameState !== "playing") return;
    if (lockFlip) return;

    const now = Date.now();
    if (now - lastFlipRef.current < FLIP_LOCK_DELAY) return;
    lastFlipRef.current = now;

    // don't flip already flipped / matched cards
    setDeck((prev) => {
      const card = prev[index];
      if (!card || card.flipped || card.matched) return prev;

      // Prevent flipping third card while two are face-up
      if (flippedIndexes.length === 2) return prev;

      const next = [...prev];
      next[index] = { ...card, flipped: true };
      return next;
    });

    setFlippedIndexes((prevIdxs) => {
      const nextIdxs = [...prevIdxs, index];

      if (nextIdxs.length === 2) {
        const [a, b] = nextIdxs;

        // Use the latest deck snapshot to compare
        // (small setTimeout ensures deck state updated before reading)
        setTimeout(() => {
          setDeck((currentDeck) => {
            const first = currentDeck[a];
            const second = currentDeck[b];

            if (first && second && first.key === second.key) {
              // Match
              const copy = [...currentDeck];
              copy[a] = { ...copy[a], matched: true, flipped: true };
              copy[b] = { ...copy[b], matched: true, flipped: true };
              // clear flipped indexes
              setFlippedIndexes([]);
              return copy;
            } else {
              // Mismatch -> lose heart, flip back after delay
              setLockFlip(true);
              window.setTimeout(() => {
                setDeck((d) => {
                  const copy = [...d];
                  const ca = copy[a];
                  const cb = copy[b];
                  if (ca && !ca.matched) copy[a] = { ...ca, flipped: false };
                  if (cb && !cb.matched) copy[b] = { ...cb, flipped: false };
                  return copy;
                });
                setFlippedIndexes([]);
                setLockFlip(false);

                setHearts((h) => {
                  const n = h - 1;
                  if (n <= 0) {
                    // out of hearts => show ad modal
                    setGameState("ad");
                    return 0;
                  }
                  return n;
                });
              }, FLIP_BACK_DELAY);
              return currentDeck;
            }
          });
        }, 20); // tiny delay to ensure deck reflects the newly flipped card
      }

      return nextIdxs;
    });
  };

  // ==== Win detection ====
  useEffect(() => {
    if (gameState !== "playing") return;
    if (matchedCount === totalCards && totalCards > 0) {
      setGameState("win");
      if (!isAwarded) awardAndMark();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedCount, totalCards, gameState]);

  // ==== Ad flow ====
  const watchAdAndContinue = () => {
    // Simulate "watch ad" success
    toast.info("Ad watched successfully! +1 heart");
    setHearts((h) => Math.max(1, h + 1));
    setGameState("playing");
  };

  // ==== UI helpers ====

  // HeartRow: show full hearts for active, broken hearts for lost
  const HeartRow = () => (
    <div className="flex items-center gap-2 sm:gap-3">
      {Array.from({ length: HEARTS_START }).map((_, i) => {
        const active = i < hearts;
        return (
          <span
            key={i}
            className={`text-[20px] sm:text-2xl leading-none select-none ${active ? "text-red-500" : "text-gray-400"}`}
            aria-hidden
          >
            {active ? "❤" : "💔"}
          </span>
        );
      })}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center items-start justify-between px-3 sm:px-4 py-3 gap-3 z-10">
        <div className="flex items-center gap-3">
          <div className="glass-panel rounded-full px-3 py-2">
            <HeartRow />
          </div>
          <div className="hidden sm:block text-sm text-gray-300">Hearts</div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="glass-panel rounded-full px-3 py-2 text-sm">
            <span className="text-yellow-300 font-semibold">♦ {GAME_REWARD}</span>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="min-h-[40px] py-2 px-3"
          >
            Exit
          </Button>
        </div>
      </div>

      {/* Game Area */}
      <div className="relative flex-1 flex items-center justify-center overflow-auto px-2">
        {/* Subtle starfield background */}
        <div className="absolute inset-0 bg-[radial-gradient(white,transparent_1px)] [background-size:20px_20px] opacity-8 pointer-events-none" />

        {/* Start Screen (now above everything and clickable) */}
        {gameState === "idle" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-40 pointer-events-auto px-4">
            <div className="glass-panel p-6 sm:p-8 rounded-2xl text-center max-w-[460px] w-full">
              <h1 className="text-2xl sm:text-3xl font-bold mb-2">Galaxy Memory</h1>
              <p className="text-sm text-gray-300 mb-1">Find all matching pairs to win.</p>
              <p className="text-sm text-gray-300 mb-4">
                You have <span className="text-red-400 font-semibold">3 hearts</span>. Each mismatch costs 1 heart.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  size="lg"
                  onClick={startGame}
                  className="bg-blue-600 hover:bg-blue-700 py-3 px-6 min-w-[160px]"
                >
                  Start Game
                </Button>
                <Button variant="outline" onClick={() => navigate(-1)} className="py-3 px-4">
                  Back
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Preview overlay */}
        {gameState === "preview" && (
          <div className="absolute inset-0 flex items-start justify-center pt-6 z-30 pointer-events-none px-4">
            <div className="glass-panel p-2 rounded-lg text-center">
              <p className="text-sm sm:text-base text-gray-200">Memorize the cards...</p>
            </div>
          </div>
        )}

        {/* Ad Screen */}
        {gameState === "ad" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50 px-4">
            <div className="glass-panel p-6 sm:p-8 rounded-2xl text-center max-w-[420px] w-full">
              <h2 className="text-2xl sm:text-3xl font-bold mb-3 text-red-400">Out of Hearts!</h2>
              <p className="text-sm sm:text-base text-gray-300 mb-4">
                Watch an ad to regain <span className="text-red-400 font-semibold">1</span> heart and continue.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  size="lg"
                  onClick={watchAdAndContinue}
                  className="bg-green-600 hover:bg-green-700 py-3 px-6"
                >
                  Watch Ad to Continue
                </Button>
                <Button variant="outline" onClick={() => setGameState("idle")} className="py-3 px-4">
                  Restart
                </Button>
                <Button variant="ghost" onClick={() => navigate(-1)} className="py-3 px-4 text-gray-300">
                  Exit
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Win Screen */}
        {gameState === "win" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50 px-4">
            <div className="glass-panel p-6 sm:p-8 rounded-2xl text-center max-w-[420px] w-full">
              <h2 className="text-2xl sm:text-3xl font-bold mb-3 text-green-400">You Did It!</h2>
              <p className="text-lg text-yellow-300 mb-2">♦ {GAME_REWARD} diamonds earned</p>
              <p className="text-sm text-gray-300 mb-4">All pairs matched. Great memory!</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={() => setGameState("idle")} className="py-3 px-6">Play Again</Button>
                <Button variant="outline" onClick={() => navigate(-1)} className="py-3 px-4">Exit</Button>
              </div>
            </div>
          </div>
        )}

        {/* Board: responsive auto-fit grid so cards resize to fit any viewport */}
        <div
          className="grid gap-3 p-2 sm:p-4 w-full max-w-[1200px] mx-auto"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(72px, 1fr))",
            // keep some breathing room on very wide screens
            gridAutoRows: "minmax(72px, auto)",
          }}
        >
          {deck.map((card, idx) => {
            const showFace = card.flipped || card.matched;
            return (
              <button
                key={card.id}
                aria-label={`card-${idx}`}
                onClick={() => handleFlip(idx)}
                disabled={gameState !== "playing" || showFace || flippedIndexes.length === 2 || lockFlip}
                className={`relative w-full aspect-square rounded-xl overflow-hidden focus:outline-none
                  transition-transform duration-150 active:scale-95
                  ${gameState !== "playing" ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                style={{ touchAction: "manipulation" }}
              >
                {/* Card Inner for flip animation */}
                <div
                  className="absolute inset-0 [transform-style:preserve-3d] transition-transform duration-300"
                  style={{
                    transform: showFace ? "rotateY(180deg)" : "rotateY(0deg)",
                  }}
                >
                  {/* Back */}
                  <div
                    className="absolute inset-0 bg-gradient-to-br from-indigo-900 to-purple-900 flex items-center justify-center text-3xl"
                    style={{ backfaceVisibility: "hidden" }}
                  >
                    ✨
                  </div>

                  {/* Front */}
                  <div
                    className="absolute inset-0 bg-black/60 flex items-center justify-center p-2"
                    style={{ transform: "rotateY(180deg)", backfaceVisibility: "hidden" }}
                  >
                    <img
                      src={card.img}
                      alt={card.key}
                      className={`w-full h-full object-contain ${card.matched ? "opacity-80" : ""}`}
                      draggable={false}
                    />
                  </div>
                </div>

                {/* Matched glow */}
                {card.matched && (
                  <div className="absolute inset-0 ring-4 ring-green-500/60 rounded-xl pointer-events-none" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MemoryGame;
