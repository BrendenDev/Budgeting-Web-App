import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { parseDateSafe } from '@/lib/date-utils';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const db = await getDb();
    const transaction = await db.collection('transactions').findOne({ _id: new ObjectId(id) });
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
    const { id } = await params;
    const data = await request.json();

    const db = await getDb();

    // Get old transaction to reverse balance
    const oldTx = await db.collection('transactions').findOne({ _id: new ObjectId(id) });
    if (!oldTx) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    // Reverse old balance effect
    const oldAmount = oldTx.type === 'income' ? -oldTx.amount : oldTx.amount;
    await db.collection('accounts').updateOne(
      { _id: new ObjectId(oldTx.accountId) },
      { $inc: { balance: oldAmount } }
    );

    // Update transaction
    const updateData = {
      description: data.description?.trim() || oldTx.description,
      amount: Number(data.amount) || oldTx.amount,
      category: data.category || oldTx.category,
      date: data.date ? parseDateSafe(data.date) : oldTx.date,
      type: data.type || oldTx.type,
      accountId: data.accountId || oldTx.accountId,
      notes: data.notes?.trim() ?? oldTx.notes,
      updatedAt: new Date(),
    };

    await db.collection('transactions').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    // Apply new balance effect
    const newAmount = updateData.type === 'income' ? updateData.amount : -updateData.amount;
    await db.collection('accounts').updateOne(
      { _id: new ObjectId(updateData.accountId) },
      { $inc: { balance: newAmount }, $set: { updatedAt: new Date() } }
    );

    return NextResponse.json({ message: 'Transaction updated' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const db = await getDb();

    // Get transaction to reverse balance
    const tx = await db.collection('transactions').findOne({ _id: new ObjectId(id) });
    if (!tx) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    // Reverse balance effect
    const reverseAmount = tx.type === 'income' ? -tx.amount : tx.amount;
    await db.collection('accounts').updateOne(
      { _id: new ObjectId(tx.accountId) },
      { $inc: { balance: reverseAmount }, $set: { updatedAt: new Date() } }
    );

    await db.collection('transactions').deleteOne({ _id: new ObjectId(id) });

    return NextResponse.json({ message: 'Transaction deleted' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 });
  }
}
