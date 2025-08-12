// src/contexts/AuthContext.tsx
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { 
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  signInWithPopup,
  sendEmailVerification,
  updateProfile,
  getAdditionalUserInfo,
  User,
} from "firebase/auth";
import { ref, set, get, child, update, runTransaction, onValue } from "firebase/database";
import { auth, googleProvider, db } from "@/integrations/firebase/config";
import { toast } from "sonner";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  userData: any;
  signUp: (firstName: string, lastName: string, email: string, password: string, referralCode?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<User | null>;
  signInWithGoogle: () => Promise<User | null>;
  signOut: () => Promise<void>;
  addCredits: (amount: number) => Promise<void>;
  addDiamonds: (amount: number) => Promise<void>;
  addXP: (amount: number) => Promise<void>;
  updateStreak: () => Promise<void>;
  completeTask: (taskType: 'daily' | 'weekly', taskKey: string) => Promise<void>;
  activateVIP: (duration: number) => Promise<void>;
  generateReferralCode: () => string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Generate a unique referral code
  const generateReferralCode = () => {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  };

  // Initialize user data with new fields
  const initUserData = (firstName: string, lastName: string, email: string, referralCode?: string) => {
    const code = generateReferralCode();
    return {
      firstName,
      lastName,
      email,
      credits: 0,
      diamonds: 0,
      xp: 0,
      level: 1,
      streak: 0,
      lastLogin: null,
      adCountToday: 0,
      adCountResetDate: null,
      vipExpiry: null,
      referralCode: code,
      referredBy: referralCode || null,
      tasks: {
        daily: {
          adsWatched: 0,
          linkShared: false
        },
        weekly: {
          adsWatched: 0,
          referrals: 0
        }
      },
      createdAt: Date.now(),
    };
  };

  // Check and update daily streak
  const updateStreak = async () => {
    if (!user) return;
    
    const userRef = ref(db, `users/${user.uid}`);
    const today = new Date().toISOString().split('T')[0];
    
    try {
      const snapshot = await get(userRef);
      const data = snapshot.val();
      
      if (!data) return;
      
      const lastLogin = data.lastLogin ? new Date(data.lastLogin).toISOString().split('T')[0] : null;
      const isConsecutive = lastLogin && 
        new Date(lastLogin).getDate() + 1 === new Date(today).getDate();
      
      const newStreak = isConsecutive ? (data.streak || 0) + 1 : 1;
      const diamondsEarned = Math.min(5, 0.2 + (newStreak * 0.1));
      
      await update(userRef, {
        streak: newStreak,
        lastLogin: new Date().toISOString(),
        diamonds: (data.diamonds || 0) + diamondsEarned,
      });
      
      toast.success(`Daily login! +${diamondsEarned.toFixed(1)} diamonds`, {
        description: `You're on a ${newStreak}-day streak!`
      });
    } catch (error) {
      console.error("Error updating streak:", error);
    }
  };

  // Add diamonds to user account
  const addDiamonds = async (amount: number) => {
    if (!user) {
      toast.error("Please sign in to add diamonds");
      return;
    }
    
    try {
      await runTransaction(ref(db, `users/${user.uid}/diamonds`), (current) => {
        const value = typeof current === "number" ? current : 0;
        return value + amount;
      });
    } catch (e) {
      toast.error("Failed to add diamonds");
    }
  };

  // Add credits to user account
  const addCredits = async (amount: number) => {
    if (!user) {
      toast.error("Please sign in to add credits");
      return;
    }
    
    try {
      await runTransaction(ref(db, `users/${user.uid}/credits`), (current) => {
        const value = typeof current === "number" ? current : 0;
        return value + amount;
      });
    } catch (e) {
      toast.error("Failed to add credits");
    }
  };

  // Add XP to user account and handle leveling up
  const addXP = async (amount: number) => {
    if (!user) return;
    
    const userRef = ref(db, `users/${user.uid}`);
    
    try {
      await runTransaction(userRef, (current) => {
        const data = current || {};
        const newXP = (data.xp || 0) + amount;
        const xpNeeded = 50 * (data.level || 1);
        
        // Check if user leveled up
        if (newXP >= xpNeeded) {
          return {
            ...data,
            xp: 0,
            level: (data.level || 1) + 1
          };
        }
        
        return {
          ...data,
          xp: newXP
        };
      });
    } catch (error) {
      console.error("Error adding XP:", error);
    }
  };

  // Complete a task
  const completeTask = async (taskType: 'daily' | 'weekly', taskKey: string) => {
    if (!user) return;
    
    const userRef = ref(db, `users/${user.uid}`);
    
    try {
      await runTransaction(userRef, (current) => {
        const data = current || {};
        return {
          ...data,
          [`tasks.${taskType}.${taskKey}`]: true
        };
      });
    } catch (error) {
      console.error("Error completing task:", error);
    }
  };

  // Activate VIP subscription
  const activateVIP = async (duration: number) => {
    if (!user) return;
    
    const expiryDate = new Date(Date.now() + duration);
    
    try {
      await update(ref(db, `users/${user.uid}`), {
        vipExpiry: expiryDate.toISOString()
      });
    } catch (error) {
      console.error("Error activating VIP:", error);
    }
  };

  // Handle referral when a new user signs up
  const handleReferral = async (referralCode: string) => {
    if (!referralCode) return;
    
    try {
      // Find user who referred
      const usersRef = ref(db, 'users');
      const snapshot = await get(usersRef);
      
      if (!snapshot.exists()) return;
      
      let referrerId: string | null = null;
      
      // Find user with matching referral code
      snapshot.forEach((childSnapshot) => {
        const user = childSnapshot.val();
        if (user.referralCode === referralCode) {
          referrerId = childSnapshot.key;
        }
      });
      
      if (!referrerId) return;
      
      // Add diamonds to referrer
      const referrerRef = ref(db, `users/${referrerId}`);
      await runTransaction(referrerRef, (current) => {
        const data = current || {};
        const diamondsPerReferral = 3 + ((data.level || 1) / 10);
        return {
          ...data,
          diamonds: (data.diamonds || 0) + diamondsPerReferral,
          [`tasks.weekly.referrals`]: (data.tasks?.weekly?.referrals || 0) + 1
        };
      });
      
      // Add XP to referrer
      await addXP.call({ user: { uid: referrerId } } as any, 5);
    } catch (error) {
      console.error("Error processing referral:", error);
    }
  };

  // Sign up with email/password
  const signUp = async (
    firstName: string, 
    lastName: string, 
    email: string, 
    password: string,
    referralCode?: string
  ) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { 
      displayName: `${firstName} ${lastName}`.trim() 
    });
    
    // Initialize user data with new fields
    const userData = initUserData(firstName, lastName, email, referralCode);
    
    // Save to database
    await set(ref(db, `users/${cred.user.uid}`), userData);
    
    // Handle referral if applicable
    if (referralCode) {
      await handleReferral(referralCode);
    }
    
    // Send verification email
    await sendEmailVerification(cred.user);
    toast("Verification email sent. Please check your inbox.");
  };

  // Sign in with Google
  const signInWithGoogle = async () => {
    const cred = await signInWithPopup(auth, googleProvider);
    const info = getAdditionalUserInfo(cred);
    
    if (info?.isNewUser) {
      const displayName = cred.user.displayName || "";
      const [firstName = "", ...rest] = displayName.split(" ");
      const lastName = rest.join(" ");
      
      // Initialize user data with new fields
      const userData = initUserData(firstName, lastName, cred.user.email || "");
      
      await set(ref(db, `users/${cred.user.uid}`), userData);
    }
    
    if (!cred.user.emailVerified) {
      try {
        await sendEmailVerification(cred.user);
        toast("Verification email sent to your Google account email.");
      } catch {} 
    }
    
    return cred.user;
  };

  // Sign in with email/password
  const signIn = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  };

  // Sign out
  const signOut = async () => {
    await fbSignOut(auth);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      
      if (user) {
        // Load user data from database
        const userRef = ref(db, `users/${user.uid}`);
        const unsubscribe = onValue(userRef, (snapshot) => {
          const data = snapshot.val();
          setUserData(data);
          setLoading(false);
        });
        
        return () => unsubscribe();
      } else {
        setUserData(null);
        setLoading(false);
      }
    });
    
    return () => unsub();
  }, []);

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      userData,
      signUp, 
      signIn, 
      signInWithGoogle, 
      signOut,
      addCredits,
      addDiamonds,
      addXP,
      updateStreak,
      completeTask,
      activateVIP,
      generateReferralCode
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};