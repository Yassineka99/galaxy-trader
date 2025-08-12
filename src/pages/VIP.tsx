// src/pages/VIP.tsx
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Diamond, Zap, Clock, Star, Check, Gift, Rocket } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { onValue, ref, update } from "firebase/database";
import { db } from "@/integrations/firebase/config";
import { cn } from "@/lib/utils";
import Navbar from "@/components/Navbar";

const VIP = () => {
  const { user } = useAuth();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('monthly');
  const [activating, setActivating] = useState(false);
  
  // Create userRef only when user is available
  const userRef = user ? ref(db, `users/${user.uid}`) : null;

  useEffect(() => {
    if (!userRef) return;

    const unsubscribe = onValue(userRef, (snapshot) => {
      const data = snapshot.val();
      setUserData(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userRef]);

  const activateVIP = async (plan: 'monthly' | 'annual') => {
    if (!userRef) {
      toast.error("Please sign in to activate VIP");
      return;
    }
    
    setActivating(true);
    
    try {
      // Calculate duration based on plan
      const duration = plan === 'monthly' 
        ? 30 * 24 * 60 * 60 * 1000 // 30 days
        : 365 * 24 * 60 * 60 * 1000; // 1 year
        
      // Calculate expiry date
      const expiryDate = new Date(Date.now() + duration);
      
      await update(userRef, {
        vipExpiry: expiryDate.toISOString(),
      });
      
      toast.success("VIP Activated!", {
        description: `You now have premium benefits until ${expiryDate.toLocaleDateString()}`
      });
    } catch (error) {
      console.error("Error activating VIP:", error);
      toast.error("Failed to activate VIP", {
        description: "Please try again later"
      });
    } finally {
      setActivating(false);
    }
  };

  const isVIP = () => {
    if (!userData?.vipExpiry) return false;
    return new Date(userData.vipExpiry) > new Date();
  };

  const vipDaysRemaining = () => {
    if (!isVIP()) return 0;
    const diff = new Date(userData.vipExpiry).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto"></div>
          <p className="mt-4 text-gray-300">Loading VIP benefits...</p>
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
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-900 to-blue-900 px-6 py-2 rounded-full mb-4">
            <Rocket className="h-5 w-5" />
            <span className="font-medium">Premium Features</span>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-bold max-w-2xl mx-auto mb-4">
            <span className="bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">
              Galaxy Trader VIP
            </span>
            <br />
            <span className="text-xl md:text-2xl font-normal text-gray-300">
              Unlock the full potential of our trading signals
            </span>
          </h1>
          
          <p className="text-gray-400 max-w-2xl mx-auto">
            Get exclusive benefits, higher rewards, and premium features to maximize your trading profits.
            Join our VIP community today!
          </p>
        </motion.div>
  
        {/* VIP Status */}
        {isVIP() ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mb-12"
          >
            <Card className="glass-panel border-yellow-600/50 bg-gradient-to-br from-amber-900/20 to-yellow-900/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-r from-yellow-600 to-amber-600 rounded-lg">
                    <Star className="h-6 w-6" />
                  </div>
                  <span>Your VIP Status</span>
                  <Badge className="ml-auto bg-gradient-to-r from-yellow-600 to-amber-600">
                    Active
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2">
                    <p className="mb-4">
                      You're enjoying premium benefits until{" "}
                      <span className="font-bold text-yellow-400">
                        {new Date(userData.vipExpiry).toLocaleDateString()}
                      </span>
                    </p>
                    <div className="text-2xl font-bold text-yellow-400">
                      {vipDaysRemaining()} days remaining
                    </div>
                  </div>
                  
                  <div className="bg-black/30 p-4 rounded-lg border border-yellow-700/50">
                    <h3 className="font-bold flex items-center gap-2 mb-2">
                      <Zap className="h-5 w-5 text-yellow-400" />
                      <span>VIP Benefits Active</span>
                    </h3>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-400" />
                        <span>+50% Diamond Bonus</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-400" />
                        <span>Priority Prediction Processing</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-400" />
                        <span>Exclusive Trading Signals</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mb-12 bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-700/50 rounded-xl p-6"
          >
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">
                Become a <span className="text-yellow-400">VIP Member</span> Today
              </h2>
              <p className="text-gray-300 max-w-2xl mx-auto mb-6">
                Unlock premium features, earn more diamonds, and get the best trading experience
              </p>
              
              <div className="flex justify-center gap-4 mb-8">
                <Button
                  variant={selectedPlan === 'monthly' ? 'default' : 'outline'}
                  onClick={() => setSelectedPlan('monthly')}
                  className="px-8 py-4"
                >
                  Monthly Plan
                </Button>
                <Button
                  variant={selectedPlan === 'annual' ? 'default' : 'outline'}
                  onClick={() => setSelectedPlan('annual')}
                  className="px-8 py-4"
                >
                  Annual Plan (Save 30%)
                </Button>
              </div>
            </div>
          </motion.div>
        )}
  
        {/* Pricing Plans */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mb-12"
        >
          <h2 className="text-2xl font-bold text-center mb-2">
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              Choose Your Plan
            </span>
          </h2>
          <p className="text-gray-400 text-center mb-8 max-w-2xl mx-auto">
            Select the VIP plan that works best for you. Both plans include all premium features.
          </p>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Monthly Plan */}
            <motion.div
              whileHover={{ scale: 1.03 }}
              className={cn(
                "border rounded-xl p-6 flex flex-col h-full",
                selectedPlan === 'monthly' 
                  ? "border-yellow-500 bg-gradient-to-br from-yellow-900/10 to-amber-900/10" 
                  : "border-gray-700 bg-gray-900/50"
              )}
            >
              <div className="flex-1">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-xl font-bold">Monthly VIP</h3>
                    <p className="text-gray-400">Perfect for short-term traders</p>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-3xl font-bold">$4.99</div>
                    <div className="text-gray-400 text-sm">per month</div>
                  </div>
                </div>
                
                <ul className="space-y-3 mb-8">
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>+50% bonus on all diamond earnings</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>Priority prediction processing</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>Exclusive VIP-only trading signals</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>5% bonus on diamond exchanges</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>Early access to new features</span>
                  </li>
                </ul>
              </div>
              
              <Button
                size="lg"
                className={cn(
                  "w-full mt-auto",
                  selectedPlan === 'monthly' 
                    ? "bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-700 hover:to-amber-700"
                    : "bg-gray-800 hover:bg-gray-700"
                )}
                onClick={() => {
                  if (isVIP()) return;
                  setSelectedPlan('monthly');
                  activateVIP('monthly');
                }}
                disabled={activating}
              >
                {isVIP() ? (
                  "Your Current Plan"
                ) : activating ? (
                  <>
                    <svg className="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Activating VIP...
                  </>
                ) : (
                  "Select Monthly Plan"
                )}
              </Button>
            </motion.div>
            
            {/* Annual Plan */}
            <motion.div
              whileHover={{ scale: 1.03 }}
              className={cn(
                "border rounded-xl p-6 flex flex-col h-full",
                selectedPlan === 'annual' 
                  ? "border-yellow-500 bg-gradient-to-br from-yellow-900/10 to-amber-900/10" 
                  : "border-gray-700 bg-gray-900/50"
              )}
            >
              <div className="flex-1">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-xl font-bold">Annual VIP</h3>
                    <p className="text-gray-400">Best value for serious traders</p>
                    <Badge className="mt-2 bg-gradient-to-r from-green-600 to-emerald-600">
                      Save 30%
                    </Badge>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-3xl font-bold">$49.99</div>
                    <div className="text-gray-400 text-sm">per year</div>
                    <div className="text-gray-500 line-through text-sm">$71.88</div>
                  </div>
                </div>
                
                <ul className="space-y-3 mb-8">
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>All Monthly VIP features</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>+65% bonus on all diamond earnings</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>Highest priority prediction processing</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>10% bonus on diamond exchanges</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>Personalized trading insights</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>Exclusive VIP community access</span>
                  </li>
                </ul>
              </div>
              
              <Button
                size="lg"
                className={cn(
                  "w-full mt-auto",
                  selectedPlan === 'annual' 
                    ? "bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-700 hover:to-amber-700"
                    : "bg-gray-800 hover:bg-gray-700"
                )}
                onClick={() => {
                  if (isVIP()) return;
                  setSelectedPlan('annual');
                  activateVIP('annual');
                }}
                disabled={activating}
              >
                {isVIP() ? (
                  "Your Current Plan"
                ) : activating ? (
                  <>
                    <svg className="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Activating VIP...
                  </>
                ) : (
                  "Select Annual Plan"
                )}
              </Button>
            </motion.div>
          </div>
        </motion.div>
  
        {/* Benefits Comparison */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="mb-12"
        >
          <h2 className="text-2xl font-bold text-center mb-2">
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              VIP vs Free Comparison
            </span>
          </h2>
          <p className="text-gray-400 text-center mb-8 max-w-2xl mx-auto">
            See how VIP membership compares to our free account
          </p>
          
          <div className="bg-gray-900/50 border border-gray-700 rounded-xl overflow-hidden max-w-4xl mx-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left p-4">Feature</th>
                  <th className="p-4 text-center">Free Account</th>
                  <th className="p-4 text-center bg-gradient-to-b from-yellow-900/30 to-transparent">
                    VIP Member
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-800">
                  <td className="p-4 font-medium">Diamond Bonus</td>
                  <td className="p-4 text-center text-gray-400">0%</td>
                  <td className="p-4 text-center text-yellow-400 font-bold">
                    +50-65%
                  </td>
                </tr>
                <tr className="border-b border-gray-800">
                  <td className="p-4 font-medium">Prediction Priority</td>
                  <td className="p-4 text-center text-gray-400">Standard</td>
                  <td className="p-4 text-center text-yellow-400 font-bold">
                    Highest Priority
                  </td>
                </tr>
                <tr className="border-b border-gray-800">
                  <td className="p-4 font-medium">Exchange Bonus</td>
                  <td className="p-4 text-center text-gray-400">0%</td>
                  <td className="p-4 text-center text-yellow-400 font-bold">
                    5-10%
                  </td>
                </tr>
                <tr className="border-b border-gray-800">
                  <td className="p-4 font-medium">Daily Ad Limit</td>
                  <td className="p-4 text-center text-gray-400">20</td>
                  <td className="p-4 text-center text-yellow-400 font-bold">
                    30
                  </td>
                </tr>
                <tr className="border-b border-gray-800">
                  <td className="p-4 font-medium">Exclusive Signals</td>
                  <td className="p-4 text-center text-gray-400">
                    <span className="text-red-500">✗</span>
                  </td>
                  <td className="p-4 text-center text-yellow-400 font-bold">
                    <span className="text-green-500">✓</span>
                  </td>
                </tr>
                <tr>
                  <td className="p-4 font-medium">Personalized Insights</td>
                  <td className="p-4 text-center text-gray-400">
                    <span className="text-red-500">✗</span>
                  </td>
                  <td className="p-4 text-center text-yellow-400 font-bold">
                    <span className="text-green-500">✓</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </motion.div>
  
        {/* VIP Testimonials */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          <h2 className="text-2xl font-bold text-center mb-2">
            <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              What Our VIPs Say
            </span>
          </h2>
          <p className="text-gray-400 text-center mb-8 max-w-2xl mx-auto">
            Hear from successful traders who use our VIP service
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              {
                name: "Alex T.",
                profit: "+42% ROI",
                text: "VIP signals helped me spot trends before others. My portfolio has never been better!"
              },
              {
                name: "Sarah K.",
                profit: "3.5x more profits",
                text: "The diamond bonus alone pays for the subscription. Best investment I've made."
              },
              {
                name: "James P.",
                profit: "Consistent gains",
                text: "Priority predictions give me the edge I need in volatile markets."
              }
            ].map((testimonial, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 + (index * 0.1), duration: 0.5 }}
                className="bg-gray-900/50 border border-gray-700 rounded-xl p-6"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-gradient-to-r from-purple-700 to-blue-700 w-10 h-10 rounded-full flex items-center justify-center">
                    <span className="font-bold">{testimonial.name.charAt(0)}</span>
                  </div>
                  <div>
                    <h4 className="font-bold">{testimonial.name}</h4>
                    <div className="text-sm text-green-400">{testimonial.profit}</div>
                  </div>
                </div>
                <p className="text-gray-300">"{testimonial.text}"</p>
                <div className="flex mt-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default VIP;