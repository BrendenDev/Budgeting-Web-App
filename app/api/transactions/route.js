import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { validateTransaction, createTransactionDoc } from '@/models/schemas';
import { parseDateSafe } from '@/lib/date-utils';

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
      // Use parseDateSafe to create noon-UTC dates. For $gte, start of day;
      // for $lte, end of day — but since all DB dates are at noon UTC,
      // noon-to-noon comparisons work correctly.
      if (startDate) filter.date.$gte = parseDateSafe(startDate);
      if (endDate) {
        // Add 12 hours to make $lte inclusive of the end date at noon
        const end = parseDateSafe(endDate);
        if (end) {
          end.setUTCHours(23, 59, 59, 999);
          filter.date.$lte = end;
        }
      }
    }

    const db = await getDb();
    const transactions = await db.collection('transactions')
      .find(filter)
      .sort({ date: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json(transactions, {
      headers: { 'Cache-Control': 'private, max-age=0, stale-while-revalidate=30' },
    });
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
      { _id: new ObjectId(doc.accountId) },
      { $inc: { balance: amount }, $set: { updatedAt: new Date() } }
    );

    return NextResponse.json({ ...doc, _id: result.insertedId }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 });
  }
}
