// src/pages/Rewards.tsx
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { ref, onValue, update, runTransaction } from "firebase/database";
import { db } from "@/integrations/firebase/config";
import { Diamond, Gift, BarChart, Share, Zap, Clock, Star, UserPlus } from "lucide-react";
import Navbar from "@/components/Navbar";

const Rewards = () => {
  const { user } = useAuth();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [referralCopied, setReferralCopied] = useState(false);
  const [exchangeAmount, setExchangeAmount] = useState(10);
  const [exchangeType, setExchangeType] = useState<'credits' | 'usdt'>('credits');
  
  // Create userRef only when user is available
  const userRef = user ? ref(db, `users/${user.uid}`) : null;

  useEffect(() => {
    if (!userRef) return;

    const unsubscribe = onValue(userRef, (snapshot) => {
      const data = snapshot.val();
      setUserData(data);
      setLoading(false);
      
      // Check daily streak
      if (data) {
        checkDailyStreak(data);
      }
    });

    return () => unsubscribe();
  }, [userRef]);

  const checkDailyStreak = async (data: any) => {
    if (!userRef) return;
    
    const today = new Date().toISOString().split('T')[0];
    const lastLogin = data.lastLogin ? new Date(data.lastLogin).toISOString().split('T')[0] : null;
    
    if (lastLogin !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      const isConsecutive = lastLogin === yesterdayStr;
      const newStreak = isConsecutive ? (data.streak || 0) + 1 : 1;
      
      // Calculate diamonds earned from streak
      const diamondsEarned = Math.min(5, 0.2 + (newStreak * 0.1));
      
      // Update user data
      await update(userRef, {
        streak: newStreak,
        lastLogin: new Date().toISOString(),
        diamonds: (data.diamonds || 0) + diamondsEarned,
        adCountToday: 0,
        adCountResetDate: new Date().toISOString().split('T')[0]
      });
      
      if (diamondsEarned > 0) {
        toast.success(`Daily login bonus! +${diamondsEarned.toFixed(1)} diamonds`, {
          description: `You're on a ${newStreak}-day streak!`
        });
      }
    }
  };

  const watchAd = async () => {
    if (!userRef || !userData) {
      toast.error("Please sign in to watch ads");
      return;
    }
    
    // Check daily ad limit
    const today = new Date().toISOString().split('T')[0];
    const resetDate = userData.adCountResetDate || today;
    
    if (resetDate !== today) {
      // Reset ad count if it's a new day
      await update(userRef, {
        adCountToday: 0,
        adCountResetDate: today
      });
    }
    
    if (userData.adCountToday >= 20) {
      toast.error("Daily ad limit reached", {
        description: "You can watch up to 20 ads per day. Come back tomorrow!"
      });
      return;
    }
    
    // Calculate diamonds earned
    const diamondsPerAd = 0.5 + (userData.level / 25);
    const diamondsEarned = Math.round(diamondsPerAd * 2) / 2; // Round to nearest 0.5
    
    // Update user data
    await runTransaction(userRef, (current) => {
      const data = current || {};
      return {
        ...data,
        diamonds: (data.diamonds || 0) + diamondsEarned,
        xp: (data.xp || 0) + 1,
        adCountToday: (data.adCountToday || 0) + 1,
        adCountResetDate: today
      };
    });
    
    toast.success(`+${diamondsEarned} diamonds earned!`, {
      description: "Thanks for watching an ad"
    });
    
    // Check level up
    checkLevelUp();
  };

  const checkLevelUp = async () => {
    if (!userRef || !userData) return;
    
    const xpNeeded = 50 * userData.level;
    if (userData.xp >= xpNeeded) {
      await update(userRef, {
        level: (userData.level || 1) + 1,
        xp: 0
      });
      
      toast.success(`Level Up! 🎉`, {
        description: `You've reached level ${userData.level + 1}`
      });
    }
  };

  const handleReferralCopy = () => {
    if (!userData) return;
    
    const referralLink = `${window.location.origin}/auth/register?ref=${userData.referralCode}`;
    navigator.clipboard.writeText(referralLink);
    setReferralCopied(true);
    setTimeout(() => setReferralCopied(false), 3000);
    
    toast.success("Referral link copied!");
  };

  const completeTask = async (taskType: 'daily' | 'weekly', taskKey: string) => {
    if (!userRef || !userData) return;
    
    // Update task progress
    await update(userRef, {
      [`tasks.${taskType}.${taskKey}`]: true
    });
    
    // Calculate diamonds earned
    let diamondsEarned = 0;
    if (taskType === 'daily') {
      diamondsEarned = 5;
    } else {
      diamondsEarned = 50;
    }
    
    // Add diamonds
    await runTransaction(userRef, (current) => {
      const data = current || {};
      return {
        ...data,
        diamonds: (data.diamonds || 0) + diamondsEarned
      };
    });
    
    toast.success(`Task completed! +${diamondsEarned} diamonds`);
  };

  const exchangeDiamonds = async () => {
    if (!userRef || !userData || exchangeAmount <= 0) return;
    
    if (exchangeAmount > userData.diamonds) {
      toast.error("Not enough diamonds");
      return;
    }
    
    if (exchangeType === 'credits') {
      // 10 diamonds = 50 credits
      const creditsEarned = (exchangeAmount / 10) * 50;
      
      await runTransaction(userRef, (current) => {
        const data = current || {};
        return {
          ...data,
          diamonds: (data.diamonds || 0) - exchangeAmount,
          credits: (data.credits || 0) + creditsEarned
        };
      });
      
      toast.success(`Exchanged ${exchangeAmount} diamonds for ${creditsEarned} credits!`);
    } else {
      // USDT exchange (would need backend processing)
      toast.info("USDT exchange requires manual processing. Contact support.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto"></div>
          <p className="mt-4 text-gray-300">Loading rewards...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      {/* Add Navbar */}
      <Navbar onHistoryClick={() => {}} />
      
      {/* Change py-8 to pt-16 pb-8 */}
      <div className="container mx-auto px-4 pt-16 pb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-center mb-2 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            Rewards Center
          </h1>
          <p className="text-gray-400 text-center max-w-2xl mx-auto">
            Earn diamonds by completing tasks, watching ads, and referring friends.
            Exchange diamonds for credits or USDT!
          </p>
        </motion.div>

        {/* User Stats */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
        >
          <Card className="glass-panel border-purple-700/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Diamond className="h-6 w-6 text-blue-400" />
                <span>Diamonds</span>
              </CardTitle>
              <CardDescription>Your premium currency</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{((+(userData?.diamonds)) || 0).toFixed(3)}</p>
              <p className="text-sm text-gray-400 mt-2">
                {userData?.vipExpiry 
                  ? "VIP: +50% earning bonus!" 
                  : "Earn more with VIP subscription"}
              </p>
            </CardContent>
          </Card>

          <Card className="glass-panel border-green-700/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-6 w-6 text-green-400" />
                <span>Credits</span>
              </CardTitle>
              <CardDescription>For predictions</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{userData?.credits || 0}</p>
              <p className="text-sm text-gray-400 mt-2">
                50 credits = 1 prediction
              </p>
            </CardContent>
          </Card>

          <Card className="glass-panel border-yellow-700/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart className="h-6 w-6 text-yellow-400" />
                <span>Level & XP</span>
              </CardTitle>
              <CardDescription>Progress to next level</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">Lvl {userData?.level || 1}</p>
              <div className="mt-2">
                <Progress 
                  value={((userData?.xp || 0) / (50 * (userData?.level || 1)) * 100)} 
                  className="h-2 bg-gray-800"
                />
                <p className="text-xs text-gray-400 mt-1">
                  {userData?.xp || 0} / {50 * (userData?.level || 1)} XP
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel border-pink-700/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-6 w-6 text-pink-400" />
                <span>Daily Streak</span>
              </CardTitle>
              <CardDescription>Login consecutive days</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{userData?.streak || 1} days</p>
              <p className="text-sm text-gray-400 mt-2">
                {userData?.streak 
                  ? `+${Math.min(5, 0.2 + (userData.streak * 0.1)).toFixed(1)} diamonds/day` 
                  : "Login daily for bonuses"}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Ad Watching */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="mb-8"
        >
          <Card className="glass-panel border-blue-700/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-6 w-6 text-blue-400" />
                <span>Watch Ads & Earn</span>
              </CardTitle>
              <CardDescription>
                {userData?.adCountToday || 0}/20 ads watched today
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="mb-4">
                    Watch short ads to earn diamonds. The higher your level, the more diamonds you earn per ad!
                  </p>
                  
                  <div className="flex items-center gap-4">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg font-medium"
                      onClick={watchAd}
                    >
                      Watch Ad Now
                    </motion.button>
                    
                    <div className="bg-gray-800/50 p-3 rounded-lg">
                      <p className="text-sm">
                        <span className="text-blue-400 font-bold">
                          +{(0.5 + ((userData?.level || 1) / 25)).toFixed(1)} 
                        </span> diamonds per ad
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gray-800/30 p-4 rounded-lg">
                  <h3 className="font-medium mb-2">Diamonds per Ad</h3>
                  <ul className="space-y-1 text-sm">
                    <li className="flex justify-between">
                      <span>Level 1</span>
                      <span>0.5 diamonds</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Level 25</span>
                      <span>1.5 diamonds</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Level 50</span>
                      <span>3.0 diamonds</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Level 100</span>
                      <span>5.0 diamonds</span>
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Tasks Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mb-8"
        >
          <Card className="glass-panel border-green-700/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gift className="h-6 w-6 text-green-400" />
                <span>Tasks & Challenges</span>
              </CardTitle>
              <CardDescription>Complete tasks for bonus rewards</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Daily Tasks */}
                <Card className="bg-gray-800/30 border-green-700/30">
                  <CardHeader>
                    <CardTitle className="text-lg">Daily Tasks</CardTitle>
                    <CardDescription>Resets every 24 hours</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">Watch 5 Ads</h4>
                          <p className="text-sm text-gray-400">
                            {userData?.tasks?.daily?.adsWatched || 0}/5 completed
                          </p>
                        </div>
                        <Button 
                          size="sm"
                          disabled={userData?.tasks?.daily?.adsWatched >= 5}
                          onClick={() => completeTask('daily', 'adsWatched')}
                        >
                          {userData?.tasks?.daily?.adsWatched >= 5 ? "Completed" : "+5 diamonds"}
                        </Button>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">Share Referral Link</h4>
                          <p className="text-sm text-gray-400">
                            {userData?.tasks?.daily?.linkShared ? "Completed" : "Not completed"}
                          </p>
                        </div>
                        <Button 
                          size="sm"
                          disabled={userData?.tasks?.daily?.linkShared}
                          onClick={() => completeTask('daily', 'linkShared')}
                        >
                          {userData?.tasks?.daily?.linkShared ? "Completed" : "+5 diamonds"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                {/* Weekly Tasks */}
                <Card className="bg-gray-800/30 border-blue-700/30">
                  <CardHeader>
                    <CardTitle className="text-lg">Weekly Challenges</CardTitle>
                    <CardDescription>Resets every Monday</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">Watch 50 Ads</h4>
                          <p className="text-sm text-gray-400">
                            {userData?.tasks?.weekly?.adsWatched || 0}/50 completed
                          </p>
                        </div>
                        <Button 
                          size="sm"
                          disabled={userData?.tasks?.weekly?.adsWatched >= 50}
                          onClick={() => completeTask('weekly', 'adsWatched')}
                        >
                          {userData?.tasks?.weekly?.adsWatched >= 50 ? "Completed" : "+50 diamonds"}
                        </Button>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">Refer 3 Friends</h4>
                          <p className="text-sm text-gray-400">
                            {userData?.tasks?.weekly?.referrals || 0}/3 completed
                          </p>
                        </div>
                        <Button 
                          size="sm"
                          disabled={userData?.tasks?.weekly?.referrals >= 3}
                          onClick={() => completeTask('weekly', 'referrals')}
                        >
                          {userData?.tasks?.weekly?.referrals >= 3 ? "Completed" : "+50 diamonds"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Referral Program */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="mb-8"
        >
          <Card className="glass-panel border-yellow-700/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-6 w-6 text-yellow-400" />
                <span>Referral Program</span>
              </CardTitle>
              <CardDescription>
                Invite friends and earn diamonds when they sign up
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="mb-4">
                    Share your referral link with friends. When they sign up and become active users,
                    you'll earn diamonds based on your current level!
                  </p>
                  
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 bg-gray-800/50 p-3 rounded-lg flex items-center">
                      <span className="truncate">
                        {window.location.origin}/auth/register?ref={userData?.referralCode || "YOURCODE"}
                      </span>
                    </div>
                    <Button onClick={handleReferralCopy}>
                      {referralCopied ? "Copied!" : "Copy Link"}
                    </Button>
                  </div>
                </div>
                
                <div className="bg-gray-800/30 p-4 rounded-lg">
                  <h3 className="font-medium mb-2">Diamonds per Referral</h3>
                  <ul className="space-y-1 text-sm">
                    <li className="flex justify-between">
                      <span>Level 1</span>
                      <span>3 diamonds</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Level 10</span>
                      <span>4 diamonds</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Level 25</span>
                      <span>5.5 diamonds</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Level 50</span>
                      <span>10 diamonds</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Level 100</span>
                      <span>15 diamonds</span>
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Exchange Center */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          <Card className="glass-panel border-purple-700/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Share className="h-6 w-6 text-purple-400" />
                <span>Exchange Center</span>
              </CardTitle>
              <CardDescription>
                Convert diamonds to credits or USDT
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="mb-4">
                    <Label htmlFor="exchangeAmount">Amount</Label>
                    <Input
                      id="exchangeAmount"
                      type="number"
                      value={exchangeAmount}
                      onChange={(e) => setExchangeAmount(Number(e.target.value))}
                      min="10"
                      step="10"
                      className="mt-1 bg-gray-800 border-gray-700"
                    />
                  </div>
                  
                  <div className="mb-4">
                    <Label>Exchange Type</Label>
                    <div className="flex gap-4 mt-2">
                      <Button
                        variant={exchangeType === 'credits' ? 'default' : 'outline'}
                        onClick={() => setExchangeType('credits')}
                        className="w-full"
                      >
                        Credits
                      </Button>
                      <Button
                        variant={exchangeType === 'usdt' ? 'default' : 'outline'}
                        onClick={() => setExchangeType('usdt')}
                        className="w-full"
                      >
                        USDT
                      </Button>
                    </div>
                  </div>
                  
                  <Button 
                    className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600"
                    onClick={exchangeDiamonds}
                  >
                    Exchange Now
                  </Button>
                </div>
                
                <div className="bg-gray-800/30 p-4 rounded-lg">
                  <h3 className="font-medium mb-2">Exchange Rates</h3>
                  <div className="space-y-3">
                    <div className="p-3 bg-gray-700/50 rounded-lg">
                      <div className="flex justify-between">
                        <span>Diamonds to Credits</span>
                        <span className="font-bold">10:50</span>
                      </div>
                      <p className="text-sm text-gray-400 mt-1">
                        10 diamonds = 50 credits (1 prediction)
                      </p>
                    </div>
                    
                    <div className="p-3 bg-gray-700/50 rounded-lg">
                      <div className="flex justify-between">
                        <span>Diamonds to USDT</span>
                        <span className="font-bold">1000:5</span>
                      </div>
                      <p className="text-sm text-gray-400 mt-1">
                        1000 diamonds = 5 USDT (Binance withdrawal)
                      </p>
                    </div>
                    
                    <div className="p-3 bg-purple-900/30 rounded-lg">
                      <p className="text-sm">
                        VIP members get 5% bonus on all exchanges!
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default Rewards;