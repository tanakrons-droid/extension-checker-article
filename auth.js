/**
 * Firebase Auth Module - VSQ Checker
 * Handles Email/Password Login using Firebase Identity REST API
 */

const AUTH_STORAGE_KEY = 'vsq_auth_token';
const USER_STORAGE_KEY = 'vsq_user_info';

/**
 * Sign in with email + password via Firebase Auth REST API
 */
async function signInWithEmail(email, password) {
  const url = `${AUTH_BASE}:signInWithPassword?key=${FIREBASE_CONFIG.apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Login failed');
  return data; // { idToken, email, displayName, expiresIn, ... }
}

/**
 * Sign up new account
 */
async function signUpWithEmail(email, password) {
  const url = `${AUTH_BASE}:signUp?key=${FIREBASE_CONFIG.apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Sign up failed');
  return data;
}

/**
 * Save auth session to chrome.storage.local
 */
async function saveAuthSession(authData) {
  const expiresAt = Date.now() + parseInt(authData.expiresIn) * 1000;
  await chrome.storage.local.set({
    [AUTH_STORAGE_KEY]: authData.idToken,
    [USER_STORAGE_KEY]: {
      email: authData.email,
      displayName: authData.displayName || authData.email.split('@')[0],
      expiresAt
    }
  });
}

/**
 * Get current session from storage
 */
async function getCurrentUser() {
  const data = await chrome.storage.local.get([AUTH_STORAGE_KEY, USER_STORAGE_KEY]);
  const token = data[AUTH_STORAGE_KEY];
  const user = data[USER_STORAGE_KEY];
  if (!token || !user) return null;
  if (Date.now() > user.expiresAt) {
    await signOut();
    return null;
  }
  return { token, ...user };
}

/**
 * Sign out - clear storage
 */
async function signOut() {
  await chrome.storage.local.remove([AUTH_STORAGE_KEY, USER_STORAGE_KEY]);
}

/**
 * Get current ID token (for API calls)
 */
async function getIdToken() {
  const data = await chrome.storage.local.get([AUTH_STORAGE_KEY]);
  return data[AUTH_STORAGE_KEY] || null;
}
