import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Coins, Diamond, BarChart2, Star, Zap, Gift, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { db } from "@/integrations/firebase/config";
import { Link } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

const Profile = () => {
  const { user, signOut } = useAuth();
  const [userData, setUserData] = useState<any>(null);
  
  useEffect(() => {
    if (!user) return;
    const userRef = ref(db, `users/${user.uid}`);
    const unsubscribe = onValue(userRef, (snapshot) => {
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
    alert("Referral link copied to clipboard!");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      <div className="container mx-auto px-4 py-12">
        <motion.div 
          className="glass-panel max-w-2xl mx-auto p-8 rounded-xl border border-purple-700/50"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex flex-col items-center gap-6">
            <div className="flex flex-col items-center relative">
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Avatar className="w-24 h-24 border-4 border-purple-500/50">
                  <AvatarImage src={user?.photoURL ?? undefined} alt={user?.displayName ?? "User"} />
                  <AvatarFallback className="text-2xl">
                    {user?.displayName ? initials(user.displayName) : "U"}
                  </AvatarFallback>
                </Avatar>
              </motion.div>
              
              {isVIP() && (
                <Badge className="absolute -bottom-2 bg-gradient-to-r from-yellow-600 to-amber-600 px-3 py-1 rounded-full">
                  <Star className="h-4 w-4 mr-1" />
                  VIP Member
                </Badge>
              )}
            </div>
            
            <div className="text-center">
              <h1 className="text-3xl font-bold">{user?.displayName || "Galaxy Trader"}</h1>
              <p className="text-gray-400">{user?.email}</p>
            </div>
            
            {/* User Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full mt-4">
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
            <div className="w-full space-y-4 mt-4">
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
            
            {/* VIP Status */}
            {isVIP() ? (
              <div className="w-full glass-panel border-yellow-600/50 bg-gradient-to-br from-amber-900/20 to-yellow-900/10 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Star className="h-5 w-5 text-yellow-400" />
                  <h3 className="font-bold">VIP Benefits Active</h3>
                </div>
                <p className="text-sm mb-2">
                  Your VIP membership is active until{" "}
                  <span className="font-bold text-yellow-400">
                    {format(new Date(userData.vipExpiry), "MMM d, yyyy")}
                  </span>
                </p>
                <ul className="text-sm space-y-1">
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-400"></div>
                    <span>+50% Diamond Bonus</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-400"></div>
                    <span>Priority Prediction Processing</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-400"></div>
                    <span>Exclusive Trading Signals</span>
                  </li>
                </ul>
              </div>
            ) : (
              <div className="w-full glass-panel border-purple-700/50 bg-gradient-to-r from-purple-900/30 to-blue-900/30 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Gift className="h-5 w-5 text-purple-400" />
                  <h3 className="font-bold">Upgrade to VIP</h3>
                </div>
                <p className="text-sm mb-2">
                  Unlock premium features and earn more diamonds!
                </p>
                <Link to="/vip">
                  <Button 
                    variant="outline" 
                    className="w-full mt-2 bg-gradient-to-r from-purple-700 to-indigo-700"
                  >
                    View VIP Plans
                  </Button>
                </Link>
              </div>
            )}
            
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
              <Link to="/dashboard" className="w-full">
                <Button className="w-full" variant="outline">
                  Back to Trading
                </Button>
              </Link>
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
        </motion.div>
      </div>
    </div>
  );
};

export default Profile;