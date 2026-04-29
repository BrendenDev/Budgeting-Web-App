'use client';

import { useState, useCallback, createContext, useContext } from 'react';

const DialogContext = createContext(null);

/**
 * Custom themed confirmation/alert dialog to replace browser confirm() and alert().
 * 
 * Usage:
 *   const { confirm, alert } = useDialog();
 *   const ok = await confirm('Are you sure?', { title: 'Delete Item', confirmText: 'Delete', variant: 'danger' });
 *   await alert('Done!', { title: 'Success', variant: 'success' });
 */
export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);

  const showDialog = useCallback((options) => {
    return new Promise((resolve) => {
      setDialog({ ...options, resolve });
    });
  }, []);

  const confirm = useCallback((message, options = {}) => {
    return showDialog({
      type: 'confirm',
      message,
      title: options.title || 'Confirm',
      confirmText: options.confirmText || 'Confirm',
      cancelText: options.cancelText || 'Cancel',
      variant: options.variant || 'default', // 'default' | 'danger' | 'success' | 'warning'
      details: options.details || null,
    });
  }, [showDialog]);

  const alert = useCallback((message, options = {}) => {
    return showDialog({
      type: 'alert',
      message,
      title: options.title || 'Notice',
      confirmText: options.confirmText || 'OK',
      variant: options.variant || 'default',
      details: options.details || null,
    });
  }, [showDialog]);

  const handleClose = (result) => {
    if (dialog?.resolve) dialog.resolve(result);
    setDialog(null);
  };

  const variantColors = {
    default: { accent: 'var(--color-accent-indigo)', bg: 'rgba(99, 102, 241, 0.1)', icon: 'ℹ️' },
    danger: { accent: 'var(--color-accent-rose)', bg: 'rgba(244, 63, 94, 0.1)', icon: '⚠️' },
    success: { accent: 'var(--color-accent-emerald)', bg: 'rgba(16, 185, 129, 0.1)', icon: '✅' },
    warning: { accent: 'var(--color-accent-amber)', bg: 'rgba(245, 158, 11, 0.1)', icon: '↩️' },
  };

  return (
    <DialogContext.Provider value={{ confirm, alert }}>
      {children}

      {/* Dialog Overlay */}
      {dialog && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 0.15s ease',
          }}
          onClick={() => handleClose(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-xl)',
              padding: '1.75rem',
              maxWidth: '420px',
              width: '90%',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.5)',
              animation: 'slideUp 0.2s ease',
            }}
          >
            {/* Icon + Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '10px',
                background: variantColors[dialog.variant]?.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.15rem', flexShrink: 0,
              }}>
                {variantColors[dialog.variant]?.icon}
              </div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--color-text-primary)' }}>
                {dialog.title}
              </h3>
            </div>

            {/* Message */}
            <p style={{
              color: 'var(--color-text-secondary)', fontSize: '0.9rem', lineHeight: '1.5',
              marginBottom: dialog.details ? '0.75rem' : '1.5rem',
              whiteSpace: 'pre-line',
            }}>
              {dialog.message}
            </p>

            {/* Details (bullet points) */}
            {dialog.details && (
              <div style={{
                background: 'var(--color-bg-input)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem 1rem',
                marginBottom: '1.5rem',
                border: '1px solid var(--color-border-default)',
              }}>
                {dialog.details.map((detail, i) => (
                  <p key={i} style={{
                    fontSize: '0.8rem', color: 'var(--color-text-muted)',
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    marginBottom: i < dialog.details.length - 1 ? '0.4rem' : 0,
                  }}>
                    <span style={{ color: variantColors[dialog.variant]?.accent, fontSize: '0.6rem' }}>●</span>
                    {detail}
                  </p>
                ))}
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              {dialog.type === 'confirm' && (
                <button
                  onClick={() => handleClose(false)}
                  className="btn-secondary"
                  style={{ minWidth: '80px', justifyContent: 'center' }}
                >
                  {dialog.cancelText}
                </button>
              )}
              <button
                onClick={() => handleClose(true)}
                style={{
                  padding: '0.55rem 1.25rem',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  minWidth: '80px',
                  textAlign: 'center',
                  transition: 'all 0.2s ease',
                  color: 'white',
                  background: dialog.variant === 'danger' ? 'var(--color-accent-rose)'
                    : dialog.variant === 'success' ? 'var(--color-accent-emerald)'
                    : dialog.variant === 'warning' ? 'var(--color-accent-amber)'
                    : 'var(--color-accent-indigo)',
                }}
              >
                {dialog.confirmText}
              </button>
            </div>
          </div>

          <style>{`
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes slideUp { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
          `}</style>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within DialogProvider');
  return ctx;
}
