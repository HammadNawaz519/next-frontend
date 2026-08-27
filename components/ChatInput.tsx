'use client';

import React, { useState, useRef, useEffect } from 'react';
import { triggerHaptic } from '@/lib/haptics';

export interface ChatInputProps {
  onSendMessage: (text: string) => void;
  onSendVoice?: (audioBlob: Blob, durationSeconds: number) => void;
  onOpenGallery?: () => void;
  onTyping?: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function ChatInput({
  onSendMessage,
  onSendVoice,
  onOpenGallery,
  onTyping,
  placeholder = 'Message...',
  disabled = false,
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isCancelled, setIsCancelled] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pointerStartX = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Clean up timers & recording on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed || disabled) return;
    triggerHaptic('light');
    onSendMessage(trimmed);
    setMessage('');
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Format recording seconds (e.g. 00:03)
  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainder = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  };

  // Start Voice Recording
  const startRecording = async (clientX?: number) => {
    if (disabled) return;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('Audio recording is not supported in this browser.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      setIsCancelled(false);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (!isCancelled && audioChunksRef.current.length > 0 && onSendVoice) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const totalDuration = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
          onSendVoice(audioBlob, totalDuration);
        }
      };

      mediaRecorder.start(100);
      startTimeRef.current = Date.now();
      setIsRecording(true);
      setRecordingDuration(0);
      pointerStartX.current = clientX ?? null;
      triggerHaptic('medium');

      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start microphone recording:', err);
    }
  };

  // Stop & finalize recording
  const stopRecording = (shouldCancel = false) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (shouldCancel) {
      setIsCancelled(true);
      triggerHaptic('heavy');
    } else {
      triggerHaptic('light');
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setRecordingDuration(0);
    pointerStartX.current = null;
  };

  // Pointer event handlers for slide-to-cancel
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    startRecording(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isRecording || pointerStartX.current === null) return;
    const deltaX = e.clientX - pointerStartX.current;
    if (deltaX < -60) {
      stopRecording(true);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch (err) {}
    if (isRecording) {
      stopRecording(false);
    }
  };

  const handlePointerCancel = () => {
    if (isRecording) {
      stopRecording(true);
    }
  };

  return (
    <div className="w-[93%] max-w-[420px] mx-auto h-[58px] bg-white border border-zinc-100 rounded-full flex items-center justify-between px-2 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.08)] relative select-none">
      
      {/* ── LEFT: Gallery Selection Button (gallery-svgrepo-com.svg) ── */}
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          onOpenGallery?.();
        }}
        className="w-11 h-11 rounded-full bg-zinc-100/90 hover:bg-zinc-200/80 text-zinc-600 flex items-center justify-center shrink-0 cursor-pointer active:scale-90 transition-all outline-none"
        title="Open Gallery & Files"
      >
        <svg className="w-5 h-5 text-zinc-600" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18 8C18 9.10457 17.1046 10 16 10C14.8954 10 14 9.10457 14 8C14 6.89543 14.8954 6 16 6C17.1046 6 18 6.89543 18 8Z" />
          <path fillRule="evenodd" clipRule="evenodd" d="M11.9426 1.25H12.0574C14.3658 1.24999 16.1748 1.24998 17.5863 1.43975C19.031 1.63399 20.1711 2.03933 21.0659 2.93414C21.9607 3.82895 22.366 4.96897 22.5603 6.41371C22.75 7.82519 22.75 9.63423 22.75 11.9426V12.0309C22.75 13.9397 22.75 15.5023 22.6463 16.7745C22.5422 18.0531 22.3287 19.1214 21.8509 20.0087C21.6401 20.4001 21.3812 20.7506 21.0659 21.0659C20.1711 21.9607 19.031 22.366 17.5863 22.5603C16.1748 22.75 14.3658 22.75 12.0574 22.75H11.9426C9.63423 22.75 7.82519 22.75 6.41371 22.5603C4.96897 22.366 3.82895 21.9607 2.93414 21.0659C2.14086 20.2726 1.7312 19.2852 1.51335 18.0604C1.29935 16.8573 1.2602 15.3603 1.25207 13.5015C1.25 13.0287 1.25 12.5286 1.25 12.001L1.25 11.9426C1.24999 9.63423 1.24998 7.82519 1.43975 6.41371C1.63399 4.96897 2.03933 3.82895 2.93414 2.93414C3.82895 2.03933 4.96897 1.63399 6.41371 1.43975C7.82519 1.24998 9.63423 1.24999 11.9426 1.25ZM6.61358 2.92637C5.33517 3.09825 4.56445 3.42514 3.9948 3.9948C3.42514 4.56445 3.09825 5.33517 2.92637 6.61358C2.75159 7.91356 2.75 9.62178 2.75 12C2.75 12.5287 2.75 13.0257 2.75205 13.4949C2.76025 15.369 2.80214 16.7406 2.99017 17.7978C3.17436 18.8333 3.48774 19.4981 3.9948 20.0052C4.56445 20.5749 5.33517 20.9018 6.61358 21.0736C7.91356 21.2484 9.62178 21.25 12 21.25C14.3782 21.25 16.0864 21.2484 17.3864 21.0736C18.6648 20.9018 19.4355 20.5749 20.0052 20.0052C20.2151 19.7953 20.3872 19.5631 20.5302 19.2976C20.8619 18.6816 21.0531 17.8578 21.1513 16.6527C21.2494 15.4482 21.25 13.9459 21.25 12C21.25 9.62178 21.2484 7.91356 21.0736 6.61358C20.9018 5.33517 20.5749 4.56445 20.0052 3.9948C19.4355 3.42514 18.6648 3.09825 17.3864 2.92637C16.0864 2.75159 14.3782 2.75 12 2.75C9.62178 2.75 7.91356 2.75159 6.61358 2.92637Z" fill="currentColor"/>
        </svg>
      </button>

      {/* ── CENTER: Text Input / Recording Indicator ── */}
      {isRecording ? (
        <div className="flex-1 flex items-center justify-between px-3.5 min-w-0">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-ping" />
            <span className="text-[13px] font-semibold text-zinc-800 tracking-tight">
              {formatDuration(recordingDuration)}
            </span>
          </div>
          <span className="text-[12px] text-zinc-400 font-medium animate-pulse">
            Slide left to cancel
          </span>
        </div>
      ) : (
        <input
          ref={inputRef}
          type="text"
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            onTyping?.();
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 bg-transparent border-none outline-none px-3.5 text-[14px] text-zinc-900 placeholder:text-zinc-400 font-sans"
        />
      )}

      {/* ── RIGHT: Dynamic Mic or Send Button ── */}
      {message.trim().length === 0 ? (
        /* Mic Button by default (mic-svgrepo-com.svg) */
        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onClick={() => {
            if (!isRecording) startRecording();
            else stopRecording(false);
          }}
          className={`w-11 h-11 rounded-full bg-[#EDE9FE] flex items-center justify-center text-[#9D4EDD] shrink-0 cursor-pointer active:scale-90 transition-all hover:bg-[#DDD6FE] outline-none touch-none ${
            isRecording ? 'ring-4 ring-[#EDE9FE] animate-pulse' : ''
          }`}
          title={isRecording ? 'Release to send, slide left to cancel' : 'Hold or tap to record'}
        >
          <svg className="w-5 h-5 text-[#9D4EDD]" viewBox="0 0 1920 1920" fill="currentColor">
            <path d="M425.818 709.983V943.41c0 293.551 238.946 532.497 532.497 532.497 293.55 0 532.496-238.946 532.496-532.497V709.983h96.818V943.41c0 330.707-256.438 602.668-580.9 627.471l-.006 252.301h242.044V1920H667.862v-96.818h242.043l-.004-252.3C585.438 1546.077 329 1274.116 329 943.41V709.983h96.818ZM958.315 0c240.204 0 435.679 195.475 435.679 435.68v484.087c0 240.205-195.475 435.68-435.68 435.68-240.204 0-435.679-195.475-435.679-435.68V435.68C522.635 195.475 718.11 0 958.315 0Z" fillRule="evenodd"/>
          </svg>
        </button>
      ) : (
        /* Send Button (send-1-svgrepo-com.svg) */
        <button
          type="button"
          onClick={handleSend}
          className="w-11 h-11 rounded-full bg-[#E0F2FE] flex items-center justify-center text-[#0284C7] shrink-0 cursor-pointer active:scale-90 transition-all hover:bg-[#BAE6FD] outline-none shadow-sm"
          title="Send Message"
        >
          <svg className="w-5 h-5 text-[#0284C7]" viewBox="-0.5 0 25 25" fill="none" stroke="currentColor">
            <path d="M2.33045 8.38999C0.250452 11.82 9.42048 14.9 9.42048 14.9C9.42048 14.9 12.5005 24.07 15.9305 21.99C19.5705 19.77 23.9305 6.13 21.0505 3.27C18.1705 0.409998 4.55045 4.74999 2.33045 8.38999Z" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M15.1999 9.12L9.41992 14.9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
    </div>
  );
}
