import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { db } from "@/integrations/firebase/config";
import { ref, runTransaction } from "firebase/database";
import { Plus } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

interface Offer {
  key: string;
  title: string;
  price: string;
  credits: number;
  description: string[];
  paypalUrl: string;
}

const offers: Offer[] = [
  {
    key: "small",
    title: "Small Pack",
    price: "$25",
    credits: 50,
    paypalUrl: "https://www.paypal.com/ncp/payment/B4CHYA7JUSW6U",
    description: [
      "Perfect for trying the app or making a quick single prediction.",
      "50 credits total",
      "Cost per prediction: 50 credits",
      "Ideal for first-time users",
    ],
  },
  {
    key: "starter",
    title: "Starter Pack",
    price: "$40",
    credits: 100,
    paypalUrl: "https://www.paypal.com/ncp/payment/GKT8V879P8H74",
    description: [
      "Great value for casual traders who want more than one shot.",
      "100 credits total (enough for 2 predictions)",
      "20% cheaper per credit than Small Pack",
      "Recommended for beginners looking to test strategies",
    ],
  },
  {
    key: "value",
    title: "Value Pack",
    price: "$100",
    credits: 350,
    paypalUrl: "https://www.paypal.com/ncp/payment/45JZLPTV7TGDL",
    description: [
      "The sweet spot for regular users, with big savings.",
      "350 credits total (enough for 7 predictions)",
      "40% cheaper per credit than Small Pack",
      "Best for consistent traders",
    ],
  },
  {
    key: "pro",
    title: "Pro Pack",
    price: "$185",
    credits: 750,
    paypalUrl: "https://www.paypal.com/ncp/payment/5VBYMZ6LZND7J",
    description: [
      "Maximum value for serious traders who want the most plays.",
      "750 credits total (enough for 15 predictions)",
      "50% cheaper per credit than Small Pack",
      "Perfect for high-frequency users",
    ],
  },
  {
    key: "master",
    title: "Master Pack",
    price: "$400",
    credits: 2000,
    paypalUrl: "https://www.paypal.com/ncp/payment/3RA5LXHSFDG5L",
    description: [
      "The ultimate bulk deal for professionals.",
      "2000 credits total (enough for 40 predictions)",
      "60% cheaper per credit than Small Pack",
      "Designed for traders who want long-term usage without reloading",
    ],
  },
];

const StarBackground = () => {
  const [stars, setStars] = useState<Array<{id: number, top: string, left: string, size: number}>>([]);
  
  useEffect(() => {
    const generatedStars = [];
    for (let i = 0; i < 150; i++) {
      generatedStars.push({
        id: i,
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        size: Math.random() * 3
      });
    }
    setStars(generatedStars);
  }, []);
  
  return (
    <div className="absolute inset-0 overflow-hidden">
      {stars.map(star => (
        <div 
          key={star.id} 
          className="absolute rounded-full bg-white animate-pulse"
          style={{
            top: star.top,
            left: star.left,
            width: `${star.size}px`,
            height: `${star.size}px`,
            animationDuration: `${1 + Math.random() * 3}s`,
            opacity: 0.1 + Math.random() * 0.9
          }}
        />
      ))}
    </div>
  );
};

const OfferCard = ({ offer }: { offer: Offer }) => {
  const { user } = useAuth();
  const [isHovered, setIsHovered] = useState(false);

  const addCredits = async (amount: number) => {
    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in to add credits.", variant: "destructive" });
      return;
    }
    try {
      await runTransaction(ref(db, `users/${user.uid}/credits`), (current) => {
        const value = typeof current === "number" ? current : 0;
        return value + amount;
      });
      toast({ title: "Credits added", description: `+${amount} credits added to your account (test).` });
    } catch (e) {
      toast({ title: "Update failed", description: "Couldn't add credits. Please try again.", variant: "destructive" });
    }
  };

  return (
    <motion.article 
      className="relative bg-gradient-to-br from-gray-900 to-black p-6 rounded-xl border border-gray-700 flex flex-col justify-between h-full overflow-hidden"
      initial={{ scale: 0.95, opacity: 0.8 }}
      animate={{ 
        scale: isHovered ? 1.03 : 1,
        opacity: 1
      }}
      transition={{ duration: 0.3 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
    >
      {/* Nebula effect */}
      <motion.div 
        className="absolute inset-0 opacity-20 pointer-events-none"
        animate={{
          background: isHovered 
            ? `radial-gradient(circle at ${Math.random() * 100}% ${Math.random() * 100}%, #8b5cf6, #3b82f6, transparent)`
            : "radial-gradient(circle at center, #8b5cf6, #3b82f6, transparent)"
        }}
        transition={{ duration: 2 }}
      />
      
      {/* Glowing border */}
      <motion.div 
        className="absolute inset-0 rounded-xl pointer-events-none"
        animate={{
          boxShadow: isHovered 
            ? "0 0 25px rgba(139, 92, 246, 0.7)" 
            : "0 0 10px rgba(59, 130, 246, 0.3)"
        }}
        transition={{ duration: 0.3 }}
      />
      
      <div className="relative z-10">
        <header className="mb-4">
          <h3 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            {offer.title}
          </h3>
          <div className="flex items-center justify-between mt-1">
            <span className="text-lg font-semibold text-white">{offer.price}</span>
            <span className="px-2 py-1 bg-indigo-900/50 rounded-full text-sm text-indigo-200">
              {offer.credits} credits
            </span>
          </div>
        </header>

        <ul className="text-sm space-y-2 mb-5">
          {offer.description.map((d, i) => (
            <li key={i} className="flex items-start">
              <svg className="w-4 h-4 text-indigo-400 mt-0.5 mr-2 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-gray-200">{d}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-3">
          <form action={offer.paypalUrl} method="post" target="_blank">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-full py-2 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg text-white font-medium hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg shadow-purple-500/20"
              type="submit"
              aria-label={`Buy ${offer.title} with PayPal`}
            >
              Buy with PayPal
            </motion.button>
          </form>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-full py-2 px-4 bg-gray-800 hover:bg-gray-700 rounded-lg text-white font-medium transition-all"
            onClick={() => addCredits(offer.credits)}
            aria-label={`Mark ${offer.title} as paid (test)`}
          >
            Mark as paid (test)
          </motion.button>
        </div>
      </div>
    </motion.article>
  );
};

export const CreditsDialogTrigger = () => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full p-2 shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 transition-all"
          aria-label="Add credits"
        >
          <Plus className="h-5 w-5" />
        </motion.button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-gray-900 to-black opacity-90" />
        <StarBackground />
        
        <DialogHeader className="relative z-10">
          <DialogTitle className="text-2xl font-bold text-white">
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              Upgrade Your Trading Power
            </span>
          </DialogTitle>
          <DialogDescription className="text-gray-300">
            Test-only PayPal buttons. Complete payment in the new tab, then click "Mark as paid (test)" to add credits.
          </DialogDescription>
        </DialogHeader>
        
        <div className="relative z-10 overflow-y-auto pr-2 -mr-2 max-h-[60vh]">
          <motion.section 
            className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {offers.map((o, index) => (
              <motion.div
                key={o.key}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
              >
                <OfferCard offer={o} />
              </motion.div>
            ))}
          </motion.section>
        </div>
        
        <p className="relative z-10 text-xs text-gray-400 mt-3 pt-3 border-t border-gray-800">
          Note: This flow is for testing only and does not verify payments automatically. 
          <span className="block mt-1 text-indigo-300">✨ Galaxy Credits - Trade Among The Stars ✨</span>
        </p>
      </DialogContent>
    </Dialog>
  );
};
