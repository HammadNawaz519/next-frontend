'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { triggerHaptic } from '@/lib/haptics';

export type VoiceToTextState =
  | 'IDLE'
  | 'REQUESTING_PERMISSION'
  | 'RECORDING'
  | 'TRANSCRIBING'
  | 'ERROR';

interface UseVoiceToTextOptions {
  onTranscript: (text: string) => void;
  onError?: (error: { code: string; message: string }) => void;
  maxDurationSeconds?: number;
  language?: string;
}

export function useVoiceToText({
  onTranscript,
  onError,
  maxDurationSeconds = 60,
  language,
}: UseVoiceToTextOptions) {
  const [state, setState] = useState<VoiceToTextState>('IDLE');
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const isCancelledRef = useRef<boolean>(false);

  // Stop & clean up all microphone MediaStream tracks
  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => track.stop());
      } catch (e) {}
      streamRef.current = null;
    }
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Full cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimer();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {}
      }
      cleanupStream();
    };
  }, [clearTimer, cleanupStream]);

  // Determine best browser supported MIME type
  const getSupportedMimeType = (): string => {
    if (typeof MediaRecorder === 'undefined') return '';
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/wav',
    ];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
  };

  // Upload and transcribe recorded audio blob
  const uploadAndTranscribe = async (audioBlob: Blob, mimeType: string) => {
    setState('TRANSCRIBING');
    try {
      const formData = new FormData();
      const extension = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
      formData.append('file', audioBlob, `speech_${Date.now()}.${extension}`);
      if (language) {
        formData.append('language', language);
      }

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        const errorInfo = data.error || {
          code: 'TRANSCRIPTION_FAILED',
          message: 'Could not transcribe audio.',
        };
        setErrorMessage(errorInfo.message);
        onError?.(errorInfo);
        setState('ERROR');
        return;
      }

      if (data.text) {
        triggerHaptic('medium');
        onTranscript(data.text);
      }

      setState('IDLE');
      setErrorMessage(null);
    } catch (err: any) {
      console.warn('Backend STT request failed:', err);
      const errObj = {
        code: 'NETWORK_ERROR',
        message: 'Network error while transcribing audio.',
      };
      setErrorMessage(errObj.message);
      onError?.(errObj);
      setState('ERROR');
    }
  };

  // Start recording
  const startRecording = async () => {
    if (state === 'RECORDING' || state === 'TRANSCRIBING') return;

    setErrorMessage(null);
    isCancelledRef.current = false;
    audioChunksRef.current = [];
    setRecordingDuration(0);

    setState('REQUESTING_PERMISSION');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      const mimeType = getSupportedMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        clearTimer();
        cleanupStream();

        if (isCancelledRef.current) {
          setState('IDLE');
          audioChunksRef.current = [];
          return;
        }

        const effectiveMime = recorder.mimeType || mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: effectiveMime });

        if (audioBlob.size < 300) {
          setState('IDLE');
          return;
        }

        await uploadAndTranscribe(audioBlob, effectiveMime);
      };

      recorder.start(100); // 100ms slices for reliable chunk capturing
      startTimeRef.current = Date.now();
      setState('RECORDING');
      triggerHaptic('medium');

      // Start duration timer
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setRecordingDuration(elapsed);

        if (elapsed >= maxDurationSeconds) {
          stopRecording();
        }
      }, 1000);
    } catch (err: any) {
      console.warn('Microphone permission or start error:', err);
      cleanupStream();
      clearTimer();
      const isDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
      const errObj = {
        code: isDenied ? 'MICROPHONE_PERMISSION_DENIED' : 'MICROPHONE_UNAVAILABLE',
        message: isDenied
          ? 'Microphone permission denied. Please allow microphone access in your browser settings.'
          : 'Microphone is unavailable.',
      };
      setErrorMessage(errObj.message);
      onError?.(errObj);
      setState('ERROR');
    }
  };

  // Stop recording normally & trigger transcription
  const stopRecording = () => {
    if (state !== 'RECORDING' || !mediaRecorderRef.current) return;
    triggerHaptic('light');
    try {
      if (mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    } catch (e) {}
  };

  // Cancel recording without transcribing
  const cancelRecording = () => {
    isCancelledRef.current = true;
    triggerHaptic('light');
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
    } else {
      cleanupStream();
      clearTimer();
      setState('IDLE');
    }
  };

  return {
    state,
    isRecording: state === 'RECORDING',
    isTranscribing: state === 'TRANSCRIBING',
    isBusy: state === 'REQUESTING_PERMISSION' || state === 'RECORDING' || state === 'TRANSCRIBING',
    recordingDuration,
    errorMessage,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
