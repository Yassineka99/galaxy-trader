// src/components/minigames/ChessGame.tsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ref, runTransaction, get } from "firebase/database";
import { db } from "@/integrations/firebase/config";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Chess, Square } from "chess.js";

type GameState = "idle" | "playing" | "win" | "ad" | "locked";

const DEFAULT_GAME_ID = "chess-game";
const GAME_REWARD = 0.2; // diamonds
const XP_REWARD = 4;
const BOT_ELO = 1000;
const todayStr = () => new Date().toISOString().split("T")[0];

// assets
const BOARD_IMG = new URL("../../assets/minigames/chess/board-1.png", import.meta.url).href;
const pieceNameForType = (type: string) => {
  switch (type) {
    case "p":
      return "pawn";
    case "n":
      return "knight";
    case "b":
      return "bishop";
    case "r":
      return "rook";
    case "q":
      return "queen";
    case "k":
      return "king";
    default:
      return "pawn";
  }
};

// ---------- Firebase helpers ----------
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

// ---------- Bot helpers ----------
const pieceValue = (type: string) => {
  switch (type) {
    case "p":
      return 1;
    case "n":
      return 3;
    case "b":
      return 3;
    case "r":
      return 5;
    case "q":
      return 9;
    case "k":
      return 900;
    default:
      return 0;
  }
};

const evaluateMaterial = (ch: Chess) => {
  const board = ch.board();
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      const val = pieceValue(p.type);
      score += p.color === "w" ? val : -val;
    }
  }
  return score;
};

const bestMoveProbabilityFromElo = (elo: number) => {
  const min = 0.2;
  const max = 0.98;
  const clamped = Math.max(800, Math.min(2000, elo));
  const t = (clamped - 800) / (2000 - 800);
  return min + t * (max - min);
};

// ---------- Component ----------
const ChessGame: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const gameId = id || DEFAULT_GAME_ID;

  const chessRef = useRef(new Chess());
  const [gameState, setGameState] = useState<GameState>("idle");
  const [isAwarded, setIsAwarded] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalDestinations, setLegalDestinations] = useState<string[]>([]);
  const [botThinking, setBotThinking] = useState(false);
  const [, setTick] = useState(0); // tiny state to force rerender when board changes

  // piece scale for small screens
  const [pieceScale, setPieceScale] = useState<number>(0.66);

  // responsive board size: smaller max so it fits mobile screens
  const boardSizeStyle: React.CSSProperties = {
    width: "min(92vw, 520px)",
    height: "min(92vw, 520px)",
    maxWidth: 520,
    maxHeight: 520,
    position: "relative",
    touchAction: "manipulation",
  };

  useEffect(() => {
    const recompute = () => {
      const w = window.innerWidth;
      if (w <= 360) setPieceScale(0.56);
      else if (w <= 420) setPieceScale(0.62);
      else if (w <= 520) setPieceScale(0.66);
      else if (w <= 768) setPieceScale(0.72);
      else setPieceScale(0.78);
    };
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, []);

  // refresh board render by toggling a tick
  const refreshBoard = () => setTick((t) => t + 1);

  // start new game (invoked by overlay Start button)
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
    const ch = new Chess();
    chessRef.current = ch;
    refreshBoard();
    setGameState("playing");
    setSelectedSquare(null);
    setLegalDestinations([]);
    setIsAwarded(false);
    setBotThinking(false);
  };

  const onSquareClick = (square: string) => {
    if (gameState !== "playing") return;
    if (botThinking) return;
    const ch = chessRef.current;
    const piece = ch.get(square as Square);

    if (selectedSquare && legalDestinations.includes(square)) {
      ch.move({ from: selectedSquare, to: square, promotion: "q" });
      setSelectedSquare(null);
      setLegalDestinations([]);
      refreshBoard();
      setTimeout(() => handlePostMove(), 60);
      return;
    }

    if (piece && piece.color === "w") {
      const moves = ch.moves({ square: square as Square, verbose: true }) as any[];
      const destinations = moves.map((m) => m.to);
      setSelectedSquare(square);
      setLegalDestinations(destinations);
      return;
    }

    setSelectedSquare(null);
    setLegalDestinations([]);
  };

  const handlePostMove = async () => {
    const ch = chessRef.current;
    if (ch.isGameOver()) {
      if (ch.isCheckmate()) {
        const winner = ch.turn() === "w" ? "black" : "white";
        if (winner === "white") {
          setGameState("win");
          if (!isAwarded) {
            const ok = await awardAndMark(user, gameId);
            setIsAwarded(ok);
            if (ok) toast.success(`Nice! +${GAME_REWARD} diamonds awarded`);
            else toast.error("Failed to record reward. Try again later.");
          }
        } else {
          setGameState("locked");
          toast.error("Checkmate — you lost this round.");
        }
      } else {
        setGameState("locked");
        toast.info("Game ended in a draw.");
      }
      return;
    }

    if (ch.turn() === "b") {
      makeBotMove();
    }
  };

  const makeBotMove = async () => {
    setBotThinking(true);
    await new Promise((r) => setTimeout(r, 220 + Math.random() * 300));
    const ch = chessRef.current;
    const moves = ch.moves({ verbose: true }) as any[];
    if (!moves || moves.length === 0) {
      setBotThinking(false);
      handlePostMove();
      return;
    }

    const scored = moves.map((m) => {
      const sim = new Chess(ch.fen());
      sim.move({ from: m.from, to: m.to, promotion: m.promotion || "q" });
      const score = evaluateMaterial(sim);
      return { move: m, score };
    });

    scored.sort((a, b) => a.score - b.score);
    const bestProb = bestMoveProbabilityFromElo(BOT_ELO);
    const pickBest = Math.random() < bestProb;
    let chosenMove;
    if (pickBest) chosenMove = scored[0].move;
    else {
      const pool = scored.slice(0, Math.max(1, Math.floor(scored.length * 0.4)));
      chosenMove = pool[Math.floor(Math.random() * pool.length)].move || scored[Math.floor(Math.random() * scored.length)].move;
    }

    ch.move({ from: chosenMove.from, to: chosenMove.to, promotion: chosenMove.promotion || "q" });
    refreshBoard();
    setBotThinking(false);
    setTimeout(() => handlePostMove(), 80);
  };

  const squareToCoords = (square: string) => {
    const file = square[0];
    const rank = parseInt(square[1], 10);
    const col = file.charCodeAt(0) - "a".charCodeAt(0);
    const row = 8 - rank;
    return { row, col };
  };

  const pieceImageUrl = (piece: { type: string; color: string } | null) => {
    if (!piece) return null;
    const color = piece.color === "w" ? "white" : "black";
    const name = pieceNameForType(piece.type);
    const url = new URL(`../../assets/minigames/chess/${color}-${name}.png`, import.meta.url).href;
    return url;
  };

  const handleExit = () => navigate(-1);

  // render the board from chessRef
  const boardArray = chessRef.current.board();

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col items-center">
      {/* Top Bar */}
      <div className="w-full max-w-3xl px-3 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="glass-panel rounded-full px-3 py-2">
            <div className="font-mono text-lg">{gameState === "idle" ? "Ready" : gameState === "playing" ? "Playing" : gameState}</div>
          </div>
          <div className="hidden sm:block text-sm text-gray-300">Play vs Bot (ELO {BOT_ELO})</div>
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

      {/* Board & Controls */}
      <div className="flex-1 w-full flex flex-col items-center justify-center px-3 pb-8">
        <div style={boardSizeStyle} className="select-none">
          {/* board background */}
          <div
            className="absolute inset-0 rounded-md overflow-hidden"
            style={{
              backgroundImage: `url(${BOARD_IMG})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              borderRadius: 10,
              boxShadow: "0 6px 24px rgba(0,0,0,0.6)",
            }}
          />

          {/* interactive grid */}
          <div
            className="absolute inset-0 grid"
            style={{
              gridTemplateColumns: "repeat(8, 1fr)",
              gridTemplateRows: "repeat(8, 1fr)",
            }}
          >
            {Array.from({ length: 8 }).map((_, row) =>
              Array.from({ length: 8 }).map((__, col) => {
                const file = String.fromCharCode("a".charCodeAt(0) + col);
                const rank = 8 - row;
                const square = `${file}${rank}`;
                const piece = boardArray[row][col]; // chessRef.current.get(square) equivalent
                const selected = selectedSquare === square;
                const isLegal = legalDestinations.includes(square);

                return (
                  <div
                    key={`${row}-${col}`}
                    onClick={() => onSquareClick(square)}
                    className="relative w-full h-full"
                    style={{ touchAction: "manipulation" }}
                  >
                    {/* selection highlight */}
                    {selected && (
                      <div
                        style={{
                          position: "absolute",
                          inset: "6px",
                          borderRadius: 8,
                          boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.14)",
                          pointerEvents: "none",
                        }}
                      />
                    )}

                    {/* legal destination dot */}
                    {isLegal && !selected && (
                      <div
                        style={{
                          position: "absolute",
                          inset: "10px",
                          borderRadius: 999,
                          background: "rgba(255,255,255,0.12)",
                          pointerEvents: "none",
                        }}
                      />
                    )}

                    {/* piece image */}
                    {piece && (
                      <img
                        src={pieceImageUrl(piece)}
                        alt={`${piece.color}${piece.type}`}
                        draggable={false}
                        style={{
                          position: "absolute",
                          left: "50%",
                          top: "50%",
                          transform: "translate(-50%,-50%)",
                          width: `${Math.round(pieceScale * 100)}%`,
                          height: "auto",
                          maxHeight: `${Math.round(pieceScale * 100)}%`,
                          transition: "transform 180ms ease, opacity 160ms ease",
                          filter:
                            piece.color === "b"
                              ? "drop-shadow(0 6px 10px rgba(0,0,0,0.6))"
                              : "drop-shadow(0 4px 8px rgba(0,0,0,0.25))",
                          pointerEvents: "none",
                        }}
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="mt-4 flex flex-wrap gap-3 items-center justify-center">
          {gameState === "playing" && (
            <>
              <div className="glass-panel rounded-full px-3 py-2 text-sm">You: White</div>
              <div className="glass-panel rounded-full px-3 py-2 text-sm">Bot: Black (ELO {BOT_ELO})</div>
              <div className="glass-panel rounded-full px-3 py-2 text-sm">{botThinking ? "Bot thinking..." : ""}</div>
            </>
          )}

          {(gameState === "win" || gameState === "locked") && (
            <>
              <div className="glass-panel rounded-full px-3 py-2 text-sm">Result: {gameState === "win" ? "You Win!" : "Finished"}</div>
              <Button onClick={startGame} className="bg-blue-600">
                Play Again
              </Button>
              <Button variant="outline" onClick={() => navigate(-1)}>
                Exit
              </Button>
            </>
          )}
        </div>
      </div>

      {/* START modal: fixed overlay above everything (shown when idle) */}
      {gameState === "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="glass-panel p-6 sm:p-8 rounded-2xl text-center max-w-[520px] w-full">
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">Galaxy Chess</h1>
            <p className="text-sm text-gray-300 mb-3">Play as White vs a friendly bot (ELO {BOT_ELO}). Win to earn diamonds.</p>
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

      {/* AD modal (keeps above content when needed) */}
      {gameState === "ad" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="glass-panel p-6 sm:p-8 rounded-2xl text-center max-w-[420px] w-full">
            <h3 className="text-2xl font-bold mb-2 text-red-300">Time's Up</h3>
            <p className="text-sm text-gray-300 mb-4">Watch an ad to get +1 minute and continue the puzzle.</p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => { toast.info("Ad watched! +60s"); /* add ad logic */ }} className="bg-green-600">
                Watch Ad to Continue
              </Button>
              <Button variant="outline" onClick={() => navigate(-1)}>
                Exit
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* WIN modal (lower z than ad) */}
      {gameState === "win" && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 pointer-events-auto px-4">
          <div className="glass-panel p-6 rounded-2xl text-center max-w-[420px] w-full">
            <h3 className="text-2xl font-bold mb-2 text-green-300">Perfect!</h3>
            <p className="text-sm text-gray-300 mb-4">You won! ♦ {GAME_REWARD} awarded (daily).</p>
            <div className="flex gap-3 justify-center">
              <Button onClick={startGame} className="bg-blue-600">
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

export default ChessGame;
