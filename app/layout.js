import './globals.css';

import { AuthProvider } from '@/lib/auth-context';
import { DialogProvider } from '@/components/ConfirmDialog';

export const metadata = {
  title: 'Budget App – Personal Finance Dashboard',
  description: 'A modern budgeting dashboard with projections, expense tracking, and financial management.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ overflowX: 'hidden' }}>
        <AuthProvider>
          <DialogProvider>
            {children}
          </DialogProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
