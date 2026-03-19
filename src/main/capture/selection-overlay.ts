import { BrowserWindow, ipcMain, screen } from 'electron';
import type { RegionSelection } from '@shared/types';
import { isPlainObject, isSenderWindow, toFiniteNumber } from '../security/ipc';
import { attachWindowSecurityGuards, buildSecureWebPreferences } from '../security/window-security';

type SelectionRequest = RegionSelection;

type SelectionOptions = {
  parent: BrowserWindow | null;
  preloadPath: string;
  overlayUrl: string;
};

let overlayWindow: BrowserWindow | null = null;
let overlayLoadPromise: Promise<void> | null = null;

function buildOverlayUrl(base: string): string {
  return base;
}

function getTargetDisplay() {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

function normalizeSelectionRequest(raw: unknown, scaleFactor: number): SelectionRequest | null {
  if (!isPlainObject(raw)) {
    return null;
  }

  const x = toFiniteNumber(raw.x);
  const y = toFiniteNumber(raw.y);
  const width = toFiniteNumber(raw.width);
  const height = toFiniteNumber(raw.height);
  if (x == null || y == null || width == null || height == null || width < 1 || height < 1) {
    return null;
  }

  const selection: SelectionRequest = {
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y)),
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
    dpr: (() => {
      const dpr = toFiniteNumber(raw.dpr);
      return dpr != null && dpr > 0 ? dpr : scaleFactor;
    })()
  };

  const displayId = toFiniteNumber(raw.displayId);
  if (displayId != null) {
    selection.displayId = Math.round(displayId);
  }

  return selection;
}

async function ensureOverlayWindow(options: SelectionOptions, targetDisplay = getTargetDisplay()): Promise<BrowserWindow> {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setBounds({
      x: targetDisplay.bounds.x,
      y: targetDisplay.bounds.y,
      width: targetDisplay.bounds.width,
      height: targetDisplay.bounds.height
    });
    if (overlayLoadPromise) {
      await overlayLoadPromise;
    }
    return overlayWindow;
  }

  overlayWindow = new BrowserWindow({
    x: targetDisplay.bounds.x,
    y: targetDisplay.bounds.y,
    width: targetDisplay.bounds.width,
    height: targetDisplay.bounds.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    focusable: true,
    acceptFirstMouse: true,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    roundedCorners: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: buildSecureWebPreferences(options.preloadPath)
  });
  attachWindowSecurityGuards(overlayWindow, options.overlayUrl);

  overlayWindow.on('closed', () => {
    overlayWindow = null;
    overlayLoadPromise = null;
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setFullScreenable(false);
  overlayWindow.setIgnoreMouseEvents(false);

  overlayLoadPromise = overlayWindow.loadURL(buildOverlayUrl(options.overlayUrl)).then(() => undefined);
  await overlayLoadPromise;
  return overlayWindow;
}

export async function warmRegionOverlay(options: SelectionOptions): Promise<void> {
  const targetDisplay = getTargetDisplay();
  const window = await ensureOverlayWindow(options, targetDisplay);
  window.webContents.send('capture:region:prepare', { displayId: targetDisplay.id });
  window.hide();
}

export async function captureRegion(options: SelectionOptions): Promise<SelectionRequest | null> {
  const targetDisplay = getTargetDisplay();
  const window = await ensureOverlayWindow(options, targetDisplay);
  window.webContents.send('capture:region:prepare', { displayId: targetDisplay.id });
  window.show();
  window.focus();

  return new Promise((resolve) => {
    let resolved = false;
    const done = (selection: SelectionRequest | null) => {
      if (resolved) {
        return;
      }
      resolved = true;
      ipcMain.removeListener('capture:region:selected', onSelect);
      ipcMain.removeListener('capture:region:cancelled', onCancel);
      window.removeListener('closed', onCancel);
      if (!window.isDestroyed()) {
        window.hide();
      }
      resolve(selection);
    };

    const onSelect = (event: Electron.IpcMainEvent, raw: unknown) => {
      if (!isSenderWindow(event, window)) {
        return;
      }

      const selection = normalizeSelectionRequest(raw, targetDisplay.scaleFactor);
      if (!selection) {
        done(null);
        return;
      }
      done(selection);
    };

    const onCancel = (event?: Electron.IpcMainEvent) => {
      if (event && !isSenderWindow(event, window)) {
        return;
      }

      done(null);
    };
    ipcMain.on('capture:region:selected', onSelect);
    ipcMain.on('capture:region:cancelled', onCancel);
    window.on('closed', onCancel);
  });
}
