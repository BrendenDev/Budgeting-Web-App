import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

/**
 * POST /api/accounts/:id/recalculate
 * 
 * Recomputes balance from source of truth:
 *   balance = initialBalance + sum(all transactions)
 * 
 * This is a full overwrite, not an $inc.
 * Designed as a safety net against drift.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const db = await getDb();

    const account = await db.collection('accounts').findOne({ _id: new ObjectId(id) });
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    if (account.initialBalance === undefined || account.initialBalance === null) {
      return NextResponse.json({
        error: 'Account has no initialBalance. Run the backfill migration first.',
      }, { status: 400 });
    }

    // Sum all transactions for this account (handle both string and ObjectId accountId)
    const accountIdStr = account._id.toString();
    const transactions = await db.collection('transactions')
      .find({
        $or: [
          { accountId: accountIdStr },
          { accountId: account._id },
        ],
      })
      .toArray();

    // Deduplicate by _id (in case both queries match the same doc)
    const seen = new Set();
    const uniqueTx = transactions.filter(tx => {
      const key = tx._id.toString();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const transactionSum = uniqueTx.reduce((sum, tx) => {
      if (tx.type === 'income') return sum + Math.abs(tx.amount);
      return sum - Math.abs(tx.amount);
    }, 0);

    const previousBalance = account.balance;
    const correctBalance = Number((account.initialBalance + transactionSum).toFixed(2));

    // Full overwrite — not $inc
    await db.collection('accounts').updateOne(
      { _id: account._id },
      { $set: { balance: correctBalance, updatedAt: new Date() } }
    );

    return NextResponse.json({
      accountName: account.name,
      initialBalance: account.initialBalance,
      transactionCount: uniqueTx.length,
      transactionSum,
      previousBalance,
      correctBalance,
      delta: Number((correctBalance - previousBalance).toFixed(2)),
      driftDetected: previousBalance !== correctBalance,
    });
  } catch (error) {
    console.error('Recalculate error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
