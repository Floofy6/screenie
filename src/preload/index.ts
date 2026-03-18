import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import type { CaptureRequest, CaptureResult, CaptureSettings, RegionSelection } from '@shared/types';

type AnnotationImagePayload = { dataUrl: string; width: number; height: number };

const api = {
  startCapture: (request: CaptureRequest) => ipcRenderer.invoke('capture:start', request),
  onCaptureResult: (callback: (payload: { success: boolean; capture?: CaptureResult; error?: string; cancelled?: boolean }) => void) => {
    const wrapped = (_event: IpcRendererEvent, payload: { success: boolean; capture?: CaptureResult; error?: string; cancelled?: boolean }) => {
      callback(payload);
    };
    ipcRenderer.on('capture:result', wrapped);
    return () => ipcRenderer.removeListener('capture:result', wrapped);
  },
  listCaptures: () => ipcRenderer.invoke('captures:list'),
  removeCapture: (id: string) => ipcRenderer.invoke('captures:remove', id),
  openCapture: (id: string) => ipcRenderer.invoke('captures:open', id),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings: CaptureSettings) => ipcRenderer.invoke('settings:set', settings),
  chooseOutputFolder: () => ipcRenderer.invoke('settings:choose-output-folder'),
  openOutputFolder: () => ipcRenderer.invoke('captures:open-folder')
};

contextBridge.exposeInMainWorld('screenieAPI', api);

contextBridge.exposeInMainWorld('screenieOverlayAPI', {
  submitSelection: (selection: RegionSelection) => ipcRenderer.send('capture:region:selected', selection),
  cancelSelection: () => ipcRenderer.send('capture:region:cancelled'),
  onPrepareSelection: (callback: (payload: { displayId?: number }) => void) => {
    const wrapped = (_event: IpcRendererEvent, payload: { displayId?: number }) => {
      callback(payload);
    };
    ipcRenderer.on('capture:region:prepare', wrapped);
    return () => ipcRenderer.removeListener('capture:region:prepare', wrapped);
  }
});

contextBridge.exposeInMainWorld('screenieMarkupAPI', {
  getImage: () => ipcRenderer.invoke('annotation:get-image') as Promise<AnnotationImagePayload | null>,
  submit: (imageDataUrl: string) => ipcRenderer.send('annotation:save', imageDataUrl),
  cancel: () => ipcRenderer.send('annotation:cancel')
});
