'use client';

import React, { useState, useRef, useEffect } from 'react';
import { triggerHaptic } from '@/lib/haptics';
import { Sparkles, Square } from 'lucide-react';
import { useVoiceToText } from '@/hooks/use-voice-to-text';

export interface ChatInputProps {
  onSendMessage: (text: string) => void;
  onSendVoice?: (audioBlob: Blob, durationSeconds: number) => void;
  onOpenGallery?: () => void;
  onTyping?: () => void;
  placeholder?: string;
  disabled?: boolean;
  isSpeechToTextEnabled?: boolean;
}

export default function ChatInput({
  onSendMessage,
  onSendVoice,
  onOpenGallery,
  onTyping,
  placeholder = 'Message...',
  disabled = false,
  isSpeechToTextEnabled = false,
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isCancelled, setIsCancelled] = useState(false);
  const [showAiSuggestion, setShowAiSuggestion] = useState(false);
  const [isMultiline, setIsMultiline] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pointerStartX = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-expand textarea height when message is long while keeping simple pill when 1 line
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      if (scrollHeight > 44) {
        setIsMultiline(true);
        textareaRef.current.style.height = `${Math.min(scrollHeight, 120)}px`;
      } else {
        setIsMultiline(false);
        textareaRef.current.style.height = '38px';
      }
    }
  }, [message]);

  // ── Backend-Powered Production Voice-to-Text Engine ──
  const vtt = useVoiceToText({
    onTranscript: (transcript) => {
      setMessage((prev) => (prev ? prev.trim() + ' ' + transcript : transcript));
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    },
    onError: (err) => {
      console.warn('Voice to text error:', err);
    },
    maxDurationSeconds: 60,
  });

  // Show @ai suggestion when user types @ or ends with @
  useEffect(() => {
    if (
      message.endsWith('@') ||
      (message.includes('@') && !message.includes('@ai') && !message.includes('@grok'))
    ) {
      setShowAiSuggestion(true);
    } else {
      setShowAiSuggestion(false);
    }
  }, [message]);

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
    setIsMultiline(false);
    setShowAiSuggestion(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = '38px';
      textareaRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInsertAiTag = () => {
    triggerHaptic('light');
    setMessage((prev) => {
      if (prev.endsWith('@')) {
        return prev + 'ai ';
      }
      return prev ? prev + ' @ai ' : '@ai ';
    });
    setShowAiSuggestion(false);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // ── Toggle Voice-to-Text Recording ──
  const handleToggleVoiceToText = () => {
    if (disabled) return;
    if (vtt.isRecording) {
      vtt.stopRecording();
    } else if (!vtt.isTranscribing) {
      vtt.startRecording();
    }
  };

  // Format recording seconds (e.g. 00:03)
  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainder = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  };

  // ── Standard Hold-to-Record Voice Note Handling ──
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      setIsCancelled(false);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());

        if (isCancelled) {
          audioChunksRef.current = [];
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const finalSec = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));

        if (finalSec >= 1 && audioBlob.size > 0) {
          onSendVoice?.(audioBlob, finalSec);
        }
        audioChunksRef.current = [];
      };

      recorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      startTimeRef.current = Date.now();

      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      triggerHaptic('medium');
    } catch (err) {
      console.error('Failed to access microphone:', err);
      setIsRecording(false);
    }
  };

  const stopRecording = (cancel = false) => {
    setIsCancelled(cancel);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setRecordingDuration(0);
    pointerStartX.current = null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || isSpeechToTextEnabled) return;
    pointerStartX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    startRecording();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isRecording || pointerStartX.current === null || isSpeechToTextEnabled) return;
    const diffX = e.clientX - pointerStartX.current;
    if (diffX < -70) {
      triggerHaptic('heavy');
      stopRecording(true);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || isSpeechToTextEnabled) return;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (err) {}
    if (isRecording) {
      stopRecording(false);
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || isSpeechToTextEnabled) return;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (err) {}
    if (isRecording) {
      stopRecording(true);
    }
  };

  const hasText = message.trim().length > 0;

  return (
    <div className="relative w-full flex flex-col items-center">
      {/* ── @ai Auto-Complete Badge (Clean dark zinc capsule with sparkles) ── */}
      {showAiSuggestion && (
        <div className="absolute -top-12 left-4 z-30 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <button
            type="button"
            onClick={handleInsertAiTag}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-100 text-[13px] font-semibold transition-all shadow-lg border-0 cursor-pointer outline-none ring-0 select-none"
          >
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>Ask AI</span>
          </button>
        </div>
      )}

      {/* ── Chat Composer Pill Container (Simple rounded-full when 1-line, expands to rounded-3xl when multiline) ── */}
      <div
        className={`w-full bg-white p-1.5 pl-2 pr-1.5 flex gap-1.5 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-zinc-200/80 transition-all focus-within:border-zinc-300 focus-within:shadow-[0_4px_20px_rgba(0,0,0,0.08)] ${
          isMultiline ? 'rounded-3xl items-end' : 'rounded-full items-center'
        }`}
      >
        {/* ── LEFT: Attachment / File Button ── */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onOpenGallery?.();
          }}
          disabled={disabled || isRecording || vtt.isBusy}
          className="w-10 h-10 rounded-full bg-zinc-100 hover:bg-zinc-200 active:scale-90 flex items-center justify-center text-zinc-700 transition-all cursor-pointer outline-none shrink-0 shadow-2xs"
          title="Attach Photos & Videos"
        >
          <svg className="w-5 h-5 text-zinc-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>

        {/* ── CENTER: Text Input / Recording State / Transcribing State ── */}
        {isRecording ? (
          <div className="flex-1 flex items-center justify-between px-3.5 min-w-0 h-10">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-ping" />
              <span className="text-[13.5px] font-semibold text-zinc-800 tracking-tight">
                {formatDuration(recordingDuration)}
              </span>
            </div>
            <span className="text-[12px] text-zinc-400 font-medium animate-pulse">
              Slide left to cancel
            </span>
          </div>
        ) : vtt.isRecording ? (
          <div className="flex-1 flex items-center justify-between px-3.5 min-w-0 h-10">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-[#9D4EDD] rounded-full animate-ping" />
              <span className="text-[13px] font-bold text-[#9D4EDD]">
                Listening... {formatDuration(vtt.recordingDuration)}
              </span>
            </div>
            <button
              type="button"
              onClick={vtt.cancelRecording}
              className="text-[11.5px] text-zinc-400 hover:text-red-500 font-semibold cursor-pointer outline-none border-0 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : vtt.isTranscribing ? (
          <div className="flex-1 flex items-center gap-2 px-3.5 min-w-0 h-10">
            <span className="w-2.5 h-2.5 bg-[#9D4EDD] rounded-full animate-pulse" />
            <span className="text-[13px] font-semibold text-zinc-600 animate-pulse">
              Transcribing speech...
            </span>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            rows={1}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              onTyping?.();
            }}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            className="flex-1 min-h-[38px] max-h-[120px] py-2 px-3 text-[15px] leading-normal font-normal text-zinc-900 placeholder:text-zinc-400 bg-transparent outline-none border-0 ring-0 focus:outline-none focus:ring-0 resize-none overflow-y-auto"
            style={{ height: '38px' }}
          />
        )}

        {/* ── RIGHT: Dynamic Action Button (Mic on Empty -> Send when Typed) ── */}
        {hasText ? (
          <button
            type="button"
            onClick={handleSend}
            disabled={disabled || vtt.isBusy}
            className="w-11 h-11 rounded-full bg-zinc-100 hover:bg-zinc-200 active:scale-90 flex items-center justify-center text-zinc-700 transition-all cursor-pointer outline-none shrink-0 shadow-2xs"
            title="Send Message"
          >
            <svg className="w-5 h-5 text-zinc-700" viewBox="-0.5 0 25 25" fill="none" stroke="currentColor">
              <path d="M2.33045 8.38999C0.250452 11.82 9.42048 14.9 9.42048 14.9C9.42048 14.9 12.5005 24.07 15.9305 21.99C19.5705 19.77 23.9305 6.13 21.0505 3.27C18.1705 0.409998 4.55045 4.74999 2.33045 8.38999Z" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M15.1999 9.12L9.41992 14.9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        ) : isSpeechToTextEnabled ? (
          <button
            type="button"
            onClick={handleToggleVoiceToText}
            disabled={disabled}
            className={`w-11 h-11 rounded-full flex items-center justify-center text-zinc-700 transition-all cursor-pointer outline-none shrink-0 shadow-2xs ${
              vtt.isRecording
                ? 'bg-[#9D4EDD] text-white animate-pulse shadow-md'
                : vtt.isTranscribing
                ? 'bg-zinc-200 text-zinc-400 animate-pulse'
                : 'bg-zinc-100 hover:bg-zinc-200 active:scale-90'
            }`}
            title={
              vtt.isRecording
                ? 'Tap to stop and transcribe'
                : vtt.isTranscribing
                ? 'Transcribing...'
                : 'Tap to speak (Voice to text)'
            }
          >
            {vtt.isRecording ? (
              <Square className="w-4 h-4 text-white fill-white" />
            ) : (
              <svg className="w-5 h-5 text-zinc-700" viewBox="0 0 1920 1920" fill="currentColor">
                <path d="M425.818 709.983V943.41c0 293.551 238.946 532.497 532.497 532.497 293.55 0 532.496-238.946 532.496-532.497V709.983h96.818V943.41c0 330.707-256.438 602.668-580.9 627.471l-.006 252.301h242.044V1920H667.862v-96.818h242.043l-.004-252.3C585.438 1546.077 329 1274.116 329 943.41V709.983h96.818ZM958.315 0c240.204 0 435.679 195.475 435.679 435.68v484.087c0 240.205-195.475 435.68-435.68 435.68-240.204 0-435.679-195.475-435.679-435.68V435.68C522.635 195.475 718.11 0 958.315 0Z" fillRule="evenodd"/>
              </svg>
            )}
          </button>
        ) : (
          <button
            type="button"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            disabled={disabled}
            className={`w-11 h-11 rounded-full bg-zinc-100 hover:bg-zinc-200 active:scale-90 flex items-center justify-center text-zinc-700 transition-all cursor-pointer outline-none shrink-0 touch-none shadow-2xs ${
              isRecording ? 'ring-4 ring-zinc-200 animate-pulse bg-zinc-200' : ''
            }`}
            title="Hold to Record Voice Message"
          >
            <svg className="w-5 h-5 text-zinc-700" viewBox="0 0 1920 1920" fill="currentColor">
              <path d="M425.818 709.983V943.41c0 293.551 238.946 532.497 532.497 532.497 293.55 0 532.496-238.946 532.496-532.497V709.983h96.818V943.41c0 330.707-256.438 602.668-580.9 627.471l-.006 252.301h242.044V1920H667.862v-96.818h242.043l-.004-252.3C585.438 1546.077 329 1274.116 329 943.41V709.983h96.818ZM958.315 0c240.204 0 435.679 195.475 435.679 435.68v484.087c0 240.205-195.475 435.68-435.68 435.68-240.204 0-435.679-195.475-435.679-435.68V435.68C522.635 195.475 718.11 0 958.315 0Z" fillRule="evenodd"/>
            </svg>
          </button>
        )}

      </div>
    </div>
  );
}
