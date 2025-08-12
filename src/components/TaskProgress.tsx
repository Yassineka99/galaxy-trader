// src/components/TaskProgress.tsx
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Check, Gift, Zap, Share2, UserPlus, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Task {
  id: string;
  name: string;
  description: string;
  icon: string;
  required: number;
  reward: number;
  type: "daily" | "weekly";
  rewardType: "diamonds" | "credits";
}

interface TaskProgressProps {
  task: Task;
  progress: number;
  completed: boolean;
  onComplete: () => void;
}

const iconMap: Record<string, React.ReactNode> = {
  gift: <Gift className="h-5 w-5" />,
  zap: <Zap className="h-5 w-5" />,
  share: <Share2 className="h-5 w-5" />,
  user: <UserPlus className="h-5 w-5" />,
  clock: <Clock className="h-5 w-5" />,
};

const TaskProgress = ({ task, progress, completed, onComplete }: TaskProgressProps) => {
  const progressPercent = Math.min(100, (progress / task.required) * 100);
  const isIncremental = task.required > 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "border rounded-xl p-4 transition-all",
        completed 
          ? "border-green-700/50 bg-green-900/10" 
          : "border-gray-700 hover:border-purple-500 bg-gradient-to-br from-gray-900/50 to-black/50"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={cn(
            "p-2 rounded-lg mt-1",
            completed 
              ? "bg-green-900/30 border border-green-700/50" 
              : "bg-purple-900/30 border border-purple-700/50"
          )}>
            {iconMap[task.icon] || <Gift className="h-5 w-5" />}
          </div>
          
          <div className="flex-1">
            <h3 className="font-medium flex items-center gap-2">
              {task.name}
              {completed && (
                <span className="text-xs bg-green-900/50 text-green-300 px-2 py-0.5 rounded-full flex items-center">
                  <Check className="h-3 w-3 mr-1" /> Completed
                </span>
              )}
            </h3>
            <p className="text-sm text-gray-400 mt-1">{task.description}</p>
            
            {isIncremental && !completed && (
              <div className="mt-3">
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div 
                    className={cn(
                      "h-2 rounded-full",
                      progressPercent < 30 ? "bg-red-500" : 
                      progressPercent < 70 ? "bg-yellow-500" : "bg-green-500"
                    )}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {progress} / {task.required}
                </p>
              </div>
            )}
          </div>
        </div>
        
        <div className="flex flex-col items-end">
          <div className={cn(
            "px-3 py-1 rounded-full text-xs font-medium flex items-center",
            completed 
              ? "bg-green-900/30 text-green-400" 
              : "bg-purple-900/30 text-purple-400"
          )}>
            {task.rewardType === "diamonds" ? (
              <span>+{task.reward} <span className="text-blue-400">♦</span></span>
            ) : (
              <span>+{task.reward} credits</span>
            )}
          </div>
          
          {!completed && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={cn(
                "mt-3 px-4 py-1.5 rounded-lg text-sm font-medium",
                progress >= task.required 
                  ? "bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700" 
                  : "bg-gray-800 hover:bg-gray-700 cursor-not-allowed"
              )}
              onClick={onComplete}
              disabled={progress < task.required}
            >
              {progress >= task.required ? "Claim Reward" : "In Progress"}
            </motion.button>
          )}
        </div>
      </div>
      
      {task.type === "weekly" && !completed && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-800">
          <Clock className="h-4 w-4 text-yellow-500" />
          <p className="text-xs text-yellow-400">
            Resets weekly - Complete before Monday
          </p>
        </div>
      )}
    </motion.div>
  );
};

export default TaskProgress;

// Utility function to get task data
export const getTaskData = (type: "daily" | "weekly"): Task[] => {
  if (type === "daily") {
    return [
      {
        id: "daily-ads",
        name: "Watch Ads",
        description: "Watch ads to earn diamonds",
        icon: "zap",
        required: 5,
        reward: 5,
        type: "daily",
        rewardType: "diamonds"
      },
      {
        id: "daily-share",
        name: "Share Referral Link",
        description: "Share your referral link with friends",
        icon: "share",
        required: 1,
        reward: 5,
        type: "daily",
        rewardType: "diamonds"
      }
    ];
  }
  
  return [
    {
      id: "weekly-ads",
      name: "Watch 50 Ads",
      description: "Watch ads throughout the week",
      icon: "zap",
      required: 50,
      reward: 50,
      type: "weekly",
      rewardType: "diamonds"
    },
    {
      id: "weekly-referrals",
      name: "Refer Friends",
      description: "Get friends to sign up and be active",
      icon: "user",
      required: 3,
      reward: 50,
      type: "weekly",
      rewardType: "diamonds"
    }
  ];
};