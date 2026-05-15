import { Server as NetServer } from "http";
import { NextApiRequest } from "next";
import { Server as ServerIO, Socket } from "socket.io";
import { NextApiResponseServerIO } from "@/types/next";

export const config = {
  api: {
    bodyParser: false,
  },
};

interface SocialMessageData {
  receiverEmail: string;
  [key: string]: any;
}

interface SocialReactionData {
  receiverEmail: string;
  [key: string]: any;
}

interface SocialDeleteData {
  receiverEmail: string;
  [key: string]: any;
}

const SocketHandler = (req: NextApiRequest, res: NextApiResponseServerIO) => {
  if (!res.socket.server.io) {
    console.log("New Socket.io server...");
    const httpServer: NetServer = res.socket.server as any;
    const io = new ServerIO(httpServer, {
      path: "/api/socket",
      addTrailingSlash: false,
    });
    res.socket.server.io = io;

    // Use a map to track online users: email -> Set of socketIds
    const onlineUsers = new Map<string, Set<string>>();

    io.on("connection", (socket: Socket) => {
      console.log("Socket connected:", socket.id);

      socket.on("identify", ({ email: rawEmail }: { email: string }) => {
        if (!rawEmail) return;
        const email = rawEmail.toLowerCase().trim();
        socket.join(email); 
        
        if (!onlineUsers.has(email)) {
          onlineUsers.set(email, new Set());
        }
        onlineUsers.get(email)!.add(socket.id);
        (socket as any).userEmail = email; 
        
        console.log(`User ${email} identified. Sockets: ${onlineUsers.get(email)!.size}`);
        
        // Broadcast that user is online
        io.emit("user_online", { email });
        
        // Send the list of current online users to the newly connected user
        socket.emit("online_users_list", Array.from(onlineUsers.keys()));
      });

      socket.on("send_social_message", (data: SocialMessageData) => {
        const { receiverEmail, ...msgData } = data;
        const target = receiverEmail.toLowerCase().trim();
        socket.to(target).emit("receive_social_message", msgData);
        // Also emit to other tabs of the same sender
        socket.to((socket as any).userEmail).emit("receive_social_message", msgData);
      });

      socket.on("react_social_message", (data: SocialReactionData) => {
        const { receiverEmail, ...reactionData } = data;
        socket.to(receiverEmail).emit("receive_social_reaction", reactionData);
      });

      socket.on("delete_social_message", (data: SocialDeleteData) => {
        const { receiverEmail, ...deleteData } = data;
        socket.to(receiverEmail).emit("receive_social_delete", deleteData);
      });

      socket.on("typing", ({ receiverEmail }) => {
        const senderEmail = (socket as any).userEmail;
        socket.to(receiverEmail).emit("user_typing", { email: senderEmail });
      });

      socket.on("stop_typing", ({ receiverEmail }) => {
        const senderEmail = (socket as any).userEmail;
        socket.to(receiverEmail).emit("user_stop_typing", { email: senderEmail });
      });

      socket.on('mark_as_seen', (data) => {
        socket.broadcast.emit('messages_seen', data);
      });

      // --- CALL EVENTS ---
      socket.on('call_user', (data) => {
        const target = data.to.toLowerCase().trim();
        socket.to(target).emit('incoming_call', { from: data.from, type: data.type });
      });

      socket.on('accept_call', (data) => {
        const target = data.to.toLowerCase().trim();
        socket.to(target).emit('call_accepted', { from: data.from });
      });

      socket.on('reject_call', (data) => {
        const target = data.to.toLowerCase().trim();
        socket.to(target).emit('call_rejected');
      });

      socket.on('webrtc_signal', (data) => {
        const target = data.to.toLowerCase().trim();
        socket.to(target).emit('webrtc_signal', data.signal);
      });

      socket.on('end_call', (data) => {
        const target = data.to.toLowerCase().trim();
        socket.to(target).emit('call_ended');
      });

      socket.on("disconnect", () => {
        const email = (socket as any).userEmail;
        if (email && onlineUsers.has(email)) {
          const sockets = onlineUsers.get(email)!;
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            onlineUsers.delete(email);
            io.emit("user_offline", { email });
            console.log(`User ${email} went offline (all sockets closed)`);
          } else {
            console.log(`User ${email} closed one socket. Remaining: ${sockets.size}`);
          }
        }
        console.log("Socket disconnected:", socket.id);
      });
    });
  }
  res.end();
};

export default SocketHandler;

