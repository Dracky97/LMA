import { initializeApp, getApps } from 'firebase/app';

const firebaseConfig = {
  apiKey: "AIzaSyDQn2YBz2Z-pNp-V3ZsyFOEqS4_9I7J2hs",
  authDomain: "leave-management-app-20ee9.firebaseapp.com",
  projectId: "leave-management-app-20ee9",
  storageBucket: "leave-management-app-20ee9.firebasestorage.app",
  messagingSenderId: "642206711530",
  appId: "1:642206711530:web:edca7f5a2b3c60df5a2193",
};

let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
}

export { app };