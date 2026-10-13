import './globals.css';
import { DM_Sans, DM_Mono, Fraunces } from 'next/font/google';

import { AuthProvider } from '@/lib/auth-context';
import { DialogProvider } from '@/components/ConfirmDialog';

// Self-hosted via next/font: no runtime Google request, no layout shift.
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans', display: 'swap' });
const dmMono = DM_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-dm-mono', display: 'swap' });
const fraunces = Fraunces({ subsets: ['latin'], axes: ['SOFT', 'opsz'], variable: '--font-fraunces', display: 'swap' });

export const metadata = {
  title: 'Budget App',
  description: 'Personal budgeting: accounts, transactions, recurring items and projections.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#16171a',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${dmMono.variable} ${fraunces.variable}`}>
      <body className="bg-bg text-ink font-sans antialiased">
        <AuthProvider>
          <DialogProvider>
            {children}
          </DialogProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
