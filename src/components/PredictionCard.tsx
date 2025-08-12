// src/components/PredictionCard.tsx
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { format, differenceInSeconds, addMinutes } from "date-fns";

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

interface PredictionCardProps {
  prediction: Prediction | null;
  onClick: () => void;
}

const PredictionCard = ({ prediction, onClick }: PredictionCardProps) => {
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [status, setStatus] = useState<"active" | "over">("active");
  const [progress, setProgress] = useState<number>(0);

  useEffect(() => {
    if (!prediction) return;

    // Parse timeframe to minutes
    const minutes = parseInt(prediction.timeframe.split(" ")[0]);
    const startTime = new Date(prediction.timestamp);
    const endTime = addMinutes(startTime, minutes);
    
    const updateTimer = () => {
      const now = new Date();
      const secondsLeft = differenceInSeconds(endTime, now);
      
      if (secondsLeft <= 0) {
        setTimeLeft("Over");
        setStatus("over");
        return;
      }
      
      // Update progress percentage
      const totalSeconds = minutes * 60;
      const newProgress = 100 - (secondsLeft / totalSeconds) * 100;
      setProgress(newProgress);
      
      // Format time as MM:SS
      const mins = Math.floor(secondsLeft / 60);
      const secs = secondsLeft % 60;
      setTimeLeft(`${mins}:${secs < 10 ? '0' : ''}${secs}`);
      setStatus("active");
    };

    // Initial update
    updateTimer();
    
    // Update every second
    const timerId = setInterval(updateTimer, 1000);
    
    return () => clearInterval(timerId);
  }, [prediction]);

  if (!prediction) {
    return (
      <div className="bg-gradient-to-br from-gray-900 to-black p-5 rounded-xl border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              Latest Prediction
            </h3>
            <p className="text-sm text-gray-400">
              Make your first prediction
            </p>
          </div>
        </div>
        <div className="h-20 flex flex-col items-center justify-center text-gray-500 gap-2">
          <div className="text-center">
            <svg className="w-8 h-8 mx-auto text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <p className="mt-2">No predictions yet</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      className="bg-gradient-to-br from-gray-900 to-black p-5 rounded-xl border border-gray-700 cursor-pointer hover:border-purple-500 transition-colors"
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            Latest Prediction
          </h3>
          <p className="text-sm text-gray-400">
            Click to view details
          </p>
        </div>
        <div className={`text-xl font-bold ${prediction.action.includes("BUY") ? "text-green-400" : "text-red-400"}`}>
          {prediction.action}
        </div>
      </div>
      
      <div className="space-y-4">
        {/* Status indicator */}
        <div className="flex justify-between items-center">
          <div className={`px-3 py-1 rounded-full text-xs font-medium ${
            status === "active" 
              ? "bg-green-900/30 text-green-400 border border-green-700/50" 
              : "bg-gray-800 text-gray-400"
          }`}>
            {status === "active" ? "Active" : "Expired"}
          </div>
          
          <div className="text-sm text-gray-400">
            {prediction.symbol}
          </div>
        </div>
        
        {/* Countdown timer */}
        <div className="flex flex-col items-center justify-center py-2">
          <div className={`text-3xl font-mono font-bold ${
            status === "active" 
              ? "text-purple-400 animate-pulse" 
              : "text-gray-500"
          }`}>
            {timeLeft}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {status === "active" ? "Remaining" : "Prediction expired"}
          </div>
        </div>
        
        {/* Progress bar */}
        {status === "active" && (
          <div className="w-full bg-gray-800 rounded-full h-1.5">
            <div 
              className="bg-gradient-to-r from-purple-600 to-indigo-600 h-1.5 rounded-full" 
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        
        {/* Prediction details */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-800/30 p-2 rounded-lg">
            <p className="text-xs text-gray-400">Target Price</p>
            <p className="font-bold">${prediction.targetPrice}</p>
          </div>
          
          <div className="bg-gray-800/30 p-2 rounded-lg">
            <p className="text-xs text-gray-400">Accuracy</p>
            <p className="font-bold text-green-400">{prediction.accuracy}%</p>
          </div>
          
          <div className="bg-gray-800/30 p-2 rounded-lg">
            <p className="text-xs text-gray-400">Timeframe</p>
            <p className="font-bold">{prediction.timeframe}</p>
          </div>
          
          <div className="bg-gray-800/30 p-2 rounded-lg">
            <p className="text-xs text-gray-400">Confidence</p>
            <p className="font-bold text-blue-400">{prediction.confidence}</p>
          </div>
        </div>
        
        {/* Generated time */}
        <div className="text-xs text-gray-500 text-center mt-2">
          Generated: {format(new Date(prediction.timestamp), "MMM d, h:mm a")}
        </div>
      </div>
    </motion.div>
  );
};

export default PredictionCard;