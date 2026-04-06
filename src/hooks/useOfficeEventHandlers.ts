/* global Office */

import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { readUserSettings, type UserSettings } from "../storage";
import { getDefaultVersionName, mergeSettings } from "../taskpane/settings-model";
import { listVersions, saveVersion } from "../versions";
import type { SlideInfo } from "../app-types";

interface UseOfficeEventHandlersOptions {
  settings: UserSettings;
  setSettings: Dispatch<SetStateAction<UserSettings>>;
  loadVersions: () => Promise<unknown>;
  enforceMaxVersions: () => Promise<void>;
  showStatus: (text: string, isError: boolean) => void;
  setCurrentSlide: Dispatch<SetStateAction<SlideInfo>>;
  onInitialized?: () => void;
}

/**
 * Registers Office JS event handlers (auto-save on document save, slide tracking) on mount
 * and loads persisted settings + versions. Cleans up handlers on unmount.
 */
export function useOfficeEventHandlers({
  settings,
  setSettings,
  loadVersions,
  enforceMaxVersions,
  showStatus,
  setCurrentSlide,
  onInitialized,
}: UseOfficeEventHandlersOptions): void {
  const autoSaveInProgress = useRef(false);

  const removeDocumentHandlerAsync = useCallback((eventType: Office.EventType): Promise<void> => {
    return new Promise<void>((resolve) => {
      Office.context.document.removeHandlerAsync(eventType, () => resolve());
    });
  }, []);

  const registerAutoSave = useCallback((): (() => void) => {
    Office.context.document.addHandlerAsync(
      "documentBeforeSave" as unknown as Office.EventType,
      (eventArgs: { completed: () => void }) => {
        if (!settings.autoSaveOnDocumentSave || autoSaveInProgress.current) {
          eventArgs.completed();
          return;
        }
        autoSaveInProgress.current = true;
        void (async () => {
          try {
            const loaded = await listVersions();
            const name = getDefaultVersionName(loaded.length + 1, settings);
            await saveVersion({ name, tags: [], authorName: settings.authorName || undefined });
            await enforceMaxVersions();
            await loadVersions();
            showStatus(`Auto-saved: ${name}`, false);
          } catch (err) {
            showStatus(err instanceof Error ? err.message : "Auto-save failed.", true);
          } finally {
            autoSaveInProgress.current = false;
            eventArgs.completed();
          }
        })();
      }
    );

    return () => {
      void removeDocumentHandlerAsync("documentBeforeSave" as unknown as Office.EventType);
    };
  }, [settings, enforceMaxVersions, loadVersions, removeDocumentHandlerAsync, showStatus]);

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
    let unregisterAutoSave: (() => void) | null = null;
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

      try {
        await loadVersions();
      } catch (error: unknown) {
        if (!disposed) {
          showStatus(error instanceof Error ? error.message : "Failed to load versions.", true);
        }
      }
      if (disposed) return;

      unregisterAutoSave = registerAutoSave();
      unregisterSlideTracking = initSlideTracking();
      onInitialized?.();
    })();

    return () => {
      disposed = true;
      unregisterAutoSave?.();
      unregisterSlideTracking?.();
    };
  }, [initSlideTracking, loadVersions, onInitialized, registerAutoSave, setSettings, showStatus]);
}
