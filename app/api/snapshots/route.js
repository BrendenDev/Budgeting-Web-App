import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

// GET /api/snapshots?userId=xxx – list all snapshots
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

    const db = await getDb();
    const snapshots = await db.collection('snapshots')
      .find({ userId })
      .sort({ year: -1, month: -1 })
      .toArray();

    return NextResponse.json(snapshots);
  } catch (error) {
    console.error('Snapshots GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch snapshots' }, { status: 500 });
  }
}

// POST /api/snapshots – generate snapshot for a given month/year
export async function POST(request) {
  try {
    const { userId, month, year } = await request.json();
    if (!userId || month === undefined || !year) {
      return NextResponse.json({ error: 'userId, month, and year are required' }, { status: 400 });
    }

    const db = await getDb();

    // Check if snapshot already exists for this month
    const existing = await db.collection('snapshots').findOne({ userId, month, year });
    if (existing) {
      // Update existing snapshot
      const snapshot = await generateSnapshot(db, userId, month, year);
      await db.collection('snapshots').updateOne(
        { _id: existing._id },
        { $set: { ...snapshot, updatedAt: new Date() } }
      );
      const updated = await db.collection('snapshots').findOne({ _id: existing._id });
      return NextResponse.json(updated);
    }

    // Generate new snapshot
    const snapshot = await generateSnapshot(db, userId, month, year);
    const result = await db.collection('snapshots').insertOne(snapshot);
    const created = await db.collection('snapshots').findOne({ _id: result.insertedId });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Snapshot POST error:', error);
    return NextResponse.json({ error: 'Failed to generate snapshot' }, { status: 500 });
  }
}

async function generateSnapshot(db, userId, month, year) {
  // Use UTC boundaries to match noon-UTC dates in the DB
  const startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

  // Fetch transactions for the month
  const transactions = await db.collection('transactions')
    .find({
      userId,
      date: { $gte: startDate, $lte: endDate },
    })
    .toArray();

  // Calculate totals
  const income = transactions
    .filter(tx => tx.type === 'income')
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const expenses = transactions
    .filter(tx => tx.type === 'expense')
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  // Category breakdown
  const categoryMap = {};
  transactions.filter(tx => tx.type === 'expense').forEach(tx => {
    const cat = tx.category || 'Miscellaneous';
    categoryMap[cat] = (categoryMap[cat] || 0) + Math.abs(tx.amount);
  });

  const categoryBreakdown = Object.entries(categoryMap)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  // Income category breakdown
  const incomeCategoryMap = {};
  transactions.filter(tx => tx.type === 'income').forEach(tx => {
    const cat = tx.category || 'Other';
    incomeCategoryMap[cat] = (incomeCategoryMap[cat] || 0) + Math.abs(tx.amount);
  });

  const incomeBreakdown = Object.entries(incomeCategoryMap)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  // Get account balances at the time
  const accounts = await db.collection('accounts').find({ userId }).toArray();
  const totalBalance = accounts.reduce((sum, a) => sum + (a.balance || 0), 0);

  return {
    userId,
    month,
    year,
    totalIncome: income,
    totalExpenses: expenses,
    netSavings: income - expenses,
    totalBalance,
    transactionCount: transactions.length,
    categoryBreakdown,
    incomeBreakdown,
    accountCount: accounts.length,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
