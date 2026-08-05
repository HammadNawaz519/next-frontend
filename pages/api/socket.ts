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

      socket.on("identify", ({ email: rawEmail }: { email: string }) => {
        if (!rawEmail) return;
        const email = rawEmail.toLowerCase().trim();
        socket.join(email); 
        (socket as any).userEmail = email; 
        console.log(`User ${email} identified.`);
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
      const handleCallReq = (data: any) => {
        const target = (data.to || data.toUserId || '').toLowerCase().trim();
        if (target) socket.to(target).emit('incoming_call', { from: data.from, type: data.type, callId: data.callId });
      };
      socket.on('call_user', handleCallReq);
      socket.on('call_request', handleCallReq);

      const handleCallAcc = (data: any) => {
        const target = (data.to || data.toUserId || '').toLowerCase().trim();
        if (target) {
          socket.to(target).emit('call_accepted', { from: data.from });
          socket.to(target).emit('call_accept', { from: data.from });
        }
      };
      socket.on('accept_call', handleCallAcc);
      socket.on('call_accept', handleCallAcc);

      const handleCallRej = (data: any) => {
        const target = (data.to || data.toUserId || '').toLowerCase().trim();
        if (target) {
          socket.to(target).emit('call_rejected');
          socket.to(target).emit('call_decline');
        }
      };
      socket.on('reject_call', handleCallRej);
      socket.on('call_decline', handleCallRej);

      socket.on('call_cancel', (data: any) => {
        const target = (data.to || data.toUserId || '').toLowerCase().trim();
        if (target) socket.to(target).emit('call_cancelled');
      });

      socket.on('call_timeout', (data: any) => {
        const target = (data.to || data.toUserId || '').toLowerCase().trim();
        if (target) socket.to(target).emit('call_timed_out');
      });

      socket.on('webrtc_signal', (data: any) => {
        const target = (data.to || data.toUserId || '').toLowerCase().trim();
        if (target) socket.to(target).emit('webrtc_signal', data.signal);
      });

      socket.on('offer', (data: any) => {
        const target = (data.to || data.toUserId || '').toLowerCase().trim();
        if (target) socket.to(target).emit('offer', { offer: data.offer });
      });

      socket.on('answer', (data: any) => {
        const target = (data.to || data.toUserId || '').toLowerCase().trim();
        if (target) socket.to(target).emit('answer', { answer: data.answer });
      });

      socket.on('ice_candidate', (data: any) => {
        const target = (data.to || data.toUserId || '').toLowerCase().trim();
        if (target) socket.to(target).emit('ice_candidate', { candidate: data.candidate });
      });

      const handleCallEnding = (data: any) => {
        const target = (data.to || data.toUserId || '').toLowerCase().trim();
        if (target) socket.to(target).emit('call_ended');
      };
      socket.on('end_call', handleCallEnding);
      socket.on('call_end', handleCallEnding);

      socket.on("disconnect", () => {
        console.log("Socket disconnected:", socket.id);
      });
    });
  }
  res.end();
};

export default SocketHandler;

