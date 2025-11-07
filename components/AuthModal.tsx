import React, { useEffect, useRef, useState } from 'react';
import { useUser } from '../contexts/UserContext';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
          }) => void;
          renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
          prompt: () => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const AuthModal: React.FC = () => {
  const { login, isLoading, error, devLogin, devLoginAvailable } = useUser();
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [devError, setDevError] = useState<string | null>(null);
  const [isLocalhost, setIsLocalhost] = useState(false);
  const buttonRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      setScriptError('Missing Google client ID');
      return;
    }

    if (window.google?.accounts?.id) {
      setScriptLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => setScriptError('Failed to load Google Sign-In');
    document.head.appendChild(script);

    return () => {
      script.onload = null;
      script.onerror = null;
    };
  }, []);

  useEffect(() => {
    if (!scriptLoaded || !window.google || !buttonRef.current || !GOOGLE_CLIENT_ID) {
      return;
    }

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async ({ credential }) => {
        if (!credential) return;
        try {
          await login(credential);
        } catch (err) {
          console.error('Google login failed', err);
        }
      }
    });

    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: 'filled_black',
      size: 'large',
      width: '280'
    });

    window.google.accounts.id.prompt();
  }, [scriptLoaded, login]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hostname = window.location.hostname;
    setIsLocalhost(hostname === 'localhost' || hostname === '127.0.0.1');
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-gray-900/90 border border-gray-700 px-8 py-10 shadow-2xl text-center">
        <h2 className="text-2xl font-bold text-white mb-4">Welcome to Thanglish Pro</h2>
        <p className="text-sm text-gray-300 mb-6">
          Sign in with Google to access your subtitles, manage plans, and unlock your free 2-day trial.
        </p>
        <div className="flex flex-col items-center gap-4">
          <div ref={buttonRef} />
          {devLoginAvailable && devLogin && isLocalhost && (
            <button
              type="button"
              onClick={async () => {
                try {
                  setDevError(null);
                  await devLogin();
                } catch (err) {
                  setDevError((err as Error).message || 'Dev login failed');
                }
              }}
              className="w-full rounded-lg border border-amber-400 px-4 py-2 text-sm font-semibold text-amber-300 transition-colors hover:bg-amber-400/10 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
            >
              Continue as Dev Tester
            </button>
          )}
          {(error || scriptError) && (
            <p className="text-sm text-red-400">
              {scriptError ?? error}
            </p>
          )}
          {devError && (
            <p className="text-sm text-red-400">{devError}</p>
          )}
          {isLoading && <p className="text-xs text-gray-400 animate-pulse">Signing you in...</p>}
        </div>
      </div>
    </div>
  );
};

export default AuthModal;

