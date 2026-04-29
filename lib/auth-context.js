'use client';

import { SessionProvider, useSession, signIn, signOut } from 'next-auth/react';
import { createContext, useContext } from 'react';

// We wrap SessionProvider so that app/layout.js doesn't need to change imports
export function AuthProvider({ children }) {
  return <SessionProvider>{children}</SessionProvider>;
}

// We provide a backwards-compatible useUser hook that wraps NextAuth's useSession
export function useUser() {
  const { data: session, status } = useSession();

  const loading = status === 'loading';
  
  // Format the user object to match the previous shape: { id, displayName, ... }
  const user = session?.user ? {
    ...session.user,
    id: session.user.id || session.user.email, // fallback if id not in token
    displayName: session.user.name || session.user.email,
  } : null;

  const login = () => signIn('google', { callbackUrl: '/' });
  const logout = () => signOut();
  
  const register = () => signIn('google'); // Registration is same as login in OAuth

  return { user, loading, login, logout, register };
}
