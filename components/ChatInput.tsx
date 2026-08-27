'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Mic, SendHorizontal } from 'lucide-react';
import { triggerHaptic } from '@/lib/haptics';

export interface ChatInputProps {
  onSendMessage: (text: string) => void;
  onSendVoice?: (audioBlob: Blob, durationSeconds: number) => void;
  onTyping?: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function ChatInput({
  onSendMessage,
  onSendVoice,
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
    // If swiped left more than 60px -> cancel
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
    <div className="w-full max-w-[350px] mx-auto h-[56px] bg-white border border-zinc-100 rounded-full flex items-center justify-between px-2 py-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.06)] relative select-none">
      
      {/* ── Left Voice Button (Mic) ── */}
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClick={(e) => {
          // If tapped rather than held
          if (!isRecording) {
            startRecording();
          } else {
            stopRecording(false);
          }
        }}
        className={`w-10 h-10 rounded-full bg-[#EDE9FE] flex items-center justify-center text-[#9D4EDD] shrink-0 cursor-pointer active:scale-90 transition-all hover:bg-[#DDD6FE] outline-none touch-none ${
          isRecording ? 'ring-4 ring-[#EDE9FE] animate-pulse' : ''
        }`}
        title={isRecording ? 'Release to send, slide left to cancel' : 'Hold to record voice'}
      >
        <Mic className="w-[18px] h-[18px]" strokeWidth={2.2} />
      </button>

      {/* ── Center Area: Text Input or Recording Indicator ── */}
      {isRecording ? (
        <div className="flex-1 flex items-center justify-between px-3 min-w-0">
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
          className="flex-1 bg-transparent border-none outline-none px-3 text-[14px] text-zinc-900 placeholder:text-zinc-400 font-sans"
        />
      )}

      {/* ── Right Send Button ── */}
      <button
        type="button"
        onClick={handleSend}
        disabled={message.trim().length === 0 || disabled}
        className={`w-10 h-10 rounded-full bg-[#E0F2FE] flex items-center justify-center text-[#0284C7] shrink-0 cursor-pointer transition-all hover:bg-[#BAE6FD] outline-none ${
          message.trim().length > 0
            ? 'active:scale-90 opacity-100 shadow-sm'
            : 'opacity-60 cursor-default'
        }`}
        title="Send Message"
      >
        <SendHorizontal className="w-[18px] h-[18px]" strokeWidth={2.2} />
      </button>
    </div>
  );
}
