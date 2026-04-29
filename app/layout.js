import './globals.css';

import { AuthProvider } from '@/lib/auth-context';
import { DialogProvider } from '@/components/ConfirmDialog';

export const metadata = {
  title: 'Budget App – Personal Finance Dashboard',
  description: 'A modern budgeting dashboard with projections, expense tracking, and financial management.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <DialogProvider>
            {children}
          </DialogProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
