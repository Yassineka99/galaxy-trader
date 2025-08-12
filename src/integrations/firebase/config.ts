import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getAnalytics } from "firebase/analytics";
// TODO: Replace the placeholders below with your Firebase Web App config.
// You can find it in Firebase Console > Project Settings > General > Your apps (Web)
const firebaseConfig = {
  apiKey: "AIzaSyChkQLTQDu7dToIB4g5vsrZ0eimJXfgD6g",
  authDomain: "binance-live-predictor-pro.firebaseapp.com",
  databaseURL: "https://binance-live-predictor-pro-default-rtdb.firebaseio.com",
  projectId: "binance-live-predictor-pro",
  storageBucket: "binance-live-predictor-pro.firebasestorage.app",
  messagingSenderId: "359363523210",
  appId: "1:359363523210:web:bd605a49c37809508cb373",
  measurementId: "G-FVHQCJNEDE"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();