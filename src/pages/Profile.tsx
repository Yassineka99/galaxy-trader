import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Coins } from "lucide-react";
import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { db } from "@/integrations/firebase/config";
import { Link } from "react-router-dom";

const Profile = () => {
  const { user, signOut } = useAuth();
  const [credits, setCredits] = useState<number>(0);
  
  useEffect(() => {
    if (!user) return;
    const creditsRef = ref(db, `users/${user.uid}/credits`);
    const unsubscribe = onValue(creditsRef, (snap) => {
      const v = snap.val();
      setCredits(typeof v === "number" ? v : 0);
    });
    return () => unsubscribe();
  }, [user]);

  const initials = (name?: string | null) => {
    if (!name) return "U";
    const parts = name.split(" ");
    return parts.length > 1 
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`
      : parts[0][0];
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      <div className="container mx-auto px-4 py-12">
        <motion.div 
          className="glass-panel max-w-2xl mx-auto p-8 rounded-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex flex-col items-center gap-6">
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Avatar className="w-24 h-24 border-4 border-purple-500/50">
                <AvatarImage src={user?.photoURL ?? undefined} alt={user?.displayName ?? "User"} />
                <AvatarFallback className="text-2xl">
                  {user?.displayName ? user.displayName[0] : "U"}
                </AvatarFallback>
              </Avatar>
            </motion.div>
            
            <div className="text-center">
              <h1 className="text-3xl font-bold">{user?.displayName || "Galaxy Trader"}</h1>
              <p className="text-gray-400">{user?.email}</p>
            </div>
            
            <div className="flex items-center gap-2 text-lg mt-4">
              <Coins className="h-6 w-6 text-yellow-400" />
              <span className="font-mono">Credits: {credits}</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mt-6">
              <Link to="/dashboard" className="w-full">
                <Button className="w-full" variant="outline">Back to Trading</Button>
              </Link>
              <Button 
                onClick={signOut}
                className="w-full bg-red-600 hover:bg-red-700"
              >
                Sign Out
              </Button>
            </div>
            
            <div className="w-full mt-8 pt-6 border-t border-gray-700">
              <h2 className="text-xl font-bold mb-4 text-center bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                Account Settings
              </h2>
              <div className="space-y-4">
                <div className="p-4 bg-gray-800/50 rounded-lg">
                  <h3 className="font-medium mb-2">Email Verification</h3>
                  <p className="text-sm text-gray-400">
                    {user?.emailVerified 
                      ? "✅ Your email has been verified" 
                      : "⚠️ Please verify your email address"}
                  </p>
                </div>
                <div className="p-4 bg-gray-800/50 rounded-lg">
                  <h3 className="font-medium mb-2">Account Created</h3>
                  <p className="text-sm text-gray-400">
                    {user?.metadata.creationTime 
                      ? new Date(user.metadata.creationTime).toLocaleDateString() 
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