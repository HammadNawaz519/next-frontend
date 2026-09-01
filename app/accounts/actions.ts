'use server';

import { prisma } from '@/lib/prisma';

/**
 * Validates a list of account emails or userIds against the database.
 * Returns an array of existing user IDs and emails so stale/deleted accounts
 * can be automatically purged from the device's Accounts Center.
 */
export async function validateSavedAccountsAction(accounts: { userId: string; email: string }[]) {
  if (!Array.isArray(accounts) || accounts.length === 0) {
    return { validUserIds: [], validEmails: [] };
  }

  try {
    const ids = accounts.map(a => a.userId).filter(Boolean);
    const emails = accounts.map(a => a.email?.toLowerCase().trim()).filter(Boolean);

    const existingUsers = await prisma.user.findMany({
      where: {
        OR: [
          { id: { in: ids } },
          { email: { in: emails } }
        ]
      },
      select: {
        id: true,
        email: true,
        username: true,
        image: true
      }
    });

    const validUserIds = existingUsers.map((u: { id: string }) => u.id);
    const validEmails = existingUsers.map((u: { email: string | null }) => u.email?.toLowerCase().trim()).filter(Boolean) as string[];

    return {
      validUserIds,
      validEmails,
      existingUsers
    };
  } catch (error) {
    console.error('Error validating saved accounts:', error);
    return { validUserIds: [], validEmails: [] };
  }
}
