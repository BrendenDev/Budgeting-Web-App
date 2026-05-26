import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

const TIMEZONE = 'America/Denver';

/** Get today's YYYY-MM-DD in Mountain Time */
function getTodayMT() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
}

/** Parse a date string/Date into a noon-UTC Date to avoid timezone boundary issues */
function parseDateSafe(dateInput) {
  if (!dateInput) return null;
  let str;
  if (typeof dateInput === 'string') {
    str = dateInput.split('T')[0];
  } else if (dateInput instanceof Date) {
    str = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(dateInput);
  } else {
    return null;
  }
  const [y, m, d] = str.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/** Format a Date to YYYY-MM-DD in Mountain Time */
function toDateStringMT(dateInput) {
  if (!dateInput) return '';
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(d);
}

/**
 * POST /api/recurring/process
 * Materializes all missed recurring rule occurrences into real transactions.
 */
export async function POST(request) {
  try {
    const { userId } = await request.json();
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const db = await getDb();
    const todayStr = getTodayMT();
    const today = parseDateSafe(todayStr); // noon UTC of today in MT

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
        const lastDate = parseDateSafe(tracker.lastProcessedDate);
        lastDate.setUTCDate(lastDate.getUTCDate() + 1);
        processFrom = lastDate;
      } else {
        // First time processing this rule — start from its startDate
        processFrom = parseDateSafe(rule.startDate);
      }

      if (!processFrom) {
        results.push({ rule: rule.name, created: 0, reason: 'Invalid start date' });
        continue;
      }

      // Don't process future dates
      if (processFrom > today) {
        results.push({ rule: rule.name, created: 0, reason: 'Already up to date' });
        continue;
      }

      // If rule has ended before our processing window, skip
      if (rule.endDate) {
        const ruleEnd = parseDateSafe(rule.endDate);
        if (ruleEnd && ruleEnd < processFrom) {
          results.push({ rule: rule.name, created: 0, reason: 'Rule has ended' });
          continue;
        }
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
        existingTx.map(tx => toDateStringMT(tx.date))
      );

      // Filter out dates that already have transactions
      const newOccurrences = occurrences.filter(date => {
        const dateKey = toDateStringMT(date);
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
        category: rule.category || 'Misc',
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
        from: toDateStringMT(processFrom),
        to: toDateStringMT(latestDate),
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

// GET /api/recurring/process?userId=xxx – get all occurrence trackers
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
 * Generate all occurrence dates for a rule within [startDate, endDate].
 * Uses noon-UTC dates and preserves anchor day-of-month.
 */
function generateOccurrences(rule, startDate, endDate) {
  const dates = [];
  let current = parseDateSafe(rule.startDate);
  if (!current) return dates;

  const anchorDay = current.getUTCDate();

  // Advance to the first occurrence on or after startDate
  while (current < startDate) {
    current = advanceDate(current, rule.frequency, anchorDay);
  }

  // Collect all occurrences up to endDate
  while (current <= endDate) {
    // Respect rule endDate
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
