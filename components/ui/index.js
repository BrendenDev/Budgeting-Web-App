'use client';

/**
 * In-house UI kit — "Ledger, after dark".
 * Tailwind classes only; colours come from the @theme tokens in globals.css.
 * No runtime styling, no JS hover handlers.
 */

const cx = (...c) => c.filter(Boolean).join(' ');
export { cx };

/* ── Page shell ───────────────────────────────────────────────── */
export function Page({ title, actions, children, className }) {
  return (
    <main className={cx('min-h-screen md:ml-48 px-4 pt-6 pb-24 md:px-10 md:pt-10 md:pb-12', className)}>
      <div className="mx-auto max-w-6xl">
        {(title || actions) && (
          <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
            {title && <h1 className="font-title text-3xl text-ink">{title}</h1>}
            {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
          </header>
        )}
        {children}
      </div>
    </main>
  );
}

/* ── Section: the ruled ledger block ──────────────────────────── */
export function Section({ title, aside, children, className, bodyClassName }) {
  return (
    <section className={cx('rule-double border-b border-rule', className)}>
      {(title || aside) && (
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule py-3">
          {title && <h2 className="font-title text-lg text-ink">{title}</h2>}
          {aside && <div className="flex flex-wrap items-center gap-3 text-sm text-muted">{aside}</div>}
        </div>
      )}
      <div className={cx('py-4', bodyClassName)}>{children}</div>
    </section>
  );
}

/* ── Buttons ──────────────────────────────────────────────────── */
const buttonVariants = {
  primary: 'bg-accent text-bg hover:bg-accent/85 border border-accent',
  secondary: 'bg-transparent text-ink border border-rule-strong hover:bg-surface-2',
  danger: 'bg-debit text-bg hover:bg-debit/85 border border-debit',
};

export function Button({ variant = 'primary', className, type = 'button', ...props }) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-sm px-4 py-2 text-sm font-medium',
        'transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
        buttonVariants[variant],
        className
      )}
      {...props}
    />
  );
}

const textTones = {
  muted: 'text-muted hover:text-ink',
  accent: 'text-accent hover:text-ink',
  debit: 'text-muted hover:text-debit',
  warn: 'text-muted hover:text-warn',
};

/** Quiet text action: `edit`, `delete`, `recheck`… */
export function TextButton({ tone = 'muted', className, type = 'button', ...props }) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center gap-1 bg-transparent p-0 text-sm underline-offset-4 hover:underline',
        'transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
        textTones[tone],
        className
      )}
      {...props}
    />
  );
}

/* ── Form controls ────────────────────────────────────────────── */
const controlBase =
  'w-full rounded-sm border border-rule bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-faint ' +
  'transition-colors hover:border-rule-strong focus:border-accent focus:outline-none disabled:opacity-50';

export const inputClass = controlBase;

export function Input({ className, ...props }) {
  return <input className={cx(controlBase, className)} {...props} />;
}

export function Select({ className, children, ...props }) {
  return (
    <select className={cx(controlBase, 'cursor-pointer pr-8', className)} {...props}>
      {children}
    </select>
  );
}

/** Underline-only input used by the ledger-line Quick Add. */
export const lineInputClass =
  'w-full border-0 border-b border-rule bg-transparent px-0 py-1.5 text-sm text-ink placeholder:text-faint ' +
  'focus:border-accent focus:outline-none';

export function Field({ label, hint, children, className }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="mb-1.5 block text-xs text-muted">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

/* ── Table ────────────────────────────────────────────────────── */
export function Table({ children, className }) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className={cx('w-full border-collapse text-sm', className)}>{children}</table>
    </div>
  );
}

export function Th({ align = 'left', className, children, ...props }) {
  return (
    <th
      className={cx(
        'border-b border-rule px-2 py-2 text-xs font-normal text-muted whitespace-nowrap',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        className
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function Td({ align = 'left', className, children, ...props }) {
  return (
    <td
      className={cx(
        'border-b border-rule px-2 py-2.5 align-middle',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        className
      )}
      {...props}
    >
      {children}
    </td>
  );
}

export const rowClass = 'transition-colors hover:bg-surface-2';

/* ── Money ────────────────────────────────────────────────────── */
/** Right-aligned mono amount: clay for expenses, sage for income. */
export function Amount({ value, type, signed = true, className, format }) {
  const isIncome = type ? type === 'income' : value >= 0;
  const abs = Math.abs(Number(value) || 0);
  const text = format
    ? format(abs)
    : abs.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  return (
    <span className={cx('num whitespace-nowrap', isIncome ? 'text-accent' : 'text-debit', className)}>
      {signed ? (isIncome ? '+' : '−') : ''}
      {text}
    </span>
  );
}

/* ── Tag ──────────────────────────────────────────────────────── */
const tagTones = {
  muted: 'border-rule-strong text-muted',
  accent: 'border-accent/50 text-accent',
  debit: 'border-debit/50 text-debit',
  warn: 'border-warn/50 text-warn',
};

export function Tag({ tone = 'muted', className, children, ...props }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-sm border px-1.5 py-px text-[11px] leading-4 whitespace-nowrap',
        tagTones[tone],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/* ── Tally strip ──────────────────────────────────────────────── */
export function Tally({ children, className }) {
  return (
    <div
      className={cx(
        'rule-double grid grid-cols-2 border-b border-rule md:grid-cols-4',
        '[&>*]:border-rule [&>*:nth-child(odd)]:border-r md:[&>*]:border-r md:[&>*:last-child]:border-r-0',
        '[&>*:nth-child(-n+2)]:border-b md:[&>*:nth-child(-n+2)]:border-b-0',
        className
      )}
    >
      {children}
    </div>
  );
}

export function TallyItem({ label, value, detail, valueClassName }) {
  return (
    <div className="min-w-0 px-4 py-4 md:px-5">
      <div className="text-xs text-muted">{label}</div>
      <div className={cx('num mt-1 truncate text-xl md:text-2xl', valueClassName || 'text-ink')}>{value}</div>
      <div className="mt-1.5 min-h-5 text-xs text-muted">{detail}</div>
    </div>
  );
}

/* ── Misc ─────────────────────────────────────────────────────── */
export function Empty({ children }) {
  return <p className="py-6 text-center text-sm text-faint">{children}</p>;
}

export function Skeleton({ className }) {
  return <div className={cx('rounded-sm bg-surface-2', className)} />;
}

export function Spinner({ className }) {
  return (
    <span
      aria-hidden
      className={cx(
        'inline-block h-3 w-3 rounded-full border-[1.5px] border-current border-t-transparent animate-spin',
        className
      )}
    />
  );
}
