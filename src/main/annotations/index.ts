import { BrowserWindow, ipcMain, nativeImage } from 'electron';

export async function openAnnotationWorkspace(params: {
  preloadPath: string;
  annotationUrl: string;
  imageBuffer: Buffer;
}): Promise<Buffer | null> {
  const image = nativeImage.createFromBuffer(params.imageBuffer);
  const imageSize = image.getSize();
  if (!imageSize.width || !imageSize.height) {
    throw new Error('Unable to open annotation workspace: invalid image data.');
  }

  const annotationWindow = new BrowserWindow({
    width: Math.min(1280, imageSize.width + 80),
    height: Math.min(760, imageSize.height + 180),
    minWidth: 860,
    minHeight: 600,
    title: 'Annotate Screenshot',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: params.preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const imagePayload = {
    dataUrl: image.toDataURL(),
    width: imageSize.width,
    height: imageSize.height
  };

  return new Promise<Buffer | null>((resolve) => {
    let settled = false;
    const onSave = (_event: Electron.IpcMainEvent, nextDataUrl: string) => {
      const prefix = 'data:image/png;base64,';
      if (typeof nextDataUrl !== 'string' || !nextDataUrl.startsWith(prefix)) {
        finish(null);
        return;
      }
      const commaIndex = nextDataUrl.indexOf(',');
      if (commaIndex < 0) {
        finish(null);
        return;
      }
      try {
        const buffer = Buffer.from(nextDataUrl.slice(commaIndex + 1), 'base64');
        finish(buffer);
      } catch {
        finish(null);
      }
    };

    const onCancel = () => {
      finish(null);
    };

    const cleanup = () => {
      ipcMain.removeListener('annotation:save', onSave);
      ipcMain.removeListener('annotation:cancel', onCancel);
      ipcMain.removeHandler('annotation:get-image');
    };

    const finish = (result: Buffer | null) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (!annotationWindow.isDestroyed()) {
        annotationWindow.close();
      }
      resolve(result);
    };

    ipcMain.handle('annotation:get-image', () => imagePayload);
    ipcMain.on('annotation:save', onSave);
    ipcMain.on('annotation:cancel', onCancel);

    annotationWindow.once('ready-to-show', () => {
      annotationWindow.show();
      annotationWindow.focus();
    });

    annotationWindow.on('close', () => {
      finish(null);
    });
    void annotationWindow.loadURL(params.annotationUrl);
    annotationWindow.on('closed', cleanup);
    annotationWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });
}
