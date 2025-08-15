// src/pages/Profile.tsx
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Coins, Diamond, BarChart2, Star, Zap, Gift, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { ref, onValue, runTransaction } from "firebase/database";
import { db } from "@/integrations/firebase/config";
import { useNavigate } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { toast } from "sonner";

const Profile = () => {
  const { user, signOut } = useAuth();
  const [userData, setUserData] = useState<any>(null);
  const [view, setView] = useState<'overview' | 'minigames'>('overview');
  const navigate = useNavigate();

  const userRef = user ? ref(db, `users/${user.uid}`) : null;

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onValue(userRef as any, (snapshot) => {
      const data = snapshot.val();
      setUserData(data);
    });
    return () => unsubscribe();
  }, [user]);

  const isVIP = () => {
    if (!userData?.vipExpiry) return false;
    return new Date(userData.vipExpiry) > new Date();
  };

  const vipDaysRemaining = () => {
    if (!isVIP()) return 0;
    const diff = new Date(userData.vipExpiry).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const initials = (name?: string | null) => {
    if (!name) return "U";
    const parts = name.split(" ");
    return parts.length > 1 
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`
      : parts[0][0];
  };

  const handleCopyReferral = () => {
    if (!userData) return;
    const referralLink = `${window.location.origin}/auth/register?ref=${userData.referralCode}`;
    navigator.clipboard.writeText(referralLink);
    toast.success("Referral link copied to clipboard!");
  };

  // ---------- Mini Games logic ----------
  // We'll store per-user minigame state in the database under `minigames.{gameId} = { lastPlayed: 'YYYY-MM-DD', reward: number }`.
  // The Run game awards a fixed 0.2 diamonds (recorded by the game). Profile will show available games and whether the user already played today.

  const todayStr = () => new Date().toISOString().split('T')[0];

  const roundToHalf = (n: number) => Math.round(n * 2) / 2;

  const computeReward = (base: number) => {
    const vipMultiplier = isVIP() ? 1.5 : 1;
    const levelBonus = (userData?.level || 1) / 500;
    const raw = base * vipMultiplier + levelBonus;
    return roundToHalf(raw);
  };

  // Mini-games catalog — Play button will navigate to the actual game route.
  const MINI_GAMES = [
   
    { id: 'memory', title: 'Memory Flip', desc: 'Match pairs from memory', difficulty: 'medium', base: 1.0 },
    
    { id: "catch", title: "Comet Catch", desc: "Catch falling comets & gems — avoid bombs!", difficulty: "easy", base: 0.5 },
    {
      id: "orbit",
      title: "Flow — Connect Colors",
      desc: "Connect each pair of same-colored dots on a grid before time runs out. Paths cannot cross — complete all pairs to earn diamonds.",
      difficulty: "medium",
      base: 0.2
    },
    { 
      id: "match3",
      title: "Match 3 — Sweet Burst",
      desc: "Swap adjacent candies to match 3 or more of the same color. Create cascades to score points — fast, tactile, mobile-first match-3 gameplay.",
      difficulty: "hard",
      base: 0.2
    },
    
    {
      id: "galaxy-slice",
      title: "Galaxy Slice",
      desc: "Swipe to slice glowing cosmic fruits while avoiding bombs. Fast-paced, galaxy-themed Fruit-Ninja style action with starfield visuals.",
      difficulty: "hard",
      base: 0.2
    }
    
  ];

  const hasPlayedToday = (gameId: string) => {
    if (!userData?.minigames || !userData?.minigames[gameId]) return false;
    return userData.minigames[gameId].lastPlayed === todayStr();
  };

  const lastRewardFor = (gameId: string) => {
    if (!userData?.minigames || !userData?.minigames[gameId]) return null;
    return userData.minigames[gameId].reward;
  };

  // Helper to navigate to a minigame route. Games themselves will write the reward to DB when finished.
  const goToGame = (gameId: string) => {
    navigate(`/minigames/${gameId}`);
  };

  // --------------------------------------

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      <div className="container mx-auto px-4 py-12">
        <motion.div 
          className="glass-panel max-w-3xl mx-auto p-6 rounded-xl border border-purple-700/50"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          {/* Top: Avatar + Name + segmented control */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <Avatar className="w-20 h-20 border-4 border-purple-500/50">
                <AvatarImage src={user?.photoURL ?? undefined} alt={user?.displayName ?? "User"} />
                <AvatarFallback className="text-2xl">
                  {user?.displayName ? initials(user.displayName) : "U"}
                </AvatarFallback>
              </Avatar>

              <div>
                <h1 className="text-2xl font-bold">{user?.displayName || "Galaxy Trader"}</h1>
                <p className="text-sm text-gray-400">{user?.email}</p>
                {isVIP() && (
                  <Badge className="mt-2 bg-gradient-to-r from-yellow-600 to-amber-600 px-2 py-0.5 rounded-full">
                    <Star className="h-3 w-3 mr-1 inline" /> VIP Member — {vipDaysRemaining()}d
                  </Badge>
                )}
              </div>
            </div>

            {/* Segmented control: Overview / VIP / Rewards / Mini Games */}
            <div className="flex w-full md:w-auto overflow-auto md:overflow-visible gap-2">
              <button
                onClick={() => setView('overview')}
                className={`flex-1 md:flex-none px-3 py-2 rounded-lg text-sm font-medium transition ${view === 'overview' ? 'bg-gradient-to-r from-purple-700 to-indigo-700 text-white' : 'bg-transparent border border-gray-800 text-gray-300 hover:bg-gray-800/30'}`}
              >
                Overview
              </button>

              <button
                onClick={() => navigate('/vip')}
                className={`flex-1 md:flex-none px-3 py-2 rounded-lg text-sm font-medium transition bg-transparent border border-gray-800 text-gray-300 hover:bg-gray-800/30`}
              >
                VIP
              </button>

              <button
                onClick={() => navigate('/rewards')}
                className={`flex-1 md:flex-none px-3 py-2 rounded-lg text-sm font-medium transition bg-transparent border border-gray-800 text-gray-300 hover:bg-gray-800/30`}
              >
                Rewards
              </button>

              <button
                onClick={() => setView('minigames')}
                className={`flex-1 md:flex-none px-3 py-2 rounded-lg text-sm font-medium transition ${view === 'minigames' ? 'bg-gradient-to-r from-green-600 to-emerald-500 text-white' : 'bg-transparent border border-gray-800 text-gray-300 hover:bg-gray-800/30'}`}
              >
                Mini Games
              </button>
            </div>
          </div>

          {/* Content area */}
          <div>
            {view === 'overview' && (
              <div className="space-y-6">
                {/* User Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full mt-2">
                  <div className="glass-panel p-4 rounded-lg flex flex-col items-center">
                    <div className="flex items-center gap-1 mb-1">
                      <Coins className="h-5 w-5 text-yellow-400" />
                      <span className="font-bold">Credits</span>
                    </div>
                    <p className="text-xl">{userData?.credits || 0}</p>
                  </div>

                  <div className="glass-panel p-4 rounded-lg flex flex-col items-center">
                    <div className="flex items-center gap-1 mb-1">
                      <Diamond className="h-5 w-5 text-blue-400" />
                      <span className="font-bold">Diamonds</span>
                    </div>
                    <p className="text-xl">{((+(userData?.diamonds)) || 0).toFixed(3)}</p>
                  </div>

                  <div className="glass-panel p-4 rounded-lg flex flex-col items-center">
                    <div className="flex items-center gap-1 mb-1">
                      <BarChart2 className="h-5 w-5 text-yellow-400" />
                      <span className="font-bold">Level</span>
                    </div>
                    <p className="text-xl">Lvl {userData?.level || 1}</p>
                  </div>

                  <div className="glass-panel p-4 rounded-lg flex flex-col items-center">
                    <div className="flex items-center gap-1 mb-1">
                      <Zap className="h-5 w-5 text-purple-400" />
                      <span className="font-bold">Streak</span>
                    </div>
                    <p className="text-xl">{userData?.streak || 0} days</p>
                  </div>
                </div>

                {/* Progress Bars */}
                <div className="w-full space-y-4 mt-2">
                  {userData?.level && (
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>XP Progress</span>
                        <span>
                          {userData?.xp || 0} / {50 * userData?.level} XP
                        </span>
                      </div>
                      <Progress 
                        value={((userData?.xp || 0) / (50 * userData?.level)) * 100} 
                        className="h-2 bg-gray-800"
                      />
                    </div>
                  )}

                  {isVIP() && (
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>VIP Status</span>
                        <span>{vipDaysRemaining()} days remaining</span>
                      </div>
                      <Progress 
                        value={(vipDaysRemaining() / 30) * 100} 
                        className="h-2 bg-gradient-to-r from-yellow-600 to-amber-600"
                      />
                    </div>
                  )}
                </div>

                {/* Referral Program */}
                <div className="w-full glass-panel border-blue-700/50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <UserPlus className="h-5 w-5 text-blue-400" />
                    <h3 className="font-bold">Referral Program</h3>
                  </div>

                  <p className="text-sm mb-3">
                    Invite friends and earn diamonds when they sign up and become active users!
                  </p>

                  {userData?.referralCode && (
                    <div className="space-y-3">
                      <div className="flex flex-col">
                        <label className="text-xs text-gray-400 mb-1">Your Referral Code</label>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-800/50 p-2 px-4 rounded-lg font-mono">
                            {userData.referralCode}
                          </div>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={handleCopyReferral}
                          >
                            Copy
                          </Button>
                        </div>
                      </div>

                      <div className="bg-gray-800/30 p-3 rounded-lg">
                        <p className="text-xs text-center">
                          Share your link: {window.location.origin}/auth/register?ref={userData.referralCode}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mt-6">
                  <a href="/dashboard" className="w-full">
                    <Button className="w-full" variant="outline">
                      Back to Trading
                    </Button>
                  </a>
                  <Button 
                    onClick={signOut}
                    className="w-full bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800"
                  >
                    Sign Out
                  </Button>
                </div>

                {/* Account Info */}
                <div className="w-full mt-8 pt-6 border-t border-gray-700">
                  <h2 className="text-xl font-bold mb-4 text-center bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                    Account Information
                  </h2>
                  <div className="space-y-4">
                    <div className="glass-panel p-4 rounded-lg">
                      <h3 className="font-medium mb-2">Email Verification</h3>
                      <p className="text-sm">
                        {user?.emailVerified 
                          ? "✅ Your email has been verified" 
                          : "⚠️ Please verify your email address"}
                      </p>
                    </div>
                    <div className="glass-panel p-4 rounded-lg">
                      <h3 className="font-medium mb-2">Account Created</h3>
                      <p className="text-sm">
                        {user?.metadata.creationTime 
                          ? format(new Date(user.metadata.creationTime), "MMM d, yyyy h:mm a") 
                          : "Unknown"}
                      </p>
                    </div>
                    <div className="glass-panel p-4 rounded-lg">
                      <h3 className="font-medium mb-2">Last Login</h3>
                      <p className="text-sm">
                        {user?.metadata.lastSignInTime 
                          ? format(new Date(user.metadata.lastSignInTime), "MMM d, yyyy h:mm a") 
                          : "Unknown"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Mini Games view */}
            {view === 'minigames' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold">Mini Games</h3>
                    <p className="text-sm text-gray-400">Play quick games and earn small diamond rewards. Rewards are conservative to match the existing economy.</p>
                  </div>
                  <Button variant="ghost" onClick={() => setView('overview')}>Back to Overview</Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {MINI_GAMES.map((g) => {
                    const playedToday = hasPlayedToday(g.id);
                    const lastReward = lastRewardFor(g.id);

                    return (
                      <div key={g.id} className="glass-panel p-4 rounded-lg flex flex-col gap-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-bold">{g.title}</h4>
                            <p className="text-sm text-gray-400">{g.desc}</p>
                          </div>

                          <div className="text-right">
                            <p className="text-sm">Difficulty: <span className="font-medium">{g.difficulty}</span></p>
                            <p className="text-sm text-gray-400">Reward: <span className="font-bold">{computeReward(g.base)} ♦</span></p>
                          </div>
                        </div>

                        <div className="flex gap-2 items-center">
                          {/* Play button only if the user hasn't played this game today */}
                          {!playedToday ? (
                            <Button onClick={() => goToGame(g.id)} className="flex-1">Play</Button>
                          ) : (
                            <div className="flex-1 flex items-center gap-2 justify-end">
                              <Badge className="px-2 py-1">Played today</Badge>
                              <div className="text-sm text-gray-300">+{lastReward ?? computeReward(g.base)} ♦</div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="text-xs text-gray-400 mt-2">Note: Games award rewards automatically when finished and record them in your account. Play buttons open the mobile games — desktop users will be prompted to download the app.</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Profile;
