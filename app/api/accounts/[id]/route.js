import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { validateAccount } from '@/models/schemas';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const db = await getDb();
    const account = await db.collection('accounts').findOne({ _id: new ObjectId(id) });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json(account);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch account' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const data = await request.json();
    const { valid, errors } = validateAccount(data);

    if (!valid) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const db = await getDb();
    const result = await db.collection('accounts').updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          name: data.name.trim(),
          type: data.type,
          balance: Number(data.balance),
          institution: data.institution?.trim() || '',
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Account updated' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update account' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const db = await getDb();
    const result = await db.collection('accounts').deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Account deleted' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
