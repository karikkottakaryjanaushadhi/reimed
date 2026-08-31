"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { clearMarginPathSession } from "./margins/margin-access-context";

/** Clears margin unlock when navigation leaves /dashboard/margins. */
export function MarginRouteSync() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.startsWith("/dashboard/margins")) {
      clearMarginPathSession();
    }
  }, [pathname]);

  return null;
}
