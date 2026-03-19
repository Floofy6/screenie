import type { BrowserWindow } from 'electron';

export type MainIpcEvent = Electron.IpcMainEvent | Electron.IpcMainInvokeEvent;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function isSenderWindow(event: MainIpcEvent, expectedWindow: BrowserWindow | null): boolean {
  return Boolean(expectedWindow && !expectedWindow.isDestroyed() && event.sender === expectedWindow.webContents);
}

export function requireSenderWindow(event: MainIpcEvent, expectedWindow: BrowserWindow | null, channel: string): void {
  if (!isSenderWindow(event, expectedWindow)) {
    throw new Error(`Rejected unexpected IPC sender for ${channel}.`);
  }
}

export function requireString(
  value: unknown,
  fieldName: string,
  options: { allowEmpty?: boolean; maxLength?: number } = {}
): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${fieldName}.`);
  }

  const normalized = value.trim();
  if (!options.allowEmpty && normalized.length === 0) {
    throw new Error(`Invalid ${fieldName}.`);
  }

  if (options.maxLength && normalized.length > options.maxLength) {
    throw new Error(`Invalid ${fieldName}.`);
  }

  return normalized;
}

export function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
