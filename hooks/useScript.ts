import { useEffect, useState } from 'react';

export const useScript = (src: string) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!src) return;

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        setLoaded(true);
      } else {
        existing.addEventListener('load', () => setLoaded(true));
        existing.addEventListener('error', () => setError(new Error(`Failed to load script ${src}`)));
      }
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.loaded = 'false';
    script.onload = () => {
      script.dataset.loaded = 'true';
      setLoaded(true);
    };
    script.onerror = () => {
      setError(new Error(`Failed to load script ${src}`));
    };
    document.body.appendChild(script);

    return () => {
      script.onload = null;
      script.onerror = null;
    };
  }, [src]);

  return { loaded, error };
};

