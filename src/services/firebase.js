import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyDY46y2n69vJhMADmOVipLY9Cq1tBhtNXo",
  authDomain: "hk261-cc-g04.firebaseapp.com",
  projectId: "hk261-cc-g04",
  storageBucket: "hk261-cc-g04.firebasestorage.app",
  messagingSenderId: "787982910078",
  appId: "1:787982910078:web:1b9e3ba8feceeb5376ce2f",
  measurementId: "G-5X9TZ2RD66"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
