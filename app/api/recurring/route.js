import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { requireUserId } from '@/lib/auth';
import { ownsAccount } from '@/lib/ownership';
import { validateRule, createRuleDoc } from '@/models/schemas';

export async function GET(request) {
  try {
    const { userId, error } = await requireUserId();
    if (error) return error;

    const db = await getDb();
    const rules = await db.collection('rules')
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json(rules, {
      headers: { 'Cache-Control': 'private, max-age=0, stale-while-revalidate=30' },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch rules' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { userId, error } = await requireUserId();
    if (error) return error;

    const data = await request.json();
    const { valid, errors } = validateRule(data);

    if (!valid) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const db = await getDb();

    // accountId is optional on rules, but if given it must be ours
    if (data.accountId && !(await ownsAccount(db, data.accountId, userId))) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const doc = createRuleDoc(data, userId);
    const result = await db.collection('rules').insertOne(doc);

    return NextResponse.json({ ...doc, _id: result.insertedId }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create rule' }, { status: 500 });
  }
}
