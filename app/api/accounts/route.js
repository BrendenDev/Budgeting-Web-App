import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { requireUserId } from '@/lib/auth';
import { validateAccount, createAccountDoc } from '@/models/schemas';

export async function GET(request) {
  try {
    const { userId, error } = await requireUserId();
    if (error) return error;

    const db = await getDb();
    const accounts = await db.collection('accounts')
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json(accounts, {
      headers: { 'Cache-Control': 'private, max-age=0, stale-while-revalidate=30' },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { userId, error } = await requireUserId();
    if (error) return error;

    const data = await request.json();
    const { valid, errors } = validateAccount(data);

    if (!valid) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const db = await getDb();
    const doc = createAccountDoc(data, userId);
    const result = await db.collection('accounts').insertOne(doc);

    return NextResponse.json({ ...doc, _id: result.insertedId }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }
}
