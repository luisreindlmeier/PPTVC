import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { writeUserSettings, type UserSettings } from "../storage";
import { DEFAULT_SETTINGS } from "../taskpane/settings-model";

/** Manages user settings state and persistence to OPFS. Exposes `setSettings` for the init hook to apply loaded settings. */
export function useSettings(): {
  settings: UserSettings;
  setSettings: Dispatch<SetStateAction<UserSettings>>;
  onSettingsChange: (next: UserSettings) => Promise<void>;
} {
  const [settings, setSettings] = useState<UserSettings>({ ...DEFAULT_SETTINGS });

  const onSettingsChange = useCallback(async (next: UserSettings) => {
    setSettings(next);
    await writeUserSettings(next);
  }, []);

  return { settings, setSettings, onSettingsChange };
}
