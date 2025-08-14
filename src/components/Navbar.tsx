// src/components/Navbar.tsx
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { motion } from "framer-motion";
import { Coins, Diamond, BarChart2, Star, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { CreditsDialogTrigger } from "@/components/CreditsDialog";
import { cn } from "@/lib/utils";

const Navbar = ({ onHistoryClick }: { onHistoryClick: () => void }) => {
  const { user, userData, signOut } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Close mobile menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  // Navbar scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const isVIP = userData?.vipExpiry && new Date(userData.vipExpiry) > new Date();

  // Helper function for user initials
  const getInitials = (name?: string | null) => {
    if (!name) return "U";
    const parts = name.split(" ");
    return parts.length > 1
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`
      : parts[0][0];
  };

  return (
    <header 
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        isScrolled 
          ? "bg-gradient-to-b from-gray-900 to-black backdrop-blur-md border-b border-gray-800" 
          : "bg-transparent"
      )}
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-1.5 rounded-lg">
              <BarChart2 className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              Galaxy Trader
            </span>
          </Link>

          {/* Desktop Navigation (History only) */}
          <div className="hidden md:flex items-center">
            <Button 
              variant="outline" 
              onClick={onHistoryClick}
              className="ml-4"
            >
              Prediction History
            </Button>
          </div>

          {/* User Stats */}
          <div className="hidden md:flex items-center gap-4">
            {/* VIP Badge */}
            {isVIP && (
              <motion.div
                whileHover={{ scale: 1.05 }}
                className="px-3 py-1 rounded-full bg-gradient-to-r from-yellow-700 to-amber-700 text-xs font-medium flex items-center gap-1"
              >
                <Star className="h-3 w-3" />
                <span>VIP</span>
              </motion.div>
            )}

            {/* Diamonds */}
            <div className="flex items-center gap-1.5 bg-gray-800/50 px-3 py-1 rounded-full">
              <Diamond className="h-4 w-4 text-blue-400" />
              <span className="font-medium text-sm">{((+(userData?.diamonds)) || 0).toFixed(3)}</span>
            </div>

            {/* Level */}
            <div className="flex items-center gap-1.5 bg-gray-800/50 px-3 py-1 rounded-full">
              <BarChart2 className="h-4 w-4 text-yellow-400" />
              <span className="font-medium text-sm">Lvl {userData?.level || 1}</span>
            </div>

            {/* Credits */}
            <div className="flex items-center gap-1.5 bg-gray-800/50 px-3 py-1 rounded-full">
              <Coins className="h-4 w-4 text-yellow-400" />
              <span className="font-medium text-sm">{userData?.credits || 0}</span>
            </div>

            {/* Add Credits Button */}
            <CreditsDialogTrigger />

            {/* Profile Dropdown */}
            <ProfileDropdown user={user} signOut={signOut} />
          </div>

          {/* Mobile Menu Button */}
          <Button 
            variant="ghost" 
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="md:hidden bg-gradient-to-b from-gray-900 to-black border-t border-gray-800"
        >
          <div className="container mx-auto px-4 py-4">
            {/* Profile Section Added Here */}
            <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-gray-800/50">
              <Avatar className="w-10 h-10">
                <AvatarImage src={user?.photoURL ?? undefined} alt={user?.displayName ?? "User"} />
                <AvatarFallback className="text-sm">
                  {getInitials(user?.displayName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm truncate">
                    {user?.displayName || "Galaxy Trader"}
                  </p>
                  {isVIP && (
                    <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-yellow-700 to-amber-700 text-xs font-medium flex items-center gap-1">
                      <Star className="h-3 w-3" />
                      <span>VIP</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 truncate">
                  {user?.email}
                </p>
              </div>
            </div>

            <nav className="flex flex-col gap-2 mb-6">
              <Link 
                to="/profile" 
                className={cn(
                  "px-4 py-3 rounded-lg text-base font-medium transition-colors",
                  location.pathname === "/profile"
                    ? "bg-gradient-to-r from-purple-900/50 to-blue-900/50 text-white"
                    : "text-gray-300 hover:bg-gray-800/50"
                )}
              >
                Profile Settings
              </Link>

              <Button 
                variant="outline" 
                onClick={() => {
                  onHistoryClick();
                  setMobileMenuOpen(false);
                }}
                className="w-full justify-start mt-2"
              >
                Prediction History
              </Button>
            </nav>

            <div className="grid grid-cols-3 gap-3 mb-6">
              {/* Diamonds */}
              <div className="flex flex-col items-center bg-gray-800/50 p-2 rounded-lg">
                <Diamond className="h-5 w-5 text-blue-400 mb-1" />
                <span className="text-sm font-medium">{((+(userData?.diamonds)) || 0).toFixed(3)}</span>
                <span className="text-xs text-gray-400">Diamonds</span>
              </div>

              {/* Level */}
              <div className="flex flex-col items-center bg-gray-800/50 p-2 rounded-lg">
                <BarChart2 className="h-5 w-5 text-yellow-400 mb-1" />
                <span className="text-sm font-medium">Lvl {userData?.level || 1}</span>
                <span className="text-xs text-gray-400">Level</span>
              </div>

              {/* Credits */}
              <div className="flex flex-col items-center bg-gray-800/50 p-2 rounded-lg">
                <Coins className="h-5 w-5 text-yellow-400 mb-1" />
                <span className="text-sm font-medium">{userData?.credits || 0}</span>
                <span className="text-xs text-gray-400">Credits</span>
              </div>
            </div>

            <div className="flex gap-3">
              <CreditsDialogTrigger />
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => {
                  signOut();
                  setMobileMenuOpen(false);
                }}
              >
                Sign Out
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </header>
  );
};

// Profile Dropdown Component
const ProfileDropdown = ({ user, signOut }: { user: any, signOut: () => void }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  
  const getInitials = (name?: string | null) => {
    if (!name) return "U";
    const parts = name.split(" ");
    return parts.length > 1 
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`
      : parts[0][0];
  };

  return (
    <div className="relative">
      <button 
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex items-center gap-2 focus:outline-none"
      >
        <Avatar className="w-8 h-8">
          <AvatarImage src={user?.photoURL ?? undefined} alt={user?.displayName ?? "User"} />
          <AvatarFallback className="text-xs">
            {user?.displayName ? getInitials(user.displayName) : "U"}
          </AvatarFallback>
        </Avatar>
      </button>

      {dropdownOpen && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute right-0 mt-2 w-56 bg-gradient-to-br from-gray-900 to-black border border-gray-700 rounded-lg shadow-lg z-50 overflow-hidden"
        >
          <div className="p-4 border-b border-gray-700">
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10">
                <AvatarImage src={user?.photoURL ?? undefined} alt={user?.displayName ?? "User"} />
                <AvatarFallback className="text-sm">
                  {user?.displayName ? getInitials(user.displayName) : "U"}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-sm truncate max-w-[140px]">
                  {user?.displayName || "Galaxy Trader"}
                </p>
                <p className="text-xs text-gray-400 truncate max-w-[140px]">
                  {user?.email}
                </p>
              </div>
            </div>
          </div>
          
          <div className="p-2">
            <Link 
              to="/profile" 
              className="block px-3 py-2 text-sm rounded-lg hover:bg-gray-800/50 transition-colors"
            >
              Profile Settings
            </Link>
            <button
              onClick={signOut}
              className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-red-900/50 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default Navbar;
