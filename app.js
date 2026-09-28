import { initializeApp, getApps, getApp } 
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import { getFirestore } 
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { getAuth } 
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCj4F_8WOwLzVoREs-gRZDXfgYEkLtNvig",
  authDomain: "ruzgarguluqr.firebaseapp.com",
  projectId: "ruzgarguluqr"
};

const app = !getApps().length 
  ? initializeApp(firebaseConfig) 
  : getApp();

const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
