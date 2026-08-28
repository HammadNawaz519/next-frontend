'use client';

import React from 'react';

interface IncomingCallModalProps {
  incomingCall: {
    from: {
      id?: string;
      name?: string;
      email?: string;
      image?: string;
    };
    type: 'audio' | 'video';
    offer?: any;
    callId?: string;
  } | null;
  onAccept: () => void;
  onReject: () => void;
}

export default function IncomingCallModal({
  incomingCall,
  onAccept,
  onReject,
}: IncomingCallModalProps) {
  if (!incomingCall) return null;

  return (
    <div
      className="fixed inset-0 z-[1500] flex items-center justify-center backdrop-blur-md animate-in fade-in duration-500 overflow-hidden font-sans select-none"
      style={{ background: 'rgba(0,0,0,0.5)' }}
    >
      <div
        className="relative z-10 w-full h-full flex flex-col items-center justify-center"
        style={{
          background: incomingCall.type === 'video' ? 'rgba(0,0,0,0.6)' : 'transparent',
        }}
      >
        <div className="flex flex-col items-center gap-6 text-center animate-in zoom-in duration-700">
          <div className="relative">
            <div
              className="absolute inset-0 rounded-full animate-ping [animation-duration:2s]"
              style={{ background: 'var(--dm-bg-input, #333)' }}
            />
            <div
              className="absolute -inset-6 rounded-full animate-pulse [animation-duration:3s]"
              style={{ background: 'var(--dm-bg-active, #444)', opacity: 0.5 }}
            />
            <div
              className="relative w-32 h-32 rounded-full overflow-hidden border-4 border-white/20 shadow-2xl flex items-center justify-center text-4xl font-bold bg-zinc-800 text-white"
            >
              {incomingCall.from.image ? (
                <img
                  src={incomingCall.from.image}
                  alt={incomingCall.from.name || 'Caller'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{incomingCall.from.name?.charAt(0) || '👤'}</span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-extrabold tracking-tight text-white">
              {incomingCall.from.name || 'Incoming Caller'}
            </h2>
            <div className="flex items-center justify-center gap-2">
              <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-white/15 text-white">
                Incoming {incomingCall.type === 'video' ? 'Video' : 'Voice'} Call
              </span>
              <span className="font-medium text-sm text-zinc-300">
                Ringing...
              </span>
            </div>
          </div>
        </div>

        {/* Action Bar (Decline / Accept) */}
        <div className="absolute bottom-10 flex items-center gap-6 px-8 py-4 backdrop-blur-2xl rounded-full shadow-2xl z-30 bg-[#141111]/90 border border-white/10">
          {/* Decline Button */}
          <button
            onClick={onReject}
            className="w-14 h-14 rounded-full flex items-center justify-center hover:scale-105 active:scale-90 transition-all shadow-xl bg-red-500 text-white cursor-pointer outline-none border-0"
            title="Decline Call"
            aria-label="Decline Call"
          >
            <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.71c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.66c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
            </svg>
          </button>

          {/* Accept Button */}
          <button
            onClick={onAccept}
            className="w-14 h-14 rounded-full flex items-center justify-center hover:scale-105 active:scale-90 transition-all shadow-xl bg-emerald-500 text-white animate-bounce cursor-pointer outline-none border-0"
            title="Accept Call"
            aria-label="Accept Call"
          >
            <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
