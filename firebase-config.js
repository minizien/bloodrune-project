import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyA-SB3kOtVOK0xwEt2xjF6JJHZKPYhNURY",
  authDomain: "bloodrune-project.firebaseapp.com",
  projectId: "bloodrune-project",
  storageBucket: "bloodrune-project.firebasestorage.app",
  messagingSenderId: "394744755352",
  appId: "1:394744755352:web:0af156b7f8c888dc164ced",
  measurementId: "G-B6BX636YH3",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);