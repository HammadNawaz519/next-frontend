'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function askAI(prompt: string) {
  const apiKey = process.env.VITE_GROQ_API_KEY;
  const model = process.env.VITE_GROQ_MODEL || "llama-3.3-70b-versatile";

  if (!apiKey) {
    throw new Error("AI API Key is missing");
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "system",
            content: "You are a helpful, knowledgeable, and friendly AI assistant. Answer any question clearly and concisely. You can help with anything — writing, coding, math, general knowledge, advice, or just a conversation.",
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

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error("[AI_ERROR]", error);
    throw new Error("Failed to get AI response");
  }
}

export async function getSocialUser(userId: string) {
  return await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      image: true
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
      name: true,
      username: true,
      email: true,
      createdAt: true,
      image: true
    }
  });
}



export async function getSocialMessages(otherUserId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return [];

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email }
  });

  if (!currentUser) return [];

  return await prisma.socialMessage.findMany({
    where: {
      OR: [
        { senderId: currentUser.id, receiverId: otherUserId, deletedBySender: false },
        { senderId: otherUserId, receiverId: currentUser.id, deletedByReceiver: false }
      ]
    },
    include: {
      reactions: {
        include: {
          user: {
            select: { id: true, name: true, username: true }
          }
        }
      }
    },
    orderBy: { createdAt: 'asc' }
  });
}

export async function markMessagesAsSeen(senderId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email }
  });

  if (!currentUser) return null;

  return await prisma.socialMessage.updateMany({
    where: {
      senderId: senderId,
      receiverId: currentUser.id,
      isSeen: false
    },
    data: {
      isSeen: true
    }
  });
}


export async function saveSocialMessage(receiverId: string, content: string, type: string = "text") {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email }
  });

  if (!currentUser) return null;

  return await prisma.socialMessage.create({
    data: {
      content,
      type,
      senderId: currentUser.id,
      receiverId
    },
    include: {
      reactions: true
    }
  });
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

    return await prisma.socialMessage.update({
      where: { id: messageId },
      data: { 
        content: "This message was deleted", 
        type: "deleted"
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

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email }
  });

  if (!currentUser) return [];

  // 1. Get all receiverIds this user has EVER sent a message to.
  // Anyone in this list is an active contact (isRequest = false).
  const sentMessages = await prisma.socialMessage.findMany({
    where: { senderId: currentUser.id },
    select: { receiverId: true },
    distinct: ['receiverId']
  });
  const contactIdsSet = new Set(sentMessages.map(m => m.receiverId));

  const sent = await prisma.socialMessage.findMany({
    where: { senderId: currentUser.id },
    distinct: ['receiverId'],
    orderBy: { createdAt: 'desc' },
    include: { receiver: { select: { id: true, name: true, username: true, email: true, image: true } } }
  });

  const received = await prisma.socialMessage.findMany({
    where: { receiverId: currentUser.id },
    distinct: ['senderId'],
    orderBy: { createdAt: 'desc' },
    include: { sender: { select: { id: true, name: true, username: true, email: true, image: true } } }
  });

  const formatLastMessage = (m: any) => {
    if (m.type === 'voice') return 'Voice Message';
    if (m.type === 'image') return 'Image';
    if (m.type === 'video') return 'Video';
    if (m.type === 'file') return 'Attachment';
    if (m.type === 'deleted') return 'Message deleted';
    if (m.type === 'accepted') return 'Request accepted';
    return m.content.length > 30 ? m.content.substring(0, 30) + '...' : m.content;
  };

  // Merge and sort
  const partners = new Map();
  
  // Get unseen counts for each sender
  const unseenMessages = await prisma.socialMessage.groupBy({
    by: ['senderId'],
    where: {
      receiverId: currentUser.id,
      isSeen: false
    },
    _count: true
  });
  const unseenMap = new Map(unseenMessages.map(m => [m.senderId, m._count]));

  sent.forEach(m => {
    partners.set(m.receiverId, { 
      ...m.receiver, 
      lastMessage: formatLastMessage(m), 
      lastTime: m.createdAt, 
      isRequest: false, 
      unseenCount: 0 
    });
  });

  received.forEach(m => {
    const existing = partners.get(m.senderId);
    // If the sender has ever received a message from us, they are a contact (isRequest = false)
    // If we have only received messages from them and never sent any, they are a request (isRequest = true)
    const isRequest = !contactIdsSet.has(m.senderId);
    
    if (!existing || m.createdAt > existing.lastTime) {
      partners.set(m.senderId, { 
        ...m.sender, 
        lastMessage: formatLastMessage(m), 
        lastTime: m.createdAt,
        isRequest: isRequest,
        unseenCount: unseenMap.get(m.senderId) || 0
      });
    }
  });

  return Array.from(partners.values()).sort((a, b) => (b.lastTime as any) - (a.lastTime as any));
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
    where: { email: session.user.email }
  });

  if (!currentUser) return [];
  
  const callModel = (prisma as any).socialCall;
  if (!callModel) return [];

  return await callModel.findMany({

    where: {
      OR: [
        { callerId: currentUser.id },
        { receiverId: currentUser.id }
      ]
    },
    include: {
      caller: { select: { name: true, image: true } },
      receiver: { select: { name: true, image: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

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

export async function updateName(newName: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { error: 'Not authenticated' };

  const trimmed = newName.trim();
  if (!trimmed || trimmed.length < 2) return { error: 'Name must be at least 2 characters' };

  const updated = await prisma.user.update({
    where: { email: session.user.email },
    data: { name: trimmed }
  });
  return { success: true, name: updated.name };
}

export async function saveTranslationHistory(text: string, language: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  });

  if (!user) return null;

  const histModel = (prisma as any).translationHistory;
  if (!histModel) return null;

  return await histModel.create({
    data: {
      text,
      language,
      userId: user.id
    }
  });
}

export async function getTranslationHistory() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return [];

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  });

  if (!user) return [];

  const histModel = (prisma as any).translationHistory;
  if (!histModel) return [];

  return await histModel.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50
  });
}

export async function getProfileDetails() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const user = await (prisma.user as any).findUnique({
    where: { email: session.user.email },
    include: {
      followers: {
        select: { id: true, name: true, username: true, image: true }
      },
      following: {
        select: { id: true, name: true, username: true, image: true }
      },
      posts: {
        orderBy: { createdAt: 'desc' }
      },
      receivedFollowRequests: {
        include: {
          sender: { select: { id: true, name: true, username: true, image: true } }
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
  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.bio !== undefined) updateData.bio = data.bio;
  if (data.website !== undefined) updateData.website = data.website.trim();
  if (data.image !== undefined) updateData.image = data.image;

  if (data.username !== undefined) {
    const trimmed = data.username.trim().toLowerCase().replace(/\s+/g, '');
    if (trimmed) {
      const existing = await prisma.user.findFirst({
        where: { username: trimmed, NOT: { email: session.user.email } }
      });
      if (existing) {
        return { error: 'Username already taken' };
      }
      updateData.username = trimmed;
    }
  }

  const updated = await prisma.user.update({
    where: { email: session.user.email },
    data: updateData
  });

  return { success: true, user: updated };
}

export async function updateProfileImageAction(imageUrl: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { error: 'Not authenticated' };

  const updated = await prisma.user.update({
    where: { email: session.user.email },
    data: { image: imageUrl }
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
      sender: { select: { id: true, name: true, username: true, image: true } }
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

export async function createPostAction(thumbnailUrl: string, postType: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { error: 'Not authenticated' };

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  });

  if (!user) return { error: 'User not found' };

  const post = await (prisma as any).post.create({
    data: {
      thumbnailUrl,
      postType,
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
    orderBy: { createdAt: 'desc' },
    take: 60,
    include: {
      user: { select: { id: true, name: true, username: true, image: true, isPrivate: true } }
    }
  });
}

export async function searchUsers(query: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return [];

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email }
  });

  if (!currentUser) return [];

  return await (prisma.user as any).findMany({
    where: {
      id: { not: currentUser.id },
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { username: { contains: query, mode: 'insensitive' } }
      ]
    },
    select: { id: true, name: true, username: true, image: true, bio: true, isPrivate: true }
  });
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
        select: { id: true, name: true, username: true, image: true }
      },
      following: {
        select: { id: true, name: true, username: true, image: true }
      },
      posts: {
        orderBy: { createdAt: 'desc' }
      },
      receivedFollowRequests: {
        include: {
          sender: { select: { id: true, name: true, username: true, image: true } }
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
    return { success: true, isFollowing: false, hasSentRequest: false };
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
      return { success: true, isFollowing: false, hasSentRequest: false };
    } else {
      // Create request
      await (prisma as any).followRequest.create({
        data: {
          senderId: currentUser.id,
          receiverId: targetUserId
        }
      });
      return { success: true, isFollowing: false, hasSentRequest: true };
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
  return { success: true, isFollowing: true, hasSentRequest: false };
}

