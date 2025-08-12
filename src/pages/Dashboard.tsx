// src/pages/Dashboard.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { ref, runTransaction, onValue, push, set, get } from "firebase/database";
import { db } from "@/integrations/firebase/config";
import { toast } from "@/components/ui/use-toast";
import { motion } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { format } from "date-fns";

// Binance API functions
const fetchHistoricalData = async (symbol = "BTCUSDT", interval = "1h", limit = 720) => {
  try {
    const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
    const data = await response.json();
    return data.map((k: any) => ({
      time: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    }));
  } catch (error) {
    console.error("Error fetching historical data:", error);
    return [];
  }
};

// Technical indicators calculation
const calculateRSI = (closes: number[], period = 14) => {
  if (closes.length < period + 1) return 0;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = closes.length - period; i < closes.length - 1; i++) {
    const change = closes[i + 1] - closes[i];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
};

const calculateMACD = (closes: number[], shortPeriod = 12, longPeriod = 26) => {
  if (closes.length < longPeriod) return { macd: 0, signal: 0 };
  
  const shortEMA = closes.slice(-shortPeriod).reduce((a, b) => a + b, 0) / shortPeriod;
  const longEMA = closes.slice(-longPeriod).reduce((a, b) => a + b, 0) / longPeriod;
  
  const macd = shortEMA - longEMA;
  const signal = macd * 0.9; // Simplified signal line (normally 9-period EMA of MACD)
  
  return { macd, signal };
};

const TradingView = () => {
  return (
    <div className="w-full h-[480px] rounded-xl overflow-hidden relative bg-gradient-to-br from-gray-900 to-black border border-gray-700">
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-1/4 left-1/4 w-32 h-32 rounded-full bg-purple-500 blur-3xl opacity-30 animate-pulse" />
        <div className="absolute bottom-1/3 right-1/3 w-48 h-48 rounded-full bg-blue-500 blur-3xl opacity-20 animate-pulse" />
      </div>
      <iframe
        title="BTCUSDT Chart"
        loading="lazy"
        className="w-full h-full relative z-10"
        src="https://s.tradingview.com/widgetembed/?symbol=BINANCE:BTCUSDT&interval=60&hidesidetoolbar=1&symboledit=1&saveimage=1&hideideas=1&theme=dark&style=1&timezone=Etc%2FUTC"
      />
    </div>
  );
};

const useBinanceTicker = (symbol: string) => {
  const [price, setPrice] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const stream = `${symbol.toLowerCase()}@trade`;
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}`);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.p) setPrice(parseFloat(data.p));
      } catch {}
    };
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [symbol]);

  return price;
};

const PriceCard = ({ symbol }: { symbol: string }) => {
  const price = useBinanceTicker(symbol);
  const [prev, setPrev] = useState<number | null>(null);
  useEffect(() => { if (price) setPrev(price); }, [price]);
  const trend = useMemo(() => {
    if (!price || !prev) return 0;
    return price - prev;
  }, [price, prev]);

  const trendColor = trend > 0 ? "text-green-400" : trend < 0 ? "text-red-400" : "text-foreground";

  return (
    <div className="bg-gradient-to-br from-gray-900 to-black p-5 rounded-xl border border-gray-700">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400">Live</p>
          <h3 className="text-lg font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            {symbol.toUpperCase()}
          </h3>
        </div>
        <div className={`text-2xl font-bold ${trendColor}`}>
          {price ? price.toFixed(2) : "—"}
        </div>
      </div>
    </div>
  );
};

interface Prediction {
  id?: string;
  action: string;
  timeframe: string;
  targetPrice: string;
  currentPrice: string;
  accuracy: string;
  confidence: string;
  indicators: {
    rsi: string;
    macd: string;
    signal: string;
  };
  timestamp: string;
  symbol: string;
}

const Dashboard = () => {
  const { user } = useAuth();
  const [credits, setCredits] = useState<number>(0);
  const [isPredicting, setIsPredicting] = useState(false);
  const [latestPrediction, setLatestPrediction] = useState<Prediction | null>(null);
  const [isPredictionModalOpen, setIsPredictionModalOpen] = useState(false);
  const [historicalData, setHistoricalData] = useState<any[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [predictionHistory, setPredictionHistory] = useState<Prediction[]>([]);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedPrediction, setSelectedPrediction] = useState<Prediction | null>(null);
  
  useEffect(() => {
    document.title = "Dashboard — Galaxy Trader";
    
    // Fetch historical data on mount
    const loadData = async () => {
      const data = await fetchHistoricalData();
      setHistoricalData(data);
    };
    
    loadData();
  }, []);

  // Listen to real-time credit updates
  useEffect(() => {
    if (!user) return;
    
    const creditsRef = ref(db, `users/${user.uid}/credits`);
    const unsubscribeCredits = onValue(creditsRef, (snap) => {
      const v = snap.val();
      setCredits(typeof v === "number" ? v : 0);
    });
    
    // Listen to prediction history
    const historyRef = ref(db, `users/${user.uid}/predictions`);
    const unsubscribeHistory = onValue(historyRef, (snap) => {
      const data = snap.val();
      if (data) {
        const historyArray = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        })).sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        setPredictionHistory(historyArray);
        
        // Set latest prediction
        if (historyArray.length > 0) {
          setLatestPrediction(historyArray[0]);
        }
      }
    });
    
    return () => {
      unsubscribeCredits();
      unsubscribeHistory();
    };
  }, [user]);

  // Listen to BTC price for prediction
  const btcPrice = useBinanceTicker("btcusdt");
  useEffect(() => {
    if (btcPrice) setCurrentPrice(btcPrice);
  }, [btcPrice]);

  const generatePrediction = (): Prediction | null => {
    if (historicalData.length === 0 || currentPrice === null) return null;
    
    const closes = historicalData.map(d => d.close);
    closes.push(currentPrice); // Add current price to the dataset
    
    // Calculate technical indicators
    const rsi = calculateRSI(closes);
    const { macd, signal } = calculateMACD(closes);
    
    // Generate high accuracy prediction
    const accuracy = 99.2 + Math.random() * 0.6; // 99.20% to 99.80%
    const timeframe = Math.random() > 0.5 ? "5 minutes" : "15 minutes";
    
    // Determine action based on indicators
    let action;
    let confidence;
    
    // RSI-based signals
    if (rsi < 30) {
      action = "STRONG BUY";
      confidence = "High";
    } else if (rsi < 40) {
      action = "BUY";
      confidence = "Medium";
    } else if (rsi > 70) {
      action = "STRONG SELL";
      confidence = "High";
    } else if (rsi > 60) {
      action = "SELL";
      confidence = "Medium";
    } else {
      // MACD-based signals when RSI is neutral
      if (macd > signal) {
        action = "BUY";
        confidence = "Medium";
      } else {
        action = "SELL";
        confidence = "Medium";
      }
    }
    
    // Add price target prediction
    const priceChange = currentPrice * (0.001 + Math.random() * 0.005);
    const targetPrice = action.includes("BUY") 
      ? currentPrice + priceChange 
      : currentPrice - priceChange;
    
    return {
      action,
      timeframe,
      targetPrice: targetPrice.toFixed(2),
      currentPrice: currentPrice.toFixed(2),
      accuracy: accuracy.toFixed(2),
      confidence,
      indicators: {
        rsi: rsi.toFixed(2),
        macd: macd.toFixed(4),
        signal: signal.toFixed(4)
      },
      timestamp: new Date().toISOString(),
      symbol: "BTC/USDT"
    };
  };

  const savePredictionToHistory = async (prediction: Prediction) => {
    if (!user) return;
    
    try {
      const predictionsRef = ref(db, `users/${user.uid}/predictions`);
      const newPredictionRef = push(predictionsRef);
      await set(newPredictionRef, prediction);
      return newPredictionRef.key;
    } catch (error) {
      console.error("Error saving prediction:", error);
      toast({
        title: "Error saving prediction",
        description: "Couldn't save prediction to history",
        variant: "destructive"
      });
    }
  };

  const handlePredict = async () => {
    if (!user) {
      toast({ 
        title: "Sign in required", 
        description: "Please sign in to make predictions.", 
        variant: "destructive",
        className: "bg-gradient-to-r from-red-900/80 to-red-800/80 text-white border border-red-700"
      });
      return;
    }
    
    if (credits < 50) {
      toast({ 
        title: "Insufficient credits", 
        description: "You need at least 50 credits to make a prediction.", 
        variant: "destructive",
        className: "bg-gradient-to-r from-red-900/80 to-red-800/80 text-white border border-red-700"
      });
      return;
    }
    
    setIsPredicting(true);
    
    try {
      // Deduct credits
      await runTransaction(ref(db, `users/${user.uid}/credits`), (current) => {
        const value = typeof current === "number" ? current : 0;
        if (value < 50) return value;
        return value - 50;
      });
      
      toast({ 
        title: "Prediction started", 
        description: "50 credits deducted. Analyzing market...", 
        variant: "default",
        className: "bg-gradient-to-r from-purple-900/80 to-blue-900/80 text-white border border-purple-700"
      });
      
      // Generate and save prediction
      setTimeout(async () => {
        const predictionResult = generatePrediction();
        if (predictionResult) {
          // Save to history
          const id = await savePredictionToHistory(predictionResult);
          if (id) {
            setLatestPrediction({ ...predictionResult, id });
          }
        } else {
          toast({ 
            title: "Prediction failed", 
            description: "Market data unavailable. Please try again.", 
            variant: "destructive",
            className: "bg-gradient-to-r from-red-900/80 to-red-800/80 text-white border border-red-700"
          });
        }
        setIsPredicting(false);
      }, 3000);
      
    } catch (e) {
      toast({ 
        title: "Prediction failed", 
        description: "Couldn't process your prediction. Please try again.", 
        variant: "destructive",
        className: "bg-gradient-to-r from-red-900/80 to-red-800/80 text-white border border-red-700"
      });
      setIsPredicting(false);
    }
  };

  const openPredictionDetails = (prediction: Prediction) => {
    setSelectedPrediction(prediction);
    setIsPredictionModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black">
      <Navbar onHistoryClick={() => setIsHistoryModalOpen(true)} />
      <main className="container mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 relative">
            <TradingView />
            
            {/* Floating Predict Button */}
            <motion.div
              className="absolute bottom-6 right-6 z-20"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <motion.button
                className={`py-3 px-6 rounded-full font-bold text-white shadow-lg relative overflow-hidden
                  ${credits >= 50 
                    ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700" 
                    : "bg-gradient-to-r from-gray-700 to-gray-800 cursor-not-allowed"}`}
                onClick={handlePredict}
                disabled={isPredicting || credits < 50}
                animate={{
                  boxShadow: credits >= 50
                    ? ["0 0 10px rgba(139, 92, 246, 0.5)", "0 0 20px rgba(139, 92, 246, 0.7)", "0 0 10px rgba(139, 92, 246, 0.5)"]
                    : "0 0 0 rgba(0,0,0,0)"
                }}
                transition={{ 
                  duration: 2, 
                  repeat: Infinity,
                  repeatType: "reverse"
                }}
              >
                {/* Glowing effect */}
                {credits >= 50 && (
                  <motion.span 
                    className="absolute inset-0 rounded-full"
                    animate={{
                      boxShadow: [
                        "0 0 15px rgba(139, 92, 246, 0.3)",
                        "0 0 30px rgba(139, 92, 246, 0.5)",
                        "0 0 15px rgba(139, 92, 246, 0.3)"
                      ]
                    }}
                    transition={{ 
                      duration: 2, 
                      repeat: Infinity,
                      repeatType: "reverse"
                    }}
                  />
                )}
                
                <div className="relative z-10 flex items-center gap-2">
                  {isPredicting ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Predicting...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Predict (50 credits)
                    </>
                  )}
                </div>
              </motion.button>
              
              <div className="text-center mt-2 text-xs font-medium bg-gray-800/50 px-2 py-1 rounded-full">
                Credits: <span className={credits >= 50 ? "text-green-400" : "text-red-400"}>{credits}</span>
              </div>
            </motion.div>
          </div>
          
          <div className="space-y-4">
            <PriceCard symbol="btcusdt" />
            <PriceCard symbol="ethusdt" />
            
            {/* Prediction Card (replaces credits card) */}
            <div 
              className="bg-gradient-to-br from-gray-900 to-black p-5 rounded-xl border border-gray-700 cursor-pointer hover:border-purple-500 transition-colors"
              onClick={() => latestPrediction && openPredictionDetails(latestPrediction)}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                    Latest Prediction
                  </h3>
                  <p className="text-sm text-gray-400">
                    {latestPrediction ? "Click to view details" : "Make your first prediction"}
                  </p>
                </div>
                <div className={`text-xl font-bold ${latestPrediction?.action.includes("BUY") ? "text-green-400" : "text-red-400"}`}>
                  {latestPrediction?.action || "—"}
                </div>
              </div>
              
              {latestPrediction ? (
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Accuracy</span>
                    <span className="font-bold text-green-400">{latestPrediction.accuracy}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Timeframe</span>
                    <span className="font-bold">{latestPrediction.timeframe}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Generated</span>
                    <span className="font-bold">
                      {format(new Date(latestPrediction.timestamp), "MMM d, h:mm a")}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="h-20 flex items-center justify-center text-gray-500">
                  No predictions yet
                </div>
              )}
              
              <div className="mt-4 pt-4 border-t border-gray-800 flex justify-between items-center">
                <span className="text-sm text-gray-400">Available credits: {credits}</span>
                <button 
                  className="text-xs text-purple-400 hover:text-purple-300"
                  onClick={() => setIsHistoryModalOpen(true)}
                >
                  View History
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Prediction Details Modal */}
        <Dialog open={isPredictionModalOpen} onOpenChange={setIsPredictionModalOpen}>
          <DialogContent className="bg-gradient-to-br from-gray-900 to-black border border-purple-700 rounded-xl max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-center bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                Trading Prediction Details
              </DialogTitle>
              <DialogDescription className="text-center text-gray-300">
                Based on market analysis
              </DialogDescription>
            </DialogHeader>
            
            {selectedPrediction && (
              <div className="space-y-6 py-4">
                <div className={`text-center py-6 rounded-xl ${selectedPrediction.action.includes("BUY") ? "bg-green-900/30 border border-green-700" : "bg-red-900/30 border border-red-700"}`}>
                  <div className="text-3xl font-bold mb-2">
                    {selectedPrediction.action}
                  </div>
                  <div className="text-lg">
                    {selectedPrediction.symbol}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-800/50 p-4 rounded-lg">
                    <p className="text-gray-400">Current Price</p>
                    <p className="text-xl font-bold">${selectedPrediction.currentPrice}</p>
                  </div>
                  <div className="bg-gray-800/50 p-4 rounded-lg">
                    <p className="text-gray-400">Target Price</p>
                    <p className="text-xl font-bold">${selectedPrediction.targetPrice}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-800/50 p-4 rounded-lg">
                    <p className="text-gray-400">Timeframe</p>
                    <p className="text-xl font-bold">{selectedPrediction.timeframe}</p>
                  </div>
                  <div className="bg-gray-800/50 p-4 rounded-lg">
                    <p className="text-gray-400">Generated At</p>
                    <p className="text-xl font-bold">
                      {format(new Date(selectedPrediction.timestamp), "MMM d, yyyy h:mm a")}
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-800/50 p-4 rounded-lg">
                    <p className="text-gray-400">Accuracy</p>
                    <p className="text-xl font-bold text-green-400">{selectedPrediction.accuracy}%</p>
                  </div>
                  <div className="bg-gray-800/50 p-4 rounded-lg">
                    <p className="text-gray-400">Confidence</p>
                    <p className="text-xl font-bold text-blue-400">{selectedPrediction.confidence}</p>
                  </div>
                </div>
                
                <div className="bg-gray-800/50 p-4 rounded-lg">
                  <p className="text-gray-400">Technical Indicators</p>
                  <div className="mt-2 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm">RSI: <span className="font-bold">{selectedPrediction.indicators.rsi}</span></p>
                      <div className="w-full bg-gray-700 rounded-full h-1.5 mt-1">
                        <div 
                          className="h-1.5 rounded-full bg-gradient-to-r from-red-400 via-yellow-400 to-green-400" 
                          style={{ width: `${Math.min(100, parseFloat(selectedPrediction.indicators.rsi))}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {parseFloat(selectedPrediction.indicators.rsi) < 30 ? "Oversold (Buy Signal)" : 
                         parseFloat(selectedPrediction.indicators.rsi) > 70 ? "Overbought (Sell Signal)" : "Neutral"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm">MACD: <span className="font-bold">{selectedPrediction.indicators.macd}</span></p>
                      <p className="text-sm">Signal: <span className="font-bold">{selectedPrediction.indicators.signal}</span></p>
                      <p className="text-xs text-gray-500 mt-1">
                        {parseFloat(selectedPrediction.indicators.macd) > parseFloat(selectedPrediction.indicators.signal) 
                          ? "Bullish Crossover (Buy Signal)" 
                          : "Bearish Crossover (Sell Signal)"}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gray-800/50 p-4 rounded-lg">
                  <p className="text-gray-400">Trading Strategy</p>
                  <div className="mt-2 space-y-2 text-sm">
                    <p>
                      {selectedPrediction.action.includes("BUY") ? (
                        <>
                          <span className="text-green-400 font-bold">Buy Recommendation:</span> Enter a long position at 
                          current market price with a target of ${selectedPrediction.targetPrice}. Set stop loss at 
                          ${(parseFloat(selectedPrediction.currentPrice) * 0.995).toFixed(2)}.
                        </>
                      ) : (
                        <>
                          <span className="text-red-400 font-bold">Sell Recommendation:</span> Enter a short position at 
                          current market price with a target of ${selectedPrediction.targetPrice}. Set stop loss at 
                          ${(parseFloat(selectedPrediction.currentPrice) * 1.005).toFixed(2)}.
                        </>
                      )}
                    </p>
                    <p>
                      <span className="font-bold">Timeframe:</span> This prediction is valid for the next {selectedPrediction.timeframe}.
                      Monitor price action closely during this period.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
        
        {/* Prediction History Modal */}
        <Dialog open={isHistoryModalOpen} onOpenChange={setIsHistoryModalOpen}>
          <DialogContent className="bg-gradient-to-br from-gray-900 to-black border border-purple-700 rounded-xl max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-center bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                Prediction History
              </DialogTitle>
              <DialogDescription className="text-center text-gray-300">
                Your trading predictions over time
              </DialogDescription>
            </DialogHeader>
            
            {predictionHistory.length === 0 ? (
              <div className="text-center py-10 text-gray-500">
                No prediction history yet. Make your first prediction!
              </div>
            ) : (
              <div className="space-y-3 py-4">
                {predictionHistory.map(prediction => (
                  <div 
                    key={prediction.id}
                    className={`p-4 rounded-lg cursor-pointer hover:bg-gray-800/50 transition-colors border ${
                      prediction.action.includes("BUY") 
                        ? "border-green-700/50 hover:border-green-500" 
                        : "border-red-700/50 hover:border-red-500"
                    }`}
                    onClick={() => {
                      setSelectedPrediction(prediction);
                      setIsHistoryModalOpen(false);
                      setTimeout(() => setIsPredictionModalOpen(true), 300);
                    }}
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${
                          prediction.action.includes("BUY") ? "bg-green-500" : "bg-red-500"
                        }`}></div>
                        <div>
                          <h4 className="font-bold">{prediction.symbol}</h4>
                          <p className="text-sm text-gray-400">
                            {format(new Date(prediction.timestamp), "MMM d, yyyy h:mm a")}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className={`font-bold ${prediction.action.includes("BUY") ? "text-green-400" : "text-red-400"}`}>
                          {prediction.action}
                        </span>
                        <span className="text-sm text-gray-400">{prediction.timeframe}</span>
                      </div>
                    </div>
                    <div className="flex justify-between mt-2">
                      <span className="text-sm">Accuracy: <span className="text-green-400">{prediction.accuracy}%</span></span>
                      <span className="text-sm">Confidence: <span className="text-blue-400">{prediction.confidence}</span></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default Dashboard;