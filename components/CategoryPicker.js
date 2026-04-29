'use client';

import { useState, useRef, useEffect } from 'react';

/**
 * Searchable category dropdown.
 * Type to filter, click or arrow-key+Enter to select.
 * 
 * Props:
 *   categories: string[]
 *   value: string
 *   onChange: (value: string) => void
 *   style?: object
 *   placeholder?: string
 */
export default function CategoryPicker({ categories, value, onChange, style = {}, placeholder = 'Category' }) {
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

  return (
    <div ref={wrapRef} style={{ position: 'relative', ...style }}>
      {/* Display button / search input */}
      <div
        onClick={() => { setOpen(!open); setHighlighted(0); setTimeout(() => inputRef.current?.focus(), 0); }}
        className="input-field"
        style={{
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: '0.85rem', padding: '0.55rem 0.75rem', minHeight: '36px',
          userSelect: 'none',
        }}
      >
        {open ? (
          <input
            ref={inputRef}
            value={search}
            onChange={e => { setSearch(e.target.value); setHighlighted(0); }}
            onKeyDown={handleKeyDown}
            placeholder={value || placeholder}
            onClick={e => e.stopPropagation()}
            style={{
              background: 'transparent', border: 'none', outline: 'none', color: 'inherit',
              fontSize: 'inherit', fontFamily: 'inherit', width: '100%', padding: 0,
            }}
          />
        ) : (
          <span style={{ color: value ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
            {value || placeholder}
          </span>
        )}
        <span style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)', marginLeft: '0.5rem', flexShrink: 0 }}>
          {open ? '▲' : '▼'}
        </span>
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          marginTop: '4px', borderRadius: 'var(--radius-md)',
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border-default)',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.4)',
          maxHeight: '200px', overflowY: 'auto',
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '0.6rem 0.75rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              No matches
            </div>
          ) : (
            filtered.map((cat, i) => (
              <div
                key={cat}
                onClick={() => select(cat)}
                onMouseEnter={() => setHighlighted(i)}
                style={{
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                  background: i === highlighted
                    ? 'rgba(99, 102, 241, 0.15)'
                    : cat === value
                      ? 'rgba(99, 102, 241, 0.06)'
                      : 'transparent',
                  color: cat === value ? 'var(--color-accent-indigo-light)' : 'var(--color-text-primary)',
                  fontWeight: cat === value ? '600' : '400',
                }}
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
