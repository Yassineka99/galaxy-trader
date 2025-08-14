import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getAnalytics } from "firebase/analytics";
// TODO: Replace the placeholders below with your Firebase Web App config.
// You can find it in Firebase Console > Project Settings > General > Your apps (Web)
const firebaseConfig = {
  apiKey: "AIzaSyA0eZOJDDf1sJDkvFJVYE3k-VZPu69WPY8",
  authDomain: "galaxy-trader.firebaseapp.com",
  databaseURL: "https://galaxy-trader-default-rtdb.firebaseio.com",
  projectId: "galaxy-trader",
  storageBucket: "galaxy-trader.firebasestorage.app",
  messagingSenderId: "112181709355",
  appId: "1:112181709355:web:34fab6c42d959fa819786e",
  measurementId: "G-6TPESCSCKC"
};
// Add to firebaseConfig:
export const userSchema = {
  credits: 0,
  diamonds: 0,
  xp: 0,
  level: 1,
  streak: 0,
  lastLogin: null,
  adCountToday: 0,
  adCountResetDate: null,
  vipExpiry: null,
  referralCode: "",
  referredBy: "",
  tasks: {
    daily: {
      adsWatched: 0,
      linkShared: false
    },
    weekly: {
      adsWatched: 0,
      referrals: 0
    }
  }
};
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();