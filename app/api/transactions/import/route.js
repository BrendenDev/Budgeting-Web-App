import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { requireUserId } from '@/lib/auth';
import { ownsAccount } from '@/lib/ownership';
import { parseDateSafe } from '@/lib/date-utils';

export async function POST(request) {
  try {
    const { userId, error } = await requireUserId();
    if (error) return error;

    const { transactions } = await request.json();

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return NextResponse.json({ error: 'transactions array is required and must not be empty' }, { status: 400 });
    }

    const db = await getDb();

    // Verify every referenced account belongs to this user before inserting
    // anything — a rejected import changes nothing.
    const accountIds = [...new Set(transactions.map(tx => tx.accountId).filter(Boolean).map(String))];
    for (const accountId of accountIds) {
      if (!(await ownsAccount(db, accountId, userId))) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
      }
    }

    // Validate and sanitize each transaction
    const docs = transactions.map((tx) => ({
      userId,
      accountId: tx.accountId || null,
      amount: Number(tx.amount) || 0,
      description: (tx.description || '').trim(),
      category: tx.category || 'Misc',
      date: parseDateSafe(tx.date),
      type: tx.type || (Number(tx.amount) >= 0 ? 'income' : 'expense'),
      isRecurring: false,
      ruleId: null,
      notes: 'Imported from CSV',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    // Insert all transactions
    const result = await db.collection('transactions').insertMany(docs);

    // Update account balances if accountId is set
    const balanceUpdates = {};
    docs.forEach((doc) => {
      if (doc.accountId) {
        const delta = doc.type === 'income' ? doc.amount : -Math.abs(doc.amount);
        balanceUpdates[doc.accountId] = (balanceUpdates[doc.accountId] || 0) + delta;
      }
    });

    for (const [accountId, delta] of Object.entries(balanceUpdates)) {
      try {
        await db.collection('accounts').updateOne(
          { _id: new ObjectId(accountId), userId },
          { $inc: { balance: delta }, $set: { updatedAt: new Date() } }
        );
      } catch (e) {
        // Skip if accountId is invalid
      }
    }

    return NextResponse.json({
      message: `Successfully imported ${result.insertedCount} transactions`,
      insertedCount: result.insertedCount,
    }, { status: 201 });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ error: 'Failed to import transactions' }, { status: 500 });
  }
}
