'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  User,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { AppUser } from '@/types';

interface AuthContextValue {
  user: AppUser | null;
  firebaseUser: User | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe: boolean) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(async () => {
    await signOut(auth);
    setUser(null);
    setFirebaseUser(null);
    localStorage.removeItem('dwd_session_start');
  }, []);

  // Auto-logout on session timeout
  useEffect(() => {
    const sessionStart = localStorage.getItem('dwd_session_start');
    if (!sessionStart) return;
    const elapsed = Date.now() - Number(sessionStart);
    const remaining = SESSION_TIMEOUT_MS - elapsed;
    if (remaining <= 0) {
      logout();
      return;
    }
    const timer = setTimeout(() => logout(), remaining);
    return () => clearTimeout(timer);
  }, [firebaseUser, logout]);

  useEffect(() => {
    let unsubUser: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
      // Clean up previous user doc listener
      if (unsubUser) { unsubUser(); unsubUser = null; }

      if (fbUser) {
        setFirebaseUser(fbUser);
        // Real-time listener on user doc — auto-syncs name, photoURL, role changes
        unsubUser = onSnapshot(
          doc(db, 'users', fbUser.uid),
          (snap) => {
            if (snap.exists()) {
              setUser(snap.data() as AppUser);
            } else {
              console.error('[Auth] Firestore user doc not found for UID:', fbUser.uid);
              setUser(null);
            }
            setLoading(false);
          },
          (err) => {
            console.error('[Auth] Firestore read error:', err);
            setUser(null);
            setLoading(false);
          },
        );
      } else {
        setFirebaseUser(null);
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubUser) unsubUser();
    };
  }, []);

  const login = useCallback(async (email: string, password: string, rememberMe: boolean) => {
    const persistence = rememberMe ? browserLocalPersistence : browserSessionPersistence;
    await setPersistence(auth, persistence);
    await signInWithEmailAndPassword(auth, email, password);
    localStorage.setItem('dwd_session_start', String(Date.now()));
  }, []);

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
