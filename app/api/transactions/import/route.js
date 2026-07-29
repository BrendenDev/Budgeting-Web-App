import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { parseDateSafe } from '@/lib/date-utils';

export async function POST(request) {
  try {
    const { transactions, userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return NextResponse.json({ error: 'transactions array is required and must not be empty' }, { status: 400 });
    }

    // Validate and sanitize each transaction
    const docs = transactions.map((tx) => ({
      userId,
      accountId: tx.accountId || null,
      amount: Number(tx.amount) || 0,
      description: (tx.description || '').trim(),
      category: tx.category || 'Miscellaneous',
      date: parseDateSafe(tx.date),
      type: tx.type || (Number(tx.amount) >= 0 ? 'income' : 'expense'),
      isRecurring: false,
      ruleId: null,
      notes: 'Imported from CSV',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const db = await getDb();

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

    const { ObjectId } = await import('mongodb');
    for (const [accountId, delta] of Object.entries(balanceUpdates)) {
      try {
        await db.collection('accounts').updateOne(
          { _id: new ObjectId(accountId) },
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
