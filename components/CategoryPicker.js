'use client';

import { useState, useRef, useEffect } from 'react';
import { inputClass, lineInputClass } from '@/components/ui';

/**
 * Searchable category dropdown.
 * Type to filter, click or arrow-key+Enter to select.
 * 
 * Props:
 *   categories: string[]
 *   value: string
 *   onChange: (value: string) => void
 *   style?: object
 *   className?: string
 *   placeholder?: string
 *   variant?: 'box' | 'line'   ('line' = underline input used in the ledger-line Quick Add)
 */
export default function CategoryPicker({ categories, value, onChange, style = {}, className = '', placeholder = 'Category', variant = 'box' }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const filtered = search
    ? categories.filter(c => c.toLowerCase().includes(search.toLowerCase()))
    : categories;

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (cat) => {
    onChange(cat);
    setOpen(false);
    setSearch('');
  };

  const handleKeyDown = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted(h => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlighted]) select(filtered[highlighted]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setSearch('');
    }
  };

  const triggerBase = variant === 'line' ? lineInputClass : inputClass;

  return (
    <div ref={wrapRef} className={`relative ${className}`} style={style}>
      {/* Display button / search input */}
      <div
        onClick={() => { setOpen(!open); setHighlighted(0); setTimeout(() => inputRef.current?.focus(), 0); }}
        className={`${triggerBase} flex min-h-9 cursor-pointer select-none items-center justify-between`}
      >
        {open ? (
          <input
            ref={inputRef}
            value={search}
            onChange={e => { setSearch(e.target.value); setHighlighted(0); }}
            onKeyDown={handleKeyDown}
            placeholder={value || placeholder}
            onClick={e => e.stopPropagation()}
            className="w-full border-0 bg-transparent p-0 text-inherit placeholder:text-faint focus:outline-none"
          />
        ) : (
          <span className={`truncate ${value ? 'text-ink' : 'text-faint'}`}>
            {value || placeholder}
          </span>
        )}
        <span className="ml-2 shrink-0 text-[10px] text-faint">{open ? '▴' : '▾'}</span>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 max-h-52 overflow-y-auto rounded-sm border border-rule-strong bg-surface shadow-lg shadow-black/40">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-[13px] text-faint">No matches</div>
          ) : (
            filtered.map((cat, i) => (
              <div
                key={cat}
                onClick={() => select(cat)}
                onMouseEnter={() => setHighlighted(i)}
                className={
                  'cursor-pointer px-3 py-1.5 text-[13px] ' +
                  (i === highlighted ? 'bg-surface-2 ' : '') +
                  (cat === value ? 'text-accent' : 'text-ink')
                }
              >
                {cat}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
