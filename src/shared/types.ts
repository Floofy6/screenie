export type CaptureMode = 'fullscreen' | 'window' | 'region';

export type CaptureRequest = {
  mode: CaptureMode;
  annotate?: boolean;
};

export type CaptureResult = {
  id: string;
  filePath: string;
  createdAt: string;
  width: number;
  height: number;
  mode: CaptureMode;
  sourceId?: string;
  sourceName?: string;
  sizeBytes: number;
};

export type ScreenshotRecord = CaptureResult;

export type CaptureShortcutMap = {
  fullscreen: string;
  window: string;
  region: string;
};

export type WindowCloseBehavior = 'close' | 'hide-to-tray';

export type CaptureSettings = {
  outputDirectory: string;
  filenameTemplate: string;
  defaultMode: CaptureMode;
  closeBehavior: WindowCloseBehavior;
  shortcuts: CaptureShortcutMap;
};

export type UploadResult = {
  success: boolean;
  url?: string;
  error?: string;
};

export interface Uploader {
  upload(filePath: string, metadata: CaptureResult): Promise<UploadResult>;
}

export type RegionSelection = {
  x: number;
  y: number;
  width: number;
  height: number;
  dpr?: number;
  displayId?: number;
};
