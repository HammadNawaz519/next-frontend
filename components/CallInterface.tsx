"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';

interface CallInterfaceProps {
  socket: Socket;
  peer: any;
  type: 'audio' | 'video';
  isCaller: boolean;
  onEnd: (duration?: number) => void;
}

export default function CallInterface({ socket, peer, type, isCaller, onEnd }: CallInterfaceProps) {
  const [callStatus, setCallStatus] = useState<'ringing' | 'connecting' | 'active' | 'ended'>('ringing');
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [duration, setDuration] = useState(0);
  const durationRef = useRef(0);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (callStatus === 'active') {
      timer = setInterval(() => {
        setDuration(prev => prev + 1);
        durationRef.current += 1;
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [callStatus]);

  useEffect(() => {
    const initCall = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: type === 'video'
        });
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        pcRef.current = pc;

        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        pc.ontrack = (event) => {
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = event.streams[0];
            setCallStatus('active');
          }
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            const target = peer.email.toLowerCase().trim();
            socket.emit('webrtc_signal', { to: target, signal: { candidate: event.candidate } });
          }
        };

        if (isCaller) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          const target = peer.email.toLowerCase().trim();
          socket.emit('webrtc_signal', { to: target, signal: { sdp: offer } });
        }

        socket.on('webrtc_signal', async (signal) => {
          if (signal.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            if (signal.sdp.type === 'offer') {
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              const target = peer.email.toLowerCase().trim();
              socket.emit('webrtc_signal', { to: target, signal: { sdp: answer } });
            }
          } else if (signal.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          }
        });

        socket.on('call_ended', () => {
          cleanup();
          onEnd(durationRef.current);
        });

      } catch (err) {
        console.error("Call error:", err);
        cleanup();
        onEnd(durationRef.current);
      }
    };

    initCall();

    return () => cleanup();
  }, []);

  const cleanup = () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    pcRef.current?.close();
    socket.off('webrtc_signal');
    socket.off('call_ended');
  };

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  };

  const toggleCamera = () => {
    if (localStreamRef.current && type === 'video') {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      videoTrack.enabled = !videoTrack.enabled;
      setIsCamOff(!videoTrack.enabled);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white animate-in fade-in duration-500 overflow-hidden font-sans">
      {/* Remote Video Background (Video Call Only) */}
      {type === 'video' && (
        <video 
          ref={remoteVideoRef} 
          autoPlay 
          playsInline 
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Main UI Layer */}
      <div className={`relative z-10 w-full h-full flex flex-col items-center justify-center ${type === 'video' ? 'bg-black/10' : ''}`}>
        
        {/* Top Floating Status (Video Call) */}
        {type === 'video' && callStatus === 'active' && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-white/90 backdrop-blur-xl border border-gray-100 rounded-full shadow-lg flex items-center gap-3">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs font-semibold tracking-wider text-black">{formatDuration(duration)}</span>
          </div>
        )}

        {/* Center Content (Audio Call or Ringing) */}
        {(type === 'audio' || callStatus !== 'active') && (
          <div className="flex flex-col items-center gap-6 text-center animate-in zoom-in duration-700">
            <div className="relative">
              {callStatus === 'ringing' && (
                <>
                  <div className="absolute inset-0 bg-gray-100 rounded-full animate-ping [animation-duration:2s]" />
                  <div className="absolute -inset-6 bg-gray-50 rounded-full animate-pulse [animation-duration:3s]" />
                </>
              )}
              <div className="relative w-32 h-32 rounded-full overflow-hidden border-4 border-white shadow-[0_15px_40px_rgba(0,0,0,0.1)] bg-gray-50 flex items-center justify-center text-4xl font-bold text-gray-900">
                {peer.image ? <img src={peer.image} className="w-full h-full object-cover" /> : peer.name?.charAt(0)}
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-extrabold text-black tracking-tight">{peer.name}</h2>
              <div className="flex items-center justify-center gap-2">
                <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-[9px] font-bold uppercase tracking-widest">
                  {type} Call
                </span>
                <span className="text-gray-400 font-medium text-base">
                  {callStatus === 'active' ? formatDuration(duration) : callStatus === 'ringing' ? 'Ringing...' : 'Connecting...'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Local Video (PiP - Minimal Round) */}
        {type === 'video' && (
          <div className="absolute top-6 right-6 w-32 h-44 rounded-3xl overflow-hidden border-2 border-white shadow-xl bg-gray-900 z-20 group hover:scale-105 transition-transform duration-300">
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover mirror" />
          </div>
        )}

        {/* Action Bar (The Vibe) */}
        <div className="absolute bottom-10 flex items-center gap-6 px-8 py-4 bg-white/95 backdrop-blur-2xl border border-gray-100 rounded-full shadow-[0_15px_50px_rgba(0,0,0,0.1)] z-30">
          
          <button 
            onClick={toggleMute}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-red-50 text-red-500' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </button>

          {type === 'video' && (
            <button 
              onClick={toggleCamera}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${isCamOff ? 'bg-red-50 text-red-500' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          )}

          <button 
            onClick={() => { 
              cleanup(); 
              const target = peer.email.toLowerCase().trim();
              socket.emit('end_call', { to: target }); 
              onEnd(durationRef.current); 
            }}
            className="w-14 h-14 rounded-full bg-black text-white flex items-center justify-center hover:bg-red-600 transition-all shadow-xl active:scale-90"
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2 2m0 0l2 2m-2-2l-2 2m2-2l2-2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
            </svg>
          </button>

          <button 
            className="w-11 h-11 rounded-full bg-gray-50 text-gray-600 flex items-center justify-center hover:bg-gray-100"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </button>
        </div>

        {/* Footer info */}
        <p className="absolute bottom-4 text-[8px] text-gray-300 font-bold uppercase tracking-[0.3em]">
          Ultra Secure • End-To-End Encrypted
        </p>
      </div>
      
      <style jsx>{`
        .mirror { transform: scaleX(-1); }
      `}</style>
    </div>
  );
}
