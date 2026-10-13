'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '@/lib/auth-context';
import AuthGuard from '@/components/AuthGuard';
import Sidebar from '@/components/Sidebar';
import { formatCurrency } from '@/lib/calculation-engine';
import Link from 'next/link';
import { Page, Section, Button, Select, Field, Table, Th, Td, rowClass, Tag, Tally, TallyItem, Spinner } from '@/components/ui';

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
        const category = row[mapping.category] || 'Misc';

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
  const stepNames = ['upload', 'map', 'preview', 'done'];
  const currentIdx = stepNames.indexOf(step);
  const mappedCols = [mapping.date, mapping.description, mapping.amount, mapping.category, mapping.type];
  const colTag = { [mapping.date]: 'date', [mapping.description]: 'description', [mapping.amount]: 'amount' };

  return (
    <Page title="Import">
      {/* Step Indicator */}
      <ol className="mb-8 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {['Upload', 'Map columns', 'Preview', 'Done'].map((label, i) => {
          const isActive = i === currentIdx;
          const isComplete = i < currentIdx;
          return (
            <li key={label} className="flex items-center gap-2">
              <span className={`num text-xs ${isComplete ? 'text-accent' : isActive ? 'text-ink' : 'text-faint'}`}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className={isActive ? 'text-ink underline decoration-accent underline-offset-4' : isComplete ? 'text-muted' : 'text-faint'}>
                {label}
              </span>
              {i < 3 && <span className="mx-1 text-faint">—</span>}
            </li>
          );
        })}
      </ol>

      {/* ─── Step 1: Upload ─────────────────────────────────── */}
      {step === 'upload' && (
        <Section title="Choose a file">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={
              'cursor-pointer rounded-sm border border-dashed px-6 py-14 text-center transition-colors ' +
              (dragOver ? 'border-accent bg-accent/5' : 'border-rule-strong hover:border-muted')
            }
          >
            <p className="mb-1 text-ink">Drop a CSV file here</p>
            <p className="mb-4 text-sm text-muted">or click to browse</p>
            <p className="text-xs text-faint">Works with CSV exports from most banks and finance apps</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files[0])}
          />
        </Section>
      )}

      {/* ─── Step 2: Map Columns ────────────────────────────── */}
      {step === 'map' && (
        <>
          <Section
            title="Map columns"
            aside={<span><span className="text-ink">{fileName}</span> · {csvData.rows.length} rows · {csvData.headers.length} columns</span>}
            className="mb-6"
          >
            <p className="mb-5 text-sm text-muted">
              Match your CSV columns to transaction fields. Detected columns are pre-filled.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { key: 'date', label: 'Date column', required: true },
                { key: 'description', label: 'Description column', required: true },
                { key: 'amount', label: 'Amount column', required: true },
                { key: 'category', label: 'Category column (optional)', required: false },
                { key: 'type', label: 'Type column (optional)', required: false },
              ].map(({ key, label, required }) => (
                <Field key={key} label={<>{label} {required && <span className="text-debit">*</span>}</>}>
                  <Select
                    value={mapping[key]}
                    onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })}
                  >
                    <option value="">{required ? 'Select column…' : 'None'}</option>
                    {csvData.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </Select>
                </Field>
              ))}

              <Field label={<>Target account <span className="text-debit">*</span></>}>
                <Select
                  value={targetAccountId}
                  onChange={(e) => setTargetAccountId(e.target.value)}
                >
                  <option value="">Select account…</option>
                  {accounts.map((a) => (
                    <option key={a._id} value={a._id}>{a.name}</option>
                  ))}
                </Select>
              </Field>

              {!mapping.type && (
                <Field
                  label="Default transaction type"
                  hint="If your CSV uses negative numbers for expenses and positive for income, the type is detected from the sign."
                >
                  <Select
                    value={defaultType}
                    onChange={(e) => setDefaultType(e.target.value)}
                  >
                    <option value="expense">Expense (negative amounts = expense)</option>
                    <option value="income">Income (positive amounts = income)</option>
                  </Select>
                </Field>
              )}
            </div>

            {/* Preview sample rows */}
            <h4 className="mb-2 mt-8 text-xs text-muted">Sample data (first 3 rows)</h4>
            <Table>
              <thead>
                <tr>
                  {csvData.headers.map((h) => (
                    <Th key={h} className={mappedCols.includes(h) ? 'text-ink' : ''}>
                      {h}
                      {colTag[h] && <span className="ml-1.5 text-accent">· {colTag[h]}</span>}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csvData.rows.slice(0, 3).map((row, i) => (
                  <tr key={i}>
                    {csvData.headers.map((h) => (
                      <Td key={h} className={`whitespace-nowrap text-xs ${mappedCols.includes(h) ? 'text-ink' : 'text-faint'}`}>
                        {row[h]}
                      </Td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Table>
          </Section>

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={resetImport}>Cancel</Button>
            <Button
              disabled={!mapping.date || !mapping.description || !mapping.amount || !targetAccountId}
              onClick={() => setStep('preview')}
            >
              Preview import
            </Button>
          </div>
        </>
      )}

      {/* ─── Step 3: Preview ────────────────────────────────── */}
      {step === 'preview' && (
        <>
          <Tally className="mb-8">
            <TallyItem label="Rows" value={previewData.length} />
            <TallyItem
              label="Income"
              valueClassName="text-accent"
              value={formatCurrency(previewData.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0))}
            />
            <TallyItem
              label="Expenses"
              valueClassName="text-debit"
              value={formatCurrency(previewData.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0))}
            />
            <TallyItem label="Excluded" valueClassName={excludedRows.size > 0 ? 'text-warn' : 'text-ink'} value={excludedRows.size} />
          </Tally>

          <Section title="Review entries" aside={<span>Uncheck rows you don&apos;t want to import</span>} className="mb-6" bodyClassName="py-0">
            <div className="max-h-[400px] overflow-y-auto">
              <Table>
                <thead className="sticky top-0 bg-bg">
                  <tr>
                    <Th className="w-8"><span className="sr-only">Include</span></Th>
                    <Th>Date</Th>
                    <Th>Description</Th>
                    <Th className="hidden sm:table-cell">Category</Th>
                    <Th className="hidden sm:table-cell">Type</Th>
                    <Th align="right">Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {csvData.rows.map((row, i) => {
                    const excluded = excludedRows.has(i);
                    const rawAmount = row[mapping.amount] || '0';
                    const amount = parseFloat(rawAmount.replace(/[^0-9.\-]/g, '')) || 0;
                    const isIncome = amount > 0;

                    return (
                      <tr key={i} className={`${rowClass} ${excluded ? 'opacity-35' : ''}`}>
                        <Td>
                          <input
                            type="checkbox"
                            checked={!excluded}
                            onChange={() => toggleRowExclusion(i)}
                            className="h-3.5 w-3.5 cursor-pointer accent-[var(--color-accent)]"
                          />
                        </Td>
                        <Td className="num whitespace-nowrap text-xs text-muted">{row[mapping.date]}</Td>
                        <Td className="text-ink">{row[mapping.description] || '—'}</Td>
                        <Td className="hidden sm:table-cell"><Tag>{row[mapping.category] || 'Misc'}</Tag></Td>
                        <Td className="hidden sm:table-cell">
                          <Tag tone={isIncome ? 'accent' : 'debit'}>{isIncome ? 'income' : 'expense'}</Tag>
                        </Td>
                        <Td align="right">
                          <span className={`num ${isIncome ? 'text-accent' : 'text-debit'}`}>
                            {isIncome ? '+' : '-'}{formatCurrency(Math.abs(amount))}
                          </span>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          </Section>

          {importResult && !importResult.success && (
            <p className="mb-4 text-right text-sm text-debit" role="alert">{importResult.message}</p>
          )}

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setStep('map')}>Back</Button>
            <Button
              onClick={handleImport}
              disabled={importing || previewData.length === 0}
              className="min-w-40"
            >
              {importing ? (
                <><Spinner /> Importing…</>
              ) : (
                `Import ${previewData.length} transactions`
              )}
            </Button>
          </div>
        </>
      )}

      {/* ─── Step 4: Done ───────────────────────────────────── */}
      {step === 'done' && importResult && (
        <Section title={importResult.success ? 'Import complete' : 'Import failed'}>
          <p className={`mb-8 text-sm ${importResult.success ? 'text-muted' : 'text-debit'}`}>
            {importResult.message}
          </p>
          <div className="flex gap-3">
            <Link
              href="/transactions"
              className="inline-flex items-center rounded-sm border border-rule-strong px-4 py-2 text-sm text-ink transition-colors hover:bg-surface-2"
            >
              View transactions
            </Link>
            <Button onClick={resetImport}>Import another file</Button>
          </div>
        </Section>
      )}
    </Page>
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
