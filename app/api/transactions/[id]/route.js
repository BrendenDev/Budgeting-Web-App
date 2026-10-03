import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { requireUserId } from '@/lib/auth';
import { ownsAccount } from '@/lib/ownership';
import { parseDateSafe } from '@/lib/date-utils';

export async function GET(request, { params }) {
  try {
    const { userId, error } = await requireUserId();
    if (error) return error;

    const { id } = await params;
    const db = await getDb();
    const transaction = await db.collection('transactions').findOne({ _id: new ObjectId(id), userId });
    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    return NextResponse.json(transaction);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch transaction' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { userId, error } = await requireUserId();
    if (error) return error;

    const { id } = await params;
    const data = await request.json();

    const db = await getDb();

    // Get old transaction to reverse balance
    const oldTx = await db.collection('transactions').findOne({ _id: new ObjectId(id), userId });
    if (!oldTx) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    // If moving to a different account, make sure it's ours — checked before
    // any balance is touched, so a rejected request changes nothing.
    const newAccountId = data.accountId || oldTx.accountId;
    if (String(newAccountId) !== String(oldTx.accountId) && !(await ownsAccount(db, newAccountId, userId))) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Reverse old balance effect
    const oldAmount = oldTx.type === 'income' ? -oldTx.amount : oldTx.amount;
    await db.collection('accounts').updateOne(
      { _id: new ObjectId(oldTx.accountId), userId },
      { $inc: { balance: oldAmount } }
    );

    // Update transaction
    const updateData = {
      description: data.description?.trim() || oldTx.description,
      amount: Number(data.amount) || oldTx.amount,
      category: data.category || oldTx.category,
      date: data.date ? parseDateSafe(data.date) : oldTx.date,
      type: data.type || oldTx.type,
      accountId: newAccountId,
      notes: data.notes?.trim() ?? oldTx.notes,
      updatedAt: new Date(),
    };

    await db.collection('transactions').updateOne(
      { _id: new ObjectId(id), userId },
      { $set: updateData }
    );

    // Apply new balance effect
    const newAmount = updateData.type === 'income' ? updateData.amount : -updateData.amount;
    await db.collection('accounts').updateOne(
      { _id: new ObjectId(updateData.accountId), userId },
      { $inc: { balance: newAmount }, $set: { updatedAt: new Date() } }
    );

    return NextResponse.json({ message: 'Transaction updated' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { userId, error } = await requireUserId();
    if (error) return error;

    const { id } = await params;
    const db = await getDb();

    // Get transaction to reverse balance
    const tx = await db.collection('transactions').findOne({ _id: new ObjectId(id), userId });
    if (!tx) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    // Reverse balance effect
    const reverseAmount = tx.type === 'income' ? -tx.amount : tx.amount;
    await db.collection('accounts').updateOne(
      { _id: new ObjectId(tx.accountId), userId },
      { $inc: { balance: reverseAmount }, $set: { updatedAt: new Date() } }
    );

    await db.collection('transactions').deleteOne({ _id: new ObjectId(id), userId });

    return NextResponse.json({ message: 'Transaction deleted' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 });
  }
}
