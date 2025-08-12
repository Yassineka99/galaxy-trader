// src/components/Navbar.tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ref, onValue } from "firebase/database";
import { db } from "@/integrations/firebase/config";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Coins } from "lucide-react";
import { CreditsDialogTrigger } from "@/components/CreditsDialog";
import { motion } from "framer-motion";

interface NavbarProps {
  onHistoryClick: () => void;
}

const initials = (name?: string | null) => {
  if (!name) return "U";
  const parts = name.split(" ");
  return parts.length > 1 
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : parts[0][0];
};

const Navbar = ({ onHistoryClick }: NavbarProps) => {
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

  return (
    <nav className="sticky top-0 z-30 w-full">
      <div className="glass-panel mx-4 mt-4 flex items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-accent animate-pulse" />
          <span className="font-semibold">Galaxy Trader</span>
        </Link>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
            <Coins className="h-4 w-4" />
            <span>Credits: {credits}</span>
            <CreditsDialogTrigger />
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="text-sm bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded-md transition-colors"
            onClick={onHistoryClick}
          >
            Prediction History
          </motion.button>
          <div className="flex items-center gap-3">
            <Link to="/profile">
              <Avatar>
                <AvatarImage 
                  src={user?.photoURL ?? undefined} 
                  alt={user?.displayName ?? "User"} 
                />
                <AvatarFallback>{initials(user?.displayName)}</AvatarFallback>
              </Avatar>
            </Link>
            <Button variant="ghost" onClick={() => signOut()}>Sign out</Button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;