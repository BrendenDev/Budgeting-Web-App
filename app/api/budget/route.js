import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { requireUserId } from '@/lib/auth';
import {
  DEFAULT_BUDGET_SETTINGS,
  validateBudgetConfig,
  createBudgetConfigDoc,
} from '@/models/schemas';

export async function GET() {
  try {
    const { userId, error } = await requireUserId();
    if (error) return error;

    const db = await getDb();
    const doc = await db.collection('budgets').findOne({ userId });

    if (!doc) {
      return NextResponse.json(
        {
          userId,
          settings: { ...DEFAULT_BUDGET_SETTINGS },
          buckets: [],
        },
        {
          headers: { 'Cache-Control': 'private, max-age=0, stale-while-revalidate=30' },
        }
      );
    }

    return NextResponse.json(doc, {
      headers: { 'Cache-Control': 'private, max-age=0, stale-while-revalidate=30' },
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load budget configuration' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const { userId, error } = await requireUserId();
    if (error) return error;

    const data = await request.json();
    const { valid, errors } = validateBudgetConfig(data);
    if (!valid) {
      return NextResponse.json({ errors, error: errors[0] }, { status: 400 });
    }

    const db = await getDb();
    const doc = createBudgetConfigDoc(data, userId);

    await db.collection('budgets').updateOne(
      { userId },
      {
        $set: doc,
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );

    return NextResponse.json(doc);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to save budget configuration' }, { status: 500 });
  }
}
