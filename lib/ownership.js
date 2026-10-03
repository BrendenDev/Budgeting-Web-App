// Ownership helpers for API routes.

import { ObjectId } from 'mongodb';

/**
 * Return true if accountId is a valid id for an account owned by userId.
 * Used before any write that references an account (and $inc's its balance),
 * so a request can never touch another user's balance.
 */
export async function ownsAccount(db, accountId, userId) {
  if (!accountId) return false;
  const idStr = accountId.toString();
  if (!ObjectId.isValid(idStr)) return false;
  const count = await db.collection('accounts').countDocuments(
    { _id: new ObjectId(idStr), userId },
    { limit: 1 }
  );
  return count > 0;
}
