import { BrowserWindow } from 'electron';

function normalizeUrl(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString();
  } catch {
    return value;
  }
}

export function buildSecureWebPreferences(preloadPath: string) {
  return {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true
  };
}

export function attachWindowSecurityGuards(targetWindow: BrowserWindow, allowedUrl: string): void {
  const normalizedAllowedUrl = normalizeUrl(allowedUrl);

  targetWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  targetWindow.webContents.on('will-navigate', (event, url) => {
    if (normalizeUrl(url) === normalizedAllowedUrl) {
      return;
    }

    event.preventDefault();
    console.warn('blocked unexpected renderer navigation', {
      target: url,
      currentUrl: targetWindow.webContents.getURL()
    });
  });
}
