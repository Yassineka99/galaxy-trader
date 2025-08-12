import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Coins, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const initials = (name?: string | null) => {
  if (!name) return "U";
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
};

const Navbar = () => {
  const { user, signOut } = useAuth();

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
            <span>Credits: 0</span>
            <Button variant="secondary" size="sm" aria-label="Add credits">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarImage src={user?.photoURL ?? undefined} alt={user?.displayName ?? "User"} />
              <AvatarFallback>{initials(user?.displayName)}</AvatarFallback>
            </Avatar>
            <Button variant="ghost" onClick={() => signOut()}>Sign out</Button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
