'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '@/lib/auth-context';
import AuthGuard from '@/components/AuthGuard';
import Sidebar from '@/components/Sidebar';
import { formatCurrency, formatDate } from '@/lib/calculation-engine';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/models/schemas';

// ─── CSV Parser ──────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };

  // Parse header row
  const headers = parseLine(lines[0]);

  // Parse data rows
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    if (values.length > 0 && values.some(v => v.trim() !== '')) {
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });
      row._index = i - 1;
      rows.push(row);
    }
  }

  return { headers, rows };
}

function parseLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// ─── Smart Column Detection ─────────────────────────────────
function detectColumnMapping(headers) {
  const mapping = { date: '', description: '', amount: '', category: '', type: '' };
  const lower = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

  lower.forEach((h, i) => {
    if (!mapping.date && (h.includes('date') || h.includes('posted') || h.includes('time'))) {
      mapping.date = headers[i];
    }
    if (!mapping.description && (h.includes('description') || h.includes('desc') || h.includes('memo') ||
        h.includes('payee') || h.includes('name') || h.includes('merchant') || h.includes('detail'))) {
      mapping.description = headers[i];
    }
    if (!mapping.amount && (h.includes('amount') || h.includes('total') || h.includes('sum') ||
        h.includes('debit') || h.includes('value'))) {
      mapping.amount = headers[i];
    }
    if (!mapping.category && (h.includes('category') || h.includes('cat') || h.includes('type') || h.includes('group'))) {
      mapping.category = headers[i];
    }
  });

  return mapping;
}

// ─── Import Page ─────────────────────────────────────────────
function ImportContent() {
  const { user } = useUser();
  const fileInputRef = useRef(null);
  const [accounts, setAccounts] = useState([]);

  // Steps: upload → map → preview → done
  const [step, setStep] = useState('upload');
  const [fileName, setFileName] = useState('');
  const [csvData, setCsvData] = useState({ headers: [], rows: [] });
  const [mapping, setMapping] = useState({ date: '', description: '', amount: '', category: '', type: '' });
  const [targetAccountId, setTargetAccountId] = useState('');
  const [defaultType, setDefaultType] = useState('expense');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [excludedRows, setExcludedRows] = useState(new Set());

  const fetchAccounts = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`/api/accounts?userId=${user.id}`);
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
  }, [user?.id]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  // ─── File Handling ────────────────────────────────────────
  const handleFile = (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      alert('Please upload a CSV file');
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const data = parseCSV(text);
      setCsvData(data);

      // Auto-detect column mapping
      const detected = detectColumnMapping(data.headers);
      setMapping(detected);
      setExcludedRows(new Set());
      setStep('map');
    };
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  // ─── Build Preview Data ───────────────────────────────────
  const buildPreviewData = () => {
    return csvData.rows
      .filter((_, i) => !excludedRows.has(i))
      .map((row) => {
        const rawAmount = row[mapping.amount] || '0';
        const amount = parseFloat(rawAmount.replace(/[^0-9.\-]/g, '')) || 0;
        const description = row[mapping.description] || 'No description';
        const dateStr = row[mapping.date] || new Date().toISOString();
        const category = row[mapping.category] || 'Miscellaneous';

        // Determine type: if mapping has a type column use it, else use sign or default
        let type = defaultType;
        if (mapping.type && row[mapping.type]) {
          const raw = row[mapping.type].toLowerCase();
          if (raw.includes('income') || raw.includes('credit') || raw.includes('deposit')) {
            type = 'income';
          } else {
            type = 'expense';
          }
        } else if (amount > 0) {
          type = 'income';
        } else if (amount < 0) {
          type = 'expense';
        }

        return {
          description,
          amount: Math.abs(amount),
          date: dateStr,
          category,
          type,
          accountId: targetAccountId,
        };
      });
  };

  // ─── Import Handler ───────────────────────────────────────
  const handleImport = async () => {
    const transactions = buildPreviewData();
    if (transactions.length === 0) return;

    setImporting(true);
    try {
      const res = await fetch('/api/transactions/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions, userId: user.id }),
      });
      const result = await res.json();
      if (res.ok) {
        setImportResult({ success: true, message: result.message, count: result.insertedCount });
        setStep('done');
      } else {
        setImportResult({ success: false, message: result.error || 'Import failed' });
      }
    } catch (e) {
      setImportResult({ success: false, message: 'Network error during import' });
    }
    setImporting(false);
  };

  const toggleRowExclusion = (index) => {
    setExcludedRows(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const resetImport = () => {
    setStep('upload');
    setFileName('');
    setCsvData({ headers: [], rows: [] });
    setMapping({ date: '', description: '', amount: '', category: '', type: '' });
    setTargetAccountId('');
    setImportResult(null);
    setExcludedRows(new Set());
  };

  const previewData = step === 'preview' ? buildPreviewData() : [];

  // ─── Render ───────────────────────────────────────────────
  return (
    <div style={{ marginLeft: '260px', padding: '2rem', minHeight: '100vh', background: 'var(--color-bg-primary)' }}>
      <div className="animate-fade-in" style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.25rem' }}>Import Transactions</h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
          Upload a CSV file to bulk-import transactions into your account
        </p>
      </div>

      {/* Step Indicator */}
      <div className="animate-fade-in" style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2rem',
      }}>
        {['Upload', 'Map Columns', 'Preview', 'Done'].map((label, i) => {
          const stepNames = ['upload', 'map', 'preview', 'done'];
          const currentIdx = stepNames.indexOf(step);
          const isActive = i === currentIdx;
          const isComplete = i < currentIdx;
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.75rem', fontWeight: '700',
                background: isComplete ? 'var(--color-accent-emerald)' : isActive ? 'var(--color-accent-indigo)' : 'var(--color-bg-card)',
                color: isComplete || isActive ? 'white' : 'var(--color-text-muted)',
                border: !isComplete && !isActive ? '1px solid var(--color-border-default)' : 'none',
                transition: 'all 0.3s ease',
              }}>
                {isComplete ? '✓' : i + 1}
              </div>
              <span style={{
                fontSize: '0.8rem', fontWeight: isActive ? '600' : '400',
                color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              }}>
                {label}
              </span>
              {i < 3 && (
                <div style={{
                  width: '40px', height: '2px',
                  background: isComplete ? 'var(--color-accent-emerald)' : 'var(--color-border-default)',
                  margin: '0 0.25rem',
                  transition: 'background 0.3s ease',
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* ─── Step 1: Upload ─────────────────────────────────── */}
      {step === 'upload' && (
        <div className="glass-card animate-fade-in" style={{ padding: '3rem', textAlign: 'center' }}>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? 'var(--color-accent-indigo)' : 'var(--color-border-default)'}`,
              borderRadius: 'var(--radius-xl)',
              padding: '3rem 2rem',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              background: dragOver ? 'rgba(99, 102, 241, 0.05)' : 'transparent',
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📄</div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              Drop your CSV file here
            </h3>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              or click to browse files
            </p>
            <p style={{
              fontSize: '0.75rem', color: 'var(--color-text-muted)',
              padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)',
              background: 'var(--color-bg-input)', display: 'inline-block',
            }}>
              Supports CSV files from most banks and financial apps
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files[0])}
          />
        </div>
      )}

      {/* ─── Step 2: Map Columns ────────────────────────────── */}
      {step === 'map' && (
        <div className="animate-fade-in">
          <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <span className="badge badge-indigo">📄 {fileName}</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                {csvData.rows.length} rows · {csvData.headers.length} columns
              </span>
            </div>

            <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>Map CSV Columns</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '1.25rem' }}>
              Match your CSV columns to transaction fields. We auto-detected what we could.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {[
                { key: 'date', label: 'Date Column', required: true },
                { key: 'description', label: 'Description Column', required: true },
                { key: 'amount', label: 'Amount Column', required: true },
                { key: 'category', label: 'Category Column (optional)', required: false },
                { key: 'type', label: 'Type Column (optional)', required: false },
              ].map(({ key, label, required }) => (
                <div key={key}>
                  <label style={{
                    display: 'block', fontSize: '0.8rem', fontWeight: '600',
                    color: 'var(--color-text-secondary)', marginBottom: '0.4rem',
                  }}>
                    {label} {required && <span style={{ color: 'var(--color-accent-rose)' }}>*</span>}
                  </label>
                  <select
                    className="select-field"
                    value={mapping[key]}
                    onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })}
                  >
                    <option value="">{required ? 'Select column...' : 'None'}</option>
                    {csvData.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}

              <div>
                <label style={{
                  display: 'block', fontSize: '0.8rem', fontWeight: '600',
                  color: 'var(--color-text-secondary)', marginBottom: '0.4rem',
                }}>
                  Target Account <span style={{ color: 'var(--color-accent-rose)' }}>*</span>
                </label>
                <select
                  className="select-field"
                  value={targetAccountId}
                  onChange={(e) => setTargetAccountId(e.target.value)}
                >
                  <option value="">Select account...</option>
                  {accounts.map((a) => (
                    <option key={a._id} value={a._id}>{a.name}</option>
                  ))}
                </select>
              </div>

              {!mapping.type && (
                <div>
                  <label style={{
                    display: 'block', fontSize: '0.8rem', fontWeight: '600',
                    color: 'var(--color-text-secondary)', marginBottom: '0.4rem',
                  }}>
                    Default Transaction Type
                  </label>
                  <select
                    className="select-field"
                    value={defaultType}
                    onChange={(e) => setDefaultType(e.target.value)}
                  >
                    <option value="expense">Expense (negative amounts = expense)</option>
                    <option value="income">Income (positive amounts = income)</option>
                  </select>
                  <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '0.3rem' }}>
                    Tip: If your CSV uses negative for expenses and positive for income, type is auto-detected from the sign
                  </p>
                </div>
              )}
            </div>

            {/* Preview sample rows */}
            <div style={{ marginTop: '1.5rem' }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.75rem', color: 'var(--color-text-secondary)' }}>
                Sample Data (first 3 rows)
              </h4>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      {csvData.headers.map((h) => (
                        <th key={h} style={{
                          background: [mapping.date, mapping.description, mapping.amount, mapping.category, mapping.type].includes(h)
                            ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                        }}>
                          {h}
                          {h === mapping.date && <span style={{ color: 'var(--color-accent-indigo)', marginLeft: '0.25rem' }}>📅</span>}
                          {h === mapping.description && <span style={{ color: 'var(--color-accent-indigo)', marginLeft: '0.25rem' }}>📝</span>}
                          {h === mapping.amount && <span style={{ color: 'var(--color-accent-indigo)', marginLeft: '0.25rem' }}>💰</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.rows.slice(0, 3).map((row, i) => (
                      <tr key={i}>
                        {csvData.headers.map((h) => (
                          <td key={h} style={{
                            background: [mapping.date, mapping.description, mapping.amount, mapping.category, mapping.type].includes(h)
                              ? 'rgba(99, 102, 241, 0.04)' : 'transparent',
                          }}>
                            {row[h]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={resetImport}>Cancel</button>
            <button
              className="btn-gradient"
              disabled={!mapping.date || !mapping.description || !mapping.amount || !targetAccountId}
              onClick={() => setStep('preview')}
            >
              Preview Import →
            </button>
          </div>
        </div>
      )}

      {/* ─── Step 3: Preview ────────────────────────────────── */}
      {step === 'preview' && (
        <div className="animate-fade-in">
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="glass-card stat-card-indigo" style={{ padding: '1rem 1.25rem' }}>
              <p style={{ fontSize: '0.7rem', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Total Rows</p>
              <p style={{ fontSize: '1.3rem', fontWeight: '700', color: 'var(--color-accent-indigo-light)' }}>
                {previewData.length}
              </p>
            </div>
            <div className="glass-card stat-card-emerald" style={{ padding: '1rem 1.25rem' }}>
              <p style={{ fontSize: '0.7rem', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Total Income</p>
              <p style={{ fontSize: '1.3rem', fontWeight: '700', color: 'var(--color-accent-emerald-light)' }}>
                {formatCurrency(previewData.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0))}
              </p>
            </div>
            <div className="glass-card stat-card-rose" style={{ padding: '1rem 1.25rem' }}>
              <p style={{ fontSize: '0.7rem', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Total Expenses</p>
              <p style={{ fontSize: '1.3rem', fontWeight: '700', color: 'var(--color-accent-rose-light)' }}>
                {formatCurrency(previewData.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0))}
              </p>
            </div>
            <div className="glass-card stat-card-amber" style={{ padding: '1rem 1.25rem' }}>
              <p style={{ fontSize: '0.7rem', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Excluded</p>
              <p style={{ fontSize: '1.3rem', fontWeight: '700', color: 'var(--color-accent-amber-light)' }}>
                {excludedRows.size}
              </p>
            </div>
          </div>

          {/* Preview Table */}
          <div className="glass-card" style={{ marginBottom: '1.5rem', overflow: 'hidden' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-border-default)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '600' }}>Review Transactions</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                Uncheck rows you don&apos;t want to import
              </p>
            </div>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}></th>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Type</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {csvData.rows.map((row, i) => {
                    const excluded = excludedRows.has(i);
                    const rawAmount = row[mapping.amount] || '0';
                    const amount = parseFloat(rawAmount.replace(/[^0-9.\-]/g, '')) || 0;
                    const isIncome = amount > 0;

                    return (
                      <tr key={i} style={{ opacity: excluded ? 0.35 : 1, transition: 'opacity 0.2s ease' }}>
                        <td>
                          <input
                            type="checkbox"
                            checked={!excluded}
                            onChange={() => toggleRowExclusion(i)}
                            style={{ cursor: 'pointer', accentColor: 'var(--color-accent-indigo)' }}
                          />
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                          {row[mapping.date]}
                        </td>
                        <td style={{ fontWeight: '500' }}>
                          {row[mapping.description] || '—'}
                        </td>
                        <td>
                          <span className="badge badge-indigo" style={{ fontSize: '0.7rem' }}>
                            {row[mapping.category] || 'Miscellaneous'}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${isIncome ? 'badge-emerald' : 'badge-rose'}`} style={{ fontSize: '0.7rem' }}>
                            {isIncome ? 'income' : 'expense'}
                          </span>
                        </td>
                        <td style={{
                          textAlign: 'right', fontWeight: '600', fontFamily: 'var(--font-mono)',
                          color: isIncome ? 'var(--color-accent-emerald-light)' : 'var(--color-accent-rose-light)',
                        }}>
                          {isIncome ? '+' : '-'}{formatCurrency(Math.abs(amount))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setStep('map')}>← Back</button>
            <button
              className="btn-gradient"
              onClick={handleImport}
              disabled={importing || previewData.length === 0}
              style={{ minWidth: '160px', justifyContent: 'center' }}
            >
              {importing ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{
                    width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: 'white', borderRadius: '50%', display: 'inline-block',
                    animation: 'spin 0.6s linear infinite',
                  }} />
                  Importing...
                </span>
              ) : (
                `Import ${previewData.length} Transactions`
              )}
            </button>
          </div>

          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ─── Step 4: Done ───────────────────────────────────── */}
      {step === 'done' && importResult && (
        <div className="glass-card animate-fade-in" style={{ padding: '3rem', textAlign: 'center' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%',
            background: importResult.success ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.75rem', margin: '0 auto 1.25rem',
          }}>
            {importResult.success ? '✅' : '❌'}
          </div>
          <h2 style={{
            fontSize: '1.25rem', fontWeight: '700', marginBottom: '0.5rem',
            color: importResult.success ? 'var(--color-accent-emerald-light)' : 'var(--color-accent-rose-light)',
          }}>
            {importResult.success ? 'Import Successful!' : 'Import Failed'}
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: '2rem' }}>
            {importResult.message}
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <a href="/transactions" className="btn-secondary" style={{ textDecoration: 'none' }}>
              View Transactions
            </a>
            <button className="btn-gradient" onClick={resetImport}>
              Import Another File
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ImportPage() {
  return (
    <AuthGuard>
      <Sidebar />
      <ImportContent />
    </AuthGuard>
  );
}
