import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  projectId: "phat-force-6q7jp",
  appId: "1:543353224077:web:53d0096e8511bf624e9bc4",
  apiKey: "AIzaSyBnh_DLAbGaIJpJe5aDF5I0pQXN90oWluQ",
  authDomain: "phat-force-6q7jp.firebaseapp.com",
  databaseId: "ai-studio-a601d947-18e0-4de4-b708-bbaa8132339a",
  storageBucket: "phat-force-6q7jp.firebasestorage.app",
  messagingSenderId: "543353224077",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, "ai-studio-a601d947-18e0-4de4-b708-bbaa8132339a");
