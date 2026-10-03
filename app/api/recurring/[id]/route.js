import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { requireUserId } from '@/lib/auth';
import { ownsAccount } from '@/lib/ownership';
import { parseDateSafe, resolveClientToday, toDateStringMT } from '@/lib/date-utils';
import { generateOccurrenceDates } from '@/lib/recurrence';

export async function GET(request, { params }) {
  try {
    const { userId, error } = await requireUserId();
    if (error) return error;

    const { id } = await params;
    const db = await getDb();
    const rule = await db.collection('rules').findOne({ _id: new ObjectId(id), userId });

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
    const { userId, error } = await requireUserId();
    if (error) return error;

    const { id } = await params;
    const data = await request.json();

    const db = await getDb();
    const ruleObjectId = new ObjectId(id);

    // Get current rule to detect date/frequency/amount changes
    const oldRule = await db.collection('rules').findOne({ _id: ruleObjectId, userId });
    if (!oldRule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    // Normalize "no account": the edit form sends '' while the DB stores null.
    // Without this, saving a rule that has no account looked like an account
    // change and triggered a full delete-and-regenerate of its transactions.
    const normAccountId = (v) => (v ? String(v) : null);
    const accountChanged =
      data.accountId !== undefined && normAccountId(data.accountId) !== normAccountId(oldRule.accountId);

    // If pointing the rule at a different account, it must be ours.
    // Checked before anything is modified.
    if (accountChanged && data.accountId && !(await ownsAccount(db, data.accountId, userId))) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const updateData = {};
    if (data.name) updateData.name = data.name.trim();
    if (data.amount) updateData.amount = Number(data.amount);
    if (data.category) updateData.category = data.category;
    if (data.frequency) updateData.frequency = data.frequency;
    if (data.startDate) updateData.startDate = parseDateSafe(data.startDate);
    if (data.endDate !== undefined) updateData.endDate = data.endDate ? parseDateSafe(data.endDate) : null;
    if (accountChanged) updateData.accountId = data.accountId || null;
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
      accountChanged;

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
              { _id: new ObjectId(accountId), userId },
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
      { _id: ruleObjectId, userId },
      { $set: updateData }
    );

    // Step 3: If recalculation was needed, re-process the rule up to today
    if (needsRecalc && updateData.isActive !== false && oldRule.isActive !== false) {
      const updatedRule = await db.collection('rules').findOne({ _id: ruleObjectId, userId });
      // Use the browser's local date (Vercel servers run in UTC)
      const today = resolveClientToday(data.today);

      const occurrences = generateOccurrenceDates(updatedRule, parseDateSafe(updatedRule.startDate), today);

      if (occurrences.length > 0) {
        const txDocs = occurrences.map(date => ({
          userId: updatedRule.userId,
          accountId: updatedRule.accountId || null,
          amount: updatedRule.amount,
          description: updatedRule.name,
          category: updatedRule.category || 'Misc',
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
              { _id: new ObjectId(updatedRule.accountId), userId },
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
    const { userId, error } = await requireUserId();
    if (error) return error;

    const { id } = await params;
    const db = await getDb();
    const ruleObjectId = new ObjectId(id);

    // Ownership check FIRST — nothing is touched unless this rule is ours
    const rule = await db.collection('rules').findOne({ _id: ruleObjectId, userId });
    if (!rule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

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
            { _id: new ObjectId(accountId), userId },
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
    await db.collection('rules').deleteOne({ _id: ruleObjectId, userId });

    return NextResponse.json({
      message: `Rule deleted, ${transactions.length} generated transactions undone`,
      undoneCount: transactions.length,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 });
  }
}
