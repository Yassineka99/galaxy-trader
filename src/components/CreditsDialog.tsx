import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { db } from "@/integrations/firebase/config";
import { ref, runTransaction, set } from "firebase/database";
import { Plus } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Offer {
  key: string;
  title: string;
  price: string;
  credits: number;
  description: string[];
  image: string;
  savings?: string;
}

const offers: Offer[] = [
  {
    key: "starter",
    title: "Starter Spark",
    price: "$5",
    credits: 50,
    image: "5.jpeg",
    description: [
      "Perfect for trying the app or making a quick single prediction.",
      "50 credits total",
      "Cost per prediction: 50 credits",
      "Ideal for first-time users",
    ],
  },
  {
    key: "value",
    title: "Value Boost",
    price: "$15",
    credits: 170,
    image: "15.jpeg",
    savings: "Saving 11.8% off",
    description: [
      "Great value for casual traders who want more than one shot.",
      "170 credits total (enough for 3 predictions)",
      "11.8% cheaper per credit than Starter Spark",
      "Recommended for beginners looking to test strategies",
    ],
  },
  {
    key: "pro",
    title: "Pro Edge",
    price: "$30",
    credits: 360,
    image: "30.jpeg",
    savings: "Saving 16.7% off",
    description: [
      "The sweet spot for regular users, with big savings.",
      "360 credits total (enough for 7 predictions)",
      "16.7% cheaper per credit than Starter Spark",
      "Best for consistent traders",
    ],
  },
  {
    key: "elite",
    title: "Elite Wave",
    price: "$60",
    credits: 780,
    image: "60.jpeg",
    savings: "Saving 23.1% off",
    description: [
      "Maximum value for serious traders who want the most plays.",
      "780 credits total (enough for 15 predictions)",
      "23.1% cheaper per credit than Starter Spark",
      "Perfect for high-frequency users",
    ],
  },
  {
    key: "master",
    title: "Master Flow",
    price: "$100",
    credits: 1400,
    image: "100.jpeg",
    savings: "Saving 28.6% off",
    description: [
      "The ultimate bulk deal for professionals.",
      "1400 credits total (enough for 28 predictions)",
      "28.6% cheaper per credit than Starter Spark",
      "Designed for traders who want long-term usage without reloading",
    ],
  },
  {
    key: "titan",
    title: "Titan Max",
    price: "$150",
    credits: 2250,
    image: "150.jpeg",
    savings: "Saving 33.3% off",
    description: [
      "The ultimate professional package for unlimited trading.",
      "2250 credits total (enough for 45 predictions)",
      "33.3% cheaper per credit than Starter Spark",
      "For traders who want maximum value and power",
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

const ConfirmationDialog = ({ 
  offer, 
  onConfirm 
}: { 
  offer: Offer; 
  onConfirm: (orderId: string) => void 
}) => {
  const [orderId, setOrderId] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async () => {
    if (!orderId.trim()) {
      toast({ title: "Order ID required", description: "Please enter your Binance Order ID", variant: "destructive" });
      return;
    }
    
    setIsProcessing(true);
    try {
      await onConfirm(orderId);
      setIsOpen(false);
      setOrderId("");
    } catch (error) {
      console.error("Error confirming order:", error);
      toast({ title: "Confirmation failed", description: "Couldn't confirm your order. Please try again.", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="w-full py-2 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg text-white font-medium hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg shadow-purple-500/20"
          aria-label={`Confirm ${offer.title} purchase`}
        >
          Confirm Purchase
        </motion.button>
      </DialogTrigger>
      <DialogContent className="bg-gradient-to-br from-gray-900 to-black border border-purple-700 rounded-xl max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-center">
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              Confirm Your Order
            </span>
          </DialogTitle>
          <DialogDescription className="text-center text-gray-300">
            Please enter your Binance Order ID
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="flex justify-center">
            <div className="relative">
              <div className="bg-gray-800 rounded-xl p-2 border border-purple-500">
                <img 
                  src={new URL(`../assets/qr-codes/${offer.image}`, import.meta.url).href} 
                  alt={`Binance QR Code for ${offer.title}`}
                  className="w-64 h-64 object-contain"
                />
              </div>
              <div className="absolute top-2 right-2 bg-purple-600 text-white px-2 py-1 rounded-lg text-xs">
                {offer.price}
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            <div>
              <Label htmlFor="orderId" className="text-gray-300 mb-2 block">
                Binance Order ID
              </Label>
              <Input
                id="orderId"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                placeholder="Enter your order ID"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            
            <div className="text-xs text-gray-400">
              <p>After completing payment on Binance, you'll receive an Order ID.</p>
              <p className="mt-1">Enter it here to verify your purchase and add credits to your account.</p>
            </div>
          </div>
          
          <Button 
            onClick={handleSubmit}
            disabled={isProcessing}
            className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
          >
            {isProcessing ? (
              <>
                <svg className="animate-spin h-5 w-5 mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Verifying...
              </>
            ) : (
              `Confirm ${offer.title} Purchase`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
      toast({ 
        title: "Test Credits Added", 
        description: `+${amount} TEST credits added to your account. This is for testing only.`,
      });
    } catch (e) {
      toast({ title: "Update failed", description: "Couldn't add credits. Please try again.", variant: "destructive" });
    }
  };

  const saveOrder = async (orderId: string) => {
    if (!user) return;
    
    const orderData = {
      orderId,
      userId: user.uid,
      userEmail: user.email || "unknown",
      offerKey: offer.key,
      credits: offer.credits,
      price: offer.price,
      timestamp: new Date().toISOString(),
      status:"false",
      hide:"false"
    };
    
    try {
      const orderRef = ref(db, `orderRequests/${orderId}`);
      await set(orderRef, orderData);
      toast({ 
        title: "Order Submitted", 
        description: `Your order #${orderId} has been received. Credits will be added to your account after verification (within 1 hour).`,
      });
    } catch (error) {
      console.error("Error saving order:", error);
      throw error;
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
          {offer.savings && (
            <div className="mt-2 text-xs bg-green-900/30 text-green-300 px-2 py-1 rounded-md inline-block">
              {offer.savings}
            </div>
          )}
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
          <ConfirmationDialog 
            offer={offer} 
            onConfirm={saveOrder} 
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-full py-2 px-4 bg-gray-800 hover:bg-gray-700 rounded-lg text-white font-medium transition-all"
            onClick={() => addCredits(offer.credits)}
            aria-label={`Add ${offer.credits} credits for testing`}
          >
            Add Credits (Test)
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
      <DialogContent className="max-w-5xl max-h-[85vh] bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-gray-900 to-black opacity-90" />
        <StarBackground />
        
        <DialogHeader className="relative z-10">
          <DialogTitle className="text-2xl font-bold text-white">
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              Upgrade Your Trading Power
            </span>
          </DialogTitle>
          <DialogDescription className="text-gray-300">
            Scan Binance QR code to purchase credits. After payment, enter your Order ID to confirm.
          </DialogDescription>
        </DialogHeader>
        
        <div className="relative z-10 overflow-y-auto pr-2 -mr-2 max-h-[60vh]">
          <motion.section 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-2"
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
          Note: After payment confirmation, credits are added immediately. For test purposes, use "Add Credits" button.
          <span className="block mt-1 text-indigo-300">✨ Galaxy Credits - Trade Among The Stars ✨</span>
        </p>
      </DialogContent>
    </Dialog>
  );
};