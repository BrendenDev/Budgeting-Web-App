// Server-side auth helpers.
//
// Every API route must derive the user from the session cookie — never from
// a userId sent by the client. The JWT is decoded locally (no DB lookup, no
// network call), so this adds ~1ms per request and no free-tier usage.

import { getServerSession } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { NextResponse } from 'next/server';

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
};

/**
 * Resolve the signed-in user's id from the session cookie.
 *
 * IMPORTANT: this must produce exactly the same value as `useUser().user.id`
 * in lib/auth-context.js (`session.user.id || session.user.email`), because
 * that is the value already stored as `userId` on every existing document.
 *
 * Usage in a route:
 *   const { userId, error } = await requireUserId();
 *   if (error) return error;
 *
 * @returns {Promise<{ userId: string, error: null } | { userId: null, error: NextResponse }>}
 */
export async function requireUserId() {
  const session = await getServerSession(authOptions);
  const userId = session?.user ? (session.user.id || session.user.email) : null;
  if (!userId) {
    return {
      userId: null,
      error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }),
    };
  }
  return { userId, error: null };
}
