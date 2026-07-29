import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { getTodayMT, parseDateSafe, toDateStringMT } from '@/lib/date-utils';

/**
 * GET /api/recurring/[id]/occurrences?userId=xxx
 * Returns all expected occurrences from startDate to today,
 * with status indicating whether each has a live transaction.
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

    const db = await getDb();
    const ruleObjectId = new ObjectId(id);

    const rule = await db.collection('rules').findOne({ _id: ruleObjectId });
    if (!rule) return NextResponse.json({ error: 'Rule not found' }, { status: 404 });

    // Generate all expected occurrence dates from startDate to today (MT)
    const today = parseDateSafe(getTodayMT());
    const expectedDates = generateOccurrences(rule, parseDateSafe(rule.startDate), today);

    // Get all existing transactions for this rule
    const existingTx = await db.collection('transactions')
      .find({ $or: [{ ruleId: ruleObjectId }, { ruleId: id }], userId })
      .toArray();

    // Build a map of existing transaction dates (normalize to MT date string)
    const txByDate = {};
    existingTx.forEach((tx) => {
      const dateKey = toDateStringMT(tx.date);
      if (!txByDate[dateKey]) txByDate[dateKey] = [];
      txByDate[dateKey].push(tx);
    });

    // Build occurrences list
    const occurrences = expectedDates.map((date) => {
      const dateKey = toDateStringMT(date);
      const matchingTx = txByDate[dateKey] || [];

      return {
        date: dateKey,
        expected: true,
        active: matchingTx.length > 0,
        transactionId: matchingTx[0]?._id || null,
        amount: matchingTx[0]?.amount ?? rule.amount,
        description: matchingTx[0]?.description ?? rule.name,
      };
    });

    // Also find any "orphan" transactions that exist but don't match expected dates
    const expectedKeys = new Set(expectedDates.map(d => toDateStringMT(d)));
    existingTx.forEach((tx) => {
      const dateKey = toDateStringMT(tx.date);
      if (!expectedKeys.has(dateKey)) {
        occurrences.push({
          date: dateKey,
          expected: false,
          active: true,
          transactionId: tx._id,
          amount: tx.amount,
          description: tx.description,
          orphan: true,
        });
      }
    });

    // Sort by date descending (most recent first)
    occurrences.sort((a, b) => b.date.localeCompare(a.date));

    // Get tracker info
    const tracker = await db.collection('rule_occurrences').findOne({
      $or: [{ ruleId: ruleObjectId }, { ruleId: id }],
      userId,
    });

    return NextResponse.json({
      rule: {
        _id: rule._id,
        name: rule.name,
        amount: rule.amount,
        type: rule.type,
        frequency: rule.frequency,
        category: rule.category,
        startDate: rule.startDate,
        endDate: rule.endDate,
        accountId: rule.accountId,
        isActive: rule.isActive,
      },
      occurrences,
      tracker: tracker ? {
        totalOccurrences: tracker.totalOccurrences,
        lastProcessedDate: tracker.lastProcessedDate,
      } : null,
      summary: {
        total: occurrences.length,
        active: occurrences.filter(o => o.active).length,
        missing: occurrences.filter(o => !o.active && o.expected).length,
      },
    });
  } catch (error) {
    console.error('Occurrences GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch occurrences' }, { status: 500 });
  }
}

/**
 * POST /api/recurring/[id]/occurrences
 * Reinstate a specific occurrence by creating the transaction.
 * Body: { date: "YYYY-MM-DD", userId: string }
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const { date, userId } = await request.json();

    if (!date || !userId) {
      return NextResponse.json({ error: 'date and userId are required' }, { status: 400 });
    }

    const db = await getDb();
    const ruleObjectId = new ObjectId(id);

    const rule = await db.collection('rules').findOne({ _id: ruleObjectId });
    if (!rule) return NextResponse.json({ error: 'Rule not found' }, { status: 404 });

    // Use noon-UTC for the occurrence date
    const occDate = parseDateSafe(date);

    // Check if transaction already exists for this date (compare by MT date string)
    const existing = await db.collection('transactions').findOne({
      $or: [{ ruleId: ruleObjectId }, { ruleId: id }],
      userId,
    });

    // Filter matches by MT date string instead of date range queries
    const existingTxForDate = existing ? await db.collection('transactions')
      .find({ $or: [{ ruleId: ruleObjectId }, { ruleId: id }], userId })
      .toArray() : [];

    const alreadyExists = existingTxForDate.some(tx => toDateStringMT(tx.date) === date);

    if (alreadyExists) {
      return NextResponse.json({ error: 'Transaction already exists for this date' }, { status: 409 });
    }

    // Create the transaction
    const txDoc = {
      userId,
      accountId: rule.accountId || null,
      amount: rule.amount,
      description: rule.name,
      category: rule.category || 'Misc',
      date: occDate,
      type: rule.type,
      isRecurring: true,
      ruleId: ruleObjectId,
      notes: `Reinstated occurrence for ${date}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection('transactions').insertOne(txDoc);

    // Update account balance
    if (rule.accountId) {
      const delta = rule.type === 'income' ? rule.amount : -Math.abs(rule.amount);
      try {
        await db.collection('accounts').updateOne(
          { _id: new ObjectId(rule.accountId) },
          { $inc: { balance: delta }, $set: { updatedAt: new Date() } }
        );
      } catch (e) { /* skip */ }
    }

    // Update tracker count
    await db.collection('rule_occurrences').updateOne(
      { $or: [{ ruleId: ruleObjectId }, { ruleId: id }], userId },
      {
        $inc: { totalOccurrences: 1 },
        $set: { updatedAt: new Date(), lastRunAt: new Date() },
      }
    );

    return NextResponse.json({
      message: `Reinstated occurrence for ${date}`,
      transaction: txDoc,
    }, { status: 201 });
  } catch (error) {
    console.error('Reinstate error:', error);
    return NextResponse.json({ error: 'Failed to reinstate occurrence' }, { status: 500 });
  }
}

// ─── Helpers ────────────────────────────────────

function generateOccurrences(rule, startDate, endDate) {
  const dates = [];
  let current = parseDateSafe(rule.startDate);
  if (!current || !startDate || !endDate) return dates;

  const anchorDay = current.getUTCDate();

  while (current < startDate) {
    current = advanceDate(current, rule.frequency, anchorDay);
  }

  while (current <= endDate) {
    if (rule.endDate) {
      const ruleEnd = parseDateSafe(rule.endDate);
      if (ruleEnd && current > ruleEnd) break;
    }
    dates.push(new Date(current));
    current = advanceDate(current, rule.frequency, anchorDay);
  }

  return dates;
}

function advanceDate(date, frequency, anchorDay) {
  const next = new Date(date);
  switch (frequency) {
    case 'daily':     next.setUTCDate(next.getUTCDate() + 1); break;
    case 'weekly':    next.setUTCDate(next.getUTCDate() + 7); break;
    case 'biweekly':  next.setUTCDate(next.getUTCDate() + 14); break;
    case 'monthly': {
      next.setUTCMonth(next.getUTCMonth() + 1);
      if (anchorDay) {
        const maxDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
        next.setUTCDate(Math.min(anchorDay, maxDay));
      }
      break;
    }
    case 'quarterly': {
      next.setUTCMonth(next.getUTCMonth() + 3);
      if (anchorDay) {
        const maxDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
        next.setUTCDate(Math.min(anchorDay, maxDay));
      }
      break;
    }
    case 'yearly':    next.setUTCFullYear(next.getUTCFullYear() + 1); break;
    default:          next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next;
}
