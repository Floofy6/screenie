import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { CaptureSettings, WindowCloseBehavior } from '@shared/types';
import { buildDefaultSettings, DEFAULT_REGION_SHORTCUT } from '../storage/storage';

function normalizeCloseBehavior(value: unknown): WindowCloseBehavior {
  return value === 'hide-to-tray' ? 'hide-to-tray' : 'close';
}

function normalizeShortcuts(parsed: Partial<CaptureSettings>, defaults: CaptureSettings): CaptureSettings['shortcuts'] {
  const merged = {
    ...defaults.shortcuts,
    ...(parsed.shortcuts ?? {})
  };

  if (merged.region === 'CommandOrControl+Shift+3') {
    merged.region = DEFAULT_REGION_SHORTCUT;
  }

  return merged;
}

const SETTINGS_FILE_NAME = 'screenie-settings.json';

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), SETTINGS_FILE_NAME);
}

export class SettingsStore {
  private cache: CaptureSettings | null = null;

  async get(): Promise<CaptureSettings> {
    if (this.cache) {
      return this.cache;
    }

    const defaults = buildDefaultSettings();
    try {
      const raw = await fs.readFile(getSettingsPath(), 'utf8');
      const parsed = JSON.parse(raw) as Partial<CaptureSettings>;
      this.cache = {
        ...defaults,
        ...parsed,
        closeBehavior: normalizeCloseBehavior(parsed.closeBehavior),
        shortcuts: normalizeShortcuts(parsed, defaults)
      };
      return this.cache;
    } catch (_error) {
      await this.set(defaults);
      this.cache = defaults;
      return defaults;
    }
  }

  async set(next: CaptureSettings): Promise<CaptureSettings> {
    const merged: CaptureSettings = {
      ...buildDefaultSettings(),
      ...next,
      closeBehavior: normalizeCloseBehavior(next.closeBehavior),
      shortcuts: normalizeShortcuts(next, buildDefaultSettings())
    };
    this.cache = merged;
    await fs.mkdir(app.getPath('userData'), { recursive: true });
    await fs.writeFile(getSettingsPath(), JSON.stringify(merged, null, 2), 'utf8');
    return merged;
  }
}
