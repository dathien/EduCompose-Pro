import { useCallback, useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const INSTALLED_STORAGE_KEY = 'smart_docx_pwa_installed';

function checkStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  const matchStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return matchStandalone || iosStandalone;
}

async function verifyOfflineStorageReady(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator) || !('caches' in window)) {
    return false;
  }
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return false;
    const cacheNames = await caches.keys();
    if (cacheNames.length === 0) return false;
    for (const name of cacheNames) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      if (keys.length > 0) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export interface UsePwaControllerOptions {
  onBeforeUpdateReload?: () => Promise<void> | void;
}

export function usePwaController(options: UsePwaControllerOptions = {}) {
  const onBeforeUpdateRef = useRef(options.onBeforeUpdateReload);
  onBeforeUpdateRef.current = options.onBeforeUpdateReload;

  const updateSwFnRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(() => checkStandaloneMode());
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (checkStandaloneMode()) return true;
    try {
      return localStorage.getItem(INSTALLED_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [isIOS, setIsIOS] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineVerified, setOfflineVerified] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Detect browser platform, standalone state, and installability events
  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const updateDisplayState = () => {
      const standalone = checkStandaloneMode();
      setIsStandalone(standalone);
      if (standalone) {
        setIsInstalled(true);
        try {
          localStorage.setItem(INSTALLED_STORAGE_KEY, '1');
        } catch {
          // Ignore storage unavailability
        }
      }
    };

    updateDisplayState();

    // Check installed related apps API when supported by Chromium/Edge
    const navWithApps = navigator as Navigator & {
      getInstalledRelatedApps?: () => Promise<Array<{ platform?: string }>>;
    };
    if (typeof navWithApps.getInstalledRelatedApps === 'function') {
      navWithApps
        .getInstalledRelatedApps()
        .then((apps) => {
          if (Array.isArray(apps) && apps.length > 0) {
            setIsInstalled(true);
          }
        })
        .catch(() => {
          // Ignore unsupported platform query
        });
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Browser fired install prompt -> app is currently uninstallable/re-installable
      setIsInstalled(checkStandaloneMode());
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      try {
        localStorage.setItem(INSTALLED_STORAGE_KEY, '1');
      } catch {
        // Ignore storage unavailability
      }
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    const mediaQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)')
        : null;

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    mediaQuery?.addEventListener?.('change', updateDisplayState);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      mediaQuery?.removeEventListener?.('change', updateDisplayState);
    };
  }, []);

  // Register VitePWA Service Worker & verify real cache storage before confirming offline readiness
  useEffect(() => {
    let active = true;

    const verifyCache = async () => {
      const ok = await verifyOfflineStorageReady();
      if (active && ok) {
        setOfflineVerified(true);
      }
    };

    try {
      const updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
          if (active) {
            setNeedRefresh(true);
          }
        },
        onOfflineReady() {
          verifyCache();
        },
        onRegisteredSW(_swUrl, registration) {
          if (registration) {
            verifyCache();
            // Periodically check for updated assets while online
            const timer = window.setInterval(() => {
              if (navigator.onLine) {
                registration.update().catch(() => {
                  // Ignore offline/network check errors
                });
              }
            }, 30 * 60 * 1000);
            return () => window.clearInterval(timer);
          }
        },
      });
      updateSwFnRef.current = updateSW;
    } catch {
      // Service Worker unavailable in restricted sandbox
    }

    verifyCache();

    return () => {
      active = false;
    };
  }, []);

  const triggerInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) return 'unavailable';
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
        try {
          localStorage.setItem(INSTALLED_STORAGE_KEY, '1');
        } catch {
          // Ignore storage unavailability
        }
        return 'accepted';
      }
      return 'dismissed';
    } catch {
      return 'unavailable';
    }
  }, [deferredPrompt]);

  const applyUpdate = useCallback(async () => {
    setIsUpdating(true);
    try {
      await onBeforeUpdateRef.current?.();
    } catch {
      // Continue update even if optional pre-save fails
    }
    if (updateSwFnRef.current) {
      await updateSwFnRef.current(true);
    } else {
      window.location.reload();
    }
  }, []);

  const dismissUpdate = useCallback(() => {
    setNeedRefresh(false);
  }, []);

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isStandalone,
    isIOS,
    isOnline,
    offlineVerified,
    needRefresh,
    isUpdating,
    triggerInstall,
    applyUpdate,
    dismissUpdate,
  };
}
