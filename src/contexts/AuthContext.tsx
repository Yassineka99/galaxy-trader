import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { auth, googleProvider, db } from "@/integrations/firebase/config";
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
import { ref, set, get, child } from "firebase/database";
import { toast } from "sonner";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signUp: (firstName: string, lastName: string, email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<User | null>;
  signInWithGoogle: () => Promise<User | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const signUp = async (firstName: string, lastName: string, email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: `${firstName} ${lastName}`.trim() });
    // Save user profile in Realtime Database with initial credits
    await set(ref(db, `users/${cred.user.uid}`), {
      firstName,
      lastName,
      email,
      credits: 0,
      createdAt: Date.now(),
    });
    await sendEmailVerification(cred.user);
    toast("Verification email sent. Please check your inbox.");
  };

  const signIn = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  };

  const signInWithGoogle = async () => {
    const cred = await signInWithPopup(auth, googleProvider);
    const info = getAdditionalUserInfo(cred);

    if (info?.isNewUser) {
      const displayName = cred.user.displayName || "";
      const [firstName = "", ...rest] = displayName.split(" ");
      const lastName = rest.join(" ");

      await set(ref(db, `users/${cred.user.uid}`), {
        firstName,
        lastName,
        email: cred.user.email || "",
        credits: 0,
        createdAt: Date.now(),
      });
    }

    if (!cred.user.emailVerified) {
      try {
        await sendEmailVerification(cred.user);
        toast("Verification email sent to your Google account email.");
      } catch {}
    }
    return cred.user;
  };

  const signOut = async () => {
    await fbSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
