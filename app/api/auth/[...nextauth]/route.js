import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

// Config lives in lib/auth.js so API routes can call getServerSession(authOptions)
// without importing a route file.
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
