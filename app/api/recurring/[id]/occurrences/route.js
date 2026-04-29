import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

/**
 * GET /api/rules/[id]/occurrences?userId=xxx
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

    // Generate all expected occurrence dates from startDate to today
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const expectedDates = generateOccurrences(rule, new Date(rule.startDate), today);

    // Get all existing transactions for this rule
    const existingTx = await db.collection('transactions')
      .find({ $or: [{ ruleId: ruleObjectId }, { ruleId: id }], userId })
      .toArray();

    // Build a map of existing transaction dates (normalize to date string)
    const txByDate = {};
    existingTx.forEach((tx) => {
      const dateKey = new Date(tx.date).toISOString().split('T')[0];
      if (!txByDate[dateKey]) txByDate[dateKey] = [];
      txByDate[dateKey].push(tx);
    });

    // Build occurrences list
    const occurrences = expectedDates.map((date) => {
      const dateKey = date.toISOString().split('T')[0];
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
    // (e.g. if the rule was edited and dates shifted)
    const expectedKeys = new Set(expectedDates.map(d => d.toISOString().split('T')[0]));
    existingTx.forEach((tx) => {
      const dateKey = new Date(tx.date).toISOString().split('T')[0];
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
 * POST /api/rules/[id]/occurrences
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

    // Check if transaction already exists for this date
    const occDate = new Date(date);
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const existing = await db.collection('transactions').findOne({
      $or: [{ ruleId: ruleObjectId }, { ruleId: id }],
      userId,
      date: { $gte: dayStart, $lte: dayEnd },
    });

    if (existing) {
      return NextResponse.json({ error: 'Transaction already exists for this date' }, { status: 409 });
    }

    // Create the transaction
    const txDoc = {
      userId,
      accountId: rule.accountId || null,
      amount: rule.amount,
      description: rule.name,
      category: rule.category || 'Miscellaneous',
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
  let current = new Date(rule.startDate);
  current.setHours(0, 0, 0, 0);

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  while (current < start) {
    current = advanceDate(current, rule.frequency);
  }

  while (current <= endDate) {
    if (rule.endDate && current > new Date(rule.endDate)) break;
    dates.push(new Date(current));
    current = advanceDate(current, rule.frequency);
  }

  return dates;
}

function advanceDate(date, frequency) {
  const next = new Date(date);
  switch (frequency) {
    case 'daily':     next.setDate(next.getDate() + 1); break;
    case 'weekly':    next.setDate(next.getDate() + 7); break;
    case 'biweekly':  next.setDate(next.getDate() + 14); break;
    case 'monthly':   next.setMonth(next.getMonth() + 1); break;
    case 'quarterly': next.setMonth(next.getMonth() + 3); break;
    case 'yearly':    next.setFullYear(next.getFullYear() + 1); break;
    default:          next.setMonth(next.getMonth() + 1);
  }
  return next;
}
