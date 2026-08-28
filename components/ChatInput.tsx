'use client';

import React, { useState, useRef, useEffect } from 'react';
import { triggerHaptic } from '@/lib/haptics';
import { Sparkles, Mic, Square } from 'lucide-react';

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
  const [isListeningSpeech, setIsListeningSpeech] = useState(false);
  const [showAiSuggestion, setShowAiSuggestion] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pointerStartX = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const speechRecognitionRef = useRef<any>(null);

  // Show @ai suggestion when user types @ or ends with @
  useEffect(() => {
    if (message.endsWith('@') || (message.includes('@') && !message.includes('@ai') && !message.includes('@grok'))) {
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
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch (e) {}
      }
    };
  }, []);

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed || disabled) return;
    triggerHaptic('light');
    onSendMessage(trimmed);
    setMessage('');
    setShowAiSuggestion(false);
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

  const handleInsertAiTag = () => {
    triggerHaptic('light');
    setMessage((prev) => {
      if (prev.endsWith('@')) {
        return prev + 'ai ';
      }
      return prev ? prev + ' @ai ' : '@ai ';
    });
    setShowAiSuggestion(false);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // ── Speech-to-Text Multi-language Recognition ──
  const toggleSpeechToText = () => {
    if (disabled) return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }

    if (isListeningSpeech) {
      try {
        speechRecognitionRef.current?.stop();
      } catch (e) {}
      setIsListeningSpeech(false);
      triggerHaptic('light');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';

      recognition.onstart = () => {
        setIsListeningSpeech(true);
        triggerHaptic('medium');
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript) {
          setMessage((prev) => {
            const cleanPrev = prev.trim();
            return cleanPrev ? `${cleanPrev} ${transcript.trim()}` : transcript.trim();
          });
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListeningSpeech(false);
      };

      recognition.onend = () => {
        setIsListeningSpeech(false);
      };

      speechRecognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Speech recognition start failed:', err);
      setIsListeningSpeech(false);
    }
  };

  // Format recording seconds (e.g. 00:03)
  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainder = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  };

  // Start Voice Audio Recording
  const startRecording = async (clientX?: number) => {
    if (disabled) return;
    if (isSpeechToTextEnabled) {
      toggleSpeechToText();
      return;
    }

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

  // Stop & finalize audio recording
  const stopRecording = (shouldCancel = false) => {
    if (isSpeechToTextEnabled) return;

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

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (isSpeechToTextEnabled) {
      toggleSpeechToText();
      return;
    }
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    startRecording(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (isSpeechToTextEnabled) return;
    if (!isRecording || pointerStartX.current === null) return;
    const deltaX = e.clientX - pointerStartX.current;
    if (deltaX < -60) {
      stopRecording(true);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (isSpeechToTextEnabled) return;
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch (err) {}
    if (isRecording) {
      stopRecording(false);
    }
  };

  const handlePointerCancel = () => {
    if (isSpeechToTextEnabled) return;
    if (isRecording) {
      stopRecording(true);
    }
  };

  const hasText = message.trim().length > 0;

  return (
    <div className="w-full relative flex flex-col items-start">
      
      {/* ── @AI Suggestion Badge (Clean White Theme on exact top of input) ── */}
      {showAiSuggestion && (
        <button
          type="button"
          onClick={handleInsertAiTag}
          className="mb-2 ml-4 px-3.5 py-1.5 rounded-full bg-white border border-zinc-200 text-zinc-900 text-[12.5px] font-bold shadow-[0_4px_16px_rgba(0,0,0,0.12)] flex items-center gap-1.5 animate-in fade-in slide-in-from-bottom-2 cursor-pointer hover:bg-zinc-50 active:scale-95 transition-all"
        >
          <Sparkles className="w-4 h-4 text-[#9D4EDD]" />
          <span>Ask Grok AI (@ai)</span>
        </button>
      )}

      <div className="w-full h-[58px] bg-white border border-zinc-200/80 rounded-full flex items-center justify-between px-2.5 py-1 shadow-[0_4px_20px_rgba(0,0,0,0.06)] relative select-none">
        
        {/* ── LEFT: Gallery Button ── */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onOpenGallery?.();
          }}
          disabled={disabled || isRecording}
          className="w-10 h-10 rounded-full bg-zinc-100/90 hover:bg-zinc-200/80 active:scale-90 flex items-center justify-center text-zinc-600 transition-all cursor-pointer outline-none shrink-0"
          title="Attach Media & Files"
        >
          <svg className="w-5 h-5 text-zinc-700" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M18 8C18 9.10457 17.1046 10 16 10C14.8954 10 14 9.10457 14 8C14 6.89543 14.8954 6 16 6C17.1046 6 18 6.89543 18 8Z" fill="currentColor"/>
            <path fillRule="evenodd" clipRule="evenodd" d="M12.0574 1.25H11.9426C9.63424 1.24999 7.82519 1.24998 6.41371 1.43975C4.96897 1.63399 3.82895 2.03933 2.93414 2.93414C2.03933 3.82895 1.63399 4.96897 1.43975 6.41371C1.24998 7.82519 1.24999 9.63422 1.25 11.9426V12.0574C1.24999 14.3658 1.24998 16.1748 1.43975 17.5863C1.63399 19.031 2.03933 20.1711 2.93414 21.0659C3.82895 21.9607 4.96897 22.366 6.41371 22.5603C7.82519 22.75 9.63423 22.75 11.9426 22.75H12.0574C14.3658 22.75 16.1748 22.75 17.5863 22.5603C19.031 22.366 20.1711 21.9607 21.0659 21.0659C21.9607 20.1711 22.366 19.031 22.5603 17.5863C22.75 16.1748 22.75 14.3658 22.75 12.0574V11.9426C22.75 9.63423 22.75 7.82519 22.5603 6.41371C22.366 4.96897 21.9607 3.82895 21.0659 2.93414C20.1711 2.03933 19.031 1.63399 17.5863 1.43975C16.1748 1.24998 14.3658 1.24999 12.0574 1.25ZM3.9948 3.9948C4.56445 3.42514 5.33517 3.09825 6.61358 2.92637C7.91356 2.75159 9.62178 2.75 12 2.75C14.3782 2.75 16.0864 2.75159 17.3864 2.92637C18.6648 3.09825 19.4355 3.42514 20.0052 3.9948C20.5749 4.56445 20.9018 5.33517 21.0736 6.61358C21.2484 7.91356 21.25 9.62178 21.25 12C21.25 12.4502 21.2499 12.8764 21.2487 13.2804L21.0266 13.2497C18.1828 12.8559 15.5805 14.3343 14.2554 16.5626C12.5459 12.2376 8.02844 9.28807 2.98073 10.0129L2.75497 10.0454C2.76633 8.63992 2.80368 7.52616 2.92637 6.61358C3.09825 5.33517 3.42514 4.56445 3.9948 3.9948Z" fill="currentColor"/>
          </svg>
        </button>

        {/* ── CENTER: Text Input / Recording Indicator ── */}
        {isRecording ? (
          <div className="flex-1 flex items-center justify-between px-3.5 min-w-0">
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
        ) : isListeningSpeech ? (
          <div className="flex-1 flex items-center justify-between px-3.5 min-w-0">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-[#9D4EDD] rounded-full animate-ping" />
              <span className="text-[13px] font-bold text-[#9D4EDD]">
                Listening (English / Urdu)...
              </span>
            </div>
            <span className="text-[11px] text-zinc-400 font-medium">Tap mic to stop</span>
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
            disabled={disabled}
            placeholder={placeholder}
            className="flex-1 h-full px-3 text-[15px] font-normal text-zinc-900 placeholder:text-zinc-400 bg-transparent outline-none border-0 ring-0 focus:outline-none focus:ring-0"
          />
        )}

        {/* ── RIGHT: Send Button / Mic Button ── */}
        {hasText ? (
          <button
            type="button"
            onClick={handleSend}
            disabled={disabled}
            className="w-10 h-10 rounded-full bg-[#9D4EDD] hover:bg-[#8A38CC] active:scale-90 flex items-center justify-center text-white transition-all cursor-pointer outline-none shadow-md shrink-0"
            title="Send Message"
          >
            <svg className="w-4 h-4 text-white translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
              <path d="M22 2L11 13" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M22 2L15 22L11 13L2 9L22 2Z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        ) : isSpeechToTextEnabled ? (
          <button
            type="button"
            onClick={toggleSpeechToText}
            disabled={disabled}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer outline-none shrink-0 ${
              isListeningSpeech
                ? 'bg-[#9D4EDD] text-white animate-pulse shadow-md'
                : 'bg-zinc-100/90 hover:bg-zinc-200/80 active:scale-90 text-zinc-700'
            }`}
            title={isListeningSpeech ? 'Tap to stop listening' : 'Tap to speak (Voice Typing)'}
          >
            {isListeningSpeech ? (
              <Square className="w-4 h-4 fill-current text-white" />
            ) : (
              <Mic className="w-5 h-5 text-zinc-700" strokeWidth={2.2} />
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
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer outline-none shrink-0 ${
              isRecording
                ? 'bg-rose-500 text-white scale-110 shadow-lg'
                : 'bg-zinc-100/90 hover:bg-zinc-200/80 active:scale-90 text-zinc-600'
            }`}
            title="Hold to Record Voice Message"
          >
            <Mic className="w-5 h-5 text-zinc-700" strokeWidth={2.2} />
          </button>
        )}

      </div>
    </div>
  );
}
