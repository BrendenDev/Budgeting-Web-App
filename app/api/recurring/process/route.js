import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

/**
 * POST /api/rules/process
 * Materializes all missed recurring rule occurrences into real transactions.
 * 
 * Body: { userId: string }
 * 
 * For each active rule, this endpoint:
 * 1. Looks up the rule_occurrences tracker for that rule
 * 2. Calculates all occurrences between lastProcessedDate and today
 * 3. Creates real transaction documents for each missed occurrence
 * 4. Updates account balances
 * 5. Updates the tracker with new counts and dates
 */
export async function POST(request) {
  try {
    const { userId } = await request.json();
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const db = await getDb();
    const today = new Date();
    today.setHours(23, 59, 59, 999); // Process up to end of today

    // Get all active rules for this user
    const rules = await db.collection('rules')
      .find({ userId, isActive: { $ne: false } })
      .toArray();

    if (rules.length === 0) {
      return NextResponse.json({ message: 'No active rules to process', processed: 0 });
    }

    // Get all existing trackers for this user
    const trackers = await db.collection('rule_occurrences')
      .find({ userId })
      .toArray();

    const trackerMap = {};
    trackers.forEach(t => { trackerMap[t.ruleId.toString()] = t; });

    let totalCreated = 0;
    const balanceUpdates = {}; // accountId -> delta
    const results = [];

    for (const rule of rules) {
      const ruleId = rule._id.toString();
      const tracker = trackerMap[ruleId];

      // Determine where to start processing from
      let processFrom;
      if (tracker && tracker.lastProcessedDate) {
        // Start from the day after last processed
        processFrom = new Date(tracker.lastProcessedDate);
        processFrom.setDate(processFrom.getDate() + 1);
        processFrom.setHours(0, 0, 0, 0);
      } else {
        // First time processing this rule — start from its startDate
        processFrom = new Date(rule.startDate);
        processFrom.setHours(0, 0, 0, 0);
      }

      // Don't process future dates
      if (processFrom > today) {
        results.push({ rule: rule.name, created: 0, reason: 'Already up to date' });
        continue;
      }

      // If rule has ended before our processing window, skip
      if (rule.endDate && new Date(rule.endDate) < processFrom) {
        results.push({ rule: rule.name, created: 0, reason: 'Rule has ended' });
        continue;
      }

      // Generate all occurrences in the window [processFrom, today]
      const occurrences = generateOccurrences(rule, processFrom, today);

      if (occurrences.length === 0) {
        results.push({ rule: rule.name, created: 0, reason: 'No occurrences in window' });
        continue;
      }

      // DEDUP: Check which dates already have transactions for this rule
      const existingTx = await db.collection('transactions')
        .find({
          $or: [{ ruleId: rule._id }, { ruleId: ruleId }],
          userId,
        })
        .project({ date: 1 })
        .toArray();

      const existingDateKeys = new Set(
        existingTx.map(tx => new Date(tx.date).toISOString().split('T')[0])
      );

      // Filter out dates that already have transactions
      const newOccurrences = occurrences.filter(date => {
        const dateKey = date.toISOString().split('T')[0];
        return !existingDateKeys.has(dateKey);
      });

      if (newOccurrences.length === 0) {
        results.push({ rule: rule.name, created: 0, reason: 'All occurrences already exist' });
        // Still update the tracker lastProcessedDate
        const latestDate = occurrences.reduce((max, d) => d > max ? d : max, occurrences[0]);
        await db.collection('rule_occurrences').updateOne(
          { userId, ruleId: rule._id },
          {
            $set: { lastProcessedDate: latestDate, lastRunAt: new Date(), updatedAt: new Date() },
            $setOnInsert: { userId, ruleId: rule._id, ruleName: rule.name, totalOccurrences: 0, createdAt: new Date() },
          },
          { upsert: true }
        );
        continue;
      }

      // Create transaction documents only for new dates
      const txDocs = newOccurrences.map(date => ({
        userId,
        accountId: rule.accountId || null,
        amount: rule.amount,
        description: rule.name,
        category: rule.category || 'Miscellaneous',
        date: date,
        type: rule.type,
        isRecurring: true,
        ruleId: rule._id,
        notes: `Auto-generated from recurring rule: ${rule.name}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      // Insert transactions
      const insertResult = await db.collection('transactions').insertMany(txDocs);
      totalCreated += insertResult.insertedCount;

      // Accumulate balance updates — only for newly created transactions
      if (rule.accountId) {
        const perOccurrenceDelta = rule.type === 'income' ? rule.amount : -Math.abs(rule.amount);
        const totalDelta = perOccurrenceDelta * newOccurrences.length;
        balanceUpdates[rule.accountId] = (balanceUpdates[rule.accountId] || 0) + totalDelta;
      }

      // Find the latest occurrence date for this batch
      const latestDate = occurrences.reduce((max, d) => d > max ? d : max, occurrences[0]);

      // Upsert the tracker
      const prevCount = tracker ? tracker.totalOccurrences : 0;
      await db.collection('rule_occurrences').updateOne(
        { userId, ruleId: rule._id },
        {
          $set: {
            ruleName: rule.name,
            lastProcessedDate: latestDate,
            lastRunAt: new Date(),
            totalOccurrences: prevCount + newOccurrences.length,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            userId,
            ruleId: rule._id,
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );

      results.push({
        rule: rule.name,
        created: newOccurrences.length,
        skippedDuplicates: occurrences.length - newOccurrences.length,
        from: processFrom.toISOString().split('T')[0],
        to: latestDate.toISOString().split('T')[0],
        totalOccurrences: prevCount + newOccurrences.length,
      });
    }

    // Apply all balance updates
    const { ObjectId } = await import('mongodb');
    for (const [accountId, delta] of Object.entries(balanceUpdates)) {
      try {
        await db.collection('accounts').updateOne(
          { _id: new ObjectId(accountId) },
          { $inc: { balance: delta }, $set: { updatedAt: new Date() } }
        );
      } catch (e) {
        // Skip invalid accountIds
      }
    }

    return NextResponse.json({
      message: `Processed ${rules.length} rules, created ${totalCreated} transactions`,
      totalCreated,
      rulesProcessed: rules.length,
      details: results,
    });
  } catch (error) {
    console.error('Rule processing error:', error);
    return NextResponse.json({ error: 'Failed to process rules' }, { status: 500 });
  }
}

// GET /api/rules/process?userId=xxx – get all occurrence trackers
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

    const db = await getDb();
    const trackers = await db.collection('rule_occurrences')
      .find({ userId })
      .sort({ lastProcessedDate: -1 })
      .toArray();

    return NextResponse.json(trackers);
  } catch (error) {
    console.error('Trackers GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch trackers' }, { status: 500 });
  }
}

/**
 * Generate all occurrence dates for a rule within [startDate, endDate]
 */
function generateOccurrences(rule, startDate, endDate) {
  const dates = [];
  let current = new Date(rule.startDate);
  current.setHours(0, 0, 0, 0);

  // Advance to the first occurrence on or after startDate
  while (current < startDate) {
    current = advanceDate(current, rule.frequency);
  }

  // Collect all occurrences up to endDate
  while (current <= endDate) {
    // Respect rule endDate
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
