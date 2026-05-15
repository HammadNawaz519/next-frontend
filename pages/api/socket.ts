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

    io.on("connection", (socket: Socket) => {
      console.log("Socket connected:", socket.id);

      socket.on("identify", ({ email }: { email: string }) => {
        socket.join(email); // Join a room for their email
        console.log(`User ${email} joined room`);
      });

      socket.on("send_social_message", (data: SocialMessageData) => {
        const { receiverEmail, ...msgData } = data;
        // Emit to the receiver's room
        socket.to(receiverEmail).emit("receive_social_message", msgData);
        // Also emit back to the sender
        socket.emit("receive_social_message", msgData);
      });

      socket.on("react_social_message", (data: SocialReactionData) => {
        const { receiverEmail, ...reactionData } = data;
        socket.to(receiverEmail).emit("receive_social_reaction", reactionData);
      });

      socket.on("delete_social_message", (data: SocialDeleteData) => {
        const { receiverEmail, ...deleteData } = data;
        socket.to(receiverEmail).emit("receive_social_delete", deleteData);
      });

      socket.on('mark_as_seen', (data) => {
        socket.broadcast.emit('messages_seen', data);
      });

      // --- CALL EVENTS ---
      socket.on('call_user', (data) => {
        // data: { to: receiverEmail, from: senderUser, type: 'audio'|'video' }
        socket.to(data.to).emit('incoming_call', { from: data.from, type: data.type });
      });

      socket.on('accept_call', (data) => {
        // data: { to: callerEmail }
        socket.to(data.to).emit('call_accepted', { from: data.from });
      });

      socket.on('reject_call', (data) => {
        socket.to(data.to).emit('call_rejected');
      });

      socket.on('webrtc_signal', (data) => {
        // data: { to: peerEmail, signal: offer/answer/candidate }
        socket.to(data.to).emit('webrtc_signal', data.signal);
      });

      socket.on('end_call', (data) => {
        socket.to(data.to).emit('call_ended');
      });

      socket.on("disconnect", () => {

        console.log("Socket disconnected:", socket.id);
      });
    });
  }
  res.end();
};

export default SocketHandler;

