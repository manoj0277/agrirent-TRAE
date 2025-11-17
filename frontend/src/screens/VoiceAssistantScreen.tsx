import React, { useState, useRef, useEffect } from 'react';
import { AppView, ItemCategory, WorkPurpose } from '../types';
import Header from '../components/Header';
import Button from '../components/Button';
import { GoogleGenAI, LiveServerMessage, Modality, Blob, FunctionDeclaration, Type } from '@google/genai';
import { useToast } from '../context/ToastContext';
import { WORK_PURPOSES } from '../types';
import { useLanguage } from '../context/LanguageContext';

const apiKey = typeof process !== 'undefined' && process.env && process.env.API_KEY
  ? process.env.API_KEY
  : undefined;

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// Audio helper functions
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

async function decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
}

const createBookingFunctionDeclaration: FunctionDeclaration = {
  name: 'createBooking',
  description: 'Starts the process of booking a farm service or equipment by navigating to the booking form.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      itemCategory: {
        type: Type.STRING,
        description: 'The category of the item to book.',
        enum: Object.values(ItemCategory),
      },
      workPurpose: {
        type: Type.STRING,
        description: 'The specific task for the booking.',
        enum: [...WORK_PURPOSES],
      }
    },
    required: ['itemCategory'],
  },
};

const getCurrentLocationFunctionDeclaration: FunctionDeclaration = {
    name: 'getCurrentLocation',
    description: "Gets the user's current geographical location (latitude and longitude). Use this when the user asks a location-based question like 'what's near me?' or 'how far is...?' without providing a specific location.",
    parameters: {
        type: Type.OBJECT,
        properties: {},
    },
};

interface VoiceAssistantScreenProps {
    navigate: (view: AppView) => void;
    goBack: () => void;
}

const VoiceAssistantScreen: React.FC<VoiceAssistantScreenProps> = ({ navigate, goBack }) => {
    const { showToast } = useToast();
    const { t } = useLanguage();
    const [status, setStatus] = useState<'idle' | 'listening' | 'speaking' | 'connecting' | 'error'>('idle');
    const [transcription, setTranscription] = useState<{ user: string, ai: string }[]>([]);
    const [currentTranscription, setCurrentTranscription] = useState({ user: '', ai: '' });
    
    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    const audioContextRef = useRef<{ input: AudioContext; output: AudioContext; scriptProcessor?: ScriptProcessorNode } | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const nextStartTimeRef = useRef(0);
    const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [showMicPrompt, setShowMicPrompt] = useState(false);
    const [showLocationPrompt, setShowLocationPrompt] = useState(false);
    const pendingLocationFcRef = useRef<any | null>(null);
    const locationPrefetchedRef = useRef(false);

    useEffect(() => {
        if (typeof navigator !== 'undefined' && (navigator as any).permissions) {
            (navigator as any).permissions.query({ name: 'microphone' }).then((status: any) => {
                if (status.state !== 'granted') setShowMicPrompt(true);
            }).catch(() => setShowMicPrompt(true));
        } else {
            setShowMicPrompt(true);
        }
    }, []);

    useEffect(() => {
        if (!showMicPrompt) {
            if (typeof navigator !== 'undefined' && (navigator as any).permissions) {
                (navigator as any).permissions.query({ name: 'geolocation' }).then((status: any) => {
                    if (status.state !== 'granted' && !locationPrefetchedRef.current) setShowLocationPrompt(true);
                }).catch(() => { if (!locationPrefetchedRef.current) setShowLocationPrompt(true); });
            } else {
                if (!locationPrefetchedRef.current) setShowLocationPrompt(true);
            }
        }
    }, [showMicPrompt]);

    const stopSession = () => {
        setStatus('idle');
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        if (audioContextRef.current) {
            audioContextRef.current.scriptProcessor?.disconnect();
            audioContextRef.current.input?.close().catch(console.error);
            audioContextRef.current.output?.close().catch(console.error);
            audioContextRef.current = null;
        }
        sessionPromiseRef.current?.then(session => session.close()).catch(console.error);
        sessionPromiseRef.current = null;
        sourcesRef.current.forEach(source => source.stop());
        sourcesRef.current.clear();
    };
    
    const startSession = async () => {
        if (!ai) {
            showToast("AI Voice Assistant is not configured.", "error");
            setStatus('error');
            return;
        }
        if (status !== 'idle' && status !== 'error') return;
        setShowMicPrompt(true);
    };

    const startSessionAfterMic = async () => {
        if (!ai) {
            showToast("AI Voice Assistant is not configured.", "error");
            setStatus('error');
            return;
        }
        if (status !== 'idle' && status !== 'error') return;

        setStatus('connecting');
        setTranscription([]);
        setCurrentTranscription({ user: '', ai: '' });
        nextStartTimeRef.current = 0;
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            
            await inputAudioContext.resume();
            await outputAudioContext.resume();
            audioContextRef.current = { input: inputAudioContext, output: outputAudioContext };

            sessionPromiseRef.current = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: () => {
                        setStatus('listening');
                        const source = inputAudioContext.createMediaStreamSource(stream);
                        const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                        audioContextRef.current!.scriptProcessor = scriptProcessor;

                        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const l = inputData.length;
                            const int16 = new Int16Array(l);
                            for (let i = 0; i < l; i++) {
                                int16[i] = inputData[i] * 32768;
                            }
                            const pcmBlob: Blob = {
                                data: encode(new Uint8Array(int16.buffer)),
                                mimeType: 'audio/pcm;rate=16000',
                            };
                            sessionPromiseRef.current?.then((session) => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            });
                        };
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(inputAudioContext.destination);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        if (message.serverContent?.inputTranscription) {
                            setCurrentTranscription(prev => ({ ...prev, user: message.serverContent.inputTranscription.text }));
                        }
                        if (message.serverContent?.outputTranscription) {
                            setCurrentTranscription(prev => ({ ...prev, ai: message.serverContent.outputTranscription.text }));
                        }
                        if (message.serverContent?.turnComplete) {
                            setTranscription(prev => [...prev, {user: currentTranscription.user, ai: currentTranscription.ai}]);
                            setCurrentTranscription({ user: '', ai: '' });
                        }
                        
                         if (message.toolCall?.functionCalls) {
                            for (const fc of message.toolCall.functionCalls) {
                                if (fc.name === 'createBooking') {
                                    navigate({ view: 'BOOKING_FORM', category: fc.args.itemCategory as ItemCategory, workPurpose: fc.args.workPurpose as WorkPurpose });
                                    const result = { success: true };
                                    sessionPromiseRef.current?.then((session) => session.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: JSON.stringify(result) } } }));
                                } else if (fc.name === 'getCurrentLocation') {
                                    pendingLocationFcRef.current = fc;
                                    setShowLocationPrompt(true);
                                }
                            }
                        }

                        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (base64Audio) {
                            setStatus('speaking');
                            const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContext, 24000, 1);
                            
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContext.currentTime);
                            const source = outputAudioContext.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(outputAudioContext.destination);
                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += audioBuffer.duration;
                            
                            sourcesRef.current.add(source);
                            source.onended = () => {
                                sourcesRef.current.delete(source);
                                if (sourcesRef.current.size === 0) setStatus('listening');
                            };
                        }
                    },
                    onerror: (e: ErrorEvent) => {
                        console.error('Session error:', e);
                        showToast("Voice session error.", "error");
                        setStatus('error');
                        stopSession();
                    },
                    onclose: (e: CloseEvent) => stopSession(),
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
                    outputAudioTranscription: {},
                    inputAudioTranscription: {},
                    tools: [{ functionDeclarations: [createBookingFunctionDeclaration, getCurrentLocationFunctionDeclaration] }],
                    systemInstruction: `You are a helpful voice assistant for AgriRent. Help users with farming questions and booking equipment. When asking for location, use the getCurrentLocation tool.`,
                },
            });
        } catch (err) {
            console.error("Failed to start session:", err);
            showToast("Could not start voice session. Check microphone permissions.", "error");
            setStatus('error');
            stopSession();
        }
    };

    const handleAllowLocation = () => {
        const fc = pendingLocationFcRef.current;
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const result = { latitude: position.coords.latitude, longitude: position.coords.longitude };
                if (fc) {
                    sessionPromiseRef.current?.then((session) => session.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: JSON.stringify(result) } } }));
                    pendingLocationFcRef.current = null;
                } else {
                    locationPrefetchedRef.current = true;
                }
                setShowLocationPrompt(false);
            },
            (error) => {
                const result = { error: error.message };
                if (fc) {
                    sessionPromiseRef.current?.then((session) => session.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: JSON.stringify(result) } } }));
                    pendingLocationFcRef.current = null;
                }
                setShowLocationPrompt(false);
            }
        );
    };

    const handleCancelLocation = () => {
        const fc = pendingLocationFcRef.current;
        if (fc) {
            const result = { error: 'Permission denied' };
            sessionPromiseRef.current?.then((session) => session.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: JSON.stringify(result) } } }));
        }
        setShowLocationPrompt(false);
        pendingLocationFcRef.current = null;
    };
    
    useEffect(() => {
        return () => stopSession();
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcription, currentTranscription]);

    const StatusIndicator = () => {
        let colorClass = 'bg-neutral-500';
        let icon = <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 11a7 7 0 01-14 0m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v3a3 3 0 01-3 3z"/></svg>;
        let animationContent = null;

        switch (status) {
            case 'listening': colorClass = 'bg-green-500'; animationContent = <div className="absolute w-full h-full rounded-full bg-green-500 animate-listening"></div>; break;
            case 'speaking': colorClass = 'bg-blue-500'; icon=<svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.683 3.902 11 4.146 11 4.707v14.586c0 .56-.317.805-.707.414L5.586 15z"/></svg>; animationContent = <div className="speaking-wave text-blue-500"></div>; break;
            case 'connecting': colorClass = 'bg-yellow-500'; icon=<div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin"></div>; break;
            case 'error': colorClass = 'bg-red-500'; icon=<svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>; break;
        }

        return (
            <div className={`relative w-32 h-32 rounded-full flex items-center justify-center transition-colors duration-300 ${colorClass}`}>
                {animationContent}
                <div className="relative z-10">{icon}</div>
            </div>
        );
    };
    
    const statusText: Record<typeof status, string> = {
        idle: t('statusIdle'),
        connecting: t('statusConnecting'),
        listening: t('statusListening'),
        speaking: t('statusSpeaking'),
        error: t('statusError'),
    };

    return (
        <div className="flex flex-col h-screen bg-neutral-50 dark:bg-neutral-900">
            <Header title={t('aiVoiceAssistant')} onBack={goBack} />
            <div className="flex-grow flex flex-col p-4 space-y-4">
                <div className="flex-grow bg-white dark:bg-neutral-800 rounded-lg p-4 space-y-4 overflow-y-auto hide-scrollbar">
                    {transcription.map((t, i) => (
                        <div key={i} className="space-y-1">
                            <p className="text-right text-primary font-semibold">{t.user}</p>
                            <p className="text-left text-neutral-700 dark:text-neutral-200">{t.ai}</p>
                        </div>
                    ))}
                    <div className="space-y-1">
                        <p className="text-right text-primary/70 font-semibold">{currentTranscription.user}</p>
                        <p className="text-left text-neutral-700/70 dark:text-neutral-200/70">{currentTranscription.ai}</p>
                    </div>
                     <div ref={messagesEndRef} />
                </div>
                <div className="flex-shrink-0 flex flex-col items-center justify-center space-y-4 pt-4">
                    <button onClick={status === 'idle' || status === 'error' ? startSession : stopSession} className="focus:outline-none focus:ring-4 focus:ring-primary/50 rounded-full">
                        <StatusIndicator />
                    </button>
                    <p className="text-neutral-600 dark:text-neutral-400 font-semibold">{statusText[status]}</p>
                </div>
            </div>
            {showMicPrompt && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-xl w-11/12 max-w-sm p-6">
                        <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 mb-2">{t('aiVoiceAssistant')}</h2>
                        <p className="text-sm text-neutral-700 dark:text-neutral-300 mb-4">Allow microphone access?</p>
                        <div className="flex space-x-2">
                            <Button onClick={() => { setShowMicPrompt(false); startSessionAfterMic(); }} className="flex-1">{t('allow')}</Button>
                            <Button variant="secondary" onClick={() => { setShowMicPrompt(false); }} className="flex-1">{t('cancel')}</Button>
                        </div>
                    </div>
                </div>
            )}
            {showLocationPrompt && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-xl w-11/12 max-w-sm p-6">
                        <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 mb-2">{t('location')}</h2>
                        <p className="text-sm text-neutral-700 dark:text-neutral-300 mb-4">Allow location access?</p>
                        <div className="flex space-x-2">
                            <Button onClick={handleAllowLocation} className="flex-1">{t('allow')}</Button>
                            <Button variant="secondary" onClick={handleCancelLocation} className="flex-1">{t('cancel')}</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VoiceAssistantScreen;