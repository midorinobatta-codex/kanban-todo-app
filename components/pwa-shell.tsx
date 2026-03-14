'use client';

import { useEffect, useMemo, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const isIosDevice = () => {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
};

const isStandaloneMode = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
};

export default function PwaShell() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setIsStandalone(isStandaloneMode());

    if (typeof window === 'undefined') return;

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        void navigator.serviceWorker.register('/sw.js', { scope: '/' });
      });
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setInstallEvent(null);
      setIsStandalone(true);
      setDismissed(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    const iosEligible = isIosDevice() && !isStandaloneMode();
    setShowIosHint(iosEligible);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const canShowInstall = useMemo(() => !isStandalone && !dismissed && Boolean(installEvent), [dismissed, installEvent, isStandalone]);
  const canShowIosHint = useMemo(() => !isStandalone && !dismissed && !installEvent && showIosHint, [dismissed, installEvent, isStandalone, showIosHint]);

  const handleInstall = async () => {
    if (!installEvent) return;
    setIsInstalling(true);
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'dismissed') {
      setDismissed(true);
    }
    setInstallEvent(null);
    setIsInstalling(false);
  };

  if (!canShowInstall && !canShowIosHint) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-[100] max-w-xs rounded-2xl border border-blue-200 bg-white/95 p-4 shadow-xl backdrop-blur">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">F</div>
        <div>
          <p className="text-sm font-semibold text-slate-900">FlowFocus をアプリ化</p>
          <p className="text-xs text-slate-600">ホーム画面やデスクトップからすぐ開けます</p>
        </div>
      </div>

      {canShowInstall ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleInstall()}
            disabled={isInstalling}
            className="flex-1 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {isInstalling ? '準備中...' : 'インストール'}
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            閉じる
          </button>
        </div>
      ) : null}

      {canShowIosHint ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            Safari の共有メニューから <span className="font-semibold">ホーム画面に追加</span> を選ぶと、FlowFocus をアプリのように使えます。
          </p>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            閉じる
          </button>
        </div>
      ) : null}
    </div>
  );
}
