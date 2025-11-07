
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Settings, OutputLanguage, HistoryItem } from './types';
import Header from './components/Header';
import SettingsPanel from './components/SettingsPanel';
import { fileToBase64 } from './utils/fileUtils';
import { generateSrt } from './services/geminiService';
import { UploadIcon, DownloadIcon, CancelIcon, PlayIcon, PauseIcon, TrashIcon } from './components/icons/Icons';
import AuthModal from './components/AuthModal';
import PricingAndWallet from './components/PricingAndWallet';
import { useUser } from './contexts/UserContext';
import { apiFetch, ApiError } from './services/apiClient';
import type { UsageResponse } from './types/user';

const App: React.FC = () => {
    const { user, isLoading: isAuthLoading, setUserData } = useUser();
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [audioSrc, setAudioSrc] = useState<string>('');
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [settings, setSettings] = useState<Settings>({
        maxLength: 7,
        minDuration: 0.1,
        gap: 0,
        lines: 'Single',
    });
    const [outputLanguage, setOutputLanguage] = useState<OutputLanguage>('Thanglish');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [srtContent, setSrtContent] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [progress, setProgress] = useState(0);
    const [statusText, setStatusText] = useState('');
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [usageSummary, setUsageSummary] = useState<string>('');
    const [audioDuration, setAudioDuration] = useState<number>(0);

    const intervalRef = useRef<number | null>(null);
    const isCancelledRef = useRef<boolean>(false);
    const audioRef = useRef<HTMLAudioElement>(null);

    // Load history from localStorage on initial render
    useEffect(() => {
        try {
            const storedHistory = localStorage.getItem('srtHistory');
            if (storedHistory) {
                setHistory(JSON.parse(storedHistory));
            }
        } catch (e) {
            console.error("Failed to parse history from localStorage", e);
            localStorage.removeItem('srtHistory'); // Clear corrupted data
        }
    }, []);

    // Progress bar simulation
    useEffect(() => {
        if (isLoading) {
            setProgress(0);
            setStatusText('Initializing...');
            
            if (intervalRef.current) clearInterval(intervalRef.current);

            intervalRef.current = window.setInterval(() => {
                setProgress(prev => {
                    const newProgress = prev + Math.random() * 4;
                    if (newProgress >= 99) {
                        if(intervalRef.current) clearInterval(intervalRef.current);
                        return 99;
                    }

                    if (newProgress < 30) {
                        setStatusText('Preparing audio file...');
                    } else if (newProgress < 70) {
                        setStatusText('AI is analyzing speech...');
                    } else {
                        setStatusText('Synchronizing timestamps...');
                    }
                    
                    return newProgress;
                });
            }, 300);

        } else {
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (srtContent) {
                 setProgress(100);
                 setStatusText('Completed!');
            } else {
                setProgress(0);
                setStatusText('');
            }
        }

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [isLoading, srtContent]);
    
    // Cleanup for audio object URL
    useEffect(() => {
        return () => {
            if (audioSrc) {
                URL.revokeObjectURL(audioSrc);
            }
        };
    }, [audioSrc]);

    const processFile = (file: File | undefined) => {
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                setError('File size must be less than 5MB.');
                setAudioFile(null);
            } else if (!file.type.startsWith('audio/')) {
                setError('Please upload a valid audio file.');
                setAudioFile(null);
            }
            else {
                setAudioFile(file);
                if (audioSrc) URL.revokeObjectURL(audioSrc); // Clean up old src
                const newAudioSrc = URL.createObjectURL(file);
                setAudioSrc(newAudioSrc);
                setIsPlaying(false);
                setError('');
                setSrtContent('');
                setUsageSummary('');
                setAudioDuration(0);
            }
        }
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        processFile(event.target.files?.[0]);
    };

    const handleDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (event: React.DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        setIsDragging(false);
        processFile(event.dataTransfer.files?.[0]);
    };

    const handleGenerate = useCallback(async () => {
        if (!audioFile) {
            setError('Please upload an audio file first.');
            return;
        }
        if (!user) {
            setError('Please sign in to continue.');
            return;
        }

        isCancelledRef.current = false;
        setIsLoading(true);
        setError('');
        setSrtContent('');
        setUsageSummary('');

        try {
            const minutesRequired = (() => {
                if (audioDuration > 0) {
                    return Math.max(1, Math.ceil(audioDuration / 60));
                }
                const duration = audioRef.current?.duration;
                if (duration && !Number.isNaN(duration)) {
                    return Math.max(1, Math.ceil(duration / 60));
                }
                return 1;
            })();

            try {
                const usage = await apiFetch<UsageResponse, { minutes: number }, { error?: string; requiredPaise?: number }>('/usage/consume', {
                    method: 'POST',
                    body: { minutes: minutesRequired }
                });
                if (usage.user) {
                    setUserData(usage.user);
                }
                const message = usage.source === 'wallet'
                    ? `Wallet debited ₹${((usage.debitedPaise ?? 0) / 100).toFixed(2)} for ${minutesRequired} minute(s).`
                    : `Using ${usage.source} balance for ${minutesRequired} minute(s).`;
                setUsageSummary(message);
            } catch (err) {
                if (err instanceof ApiError) {
                    if ((err.data as { requiredPaise?: number })?.requiredPaise) {
                        const required = (err.data as { requiredPaise?: number }).requiredPaise ?? 0;
                        setError(`${err.message}. Required top-up: ₹${(required / 100).toFixed(2)}.`);
                    } else {
                        setError(err.message);
                    }
                } else {
                    setError((err as Error).message);
                }
                setIsLoading(false);
                return;
            }

            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            const base64Audio = await fileToBase64(audioFile);
            const generatedSrt = await generateSrt(ai, audioFile, base64Audio, settings, outputLanguage);
            if (!isCancelledRef.current) {
                setSrtContent(generatedSrt);

                const newHistoryItem: HistoryItem = {
                    name: `${audioFile.name.replace(/\.[^/.]+$/, "")}_${outputLanguage}.srt`,
                    content: generatedSrt,
                    timestamp: Date.now()
                };
                const updatedHistory = [newHistoryItem, ...history].slice(0, 10);
                setHistory(updatedHistory);
                localStorage.setItem('srtHistory', JSON.stringify(updatedHistory));
            }
        } catch (err) {
            if (!isCancelledRef.current) {
                console.error(err);
                setError('Failed to generate subtitles. Please check your API key and try again.');
            }
        } finally {
            setIsLoading(false);
        }
    }, [audioFile, user, audioDuration, settings, outputLanguage, history, setUserData]);

    const handleCancel = () => {
        isCancelledRef.current = true;
        setIsLoading(false);
        setError('Generation cancelled by user.');
    };

    const downloadSrt = (content: string, fileName: string) => {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleDownload = () => {
        if (!srtContent) return;
        const fileName = audioFile?.name.replace(/\.[^/.]+$/, "") || "subtitles";
        downloadSrt(srtContent, `${fileName}_${outputLanguage}.srt`);
    };

    const handleHistoryDownload = (item: HistoryItem) => {
        downloadSrt(item.content, item.name);
    };

    const handleClearHistory = () => {
        if (window.confirm("Are you sure you want to clear your subtitle history? This cannot be undone.")) {
            setHistory([]);
            localStorage.removeItem('srtHistory');
        }
    };
    
    const handleDeleteHistoryItem = (timestampToDelete: number) => {
        if (window.confirm("Are you sure you want to delete this item from your history?")) {
            const updatedHistory = history.filter(item => item.timestamp !== timestampToDelete);
            setHistory(updatedHistory);
            if (updatedHistory.length > 0) {
                localStorage.setItem('srtHistory', JSON.stringify(updatedHistory));
            } else {
                localStorage.removeItem('srtHistory');
            }
        }
    };

    const togglePlayPause = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const audio = audioRef.current;
        if (!audio) return;
        if (isPlaying) {
            audio.pause();
        } else {
            audio.play();
        }
        setIsPlaying(!isPlaying);
    };

    const LanguageButton: React.FC<{lang: OutputLanguage, label: string}> = ({ lang, label }) => (
        <button
            onClick={() => setOutputLanguage(lang)}
            className={`flex-1 flex items-center justify-center px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 ${outputLanguage === lang ? 'bg-amber-400 text-black shadow-lg' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}
        >
            {label}
        </button>
    );

    if (!user && isAuthLoading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center text-gray-300">
                <p className="animate-pulse">Checking your subscription status...</p>
            </div>
        );
    }

    return (
        <div className="relative min-h-screen bg-black font-sans text-gray-200 flex flex-col items-center p-4 sm:p-6 lg:p-8">
            <div className="w-full max-w-5xl mx-auto">
                <Header />
                <PricingAndWallet />
                <main className="mt-8 bg-[#1F2937] border border-[#374151] rounded-xl shadow-2xl p-6 md:p-8">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Left Column: Upload & Settings */}
                        <div className="flex flex-col gap-6">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-100 mb-3">1. Upload Audio</h2>
                                <label
                                    htmlFor="audio-upload"
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    className={`relative block w-full p-6 text-center border-2 border-dashed rounded-lg cursor-pointer transition-colors ${isDragging ? 'border-amber-400 bg-gray-700/50' : 'border-gray-600 hover:border-amber-400 hover:bg-gray-700/20'}`}
                                >
                                    <input id="audio-upload" type="file" className="sr-only" accept="audio/*" onChange={handleFileChange} />
                                    <div className="flex flex-col items-center justify-center text-gray-400">
                                        <UploadIcon className="w-8 h-8 mb-2" />
                                        {audioFile ? (
                                            <span className="font-medium text-amber-400">{audioFile.name}</span>
                                        ) : (
                                            <span className="font-medium">{isDragging ? 'Drop the file here' : 'Click to upload or drag & drop'}</span>
                                        )}
                                        <p className="text-xs mt-1">Maximum file size: 5MB</p>
                                    </div>
                                    {audioFile && (
                                        <div className="mt-4 flex justify-center">
                                            <audio
                                                ref={audioRef}
                                                src={audioSrc}
                                                onLoadedMetadata={() => {
                                                    const duration = audioRef.current?.duration ?? 0;
                                                    if (!Number.isNaN(duration)) {
                                                        setAudioDuration(duration);
                                                    }
                                                }}
                                                onEnded={() => setIsPlaying(false)}
                                                preload="auto"
                                            />
                                            <button
                                                onClick={togglePlayPause}
                                                className="flex items-center gap-2 bg-gray-900/50 border border-gray-600 text-gray-200 font-semibold py-2 px-4 rounded-lg hover:bg-gray-700 hover:border-gray-500 transition-colors"
                                                aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
                                            >
                                                {isPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
                                                <span>{isPlaying ? 'Pause' : 'Preview'}</span>
                                            </button>
                                        </div>
                                    )}
                                </label>
                            </div>
                            
                            <div>
                                <h2 className="text-lg font-semibold text-gray-100 mb-3">2. Choose Output</h2>
                                <div className="flex gap-4">
                                    <LanguageButton lang="Thanglish" label="Tamil to Thanglish" />
                                    <LanguageButton lang="English" label="Tamil to English" />
                                </div>
                            </div>
                            
                            <SettingsPanel settings={settings} setSettings={setSettings} />
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={handleGenerate}
                                    disabled={!audioFile || isLoading}
                                    className={`
                                        flex-grow flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-all duration-300 shadow-lg
                                        focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-gray-800
                                        ${isLoading 
                                            ? 'bg-black text-gray-300 border border-gray-700 cursor-not-allowed' 
                                            : 'btn-animated-gradient disabled:bg-gray-600 disabled:cursor-not-allowed disabled:text-gray-400'
                                        }
                                    `}
                                >
                                    {isLoading ? (
                                        <span className="animate-pulse-text">Generating...</span>
                                    ) : 'Generate Subtitles'}
                                </button>
                                {isLoading && (
                                     <button
                                        onClick={handleCancel}
                                        className="flex items-center justify-center gap-2 bg-gray-800 border border-gray-600 text-gray-300 font-semibold py-3 px-4 rounded-lg hover:bg-gray-700 hover:border-gray-500 transition-colors"
                                        aria-label="Cancel generation"
                                    >
                                        <CancelIcon className="w-5 h-5" />
                                        Cancel
                                    </button>
                                )}
                            </div>
                            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                            {!error && usageSummary && <p className="text-amber-300 text-xs text-center">{usageSummary}</p>}
                        </div>

                        {/* Right Column: Output */}
                        <div className="flex flex-col">
                           <div className="flex justify-between items-center mb-3">
                                <h2 className="text-lg font-semibold text-gray-100">3. Get Your Subtitles</h2>
                                <button
                                    onClick={handleDownload}
                                    disabled={!srtContent || isLoading}
                                    className="flex items-center gap-2 bg-amber-400 text-black font-semibold py-2 px-4 rounded-lg hover:bg-amber-500 transition-colors disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed text-sm"
                                >
                                    <DownloadIcon className="w-4 h-4" />
                                    Download .srt
                                </button>
                            </div>
                            <div className="bg-black/50 rounded-lg p-4 flex-grow h-96 min-h-[400px] font-mono text-sm border border-gray-700 flex items-center justify-center">
                                {isLoading ? (
                                    <div className="w-full max-w-sm text-center px-4">
                                        <p className="text-lg font-semibold text-gray-100">Crafting your subtitles...</p>
                                        <div className="w-full bg-gray-700 rounded-full h-2.5 my-4">
                                            <div 
                                                className="bg-amber-400 h-2.5 rounded-full transition-all duration-300 ease-out"
                                                style={{ width: `${progress}%` }}
                                            ></div>
                                        </div>
                                        <div className="flex justify-between items-center text-sm h-5">
                                            <span className="text-gray-400 transition-opacity duration-300">{statusText}</span>
                                            <span className="font-mono font-semibold text-gray-200 transition-opacity duration-300">{Math.floor(progress)}%</span>
                                        </div>
                                    </div>
                                ) : (
                                    <textarea
                                        readOnly
                                        value={srtContent || 'Your generated .srt file will appear here.'}
                                        className="w-full h-full bg-transparent border-none resize-none text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-0"
                                        placeholder="Your generated .srt file will appear here."
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                </main>

                 {history.length > 0 && (
                    <section className="mt-10 bg-[#1F2937] border border-[#374151] rounded-xl shadow-2xl p-6 md:p-8">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-white">Your Recent Creations</h2>
                            <button
                                onClick={handleClearHistory}
                                className="flex items-center gap-2 text-sm text-gray-400 hover:text-red-400 transition-colors"
                                aria-label="Clear history"
                            >
                                <TrashIcon className="w-4 h-4" />
                                Clear History
                            </button>
                        </div>
                        <ul className="space-y-3">
                            {history.map((item) => (
                                <li key={item.timestamp} className="bg-gray-800/50 p-3 rounded-lg flex justify-between items-center border border-gray-700 hover:bg-gray-800 transition-colors">
                                    <div className="flex flex-col overflow-hidden mr-4">
                                        <span className="font-semibold text-gray-100 text-sm truncate" title={item.name}>{item.name}</span>
                                        <span className="text-xs text-gray-400">{new Date(item.timestamp).toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <button
                                            onClick={() => handleHistoryDownload(item)}
                                            className="flex items-center gap-2 bg-gray-700 text-gray-200 font-semibold py-2 px-3 rounded-lg hover:bg-gray-600 transition-colors text-sm"
                                            aria-label={`Download ${item.name}`}
                                        >
                                            <DownloadIcon className="w-4 h-4" />
                                            Download
                                        </button>
                                        <button
                                            onClick={() => handleDeleteHistoryItem(item.timestamp)}
                                            className="p-2 text-gray-400 rounded-lg hover:bg-red-500/20 hover:text-red-400 transition-colors"
                                            aria-label={`Delete ${item.name}`}
                                        >
                                            <TrashIcon className="w-5 h-5" />
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
            </div>
            {!user && <AuthModal />}
        </div>
    );
};

export default App;
