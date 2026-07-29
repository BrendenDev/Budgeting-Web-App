import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { parseDateSafe, getTodayMT, toDateStringMT } from '@/lib/date-utils';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const db = await getDb();
    const rule = await db.collection('rules').findOne({ _id: new ObjectId(id) });

    if (!rule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    return NextResponse.json(rule);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch rule' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const data = await request.json();

    const db = await getDb();
    const ruleObjectId = new ObjectId(id);

    // Get current rule to detect date/frequency/amount changes
    const oldRule = await db.collection('rules').findOne({ _id: ruleObjectId });
    if (!oldRule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    const updateData = {};
    if (data.name) updateData.name = data.name.trim();
    if (data.amount) updateData.amount = Number(data.amount);
    if (data.category) updateData.category = data.category;
    if (data.frequency) updateData.frequency = data.frequency;
    if (data.startDate) updateData.startDate = parseDateSafe(data.startDate);
    if (data.endDate !== undefined) updateData.endDate = data.endDate ? parseDateSafe(data.endDate) : null;
    if (data.accountId !== undefined) updateData.accountId = data.accountId;
    if (data.type) updateData.type = data.type;
    if (data.description !== undefined) updateData.description = data.description?.trim() || '';
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    updateData.updatedAt = new Date();

    // Detect if dates, frequency, amount, or type changed — requires recalculation
    const oldStartStr = toDateStringMT(oldRule.startDate);
    const newStartStr = data.startDate ? toDateStringMT(parseDateSafe(data.startDate)) : oldStartStr;
    const oldEndStr = oldRule.endDate ? toDateStringMT(oldRule.endDate) : '';
    const newEndStr = data.endDate !== undefined ? (data.endDate ? toDateStringMT(parseDateSafe(data.endDate)) : '') : oldEndStr;

    const needsRecalc =
      (newStartStr !== oldStartStr) ||
      (newEndStr !== oldEndStr) ||
      (data.frequency && data.frequency !== oldRule.frequency) ||
      (data.amount && Number(data.amount) !== oldRule.amount) ||
      (data.type && data.type !== oldRule.type) ||
      (data.accountId !== undefined && data.accountId !== oldRule.accountId);

    if (needsRecalc) {
      // Step 1: Undo all existing materialized transactions for this rule
      const existingTx = await db.collection('transactions')
        .find({ $or: [{ ruleId: ruleObjectId }, { ruleId: id }] })
        .toArray();

      if (existingTx.length > 0) {
        // Reverse account balances
        const reversals = {};
        existingTx.forEach((tx) => {
          if (tx.accountId) {
            const key = tx.accountId.toString();
            const reversal = tx.type === 'income' ? -Math.abs(tx.amount) : Math.abs(tx.amount);
            reversals[key] = (reversals[key] || 0) + reversal;
          }
        });

        for (const [accountId, delta] of Object.entries(reversals)) {
          try {
            await db.collection('accounts').updateOne(
              { _id: new ObjectId(accountId) },
              { $inc: { balance: delta }, $set: { updatedAt: new Date() } }
            );
          } catch (e) { /* skip invalid */ }
        }

        // Delete the old transactions
        await db.collection('transactions').deleteMany({ $or: [{ ruleId: ruleObjectId }, { ruleId: id }] });
      }

      // Step 2: Reset occurrence tracker
      await db.collection('rule_occurrences').deleteMany({ $or: [{ ruleId: ruleObjectId }, { ruleId: id }] });
    }

    // Update the rule
    await db.collection('rules').updateOne(
      { _id: ruleObjectId },
      { $set: updateData }
    );

    // Step 3: If recalculation was needed, re-process the rule up to today
    if (needsRecalc && updateData.isActive !== false && oldRule.isActive !== false) {
      const updatedRule = await db.collection('rules').findOne({ _id: ruleObjectId });
      const today = parseDateSafe(getTodayMT());

      const occurrences = generateOccurrences(updatedRule, parseDateSafe(updatedRule.startDate), today);

      if (occurrences.length > 0) {
        const txDocs = occurrences.map(date => ({
          userId: updatedRule.userId,
          accountId: updatedRule.accountId || null,
          amount: updatedRule.amount,
          description: updatedRule.name,
          category: updatedRule.category || 'Miscellaneous',
          date: date,
          type: updatedRule.type,
          isRecurring: true,
          ruleId: ruleObjectId,
          notes: `Auto-generated from recurring rule: ${updatedRule.name}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));

        await db.collection('transactions').insertMany(txDocs);

        // Update account balance
        if (updatedRule.accountId) {
          const perDelta = updatedRule.type === 'income' ? updatedRule.amount : -Math.abs(updatedRule.amount);
          const totalDelta = perDelta * occurrences.length;
          try {
            await db.collection('accounts').updateOne(
              { _id: new ObjectId(updatedRule.accountId) },
              { $inc: { balance: totalDelta }, $set: { updatedAt: new Date() } }
            );
          } catch (e) { /* skip */ }
        }

        // Create new tracker
        const latestDate = occurrences.reduce((max, d) => d > max ? d : max, occurrences[0]);
        await db.collection('rule_occurrences').insertOne({
          userId: updatedRule.userId,
          ruleId: ruleObjectId,
          ruleName: updatedRule.name,
          lastProcessedDate: latestDate,
          lastRunAt: new Date(),
          totalOccurrences: occurrences.length,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    return NextResponse.json({
      message: needsRecalc ? 'Rule updated and recalculated' : 'Rule updated',
      recalculated: needsRecalc,
    });
  } catch (error) {
    console.error('Rule PUT error:', error);
    return NextResponse.json({ error: 'Failed to update rule' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const db = await getDb();
    const ruleObjectId = new ObjectId(id);

    // First, undo all materialized transactions
    const transactions = await db.collection('transactions')
      .find({ $or: [{ ruleId: ruleObjectId }, { ruleId: id }] })
      .toArray();

    if (transactions.length > 0) {
      // Reverse account balances
      const reversals = {};
      transactions.forEach((tx) => {
        if (tx.accountId) {
          const key = tx.accountId.toString();
          const reversal = tx.type === 'income' ? -Math.abs(tx.amount) : Math.abs(tx.amount);
          reversals[key] = (reversals[key] || 0) + reversal;
        }
      });

      for (const [accountId, delta] of Object.entries(reversals)) {
        try {
          await db.collection('accounts').updateOne(
            { _id: new ObjectId(accountId) },
            { $inc: { balance: delta }, $set: { updatedAt: new Date() } }
          );
        } catch (e) { /* skip */ }
      }

      // Delete generated transactions
      await db.collection('transactions').deleteMany({ $or: [{ ruleId: ruleObjectId }, { ruleId: id }] });
    }

    // Delete tracker
    await db.collection('rule_occurrences').deleteMany({ $or: [{ ruleId: ruleObjectId }, { ruleId: id }] });

    // Delete the rule
    const result = await db.collection('rules').deleteOne({ _id: ruleObjectId });
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    return NextResponse.json({
      message: `Rule deleted, ${transactions.length} generated transactions undone`,
      undoneCount: transactions.length,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 });
  }
}

// ─── Helpers ────────────────────────────────────────────────
// Uses the same noon-UTC pattern as the process route to ensure consistency.

function generateOccurrences(rule, startDate, endDate) {
  const dates = [];
  let current = parseDateSafe(rule.startDate);
  if (!current) return dates;

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
