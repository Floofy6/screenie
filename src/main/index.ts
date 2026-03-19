import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  app,
  screen,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  shell,
  systemPreferences
} from 'electron';
import type { CaptureMode, CaptureRequest, CaptureResult, CaptureSettings, RegionSelection } from '@shared/types';
import { captureActiveWindow, captureArea, captureFullscreen, captureNativeRegion } from './capture/capture-service';
import { captureRegion, warmRegionOverlay } from './capture/selection-overlay';
import { SettingsStore } from './settings/settings';
import { openAnnotationWorkspace } from './annotations';
import { isPlainObject, requireSenderWindow, requireString } from './security/ipc';
import { attachWindowSecurityGuards, buildSecureWebPreferences } from './security/window-security';
import { HistoryStore } from './storage/history';
import { writeCaptureImage } from './storage/storage';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isMac = process.platform === 'darwin';
const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
const rendererDevUrl = process.env.ELECTRON_RENDERER_URL;
const preloadPath = (() => {
  const cjsPath = join(__dirname, '../preload/index.cjs');
  const jsPath = join(__dirname, '../preload/index.js');
  const mjsPath = join(__dirname, '../preload/index.mjs');
  return existsSync(cjsPath) ? cjsPath : existsSync(jsPath) ? jsPath : mjsPath;
})();
function resolveRendererDistPath(): string {
  const candidates = [
    join(__dirname, '../../dist'),
    join(app.getAppPath(), 'dist'),
    join(process.cwd(), 'dist'),
    join(process.resourcesPath ?? process.cwd(), 'dist')
  ];

  const root = candidates.find((entry) => existsSync(join(entry, 'index.html')));
  return root ?? join(__dirname, '../../dist');
}

const rendererDistPath = resolveRendererDistPath();
function resolveRendererPageUrl(fileName: string) {
  if (rendererDevUrl) {
    const normalizedBase = rendererDevUrl.endsWith('/') ? rendererDevUrl : `${rendererDevUrl}/`;
    return new URL(fileName, normalizedBase).toString();
  }
  return `file://${join(rendererDistPath, fileName)}`;
}

const mainWindowUrl = resolveRendererPageUrl('index.html');
const overlayWindowUrl = resolveRendererPageUrl('overlay.html');
const annotationWindowUrl = resolveRendererPageUrl('annotation.html');

const settingsStore = new SettingsStore();
const historyStore = new HistoryStore();
let mainWindow: BrowserWindow | null = null;
let isCapturing = false;
let isRegionSelectionActive = false;
let closeBehavior: CaptureSettings['closeBehavior'] = 'close';
let ipcReady = false;

app.setName('Screenie');

function resolveAppIconPath() {
  const candidates = [
    join(process.cwd(), 'resources', 'icon.png'),
    join(app.getAppPath(), 'resources', 'icon.png'),
    join(process.resourcesPath, 'resources', 'icon.png')
  ];

  return candidates.find((entry) => existsSync(entry)) ?? null;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertCaptureMode(value: unknown): CaptureMode {
  if (value === 'fullscreen' || value === 'window' || value === 'region') {
    return value;
  }

  throw new Error('Invalid capture mode.');
}

function assertCloseBehavior(value: unknown): CaptureSettings['closeBehavior'] {
  if (value === 'close' || value === 'hide-to-tray') {
    return value;
  }

  throw new Error('Invalid close behavior.');
}

function assertCaptureRequest(value: unknown): CaptureRequest {
  if (!isPlainObject(value)) {
    throw new Error('Invalid capture request.');
  }

  const mode = assertCaptureMode(value.mode);
  const annotate = typeof value.annotate === 'boolean' ? value.annotate : false;
  return annotate ? { mode, annotate } : { mode };
}

function assertShortcutValue(value: unknown, fieldName: string): string {
  return requireString(value, fieldName, { allowEmpty: true, maxLength: 128 });
}

function assertCaptureSettings(value: unknown): CaptureSettings {
  if (!isPlainObject(value)) {
    throw new Error('Invalid settings payload.');
  }

  if (!isPlainObject(value.shortcuts)) {
    throw new Error('Invalid shortcuts payload.');
  }

  const filenameTemplate = requireString(value.filenameTemplate, 'filename template', {
    allowEmpty: true,
    maxLength: 128
  });
  if (filenameTemplate.includes('..') || /[\\/]/.test(filenameTemplate)) {
    throw new Error('Filename template cannot contain path separators.');
  }

  return {
    outputDirectory: requireString(value.outputDirectory, 'output directory', {
      allowEmpty: true,
      maxLength: 1024
    }),
    filenameTemplate,
    defaultMode: assertCaptureMode(value.defaultMode),
    closeBehavior: assertCloseBehavior(value.closeBehavior),
    shortcuts: {
      fullscreen: assertShortcutValue(value.shortcuts.fullscreen, 'fullscreen shortcut'),
      window: assertShortcutValue(value.shortcuts.window, 'window shortcut'),
      region: assertShortcutValue(value.shortcuts.region, 'region shortcut')
    }
  };
}

function buildWindowErrorHtml(title: string, detail: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: dark;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: radial-gradient(circle at top, #24304a 0%, #121826 55%, #0b1020 100%);
        color: #eef2ff;
        font: 15px/1.5 "Trebuchet MS", "Segoe UI", sans-serif;
        padding: 24px;
      }
      main {
        width: min(560px, 100%);
        background: rgba(12, 18, 34, 0.88);
        border: 1px solid rgba(124, 147, 203, 0.24);
        border-radius: 18px;
        padding: 22px;
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 24px;
      }
      p {
        margin: 0 0 14px;
        color: #d7def7;
      }
      pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        background: rgba(255, 255, 255, 0.06);
        border-radius: 12px;
        padding: 12px;
        color: #c9d6ff;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>Screenie could not load its interface cleanly, so this fallback screen is showing instead of a blank window.</p>
      <pre>${detail}</pre>
    </main>
  </body>
</html>`;
}

async function loadWindowContent(targetWindow: BrowserWindow, targetUrl: string) {
  const attempts = isDev ? 12 : 1;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await targetWindow.loadURL(targetUrl);
      return;
    } catch (error) {
      lastError = error;
      console.error('main window load attempt failed', { attempt, targetUrl, error });
      if (attempt < attempts) {
        await delay(250);
      }
    }
  }

  const detail = lastError instanceof Error ? lastError.message : `Unable to load ${targetUrl}`;
  const fallbackUrl = `data:text/html;charset=utf-8,${encodeURIComponent(buildWindowErrorHtml('Screenie Failed To Load', detail))}`;
  await targetWindow.loadURL(fallbackUrl);
}

async function applyWindowCloseBehavior() {
  const next = await settingsStore.get();
  closeBehavior = next.closeBehavior;
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 460,
    height: 620,
    show: false,
    minWidth: 420,
    minHeight: 560,
    backgroundColor: '#101624',
    autoHideMenuBar: true,
    webPreferences: buildSecureWebPreferences(preloadPath)
  });
  attachWindowSecurityGuards(mainWindow, mainWindowUrl);

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, url) => {
    console.error('renderer load failed', { errorCode, errorDescription, url, candidatePath: mainWindowUrl });
  });
  mainWindow.webContents.on('console-message', (_event, _level, message, line, sourceId) => {
    console.log('[renderer]', sourceId, `:${line}`, message);
  });

  mainWindow.on('close', (event) => {
    if (closeBehavior === 'hide-to-tray') {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('renderer process exited', details);
  });

  await loadWindowContent(mainWindow, mainWindowUrl);
}

async function ensureScreenPermission() {
  if (!isMac) {
    return;
  }
  const status = systemPreferences.getMediaAccessStatus('screen');
  if (status === 'granted') {
    return;
  }
  const answer = await dialog.showMessageBox({
    title: 'Screen Recording permission required',
    type: 'warning',
    message: 'Screenie needs Screen Recording permission.',
    detail:
      'Open System Settings > Privacy & Security > Screen Recording and allow Screenie to capture the screen.',
    buttons: ['Open Settings', 'Continue'],
    defaultId: 0,
    cancelId: 1
  });
  if (answer.response === 0) {
    await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
  }
}

function normalizeRegionSelection(selection: RegionSelection): RegionSelection {
  const chosenDisplay = screen.getAllDisplays().find((entry) => entry.id === selection.displayId);
  const scale = chosenDisplay?.scaleFactor ?? 1;
  const dpr = Number(selection.dpr || scale);
  const multiplier = Number.isFinite(dpr) && dpr > 0 ? dpr / scale : 1;

  return {
    x: Math.round(selection.x * multiplier),
    y: Math.round(selection.y * multiplier),
    width: Math.max(1, Math.round(selection.width * multiplier)),
    height: Math.max(1, Math.round(selection.height * multiplier)),
    displayId: selection.displayId,
    dpr
  };
}

async function runCapture(request: CaptureRequest): Promise<{ success: boolean; capture?: CaptureResult; error?: string; cancelled?: boolean }> {
  if (isCapturing) {
    return { success: false, error: 'A capture is already in progress.' };
  }

  isCapturing = true;
  const settings = await settingsStore.get();
  const shouldRestoreMainWindow = request.mode === 'window' && Boolean(mainWindow?.isVisible());
  try {
    if (shouldRestoreMainWindow) {
      mainWindow?.hide();
      await delay(120);
    }

    let snapshot: { buffer: Buffer; sourceId: string; sourceName: string; width: number; height: number };
    if (request.mode === 'fullscreen') {
      snapshot = await captureFullscreen();
    } else if (request.mode === 'window') {
      snapshot = await captureActiveWindow();
    } else {
      isRegionSelectionActive = true;
      try {
        if (isMac) {
          const nativeRegionCapture = await captureNativeRegion();
          if (!nativeRegionCapture) {
            return { success: false, cancelled: true };
          }
          snapshot = nativeRegionCapture;
        } else {
          const rawSelection = await captureRegion({
            parent: mainWindow,
            preloadPath,
            overlayUrl: overlayWindowUrl
          });
          if (!rawSelection) {
            return { success: false, cancelled: true };
          }
          const normalizedSelection = normalizeRegionSelection(rawSelection);
          snapshot = await captureArea(normalizedSelection);
        }
      } finally {
        isRegionSelectionActive = false;
      }
      if (request.annotate) {
        const annotated = await openAnnotationWorkspace({
          preloadPath,
          annotationUrl: annotationWindowUrl,
          imageBuffer: snapshot.buffer
        });
        if (annotated) {
          const annotatedImage = nativeImage.createFromBuffer(annotated);
          const annotatedSize = annotatedImage.getSize();
          if (annotatedSize.width > 0 && annotatedSize.height > 0) {
            snapshot = {
              buffer: annotated,
              sourceId: snapshot.sourceId,
              sourceName: snapshot.sourceName,
              width: annotatedSize.width,
              height: annotatedSize.height
            };
          }
        }
      }
    }

    const output = await writeCaptureImage({
      outputDirectory: settings.outputDirectory,
      filenameTemplate: settings.filenameTemplate,
      mode: request.mode,
      sourceName: snapshot.sourceName,
      sourceId: snapshot.sourceId,
      buffer: snapshot.buffer,
      width: snapshot.width,
      height: snapshot.height
    });
    clipboard.writeImage(nativeImage.createFromBuffer(snapshot.buffer));
    const savedRecord = await historyStore.add(output);
    const payload = { success: true, capture: savedRecord };
    mainWindow?.webContents.send('capture:result', payload);
    return payload;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Capture failed';
    const payload = { success: false, error: message };
    mainWindow?.webContents.send('capture:result', payload);
    return payload;
  } finally {
    if (shouldRestoreMainWindow && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
    isCapturing = false;
  }
}

function buildShortcutMappings(settings: CaptureSettings): Array<{ combo: string; mode: CaptureMode }> {
  return [
    { combo: settings.shortcuts.fullscreen, mode: 'fullscreen' },
    { combo: settings.shortcuts.window, mode: 'window' },
    { combo: settings.shortcuts.region, mode: 'region' }
  ];
}

async function registerShortcuts(nextSettings?: CaptureSettings) {
  globalShortcut.unregisterAll();
  const settings = nextSettings ?? (await settingsStore.get());
  const mapping = buildShortcutMappings(settings);
  const failedCombos: string[] = [];
  const seenCombos = new Set<string>();

  for (const mappingItem of mapping) {
    const combo = mappingItem.combo.trim();
    if (!combo) {
      continue;
    }

    const normalizedCombo = combo.toLowerCase();
    if (seenCombos.has(normalizedCombo)) {
      failedCombos.push(combo);
      continue;
    }

    seenCombos.add(normalizedCombo);

    try {
      const didRegister = globalShortcut.register(combo, () => {
        void runCapture({ mode: mappingItem.mode });
      });

      if (!didRegister) {
        failedCombos.push(combo);
      }
    } catch {
      failedCombos.push(combo);
    }
  }

  if (failedCombos.length > 0) {
    globalShortcut.unregisterAll();
    throw new Error(
      `Could not register shortcut${failedCombos.length === 1 ? '' : 's'}: ${failedCombos.join(', ')}.`
    );
  }
}

function setupIpc() {
  if (ipcReady) {
    return;
  }
  ipcReady = true;
  ipcMain.handle('capture:start', async (event, request: unknown) => {
    requireSenderWindow(event, mainWindow, 'capture:start');
    return runCapture(assertCaptureRequest(request));
  });
  ipcMain.handle('captures:list', async (event) => {
    requireSenderWindow(event, mainWindow, 'captures:list');
    return historyStore.list();
  });
  ipcMain.handle('captures:remove', async (event, id: unknown) => {
    requireSenderWindow(event, mainWindow, 'captures:remove');
    await historyStore.remove(requireString(id, 'capture id', { maxLength: 128 }));
  });
  ipcMain.handle('captures:open', async (event, id: unknown) => {
    requireSenderWindow(event, mainWindow, 'captures:open');
    const captureId = requireString(id, 'capture id', { maxLength: 128 });
    const captures = await historyStore.list();
    const hit = captures.find((entry) => entry.id === captureId);
    if (!hit) {
      return;
    }
    shell.showItemInFolder(hit.filePath);
  });
  ipcMain.handle('captures:open-folder', async (event) => {
    requireSenderWindow(event, mainWindow, 'captures:open-folder');
    const settings = await settingsStore.get();
    await shell.openPath(settings.outputDirectory);
  });
  ipcMain.handle('settings:choose-output-folder', async (event) => {
    requireSenderWindow(event, mainWindow, 'settings:choose-output-folder');
    const settings = await settingsStore.get();
    const result = await dialog.showOpenDialog({
      title: 'Choose output folder',
      defaultPath: settings.outputDirectory,
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });
  ipcMain.handle('settings:get', async (event) => {
    requireSenderWindow(event, mainWindow, 'settings:get');
    return settingsStore.get();
  });
  ipcMain.handle('settings:set', async (event, next: unknown) => {
    requireSenderWindow(event, mainWindow, 'settings:set');
    const validatedSettings = assertCaptureSettings(next);
    const previous = await settingsStore.get();
    const applied = await settingsStore.set(validatedSettings);
    try {
      closeBehavior = applied.closeBehavior;
      await registerShortcuts(applied);
      return applied;
    } catch (error) {
      closeBehavior = previous.closeBehavior;
      await settingsStore.set(previous);
      try {
        await registerShortcuts(previous);
      } catch (restoreError) {
        console.error('failed to restore previous shortcuts', restoreError);
      }
      throw error;
    }
  });
}

app.whenReady().then(async () => {
  const iconPath = resolveAppIconPath();
  if (iconPath && isMac) {
    app.dock.setIcon(iconPath);
  }
  await ensureScreenPermission();
  await applyWindowCloseBehavior();
  setupIpc();
  await createMainWindow();
  try {
    await registerShortcuts();
  } catch (error) {
    console.error('shortcut registration failed during startup', error);
  }
  if (!isMac) {
    void warmRegionOverlay({
      parent: mainWindow,
      preloadPath,
      overlayUrl: overlayWindowUrl
    }).catch((error) => {
      console.error('region overlay warmup failed', error);
    });
  }
});

app.on('activate', () => {
  if (isRegionSelectionActive) {
    return;
  }

  if (!mainWindow) {
    void createMainWindow();
    return;
  }
  mainWindow?.show();
});

app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit();
  }
});

app.on('before-quit', () => {
  globalShortcut.unregisterAll();
});
