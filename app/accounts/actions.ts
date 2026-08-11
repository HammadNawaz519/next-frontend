'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

export async function getAccountsCenterOverview() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error('Unauthorized');

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: {
      profileSync: true,
      securitySetting: true,
      activeSessions: { orderBy: { lastActiveAt: 'desc' } },
      searchHistories: { orderBy: { searchedAt: 'desc' }, take: 10 },
      offPlatformLogs: { orderBy: { eventTimestamp: 'desc' }, take: 10 },
      dataExports: { orderBy: { requestedAt: 'desc' }, take: 5 },
      adPreference: true,
      paymentTokens: { orderBy: { createdAt: 'desc' } },
      vaultAddresses: { orderBy: { isDefault: 'desc' } },
    },
  });

  if (!user) throw new Error('User not found');

  // Initialize defaults if null
  if (!user.profileSync) {
    await prisma.profileSyncSetting.create({
      data: { userId: user.id, syncPolicy: 'FULL_SYNC', syncName: true, syncBio: true, syncAvatar: true },
    });
  }

  if (!user.securitySetting) {
    await prisma.securitySetting.create({
      data: { userId: user.id, isTwoFactorEnabled: false, loginAlertsEmail: true, loginAlertsPush: true },
    });
  }

  if (!user.adPreference) {
    await prisma.adPreference.create({
      data: { userId: user.id, sensitiveTopicsHidden: ['Gambling', 'Politics'], usePartnerData: true, personalizedAds: true },
    });
  }

  // Ensure current session exists in ActiveSessions
  const existingCurrent = user.activeSessions.find((s) => s.isCurrent);
  if (!existingCurrent) {
    await prisma.activeSession.create({
      data: {
        userId: user.id,
        sessionToken: `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        deviceName: 'Chrome on Windows',
        deviceOs: 'Windows 11',
        ipAddress: '127.0.0.1',
        locationCity: 'San Francisco',
        locationCountry: 'United States',
        isCurrent: true,
      },
    });
  }

  const updatedUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: {
      profileSync: true,
      securitySetting: true,
      activeSessions: { orderBy: { lastActiveAt: 'desc' } },
      searchHistories: { orderBy: { searchedAt: 'desc' }, take: 10 },
      offPlatformLogs: { orderBy: { eventTimestamp: 'desc' }, take: 10 },
      dataExports: { orderBy: { requestedAt: 'desc' }, take: 5 },
      adPreference: true,
      paymentTokens: { orderBy: { createdAt: 'desc' } },
      vaultAddresses: { orderBy: { isDefault: 'desc' } },
    },
  });

  return updatedUser;
}

// Module 1: Connected Experiences Actions
export async function updateProfileSyncAction(data: { syncPolicy: string; syncName: boolean; syncBio: boolean; syncAvatar: boolean }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error('Unauthorized');
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) throw new Error('User not found');

  return await prisma.profileSyncSetting.upsert({
    where: { userId: user.id },
    update: data,
    create: { userId: user.id, ...data },
  });
}

// Module 2: Centralized Security & Session Hub Actions
export async function toggleTwoFactorAction(enabled: boolean) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error('Unauthorized');
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) throw new Error('User not found');

  return await prisma.securitySetting.upsert({
    where: { userId: user.id },
    update: { isTwoFactorEnabled: enabled },
    create: { userId: user.id, isTwoFactorEnabled: enabled },
  });
}

export async function revokeActiveSessionAction(sessionId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error('Unauthorized');
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) throw new Error('User not found');

  return await prisma.activeSession.delete({
    where: { id: sessionId, userId: user.id },
  });
}

// Module 3: User Data & Privacy Controls Actions
export async function clearOffPlatformDataAction() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error('Unauthorized');
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) throw new Error('User not found');

  return await prisma.offPlatformActivity.updateMany({
    where: { userId: user.id },
    data: { isCleared: true },
  });
}

export async function clearSearchHistoryAction() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error('Unauthorized');
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) throw new Error('User not found');

  return await prisma.searchHistory.deleteMany({
    where: { userId: user.id },
  });
}

export async function requestDataExportAction(format: 'JSON' | 'HTML') {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error('Unauthorized');
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) throw new Error('User not found');

  return await prisma.dataExportJob.create({
    data: {
      userId: user.id,
      exportFormat: format,
      status: 'PROCESSING',
      downloadUrl: `/api/data-export/download?job=${Date.now()}`,
    },
  });
}

// Module 4: Global Ad & Payment Preferences Actions
export async function updateAdPreferencesAction(sensitiveTopics: string[], usePartnerData: boolean) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error('Unauthorized');
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) throw new Error('User not found');

  return await prisma.adPreference.upsert({
    where: { userId: user.id },
    update: { sensitiveTopicsHidden: sensitiveTopics, usePartnerData },
    create: { userId: user.id, sensitiveTopicsHidden: sensitiveTopics, usePartnerData },
  });
}

export async function addPaymentVaultTokenAction(data: { cardBrand: string; cardLast4: string; expiryMonth: number; expiryYear: number }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error('Unauthorized');
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) throw new Error('User not found');

  return await prisma.paymentVaultToken.create({
    data: {
      userId: user.id,
      provider: 'STRIPE',
      vaultedTokenId: `tok_vault_${Date.now()}`,
      cardBrand: data.cardBrand,
      cardLast4: data.cardLast4,
      expiryMonth: data.expiryMonth,
      expiryYear: data.expiryYear,
      isDefault: true,
    },
  });
}
