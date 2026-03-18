import { BrowserWindow, ipcMain, screen } from 'electron';
import type { RegionSelection } from '@shared/types';

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

function getTargetDisplay(parent: BrowserWindow | null) {
  return screen.getDisplayMatching(parent ? parent.getBounds() : screen.getPrimaryDisplay().bounds);
}

async function ensureOverlayWindow(options: SelectionOptions, targetDisplay = getTargetDisplay(options.parent)): Promise<BrowserWindow> {
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
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: options.preloadPath
    }
  });

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
  const targetDisplay = getTargetDisplay(options.parent);
  const window = await ensureOverlayWindow(options, targetDisplay);
  window.webContents.send('capture:region:prepare', { displayId: targetDisplay.id });
  window.hide();
}

export async function captureRegion(options: SelectionOptions): Promise<SelectionRequest | null> {
  const { parent } = options;
  const targetDisplay = getTargetDisplay(parent);
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

    const onSelect = (_event: Electron.IpcMainEvent, raw: SelectionRequest) => {
      if (!raw || raw.width < 1 || raw.height < 1) {
        done(null);
        return;
      }
      const selection: SelectionRequest = {
        x: Math.max(0, Math.round(raw.x)),
        y: Math.max(0, Math.round(raw.y)),
        width: Math.max(1, Math.round(raw.width)),
        height: Math.max(1, Math.round(raw.height)),
        dpr: Number(raw.dpr) > 0 ? Number(raw.dpr) : targetDisplay.scaleFactor
      };
      const parsedDisplayId = Number(raw.displayId);
      if (Number.isFinite(parsedDisplayId)) {
        selection.displayId = parsedDisplayId;
      }
      done(selection);
    };

    const onCancel = () => done(null);
    ipcMain.on('capture:region:selected', onSelect);
    ipcMain.on('capture:region:cancelled', onCancel);
    window.on('closed', onCancel);
  });
}
