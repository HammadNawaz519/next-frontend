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
            content: "You are a helpful AI assistant. You provide concise and accurate answers. When asked about searching the web, simulate that you have access to the latest information.",
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

export async function searchUsers(query: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return [];

  return await prisma.user.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { username: { contains: query, mode: 'insensitive' } }
      ],
      NOT: { id: (session.user as any).id }
    },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
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
        { senderId: currentUser.id, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: currentUser.id }
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

  if (deleteFor === 'everyone') {
    const msg = await prisma.socialMessage.findUnique({ where: { id: messageId } });
    if (msg?.senderId !== currentUser.id) return null;

    return await prisma.socialMessage.update({
      where: { id: messageId },
      data: { 
        content: "🚫 This message was deleted", 
        type: "deleted"
      }
    });
  } else {
    return { success: true };
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

  // This is a simplified version of getting recent chats.
  // In a real app, you'd want to aggregate messages to find unique conversation partners.
  const sent = await prisma.socialMessage.findMany({
    where: { senderId: currentUser.id },
    distinct: ['receiverId'],
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { receiver: { select: { id: true, name: true, username: true, email: true, image: true } } }
  });

  const received = await prisma.socialMessage.findMany({
    where: { receiverId: currentUser.id },
    distinct: ['senderId'],
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { sender: { select: { id: true, name: true, username: true, email: true, image: true } } }
  });

  const formatLastMessage = (m: any) => {
    if (m.type === 'voice') return 'Voice Message';
    if (m.type === 'image') return 'Image';
    if (m.type === 'video') return 'Video';
    if (m.type === 'file') return 'Attachment';
    if (m.type === 'deleted') return 'Message deleted';
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

  sent.forEach(m => partners.set(m.receiverId, { ...m.receiver, lastMessage: formatLastMessage(m), lastTime: m.createdAt, isRequest: false, unseenCount: 0 }));
  received.forEach(m => {
    const existing = partners.get(m.senderId);
    // If we have sent them a message, they are a contact (isRequest = false)
    // If we have only received, they are a request (isRequest = true)
    const isRequest = !partners.has(m.senderId);
    
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
