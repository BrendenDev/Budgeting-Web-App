import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { requireUserId } from '@/lib/auth';
import { validateAccount } from '@/models/schemas';

// Transactions/rules may store accountId as a string (normal) or ObjectId (legacy).
function accountIdMatch(account) {
  return { $in: [account._id.toString(), account._id] };
}

/**
 * GET /api/accounts/:id
 * Optional ?withCounts=1 adds { transactionCount, ruleCount } — used by the
 * delete confirmation dialog so the user sees exactly what will be removed.
 */
export async function GET(request, { params }) {
  try {
    const { userId, error } = await requireUserId();
    if (error) return error;

    const { id } = await params;
    const db = await getDb();
    const account = await db.collection('accounts').findOne({ _id: new ObjectId(id), userId });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    if (searchParams.get('withCounts') === '1') {
      const match = accountIdMatch(account);
      const [transactionCount, ruleCount] = await Promise.all([
        db.collection('transactions').countDocuments({ userId, accountId: match }),
        db.collection('rules').countDocuments({ userId, accountId: match }),
      ]);
      return NextResponse.json({ ...account, transactionCount, ruleCount });
    }

    return NextResponse.json(account);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch account' }, { status: 500 });
  }
}

/**
 * PUT /api/accounts/:id
 *
 * Balance edits are applied as a delta: newBalance - originalBalance, where
 * originalBalance is the value the edit form was opened with. This means:
 *   - Saving the form without touching the balance never changes it (even if
 *     the form was showing a slightly stale cached balance).
 *   - The same delta is applied to initialBalance, so a manual correction
 *     survives the next Recalculate instead of being reverted.
 */
export async function PUT(request, { params }) {
  try {
    const { userId, error } = await requireUserId();
    if (error) return error;

    const { id } = await params;
    const data = await request.json();
    const { valid, errors } = validateAccount(data);

    if (!valid) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const db = await getDb();
    const account = await db.collection('accounts').findOne({ _id: new ObjectId(id), userId });
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const update = {
      $set: {
        name: data.name.trim(),
        type: data.type,
        institution: data.institution?.trim() || '',
        updatedAt: new Date(),
      },
    };

    // Only touch the balance if the client tells us what it started from.
    // (An old open tab without this field can rename, but not move money.)
    if (data.originalBalance !== undefined && data.originalBalance !== null && !isNaN(Number(data.originalBalance))) {
      const delta = Number((Number(data.balance) - Number(data.originalBalance)).toFixed(2));
      if (delta !== 0) {
        update.$inc = { balance: delta };
        // Keep the recalculate invariant intact. Never create initialBalance
        // from nothing — only shift it if it already exists.
        if (typeof account.initialBalance === 'number') {
          update.$inc.initialBalance = delta;
        }
      }
    }

    await db.collection('accounts').updateOne({ _id: account._id, userId }, update);

    return NextResponse.json({ message: 'Account updated' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update account' }, { status: 500 });
  }
}

/**
 * DELETE /api/accounts/:id
 * Cascades: removes the account's transactions, its recurring rules, and those
 * rules' occurrence trackers. The account document is deleted LAST, so if the
 * request fails partway the account is still visible and the delete can simply
 * be retried.
 */
export async function DELETE(request, { params }) {
  try {
    const { userId, error } = await requireUserId();
    if (error) return error;

    const { id } = await params;
    const db = await getDb();
    const account = await db.collection('accounts').findOne({ _id: new ObjectId(id), userId });
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const match = accountIdMatch(account);

    // 1. Rules attached to this account (+ their trackers)
    const rules = await db.collection('rules')
      .find({ userId, accountId: match })
      .project({ _id: 1 })
      .toArray();
    const ruleIds = rules.flatMap(r => [r._id, r._id.toString()]);

    if (ruleIds.length > 0) {
      await db.collection('rule_occurrences').deleteMany({ userId, ruleId: { $in: ruleIds } });
    }
    const rulesResult = await db.collection('rules').deleteMany({ userId, accountId: match });

    // 2. Transactions on this account
    const txResult = await db.collection('transactions').deleteMany({ userId, accountId: match });

    // 3. The account itself (last)
    await db.collection('accounts').deleteOne({ _id: account._id, userId });

    return NextResponse.json({
      message: 'Account deleted',
      deletedTransactions: txResult.deletedCount,
      deletedRules: rulesResult.deletedCount,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
