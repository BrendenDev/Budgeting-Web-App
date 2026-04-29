import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { validateTransaction, createTransactionDoc } from '@/models/schemas';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const accountId = searchParams.get('accountId');
    const category = searchParams.get('category');
    const type = searchParams.get('type');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '100');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const filter = { userId };
    if (accountId) filter.accountId = accountId;
    if (category) filter.category = category;
    if (type) filter.type = type;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const db = await getDb();
    const transactions = await db.collection('transactions')
      .find(filter)
      .sort({ date: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json(transactions);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const data = await request.json();
    const { valid, errors } = validateTransaction(data);

    if (!valid) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    if (!data.userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const db = await getDb();
    const doc = createTransactionDoc(data, data.userId);
    const result = await db.collection('transactions').insertOne(doc);

    // Update account balance
    const amount = doc.type === 'income' ? doc.amount : -doc.amount;
    await db.collection('accounts').updateOne(
      { _id: new (await import('mongodb')).ObjectId(doc.accountId) },
      { $inc: { balance: amount }, $set: { updatedAt: new Date() } }
    );

    return NextResponse.json({ ...doc, _id: result.insertedId }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 });
  }
}
