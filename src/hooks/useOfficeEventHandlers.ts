/* global Office */

import { useCallback, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { readUserSettings, type UserSettings } from "../storage";
import { mergeSettings } from "../taskpane/settings-model";
import type { SlideInfo } from "../app-types";

interface UseOfficeEventHandlersOptions {
  setSettings: Dispatch<SetStateAction<UserSettings>>;
  loadVersions: () => Promise<unknown>;
  showStatus: (text: string, isError: boolean) => void;
  setCurrentSlide: Dispatch<SetStateAction<SlideInfo>>;
  onInitialized?: () => void;
}

/**
 * Registers Office JS event handlers (auto-save on document save, slide tracking) on mount
 * and loads persisted settings + versions. Cleans up handlers on unmount.
 */
export function useOfficeEventHandlers({
  setSettings,
  loadVersions,
  showStatus,
  setCurrentSlide,
  onInitialized,
}: UseOfficeEventHandlersOptions): void {
  const removeDocumentHandlerAsync = useCallback((eventType: Office.EventType): Promise<void> => {
    return new Promise<void>((resolve) => {
      Office.context.document.removeHandlerAsync(eventType, () => resolve());
    });
  }, []);

  const initSlideTracking = useCallback((): (() => void) => {
    const updateSlide = () => {
      Office.context.document.getSelectedDataAsync(
        Office.CoercionType.SlideRange,
        (result: Office.AsyncResult<{ slides?: { index: number; title: string }[] }>) => {
          const slide = result.value?.slides?.[0];
          if (result.status === Office.AsyncResultStatus.Succeeded && slide) {
            const num = Math.max(1, slide.index);
            setCurrentSlide({ num, name: `Slide ${num}` });
          }
        }
      );
    };
    updateSlide();
    Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, updateSlide);

    return () => {
      void removeDocumentHandlerAsync(Office.EventType.DocumentSelectionChanged);
    };
  }, [removeDocumentHandlerAsync, setCurrentSlide]);

  useEffect(() => {
    let disposed = false;
    let unregisterSlideTracking: (() => void) | null = null;

    void (async () => {
      try {
        const stored = await readUserSettings();
        const merged = mergeSettings(stored);
        if (disposed) return;
        setSettings(merged);
      } catch (error: unknown) {
        if (!disposed) {
          showStatus(error instanceof Error ? error.message : "Failed to load settings.", true);
        }
      }

      if (disposed) return;

      onInitialized?.();

      try {
        await loadVersions();
      } catch (error: unknown) {
        if (!disposed) {
          showStatus(error instanceof Error ? error.message : "Failed to load versions.", true);
        }
      }
      if (disposed) return;

      unregisterSlideTracking = initSlideTracking();
    })();

    return () => {
      disposed = true;
      unregisterSlideTracking?.();
    };
  }, [initSlideTracking, loadVersions, onInitialized, setSettings, showStatus]);
}
