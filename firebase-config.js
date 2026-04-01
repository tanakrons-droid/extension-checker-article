/**
 * Firebase Configuration
 * VSQ CHECKER - Doctor Registry System
 *
 * IMPORTANT: Replace with your own Firebase project config from:
 * https://console.firebase.google.com -> Project Settings -> Your apps -> SDK setup
 */

const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Firestore REST API base URL (used instead of SDK to keep extension lightweight)
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

// Firebase Auth REST API
const AUTH_BASE = `https://identitytoolkit.googleapis.com/v1/accounts`;
