/* global setTimeout, clearTimeout */

import { useCallback, useEffect, useRef, useState } from "react";
import type { StatusMessage } from "../app-types";

/** Manages the transient status message shown in the app footer. Auto-dismisses after 4 seconds. */
export function useStatusMessages(): {
  status: StatusMessage | null;
  showStatus: (text: string, isError: boolean) => void;
} {
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showStatus = useCallback((text: string, isError: boolean) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatus({ text, isError, key: Date.now() });
    statusTimerRef.current = setTimeout(() => setStatus(null), 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, []);

  return { status, showStatus };
}
