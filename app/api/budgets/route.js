import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { validateBudget, createBudgetDoc } from '@/models/schemas';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const db = await getDb();
    const budgets = await db.collection('budgets')
      .find({ userId })
      .sort({ category: 1 })
      .toArray();

    return NextResponse.json(budgets);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch budgets' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const data = await request.json();
    const { valid, errors } = validateBudget(data);

    if (!valid) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    if (!data.userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const db = await getDb();
    const doc = createBudgetDoc(data, data.userId);
    const result = await db.collection('budgets').insertOne(doc);

    return NextResponse.json({ ...doc, _id: result.insertedId }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create budget' }, { status: 500 });
  }
}
