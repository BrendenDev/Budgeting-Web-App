'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser } from '@/lib/auth-context';

const navItems = [
  {
    label: 'Dashboard',
    href: '/',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="11" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="2" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="11" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    label: 'Accounts',
    href: '/accounts',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="4" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M2 8H18" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M6 12H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: 'Transactions',
    href: '/transactions',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 7L8 3L12 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M8 3V13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M16 13L12 17L8 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12 17V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: 'Recurring',
    href: '/recurring',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 2V18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M6 6L10 2L14 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M3 10H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    label: 'Budgets',
    href: '/budgets',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M10 6V10L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    label: 'Import',
    href: '/import',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 3V13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M6 9L10 13L14 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M3 16H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: 'Reports',
    href: '/reports',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 17V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M7 17V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M11 17V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M15 17V5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useUser();

  return (
    <aside className="app-sidebar">
      {/* Logo */}
      <div className="sidebar-logo-area" style={{
        padding: '1.5rem',
        borderBottom: '1px solid var(--color-border-default)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, var(--color-accent-indigo), var(--color-accent-violet))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.1rem',
            boxShadow: '0 0 20px rgba(99, 102, 241, 0.3)',
          }}>
            💰
          </div>
          <div>
            <h1 className="gradient-text" style={{ fontSize: '1.1rem', fontWeight: '700' }}>
              Budget App
            </h1>
            <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
              Financial Dashboard
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav-area">
        {navItems.map((item) => {
          const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="sidebar-nav-item"
              style={{
                fontWeight: isActive ? '600' : '400',
                color: isActive ? 'var(--color-accent-indigo-light)' : 'var(--color-text-secondary)',
                background: isActive ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'rgba(99, 102, 241, 0.05)';
                  e.currentTarget.style.color = 'var(--color-text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--color-text-secondary)';
                }
              }}
            >
              {isActive && (
                <div className="sidebar-active-bar" style={{
                  position: 'absolute',
                  left: 0,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '3px',
                  height: '60%',
                  borderRadius: '0 3px 3px 0',
                  background: 'var(--color-accent-indigo)',
                }} />
              )}
              {item.icon}
              <span className="sidebar-nav-text">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Section */}
      <div className="sidebar-user-area" style={{
        padding: '1rem 1.25rem',
        borderTop: '1px solid var(--color-border-default)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          marginBottom: '0.75rem',
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--color-accent-emerald), var(--color-accent-cyan))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.85rem',
            fontWeight: '700',
            color: 'white',
          }}>
            {user?.displayName?.[0]?.toUpperCase() || 'U'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: '0.85rem',
              fontWeight: '600',
              color: 'var(--color-text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {user?.displayName || 'User'}
            </p>
            <p style={{
              fontSize: '0.7rem',
              color: 'var(--color-text-muted)',
            }}>
              @{user?.username || 'user'}
            </p>
          </div>
        </div>
        <button
          onClick={logout}
          id="logout-btn"
          style={{
            width: '100%',
            padding: '0.5rem',
            borderRadius: 'var(--radius-sm)',
            background: 'transparent',
            border: '1px solid var(--color-border-default)',
            color: 'var(--color-text-muted)',
            fontSize: '0.8rem',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-accent-rose)';
            e.currentTarget.style.color = 'var(--color-accent-rose)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border-default)';
            e.currentTarget.style.color = 'var(--color-text-muted)';
          }}
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
}
