'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser } from '@/lib/auth-context';

const navItems = [
  { label: 'Overview', href: '/' },
  { label: 'Accounts', href: '/accounts' },
  { label: 'Transactions', href: '/transactions' },
  { label: 'Recurring', href: '/recurring' },
  { label: 'Import', href: '/import' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useUser();

  return (
    <aside
      className={
        'fixed z-40 bg-bg border-rule ' +
        // phone: slim bottom bar
        'inset-x-0 bottom-0 h-14 border-t ' +
        // desktop: narrow left rail
        'md:inset-x-auto md:left-0 md:top-0 md:h-screen md:w-48 md:border-t-0 md:border-r md:flex md:flex-col'
      }
    >
      {/* App name */}
      <div className="hidden md:block px-6 pt-8 pb-8">
        <span className="font-title text-xl text-ink">Budget App</span>
      </div>

      {/* Navigation */}
      <nav className="flex h-full items-stretch justify-around md:h-auto md:flex-1 md:flex-col md:justify-start md:gap-1 md:px-6">
        {navItems.map((item) => {
          const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={
                'group flex items-center justify-center px-1 text-[13px] transition-colors md:justify-start md:py-1.5 md:text-sm ' +
                (isActive ? 'text-ink' : 'text-muted hover:text-ink')
              }
            >
              <span
                className={
                  'border-b-[1.5px] pb-0.5 ' + (isActive ? 'border-accent' : 'border-transparent')
                }
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="hidden md:block border-t border-rule px-6 py-5">
        <p className="truncate text-sm text-ink">{user?.displayName || 'User'}</p>
        <p className="truncate text-xs text-faint">@{user?.username || 'user'}</p>
        <button
          onClick={logout}
          id="logout-btn"
          className="mt-3 cursor-pointer text-xs text-muted underline-offset-4 transition-colors hover:text-debit hover:underline"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
