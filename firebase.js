import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {
  getFirestore,
  serverTimestamp,
  Timestamp,
  collection,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  onSnapshot,
  query,
  orderBy
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCEeatyDxNMP9s1znkQTPdeuAV2lBXki3Y',
  authDomain: 'lotus-odontologia.firebaseapp.com',
  projectId: 'lotus-odontologia',
  storageBucket: 'lotus-odontologia.firebasestorage.app',
  messagingSenderId: '476967198868',
  appId: '1:476967198868:web:5c8efcd6c81e1875c29481',
  measurementId: 'G-2RXDLWTDLV'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});

export {
  app,
  db,
  auth,
  serverTimestamp,
  Timestamp,
  collection,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  onAuthStateChanged
};
