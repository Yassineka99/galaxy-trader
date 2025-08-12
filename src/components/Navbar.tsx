import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ref, onValue } from "firebase/database";
import { db } from "@/integrations/firebase/config";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Coins, Menu, X } from "lucide-react";
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
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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
        
        {/* Mobile menu button */}
        <div className="flex items-center gap-4 sm:hidden">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Coins className="h-4 w-4" />
            <span>{credits}</span>
            <CreditsDialogTrigger />
          </div>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
        
        {/* Desktop menu */}
        <div className="hidden sm:flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
      
      {/* Mobile menu dropdown */}
      {isMenuOpen && (
        <motion.div 
          className="absolute top-full left-0 right-0 bg-gray-900 border-t border-gray-800 z-40"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="p-4 space-y-4">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full text-left py-2 px-4 bg-gray-800 hover:bg-gray-700 rounded-md transition-colors"
              onClick={() => {
                onHistoryClick();
                setIsMenuOpen(false);
              }}
            >
              Prediction History
            </motion.button>
            
            <Link 
              to="/profile" 
              className="flex items-center gap-3 py-2 px-4 rounded-md hover:bg-gray-800 transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              <Avatar className="w-8 h-8">
                <AvatarImage 
                  src={user?.photoURL ?? undefined} 
                  alt={user?.displayName ?? "User"} 
                />
                <AvatarFallback>{initials(user?.displayName)}</AvatarFallback>
              </Avatar>
              <span>Profile</span>
            </Link>
            
            <Button 
              variant="destructive"
              className="w-full"
              onClick={() => {
                signOut();
                setIsMenuOpen(false);
              }}
            >
              Sign out
            </Button>
          </div>
        </motion.div>
      )}
    </nav>
  );
};

export default Navbar;