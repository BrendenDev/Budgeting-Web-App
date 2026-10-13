'use client';

export default function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center md:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full overflow-y-auto border-t-[3px] border-double border-rule-strong bg-surface px-5 pb-6 pt-4 md:max-w-lg md:border md:border-t-[3px] md:border-rule md:border-t-rule-strong md:px-6"
      >
        <div className="mb-5 flex items-baseline justify-between gap-4 border-b border-rule pb-3">
          <h2 className="font-title text-xl text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer text-sm text-muted transition-colors hover:text-ink"
          >
            close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
