import { BrowserWindow, ipcMain, nativeImage } from 'electron';
import { isSenderWindow, requireSenderWindow } from '../security/ipc';
import { attachWindowSecurityGuards, buildSecureWebPreferences } from '../security/window-security';

type AnnotationImagePayload = {
  bytes: Uint8Array;
  width: number;
  height: number;
};

function toBuffer(value: unknown): Buffer | null {
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }

  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }

  return null;
}

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
    webPreferences: buildSecureWebPreferences(params.preloadPath)
  });
  attachWindowSecurityGuards(annotationWindow, params.annotationUrl);

  const imagePayload: AnnotationImagePayload = {
    bytes: new Uint8Array(params.imageBuffer),
    width: imageSize.width,
    height: imageSize.height
  };

  return new Promise<Buffer | null>((resolve) => {
    let settled = false;
    const onSave = (event: Electron.IpcMainEvent, nextImageBytes: unknown) => {
      if (!isSenderWindow(event, annotationWindow)) {
        return;
      }

      const buffer = toBuffer(nextImageBytes);
      if (!buffer) {
        finish(null);
        return;
      }

      const nextImage = nativeImage.createFromBuffer(buffer);
      const nextImageSize = nextImage.getSize();
      if (!nextImageSize.width || !nextImageSize.height) {
        finish(null);
        return;
      }

      finish(buffer);
    };

    const onCancel = (event?: Electron.IpcMainEvent) => {
      if (event && !isSenderWindow(event, annotationWindow)) {
        return;
      }

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

    ipcMain.handle('annotation:get-image', async (event) => {
      requireSenderWindow(event, annotationWindow, 'annotation:get-image');
      return imagePayload;
    });
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
  });
}
