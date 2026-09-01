'use server';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - next-auth types resolved at runtime
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import {
  uploadBufferToStorage,
  deleteFilesFromStorage,
  emptyStorageBucket,
  generateChatStoragePath,
  generateAvatarStoragePath,
  generatePostStoragePath,
  CHAT_MEDIA_BUCKET,
  PUBLIC_MEDIA_BUCKET,
} from "@/lib/media-storage";

export async function askAI(prompt: string) {
  const apiKey =
    process.env.GROQ_API_KEY ||
    process.env.VITE_GROQ_API_KEY ||
    process.env.NEXT_PUBLIC_GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("AI API Key is missing");
  }

  const modelsToTry = [
    process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.8-27b",
    "groq/compound-mini"
  ];

  for (const model of modelsToTry) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                "You are Grok AI, a witty, intelligent, and helpful assistant inside Connect. Answer clearly, accurately, and concisely in the user's language (English, Urdu, etc.).",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 1024,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`Model ${model} returned non-200:`, errorText);
        continue;
      }

      const data = await response.json();
      const answer = data?.choices?.[0]?.message?.content;
      if (answer) return answer;
    } catch (error) {
      console.warn(`Model ${model} failed, trying next:`, error);
    }
  }

  throw new Error("Failed to get AI response");
}

export async function getSocialUser(userId: string) {
  if (!userId) return null;
  const cleanId = String(userId).trim();
  return await prisma.user.findFirst({
    where: {
      OR: [
        { id: cleanId },
        { email: cleanId.toLowerCase() },
        { username: cleanId.toLowerCase() }
      ]
    },
    select: {
      id: true,
      username: true,
      email: true,
      image: true,
      bio: true,
      isPrivate: true,
      lastSeen: true
    }
  });
}

export async function getChatHistory() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return [];

  // We fetch the user and include their messages
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { 
      messages: { 
        orderBy: { 
          createdAt: 'asc' as const 
        } 
      } 
    }
  });

  // Prisma generates the relation as 'messages' on the User model
  return user?.messages || [];
}

export async function saveChatMessage(content: string, role: 'user' | 'ai') {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  });

  if (!user) return null;

  // Prisma generates the model property as 'message' (lowercase) on the client
  return await prisma.message.create({
    data: {
      content,
      role,
      userId: user.id
    }
  });
}

export async function getUserDetails() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  return await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      username: true,
      email: true,
      createdAt: true,
      image: true
    }
  });
}



export async function getSocialMessages(otherUserId: string, limit: number = 30, beforeId?: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return [];

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true }
  });

  if (!currentUser) return [];

  let cursorFilter: any = {};
  if (beforeId) {
    const beforeMsg = await prisma.socialMessage.findUnique({
      where: { id: beforeId },
      select: { createdAt: true }
    });
    if (beforeMsg) {
      cursorFilter = { createdAt: { lt: beforeMsg.createdAt } };
    }
  }

  const messages = await prisma.socialMessage.findMany({
    where: {
      OR: [
        { senderId: currentUser.id, receiverId: otherUserId, deletedBySender: false },
        { senderId: otherUserId, receiverId: currentUser.id, deletedByReceiver: false }
      ],
      ...cursorFilter
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      reactions: {
        include: {
          user: {
            select: { id: true, username: true }
          }
        }
      }
    }
  });

  return messages.reverse();
}

export async function getChatSharedMedia(otherUserId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return [];

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true }
  });

  if (!currentUser) return [];

  const mediaMessages = await prisma.socialMessage.findMany({
    where: {
      OR: [
        { senderId: currentUser.id, receiverId: otherUserId, deletedBySender: false },
        { senderId: otherUserId, receiverId: currentUser.id, deletedByReceiver: false }
      ],
      type: { in: ['image', 'video', 'voice', 'file', 'media_album'] }
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: {
      id: true,
      senderId: true,
      receiverId: true,
      content: true,
      type: true,
      createdAt: true
    }
  });

  return mediaMessages;
}

export async function markMessagesAsSeen(senderId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email }
  });

  if (!currentUser) return null;

  const now = new Date();
  return await (prisma.socialMessage as any).updateMany({
    where: {
      senderId: senderId,
      receiverId: currentUser.id,
      isSeen: false
    },
    data: {
      isSeen: true,
      seenAt: now
    }
  });
}


export async function saveSocialMessage(
  receiverId: string,
  content: string,
  type: string = "text",
  replyTo?: { id: string; content: string; senderName: string } | null,
  metadata?: {
    mediaUrl?: string;
    thumbnailUrl?: string;
    mimeType?: string;
    fileSize?: number;
    width?: number;
    height?: number;
    duration?: number;
    storagePath?: string;
  } | null
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const email = session.user.email.toLowerCase().trim();
  const currentUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email: session.user.email },
        { email: email }
      ]
    },
    select: { id: true }
  });

  if (!currentUser) return null;

  // Un-hide the chat for both users if it was previously hidden
  await prisma.hiddenSocialChat.deleteMany({
    where: {
      OR: [
        { userId: currentUser.id, hiddenUserId: receiverId },
        { userId: receiverId, hiddenUserId: currentUser.id }
      ]
    }
  });

  let finalContent = content;

  // Fallback: If content is base64 image/video/voice, upload directly to Supabase Storage
  if (content && content.startsWith("data:")) {
    try {
      const matches = content.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        const rawBuffer = Buffer.from(matches[2], "base64");
        const storagePath = generateChatStoragePath(
          currentUser.id,
          receiverId,
          "msg-" + Date.now(),
          "media",
          mimeType
        );
        const result = await uploadBufferToStorage(CHAT_MEDIA_BUCKET, storagePath, rawBuffer, mimeType);
        finalContent = result.url;
      }
    } catch (e) {
      console.error("Failed to upload fallback base64 to Supabase Storage:", e);
    }
  }

  // Update sender's activity timestamp in DB
  prisma.user.update({
    where: { id: currentUser.id },
    data: { isOnline: true, lastSeen: new Date(), lastHeartbeat: new Date() }
  }).catch(() => {});

  return await prisma.socialMessage.create({
    data: {
      content: finalContent,
      type,
      senderId: currentUser.id,
      receiverId,
      ...(replyTo ? {
        replyToId: replyTo.id,
        replyToContent: replyTo.content,
        replyToSenderName: replyTo.senderName,
      } : {}),
      ...(metadata ? {
        mediaUrl: metadata.mediaUrl || finalContent,
        thumbnailUrl: metadata.thumbnailUrl,
        mimeType: metadata.mimeType,
        fileSize: metadata.fileSize,
        width: metadata.width,
        height: metadata.height,
        duration: metadata.duration,
        storagePath: metadata.storagePath,
      } : {})
    },
    include: {
      reactions: true
    }
  });
}

export async function hideSocialChat(hiddenUserId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true }
  });

  if (!currentUser) return null;

  try {
    // 1. Mark sent messages as deletedBySender for currentUser
    await prisma.socialMessage.updateMany({
      where: {
        senderId: currentUser.id,
        receiverId: hiddenUserId
      },
      data: {
        deletedBySender: true
      }
    });

    // 2. Mark received messages as deletedByReceiver for currentUser
    await prisma.socialMessage.updateMany({
      where: {
        senderId: hiddenUserId,
        receiverId: currentUser.id
      },
      data: {
        deletedByReceiver: true
      }
    });

    // 3. Clean up messages where BOTH users have deleted them (EXCEPT calls, so call logs are never destroyed)
    await prisma.socialMessage.deleteMany({
      where: {
        deletedBySender: true,
        deletedByReceiver: true,
        type: { not: 'call' },
        OR: [
          { senderId: currentUser.id, receiverId: hiddenUserId },
          { senderId: hiddenUserId, receiverId: currentUser.id }
        ]
      }
    }).catch(() => {});

    // 4. Track in HiddenSocialChat table
    await prisma.hiddenSocialChat.upsert({
      where: {
        userId_hiddenUserId: {
          userId: currentUser.id,
          hiddenUserId
        }
      },
      create: {
        userId: currentUser.id,
        hiddenUserId
      },
      update: {}
    }).catch(() => {});

    return { success: true };
  } catch (err) {
    console.error('Failed to hide chat messages for user:', err);
    return { success: false, error: 'Database update failed' };
  }
}

export async function deleteSocialMessage(messageId: string, deleteFor: 'me' | 'everyone') {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email }
  });

  if (!currentUser) return null;

  const msg = await prisma.socialMessage.findUnique({ where: { id: messageId } });
  if (!msg) return null;

  if (deleteFor === 'everyone') {
    if (msg.senderId !== currentUser.id) return null;

    // Clean up associated files in Supabase Storage
    const pathsToDelete: string[] = [];
    if ((msg as any).storagePath) pathsToDelete.push((msg as any).storagePath);
    if (msg.content && (msg.content.includes("supabase.co") || msg.content.includes("chat/"))) {
      pathsToDelete.push(msg.content);
    }
    if ((msg as any).thumbnailUrl && ((msg as any).thumbnailUrl.includes("supabase.co") || (msg as any).thumbnailUrl.includes("chat/"))) {
      pathsToDelete.push((msg as any).thumbnailUrl);
    }
    if (pathsToDelete.length > 0) {
      deleteFilesFromStorage(CHAT_MEDIA_BUCKET, pathsToDelete).catch(() => {});
    }

    return await (prisma.socialMessage as any).update({
      where: { id: messageId },
      data: { 
        content: "This message was deleted", 
        type: "deleted",
        mediaUrl: null,
        thumbnailUrl: null,
        storagePath: null
      }
    });
  } else {
    if (msg.senderId === currentUser.id) {
      return await prisma.socialMessage.update({
        where: { id: messageId },
        data: { deletedBySender: true }
      });
    } else if (msg.receiverId === currentUser.id) {
      return await prisma.socialMessage.update({
        where: { id: messageId },
        data: { deletedByReceiver: true }
      });
    }
    return null;
  }
}

export async function reactToSocialMessage(messageId: string, emoji: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email }
  });

  if (!currentUser) return null;

  const existingReaction = await prisma.socialReaction.findUnique({
    where: {
      userId_messageId_emoji: {
        userId: currentUser.id,
        messageId,
        emoji
      }
    }
  });

  if (existingReaction) {
    return await prisma.socialReaction.delete({
      where: { id: existingReaction.id }
    });
  } else {
    return await prisma.socialReaction.create({
      data: {
        userId: currentUser.id,
        messageId,
        emoji
      }
    });
  }
}
export async function getRecentChats() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return [];

  const email = session.user.email.toLowerCase().trim();
  const currentUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email: session.user.email },
        { email: email }
      ]
    },
    select: { id: true }
  });

  if (!currentUser) return [];

  const hiddenChats = await prisma.hiddenSocialChat.findMany({
    where: { userId: currentUser.id },
    select: { hiddenUserId: true }
  });
  const hiddenUserIds = hiddenChats.map((chat: { hiddenUserId: string }) => chat.hiddenUserId);
  const hasHidden = hiddenUserIds.length > 0;

  // 1. Get distinct receiverIds this user has sent a message to (distinguish contacts vs requests)
  const sentMessages = await prisma.socialMessage.findMany({
    where: {
      senderId: currentUser.id,
      ...(hasHidden ? { receiverId: { notIn: hiddenUserIds } } : {})
    },
    distinct: ['receiverId'],
    select: { receiverId: true }
  });
  const contactIdsSet = new Set(sentMessages.map((m: { receiverId: string }) => m.receiverId));

  // 2. Fetch recent messages for this user (both sent and received) in parallel with unseen counts
  const userSelect = {
    id: true,
    username: true,
    email: true,
    image: true,
    lastSeen: true,
    isOnline: true,
    lastHeartbeat: true,
    showActivityStatus: true
  };

  const [allMessages, unseenMessages] = await Promise.all([
    (prisma.socialMessage as any).findMany({
      where: {
        OR: [
          { senderId: currentUser.id, ...(hasHidden ? { receiverId: { notIn: hiddenUserIds } } : {}), deletedBySender: false },
          { receiverId: currentUser.id, ...(hasHidden ? { senderId: { notIn: hiddenUserIds } } : {}), deletedByReceiver: false }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 600,
      select: {
        id: true,
        senderId: true,
        receiverId: true,
        content: true,
        type: true,
        createdAt: true,
        sender: { select: userSelect },
        receiver: { select: userSelect }
      }
    }),
    prisma.socialMessage.groupBy({
      by: ['senderId'],
      where: {
        receiverId: currentUser.id,
        isSeen: false,
        deletedByReceiver: false
      },
      _count: true
    })
  ]);

  const formatLastMessage = (m: any) => {
    if (m.type === 'voice') return 'Voice Message';
    if (m.type === 'image') return 'Image';
    if (m.type === 'video') return 'Video';
    if (m.type === 'song') return '🎵 Song Clip';
    if (m.type === 'file') return 'Attachment';
    if (m.type === 'deleted') return 'Message deleted';
    if (m.type === 'accepted') return 'Request accepted';
    if (m.type === 'call') return m.content || 'Call';
    return (m.content && m.content.length > 30) ? m.content.substring(0, 30) + '...' : (m.content || '');
  };

  const unseenMap = new Map(unseenMessages.map((m: { senderId: string; _count: number }) => [m.senderId, m._count]));

  // Merge into unique partner list
  const partners = new Map();
  for (const m of allMessages) {
    const isSentByMe = m.senderId === currentUser.id;
    const partner = isSentByMe ? m.receiver : m.sender;
    const partnerId = isSentByMe ? m.receiverId : m.senderId;

    if (!partner || !partnerId) continue;
    if (partners.has(partnerId)) continue; // Already have newest message for this partner

    const isRequest = !isSentByMe && !contactIdsSet.has(partnerId);
    const latestActiveTime = partner.lastSeen && partner.lastHeartbeat
      ? (new Date(partner.lastHeartbeat).getTime() > new Date(partner.lastSeen).getTime() ? partner.lastHeartbeat : partner.lastSeen)
      : (partner.lastSeen || partner.lastHeartbeat || null);

    partners.set(partnerId, {
      ...partner,
      lastSeen: latestActiveTime,
      lastMessage: formatLastMessage(m),
      lastTime: m.createdAt,
      isRequest: isRequest,
      unseenCount: unseenMap.get(partnerId) || 0
    });
  }

  return Array.from(partners.values()).sort((a, b) => (new Date(b.lastTime).getTime()) - (new Date(a.lastTime).getTime()));
}

export async function saveCall(receiverId: string, type: 'audio' | 'video', status: 'missed' | 'completed' | 'rejected', duration?: number) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email }
  });

  if (!currentUser) return null;
  
  const callModel = (prisma as any).socialCall;
  if (!callModel) {
    console.error("Prisma model 'socialCall' is missing from the client!");
    return null;
  }

  const call = await callModel.create({
    data: {
      callerId: currentUser.id,
      receiverId,
      type,
      status,
      duration
    }
  });

  // Also save as a message so it appears in chat history
  let content = "";
  if (status === 'missed') content = `Missed ${type} call`;
  else if (status === 'rejected') content = `${type.charAt(0).toUpperCase() + type.slice(1)} call rejected`;
  else {
    const mins = Math.floor((duration || 0) / 60);
    const secs = (duration || 0) % 60;
    const durStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    content = `${type.charAt(0).toUpperCase() + type.slice(1)} call ended • ${durStr}`;
  }

  const message = await prisma.socialMessage.create({
    data: {
      content,
      type: "call",
      senderId: currentUser.id,
      receiverId
    },
    include: {
      reactions: true
    }
  });

  return { call, message };
}


export async function getCallHistory() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return [];

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true }
  });

  if (!currentUser) return [];
  
  const callModel = (prisma as any).socialCall;
  let calls: any[] = [];

  if (callModel) {
    try {
      calls = await callModel.findMany({
        where: {
          OR: [
            { callerId: currentUser.id },
            { receiverId: currentUser.id }
          ]
        },
        include: {
          caller: { select: { id: true, image: true, username: true } },
          receiver: { select: { id: true, image: true, username: true } }
        },
        orderBy: { createdAt: 'desc' }
      });
    } catch (e) {
      console.warn("getCallHistory socialCall query error:", e);
    }
  }

  // If no socialCall records exist, check legacy socialMessage records
  if (calls.length === 0) {
    try {
      const callMessages = await prisma.socialMessage.findMany({
        where: {
          OR: [
            { senderId: currentUser.id },
            { receiverId: currentUser.id }
          ],
          type: 'call'
        },
        include: {
          sender: { select: { id: true, image: true, username: true } },
          receiver: { select: { id: true, image: true, username: true } }
        },
        orderBy: { createdAt: 'desc' }
      });

      if (callMessages && callMessages.length > 0) {
        for (const cm of callMessages) {
          const isVideo = cm.content?.toLowerCase().includes('video');
          const isMissed = cm.content?.toLowerCase().includes('missed');
          const isRejected = cm.content?.toLowerCase().includes('rejected');
          
          let duration = 0;
          const matchMins = cm.content?.match(/(\d+)m/);
          const matchSecs = cm.content?.match(/(\d+)s/);
          if (matchMins) duration += parseInt(matchMins[1], 10) * 60;
          if (matchSecs) duration += parseInt(matchSecs[1], 10);

          calls.push({
            id: cm.id,
            callerId: cm.senderId,
            receiverId: cm.receiverId,
            type: isVideo ? 'video' : 'audio',
            status: isMissed ? 'missed' : isRejected ? 'rejected' : 'completed',
            duration: duration || 0,
            createdAt: cm.createdAt,
            caller: cm.sender,
            receiver: cm.receiver
          });
        }
      }
    } catch (e) {
      console.warn("getCallHistory socialMessage fallback error:", e);
    }
  }

  return calls;
}

export async function clearCallHistory() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { success: false };

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true }
  });
  if (!currentUser) return { success: false };

  const callModel = (prisma as any).socialCall;
  if (callModel) {
    try {
      await callModel.deleteMany({
        where: {
          OR: [
            { callerId: currentUser.id },
            { receiverId: currentUser.id }
          ]
        }
      });
    } catch (e) {
      console.warn("Failed to clear calls from DB:", e);
    }
  }

  try {
    await prisma.socialMessage.deleteMany({
      where: {
        OR: [
          { senderId: currentUser.id },
          { receiverId: currentUser.id }
        ],
        type: 'call'
      }
    });
  } catch (e) {
    console.warn("Failed to clear call messages from DB:", e);
  }

  return { success: true };
}


export async function updateUsername(newUsername: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { error: 'Not authenticated' };

  const trimmed = newUsername.trim().toLowerCase().replace(/\s+/g, '');
  if (!trimmed || trimmed.length < 3) return { error: 'Username must be at least 3 characters' };

  const existing = await prisma.user.findFirst({
    where: { username: trimmed, NOT: { email: session.user.email } }
  });
  if (existing) return { error: 'Username already taken' };

  const updated = await prisma.user.update({
    where: { email: session.user.email },
    data: { username: trimmed }
  });
  return { success: true, username: updated.username };
}

export async function deleteAccountAction() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { error: 'Not authenticated' };

  const email = session.user.email.toLowerCase().trim();
  const currentUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email: session.user.email },
        { email: email }
      ]
    },
    select: { id: true, email: true }
  });

  if (!currentUser) return { error: 'User not found' };

  try {
    const userId = currentUser.id;
    const userEmail = currentUser.email;

    // Delete user from DB (Prisma cascade deletes messages, calls, posts, stories, followers, etc.)
    await prisma.user.delete({
      where: { id: userId }
    });

    // Also remove any pending verification records for this email if any
    if (userEmail) {
      await prisma.pendingUser.deleteMany({
        where: { email: userEmail }
      }).catch(() => {});
    }

    return { success: true };
  } catch (error: any) {
    console.error('[DELETE_ACCOUNT_ERROR]', error);
    return { error: error?.message || 'Failed to delete account from database' };
  }
}

export async function saveChatNicknameAction(targetUserId: string, nickname: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { error: 'Not authenticated' };

  const email = session.user.email.toLowerCase().trim();
  const currentUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email: session.user.email },
        { email: email }
      ]
    },
    select: { id: true }
  });
  if (!currentUser) return { error: 'User not found' };

  const cleanNick = (nickname || '').trim();

  // Resolve target user id if an email or id was passed
  let resolvedTargetId = targetUserId;
  const targetUser = await prisma.user.findFirst({
    where: {
      OR: [
        { id: targetUserId },
        { email: targetUserId },
        { email: targetUserId.toLowerCase().trim() }
      ]
    },
    select: { id: true, email: true }
  });
  if (targetUser) {
    resolvedTargetId = targetUser.id;
  }

  if (!cleanNick) {
    // Delete custom nickname if empty
    await (prisma as any).chatNickname.deleteMany({
      where: {
        userId: currentUser.id,
        OR: [
          { targetId: resolvedTargetId },
          { targetId: targetUserId }
        ]
      }
    });
    return { success: true, nickname: '', targetId: resolvedTargetId };
  }

  const saved = await (prisma as any).chatNickname.upsert({
    where: {
      userId_targetId: {
        userId: currentUser.id,
        targetId: resolvedTargetId
      }
    },
    update: { nickname: cleanNick },
    create: {
      userId: currentUser.id,
      targetId: resolvedTargetId,
      nickname: cleanNick
    }
  });

  return { success: true, nickname: saved.nickname, targetId: resolvedTargetId };
}

export async function getInitialSocialData() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { recentChats: [], activeStories: [], nicknames: {} };

  const [recentChats, activeStories, nicknames] = await Promise.all([
    getRecentChats(),
    getActiveStoriesAction(),
    getChatNicknamesAction()
  ]);

  return {
    recentChats,
    activeStories,
    nicknames
  };
}

export async function getChatNicknamesAction() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return {};

  const email = session.user.email.toLowerCase().trim();
  const currentUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email: session.user.email },
        { email: email }
      ]
    },
    select: { id: true }
  });
  if (!currentUser) return {};

  const records = await (prisma as any).chatNickname.findMany({
    where: { userId: currentUser.id },
    include: {
      targetUser: {
        select: { id: true, email: true }
      }
    }
  });

  const nicknameMap: Record<string, string> = {};
  records.forEach((r: any) => {
    if (r.targetId) nicknameMap[r.targetId] = r.nickname;
    if (r.targetUser?.email) {
      nicknameMap[r.targetUser.email.toLowerCase().trim()] = r.nickname;
    }
  });

  return nicknameMap;
}

export async function updateName(newName: string) {
  return await updateUsername(newName);
}

export async function getProfileDetails() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const user = await (prisma.user as any).findUnique({
    where: { email: session.user.email },
    include: {
      followers: {
        select: { id: true, username: true, image: true }
      },
      following: {
        select: { id: true, username: true, image: true }
      },
      posts: {
        orderBy: { createdAt: 'desc' },
        take: 36
      },
      receivedFollowRequests: {
        include: {
          sender: { select: { id: true, username: true, image: true } }
        }
      }
    }
  });

  return user;
}

export async function updateProfileDetails(data: { name?: string; username?: string; bio?: string; website?: string; image?: string }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { error: 'Not authenticated' };

  const updateData: any = {};
  if (data.bio !== undefined) {
    updateData.bio = data.bio.trim().slice(0, 150);
  }

  if (data.website !== undefined) {
    updateData.website = data.website.trim().slice(0, 100);
  }

  if (data.image !== undefined) {
    updateData.image = data.image;
  }

  if (data.username !== undefined || data.name !== undefined) {
    const rawUser = data.username !== undefined ? data.username : (data.name || '');
    const trimmedUser = rawUser.trim().toLowerCase().replace(/^@+/, '').replace(/\s+/g, '');
    if (trimmedUser.length < 3) return { error: 'Username must be at least 3 characters' };
    if (trimmedUser.length > 30) return { error: 'Username cannot exceed 30 characters' };
    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUser)) {
      return { error: 'Username can only contain letters, numbers, and underscores' };
    }

    const existing = await prisma.user.findFirst({
      where: {
        username: { equals: trimmedUser, mode: 'insensitive' },
        NOT: { email: session.user.email }
      }
    });

    if (existing) {
      return { error: 'Username is already taken' };
    }
    updateData.username = trimmedUser;
  }

  const updated = await prisma.user.update({
    where: { email: session.user.email },
    data: updateData,
    select: {
      id: true,
      username: true,
      email: true,
      image: true,
      bio: true,
      website: true,
      isPrivate: true,
      isOnline: true,
      lastSeen: true,
      showActivityStatus: true
    }
  });

  return { success: true, user: updated };
}

export async function updateProfileImageAction(imageUrl: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { error: 'Not authenticated' };

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true }
  });
  if (!currentUser) return { error: 'User not found' };

  let finalUrl = imageUrl;
  if (imageUrl && imageUrl.startsWith("data:")) {
    try {
      const matches = imageUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        const rawBuffer = Buffer.from(matches[2], "base64");
        const storagePath = generateAvatarStoragePath(currentUser.id, "avatar.jpg", mimeType);
        const res = await uploadBufferToStorage(PUBLIC_MEDIA_BUCKET, storagePath, rawBuffer, mimeType);
        finalUrl = res.url;
      }
    } catch (e) {
      console.error("Failed to upload avatar to Supabase Storage:", e);
    }
  }

  const updated = await prisma.user.update({
    where: { id: currentUser.id },
    data: { image: finalUrl }
  });
  return { success: true, image: updated.image };
}

export async function getFollowRequests() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return [];

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email }
  });

  if (!currentUser) return [];

  return await (prisma as any).followRequest.findMany({
    where: { receiverId: currentUser.id },
    include: {
      sender: { select: { id: true, username: true, image: true } }
    }
  });
}

export async function respondToFollowRequest(requestId: string, action: 'accept' | 'decline') {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { error: 'Not authenticated' };

  const req = await (prisma as any).followRequest.findUnique({
    where: { id: requestId }
  });

  if (!req) return { error: 'Request not found' };

  if (action === 'accept') {
    // Add to followers/following
    await prisma.$transaction([
      (prisma.user as any).update({
        where: { id: req.receiverId },
        data: { followers: { connect: { id: req.senderId } } }
      }),
      (prisma.user as any).update({
        where: { id: req.senderId },
        data: { following: { connect: { id: req.receiverId } } }
      }),
      (prisma as any).followRequest.delete({
        where: { id: requestId }
      })
    ]);
    return { success: true, accepted: true };
  } else {
    await (prisma as any).followRequest.delete({
      where: { id: requestId }
    });
    return { success: true, accepted: false };
  }
}

export async function createPostAction(data: { imageUrl: string; thumbnailUrl?: string; caption: string; postType: 'single_image' | 'reel' }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { error: 'Not authenticated' };

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  });

  if (!user) return { error: 'User not found' };

  let finalImageUrl = data.imageUrl;
  if (data.imageUrl && data.imageUrl.startsWith("data:")) {
    try {
      const matches = data.imageUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        const rawBuffer = Buffer.from(matches[2], "base64");
        const storagePath = generatePostStoragePath(user.id, "post.jpg", mimeType);
        const res = await uploadBufferToStorage(PUBLIC_MEDIA_BUCKET, storagePath, rawBuffer, mimeType);
        finalImageUrl = res.url;
      }
    } catch (e) {
      console.error("Failed to upload post image to Supabase Storage:", e);
    }
  }

  const post = await (prisma as any).post.create({
    data: {
      imageUrl: finalImageUrl,
      thumbnailUrl: data.thumbnailUrl || finalImageUrl,
      caption: data.caption,
      postType: data.postType,
      userId: user.id
    }
  });

  return { success: true, post };
}

export async function deletePostAction(postId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { error: 'Not authenticated' };

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  });

  if (!user) return { error: 'User not found' };

  const post = await (prisma as any).post.findUnique({
    where: { id: postId }
  });

  if (!post || post.userId !== user.id) {
    return { error: 'Unauthorized or not found' };
  }

  await (prisma as any).post.delete({
    where: { id: postId }
  });

  return { success: true };
}

export async function getExploreContent() {
  return await (prisma as any).post.findMany({
    where: {
      postType: 'reel'
    },
    orderBy: { createdAt: 'desc' },
    take: 60,
    include: {
      user: { select: { id: true, username: true, email: true, image: true, isPrivate: true } },
      likes: { select: { userId: true } },
      comments: { select: { id: true } }
    }
  });
}

export async function searchUsers(query: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return [];

  const email = session.user.email.toLowerCase().trim();
  const currentUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email: session.user.email },
        { email: email }
      ]
    },
    select: { id: true }
  });

  if (!currentUser) return [];

  const rawQ = query ? query.trim() : '';
  const cleanQ = rawQ.replace(/^@+/, '').trim();

  if (!cleanQ) {
    return await prisma.user.findMany({
      where: {
        id: { not: currentUser.id }
      },
      select: { id: true, username: true, email: true, image: true, bio: true, isPrivate: true, lastSeen: true, lastHeartbeat: true, isOnline: true },
      take: 30,
      orderBy: { createdAt: 'desc' }
    });
  }

  return await prisma.user.findMany({
    where: {
      id: { not: currentUser.id },
      OR: [
        { username: { contains: cleanQ, mode: 'insensitive' } },
        { email: { contains: cleanQ, mode: 'insensitive' } }
      ]
    },
    select: { id: true, username: true, email: true, image: true, bio: true, isPrivate: true, lastSeen: true, lastHeartbeat: true, isOnline: true },
    take: 40,
  });
}

export async function updateUserLastSeenAction(timestampIso?: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { error: 'Not authenticated' };

  const email = session.user.email.toLowerCase().trim();
  const targetDate = timestampIso ? new Date(timestampIso) : new Date();

  await (prisma.user as any).updateMany({
    where: {
      OR: [
        { email: session.user.email },
        { email: email }
      ]
    },
    data: { lastSeen: targetDate, lastHeartbeat: targetDate }
  });

  return { success: true, lastSeen: targetDate.toISOString() };
}

export async function toggleProfilePrivacy(isPrivate: boolean) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { error: 'Not authenticated' };

  await (prisma.user as any).update({
    where: { email: session.user.email },
    data: { isPrivate }
  });

  return { success: true };
}

export async function getOtherUserProfile(targetUserId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email }
  });

  if (!currentUser) return null;

  const targetUser = await (prisma.user as any).findUnique({
    where: { id: targetUserId },
    include: {
      followers: {
        select: { id: true, username: true, image: true }
      },
      following: {
        select: { id: true, username: true, image: true }
      },
      posts: {
        orderBy: { createdAt: 'desc' },
        take: 36
      },
      receivedFollowRequests: {
        include: {
          sender: { select: { id: true, username: true, image: true } }
        }
      }
    }
  });

  if (!targetUser) return null;

  // Check relationship status
  const isFollowing = targetUser.followers.some((f: any) => f.id === currentUser.id);
  const hasSentRequest = targetUser.receivedFollowRequests.some((r: any) => r.senderId === currentUser.id);

  return {
    ...targetUser,
    isFollowing,
    hasSentRequest,
    isCurrentUser: currentUser.id === targetUser.id
  };
}

export async function toggleFollowUser(targetUserId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { error: 'Not authenticated' };

  const currentUser = await (prisma.user as any).findUnique({
    where: { email: session.user.email },
    include: {
      following: true
    }
  });

  if (!currentUser) return { error: 'User not found' };
  if (currentUser.id === targetUserId) return { error: 'Cannot follow yourself' };

  const targetUser = await (prisma.user as any).findUnique({
    where: { id: targetUserId },
    include: {
      followers: true,
      receivedFollowRequests: true
    }
  });

  if (!targetUser) return { error: 'Target user not found' };

  const isFollowing = targetUser.followers.some((f: any) => f.id === currentUser.id);

  if (isFollowing) {
    // Unfollow
    await prisma.$transaction([
      (prisma.user as any).update({
        where: { id: targetUserId },
        data: { followers: { disconnect: { id: currentUser.id } } }
      }),
      (prisma.user as any).update({
        where: { id: currentUser.id },
        data: { following: { disconnect: { id: targetUserId } } }
      })
    ]);

    const updatedTarget = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        _count: {
          select: { followers: true, following: true }
        }
      }
    });

    return {
      success: true,
      isFollowing: false,
      hasSentRequest: false,
      followersCount: updatedTarget?._count?.followers ?? 0,
      followingCount: updatedTarget?._count?.following ?? 0
    };
  }

  // If private, send request
  if (targetUser.isPrivate) {
    const existingRequest = targetUser.receivedFollowRequests.some((r: any) => r.senderId === currentUser.id);
    if (existingRequest) {
      // Cancel request
      await (prisma as any).followRequest.delete({
        where: {
          senderId_receiverId: {
            senderId: currentUser.id,
            receiverId: targetUserId
          }
        }
      });

      const updatedTarget = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: {
          _count: {
            select: { followers: true, following: true }
          }
        }
      });

      return {
        success: true,
        isFollowing: false,
        hasSentRequest: false,
        followersCount: updatedTarget?._count?.followers ?? 0,
        followingCount: updatedTarget?._count?.following ?? 0
      };
    } else {
      // Create request
      await (prisma as any).followRequest.create({
        data: {
          senderId: currentUser.id,
          receiverId: targetUserId
        }
      });

      const updatedTarget = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: {
          _count: {
            select: { followers: true, following: true }
          }
        }
      });

      return {
        success: true,
        isFollowing: false,
        hasSentRequest: true,
        followersCount: updatedTarget?._count?.followers ?? 0,
        followingCount: updatedTarget?._count?.following ?? 0
      };
    }
  }

  // If public, follow directly
  await prisma.$transaction([
    (prisma.user as any).update({
      where: { id: targetUserId },
      data: { followers: { connect: { id: currentUser.id } } }
    }),
    (prisma.user as any).update({
      where: { id: currentUser.id },
      data: { following: { connect: { id: targetUserId } } }
    })
  ]);

  const updatedTarget = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      _count: {
        select: { followers: true, following: true }
      }
    }
  });

  return {
    success: true,
    isFollowing: true,
    hasSentRequest: false,
    followersCount: updatedTarget?._count?.followers ?? 0,
    followingCount: updatedTarget?._count?.following ?? 0
  };
}

export async function getFollowNotificationsAction() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { success: false, notifications: [], unreadCount: 0 };

  const currentUser = await (prisma.user as any).findUnique({
    where: { email: session.user.email },
    include: {
      followers: {
        select: {
          id: true,
          username: true,
          image: true
        }
      },
      receivedFollowRequests: {
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              image: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  if (!currentUser) return { success: false, notifications: [], unreadCount: 0 };

  const notifications: { id: string; title: string; desc: string; time: string; unread: boolean; icon?: string }[] = [];

  // Add received follow requests
  (currentUser.receivedFollowRequests || []).forEach((req: any) => {
    const senderName = req.sender?.username || 'Someone';
    notifications.push({
      id: req.id,
      title: `${senderName} requested to follow you`,
      desc: 'Follow request',
      time: 'Recently',
      unread: true,
      icon: '👋'
    });
  });

  // Add followers
  (currentUser.followers || []).forEach((f: any) => {
    const fName = f.name || f.username || 'Someone';
    notifications.push({
      id: `f-${f.id}`,
      title: `${fName} started following you`,
      desc: 'New follower',
      time: 'Recently',
      unread: false,
      icon: '✨'
    });
  });

  return {
    success: true,
    notifications,
    unreadCount: (currentUser.receivedFollowRequests || []).length
  };
}

export async function createStoryAction(imageUrl: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { error: 'Not authenticated' };

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  });
  if (!user) return { error: 'User not found' };

  let finalImageUrl = imageUrl;
  if (imageUrl && imageUrl.startsWith("data:")) {
    try {
      const matches = imageUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        const rawBuffer = Buffer.from(matches[2], "base64");
        const storagePath = generatePostStoragePath(user.id, "story.jpg", mimeType);
        const res = await uploadBufferToStorage(PUBLIC_MEDIA_BUCKET, storagePath, rawBuffer, mimeType);
        finalImageUrl = res.url;
      }
    } catch (e) {
      console.error("Failed to upload story image to Supabase Storage:", e);
    }
  }

  const story = await (prisma as any).story.create({
    data: {
      imageUrl: finalImageUrl,
      userId: user.id
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          image: true
        }
      }
    }
  });

  return { success: true, story };
}

export async function getUserStoriesAction(targetUserId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { error: 'Not authenticated', stories: [] };

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email }
  });
  if (!currentUser) return { error: 'User not found', stories: [] };

  const targetUser = await (prisma.user as any).findUnique({
    where: { id: targetUserId },
    include: {
      followers: { select: { id: true } }
    }
  });
  if (!targetUser) return { error: 'Target user not found', stories: [] };

  // Check privacy constraint: only show to followers if private account (unless it's the user themselves)
  const isSelf = currentUser.id === targetUserId;
  const isFollower = targetUser.followers.some((f: any) => f.id === currentUser.id);

  if (targetUser.isPrivate && !isSelf && !isFollower) {
    return { error: 'Private account', stories: [] };
  }

  // Active stories within 24 hours
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const stories = await (prisma as any).story.findMany({
    where: {
      userId: targetUserId,
      createdAt: { gte: twentyFourHoursAgo }
    },
    orderBy: { createdAt: 'asc' }
  });

  return { success: true, stories };
}

export async function getActiveStoriesAction() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return [];

  const currentUser = await (prisma.user as any).findUnique({
    where: { email: session.user.email },
    include: {
      following: { select: { id: true } }
    }
  });
  if (!currentUser) return [];

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const userIds = [currentUser.id, ...(currentUser.following || []).map((f: any) => f.id)];

  try {
    const stories = await (prisma as any).story.findMany({
      where: {
        userId: { in: userIds },
        createdAt: { gte: twentyFourHoursAgo }
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            image: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    return stories;
  } catch (err) {
    console.error("Failed to load active stories:", err);
    return [];
  }
}

export async function deleteStoryAction(storyId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { error: 'Not authenticated' };

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  });
  if (!user) return { error: 'User not found' };

  const story = await (prisma as any).story.findUnique({
    where: { id: storyId }
  });
  if (!story) return { error: 'Story not found' };

  if (story.userId !== user.id) {
    return { error: 'Unauthorized to delete this story' };
  }

  await (prisma as any).story.delete({
    where: { id: storyId }
  });

  return { success: true };
}

export async function toggleLikeAction(postId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { error: 'Not authenticated' };

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  });
  if (!user) return { error: 'User not found' };

  const existingLike = await (prisma as any).like.findUnique({
    where: {
      postId_userId: {
        postId,
        userId: user.id
      }
    }
  });

  if (existingLike) {
    await (prisma as any).like.delete({
      where: { id: existingLike.id }
    });
    return { success: true, liked: false };
  } else {
    await (prisma as any).like.create({
      data: {
        postId,
        userId: user.id
      }
    });
    return { success: true, liked: true };
  }
}

export async function commentAction(postId: string, content: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { error: 'Not authenticated' };

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  });
  if (!user) return { error: 'User not found' };

  const comment = await (prisma as any).comment.create({
    data: {
      content,
      postId,
      userId: user.id
    },
    include: {
      user: {
        select: { id: true, username: true, image: true }
      }
    }
  });

  return { success: true, comment };
}

export async function getCommentsAction(postId: string) {
  return await (prisma as any).comment.findMany({
    where: { postId },
    include: {
      user: {
        select: { id: true, username: true, image: true }
      }
    },
    orderBy: { createdAt: 'asc' }
  });
}

export async function toggleSaveAction(postId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { error: 'Not authenticated' };

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  });
  if (!user) return { error: 'User not found' };

  const existingSave = await (prisma as any).savedPost.findUnique({
    where: {
      postId_userId: {
        postId,
        userId: user.id
      }
    }
  });

  if (existingSave) {
    await (prisma as any).savedPost.delete({
      where: { id: existingSave.id }
    });
    return { success: true, saved: false };
  } else {
    await (prisma as any).savedPost.create({
      data: {
        postId,
        userId: user.id
      }
    });
    return { success: true, saved: true };
  }
}

export async function getSavedPostsAction() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return [];

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  });
  if (!user) return [];

  return await (prisma as any).savedPost.findMany({
    where: { userId: user.id },
    include: {
      post: {
        include: {
          user: { select: { id: true, username: true, image: true } }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
}

export async function getHomeFeedPostsAction() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return [];

  const currentUser = await (prisma.user as any).findUnique({
    where: { email: session.user.email },
    include: { following: { select: { id: true } } }
  });
  if (!currentUser) return [];

  // Fetch posts: currentUser's posts, followed users' posts, and public users' posts.
  const followingIds = currentUser.following.map((f: any) => f.id);
  const posts = await (prisma as any).post.findMany({
    where: {
      OR: [
        { userId: currentUser.id },
        { userId: { in: followingIds } },
        { user: { isPrivate: false } }
      ]
    },
    include: {
      user: { select: { id: true, username: true, image: true, isPrivate: true } },
      likes: { select: { userId: true } },
      comments: {
        include: { user: { select: { id: true, username: true, image: true } } },
        orderBy: { createdAt: 'asc' }
      },
      savedPosts: { select: { userId: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  return posts.map((p: any) => ({
    id: p.id,
    user: p.user.username || 'user',
    userImage: p.user.image || undefined,
    userId: p.user.id,
    image: p.imageUrl || p.thumbnailUrl || '',
    likes: p.likes.length,
    caption: p.caption || '',
    time: formatTimeAgo(p.createdAt),
    liked: p.likes.some((l: any) => l.userId === currentUser.id),
    saved: p.savedPosts.some((s: any) => s.userId === currentUser.id),
    comments: p.comments.map((c: any) => ({
      user: c.user.username || 'user',
      userImage: c.user.image || undefined,
      text: c.content,
      time: formatTimeAgo(c.createdAt)
    }))
  }));
}

// Helper to format post timestamp
function formatTimeAgo(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export async function getReelsAction() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return [];

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { following: { select: { id: true } } }
  });
  if (!currentUser) return [];

  const reels = await (prisma as any).post.findMany({
    where: { postType: 'reel' },
    include: {
      user: { select: { id: true, username: true, image: true, isPrivate: true } },
      likes: { select: { userId: true } },
      comments: {
        include: { user: { select: { id: true, username: true, image: true } } },
        orderBy: { createdAt: 'asc' }
      },
      savedPosts: { select: { userId: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  return reels.map((p: any) => ({
    id: p.id,
    user: p.user.username || 'user',
    userImage: p.user.image || undefined,
    userId: p.user.id,
    image: p.imageUrl || p.thumbnailUrl || '',
    likes: p.likes.length,
    caption: p.caption || '',
    time: formatTimeAgo(p.createdAt),
    liked: p.likes.some((l: any) => l.userId === currentUser.id),
    saved: p.savedPosts.some((s: any) => s.userId === currentUser.id),
    comments: p.comments.map((c: any) => ({
      id: c.id,
      user: c.user.username || 'user',
      userImage: c.user.image || undefined,
      text: c.content,
      time: formatTimeAgo(c.createdAt)
    }))
  }));
}



// -- Activity Status Server Actions ------------------------------------------

export async function updateActivityStatus(action: 'online' | 'offline' | 'heartbeat') {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const now = new Date();
  let data: any = { lastHeartbeat: now };

  if (action === 'online') {
    data = { isOnline: true, lastSeen: now, lastHeartbeat: now };
  } else if (action === 'offline') {
    data = { isOnline: false, lastSeen: now, lastHeartbeat: now };
  }

  return await prisma.user.update({
    where: { email: session.user.email },
    data,
    select: { id: true, isOnline: true, lastSeen: true, showActivityStatus: true }
  });
}

export async function toggleShowActivityStatus(show: boolean) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  return await prisma.user.update({
    where: { email: session.user.email },
    data: { showActivityStatus: show },
    select: { id: true, showActivityStatus: true }
  });
}

export async function getMyActivitySettings() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  return await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, showActivityStatus: true, isOnline: true, lastSeen: true }
  });
}

// ── Public User Profile & Follow Server Actions ──

export async function getUserPublicProfile(targetUserId: string) {
  const session = await getServerSession(authOptions);
  let currentUserId: string | null = null;

  if (session?.user?.email) {
    const me = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true }
    });
    currentUserId = me?.id || null;
  }

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      username: true,
      image: true,
      bio: true,
      website: true,
      isOnline: true,
      lastSeen: true,
      createdAt: true,
      _count: {
        select: {
          followers: true,
          following: true,
          posts: true,
          likes: true
        }
      }
    }
  });

  if (!user) return null;

  let isFollowing = false;
  let hasSentRequest = false;
  if (currentUserId && currentUserId !== targetUserId) {
    const followCheck = await prisma.user.findFirst({
      where: {
        id: currentUserId,
        following: { some: { id: targetUserId } }
      },
      select: { id: true }
    });
    isFollowing = !!followCheck;

    if (!isFollowing) {
      const reqCheck = await (prisma as any).followRequest.findUnique({
        where: {
          senderId_receiverId: {
            senderId: currentUserId,
            receiverId: targetUserId
          }
        },
        select: { id: true }
      });
      hasSentRequest = !!reqCheck;
    }
  }

  // Real authoritative database counts
  const followersCount = user._count?.followers ?? 0;
  const followingCount = user._count?.following ?? 0;
  const postsCount = user._count?.posts ?? 0;
  const likesCount = user._count?.likes ?? 0;

  // Real rating: Displays empty state '—' when no reviews exist rather than fake score
  const ratingStr = '—';

  return {
    ...user,
    isFollowing,
    hasSentRequest,
    isSelf: currentUserId === targetUserId,
    stats: {
      rating: ratingStr,
      followers: followersCount,
      following: followingCount,
      posts: postsCount,
      likes: likesCount
    }
  };
}

export async function getGlobalEdgeRequestCount() {
  return 0;
}

export async function clearAllDatabaseAndBucketsAction() {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || '').toLowerCase().trim();
  const isAdmin = 
    email === 'hammadnawaz519@gmail.com' || 
    email === 'hammadnawz519@gmail.com' ||
    email === 'hammadnawaz00519@gmail.com' ||
    email === 'hammadnawaz276@gmail.com' ||
    email.includes('hammadnawaz');

  if (!isAdmin) {
    return { error: 'Unauthorized: Admin access required' };
  }

  try {
    // 1. Delete all relational data in order, leaving ONLY User (and Auth) records
    try {
      await (prisma as any).$executeRawUnsafe(`
        TRUNCATE TABLE 
          "SocialReaction", 
          "SocialMessage", 
          "HiddenSocialChat", 
          "SocialCall", 
          "FollowRequest", 
          "Like", 
          "Comment", 
          "SavedPost", 
          "Post", 
          "Story", 
          "Message", 
          "ChatNickname", 
          "PendingUser", 
          "VerificationToken",
          "_UserFollows"
        CASCADE;
      `);
    } catch (rawErr) {
      // Fallback to Prisma deleteMany in strict foreign-key order
      await (prisma as any).socialReaction.deleteMany({}).catch(() => {});
      await (prisma as any).chatNickname.deleteMany({}).catch(() => {});
      await (prisma as any).comment.deleteMany({}).catch(() => {});
      await (prisma as any).like.deleteMany({}).catch(() => {});
      await (prisma as any).savedPost.deleteMany({}).catch(() => {});
      await (prisma as any).post.deleteMany({}).catch(() => {});
      await (prisma as any).story.deleteMany({}).catch(() => {});
      await (prisma as any).socialCall.deleteMany({}).catch(() => {});
      await (prisma as any).hiddenSocialChat.deleteMany({}).catch(() => {});
      await (prisma as any).socialMessage.deleteMany({}).catch(() => {});
      await (prisma as any).followRequest.deleteMany({}).catch(() => {});
      await (prisma as any).message.deleteMany({}).catch(() => {});
      await (prisma as any).pendingUser.deleteMany({}).catch(() => {});
      await (prisma as any).verificationToken.deleteMany({}).catch(() => {});
    }

    // 2. Empty Supabase Storage Buckets
    try {
      await Promise.all([
        emptyStorageBucket(CHAT_MEDIA_BUCKET),
        emptyStorageBucket(PUBLIC_MEDIA_BUCKET),
      ]);
    } catch (storageErr) {
      console.warn("Storage bucket clearing warning:", storageErr);
    }

    return {
      success: true,
      message: 'All messages, calls, posts, stories & storage buckets cleared! Only Users preserved.'
    };
  } catch (err: any) {
    console.error("Failed to clear database & buckets:", err);
    return { error: err?.message || 'Failed to clear database' };
  }
}
