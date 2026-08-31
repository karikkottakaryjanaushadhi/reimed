"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

/** Set while user is unlocked on /dashboard/margins; cleared when they leave that path. */
export const MARGIN_PATH_ACTIVE_KEY = "reimed_margin_path_active";
const MARGIN_PASSWORD_KEY = "reimed_margin_pw";
const LEGACY_MARGIN_PASSWORD_STORAGE_KEY = "reimed_margin_password";

export function clearMarginPathSession() {
  try {
    sessionStorage.removeItem(MARGIN_PATH_ACTIVE_KEY);
    sessionStorage.removeItem(MARGIN_PASSWORD_KEY);
    sessionStorage.removeItem(LEGACY_MARGIN_PASSWORD_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function readMarginPasswordFromSession(): string | null {
  try {
    if (sessionStorage.getItem(MARGIN_PATH_ACTIVE_KEY) !== "1") return null;
    return sessionStorage.getItem(MARGIN_PASSWORD_KEY);
  } catch {
    return null;
  }
}

function writeMarginPasswordToSession(password: string) {
  try {
    sessionStorage.setItem(MARGIN_PATH_ACTIVE_KEY, "1");
    sessionStorage.setItem(MARGIN_PASSWORD_KEY, password);
    sessionStorage.removeItem(LEGACY_MARGIN_PASSWORD_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

type MarginAccessContextValue = {
  ready: boolean;
  marginPassword: string | null;
  unlock: (password: string) => void;
  lock: () => void;
};

const MarginAccessContext = createContext<MarginAccessContextValue | null>(null);

export function MarginAccessProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [marginPassword, setMarginPassword] = useState<string | null>(null);

  const lock = useCallback(() => {
    clearMarginPathSession();
    setMarginPassword(null);
  }, []);

  const unlock = useCallback((password: string) => {
    writeMarginPasswordToSession(password);
    setMarginPassword(password);
  }, []);

  useEffect(() => {
    try {
      sessionStorage.removeItem(LEGACY_MARGIN_PASSWORD_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setMarginPassword(readMarginPasswordFromSession());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !pathname.startsWith("/dashboard/margins")) return;
    const stored = readMarginPasswordFromSession();
    if (stored) {
      setMarginPassword(stored);
    } else {
      setMarginPassword(null);
    }
  }, [pathname, ready]);

  const value = useMemo(
    () => ({ ready, marginPassword, unlock, lock }),
    [ready, marginPassword, unlock, lock],
  );

  return <MarginAccessContext.Provider value={value}>{children}</MarginAccessContext.Provider>;
}

export function useMarginAccess() {
  const ctx = useContext(MarginAccessContext);
  if (!ctx) {
    throw new Error("useMarginAccess must be used within MarginAccessProvider");
  }
  return ctx;
}
