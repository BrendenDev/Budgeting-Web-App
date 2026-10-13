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

  // Variant only tints the top rule and the confirm button — no icons.
  const variantStyles = {
    default: { rule: 'border-t-rule-strong', button: 'bg-accent border-accent hover:bg-accent/85' },
    danger: { rule: 'border-t-debit', button: 'bg-debit border-debit hover:bg-debit/85' },
    success: { rule: 'border-t-accent', button: 'bg-accent border-accent hover:bg-accent/85' },
    warning: { rule: 'border-t-warn', button: 'bg-warn border-warn hover:bg-warn/85' },
  };
  const v = variantStyles[dialog?.variant] || variantStyles.default;

  return (
    <DialogContext.Provider value={{ confirm, alert }}>
      {children}

      {/* Dialog Overlay */}
      {dialog && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
          onClick={() => handleClose(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-md border border-rule border-t-[3px] bg-surface px-6 pb-5 pt-4 ${v.rule}`}
          >
            <h3 className="mb-3 border-b border-rule pb-3 font-title text-lg text-ink">
              {dialog.title}
            </h3>

            <p className={`whitespace-pre-line text-sm leading-relaxed text-muted ${dialog.details ? 'mb-3' : 'mb-6'}`}>
              {dialog.message}
            </p>

            {/* Details */}
            {dialog.details && (
              <ul className="mb-6 border-y border-rule py-2 text-[13px] text-muted">
                {dialog.details.map((detail, i) => (
                  <li key={i} className="py-0.5 pl-3 -indent-3">
                    <span className="text-faint">– </span>{detail}
                  </li>
                ))}
              </ul>
            )}

            {/* Buttons */}
            <div className="flex justify-end gap-3">
              {dialog.type === 'confirm' && (
                <button
                  onClick={() => handleClose(false)}
                  className="min-w-20 cursor-pointer rounded-sm border border-rule-strong px-4 py-2 text-sm text-ink transition-colors hover:bg-surface-2"
                >
                  {dialog.cancelText}
                </button>
              )}
              <button
                onClick={() => handleClose(true)}
                autoFocus
                className={`min-w-20 cursor-pointer rounded-sm border px-4 py-2 text-sm font-medium text-bg transition-colors ${v.button}`}
              >
                {dialog.confirmText}
              </button>
            </div>
          </div>
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
