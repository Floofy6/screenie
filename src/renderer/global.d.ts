import type { CaptureMode, CaptureResult, CaptureRequest, CaptureSettings, RegionSelection } from '@shared/types';

declare global {
  interface Window {
    screenieAPI: {
      startCapture: (request: CaptureRequest) => Promise<{ success: boolean; capture?: CaptureResult; error?: string; cancelled?: boolean }>;
      onCaptureResult: (
        callback: (payload: { success: boolean; capture?: CaptureResult; error?: string; cancelled?: boolean }) => void
      ) => () => void;
      listCaptures: () => Promise<CaptureResult[]>;
      removeCapture: (id: string) => Promise<void>;
      openCapture: (id: string) => Promise<void>;
      getSettings: () => Promise<CaptureSettings>;
      setSettings: (settings: CaptureSettings) => Promise<CaptureSettings>;
      chooseOutputFolder: () => Promise<string | null>;
      openOutputFolder: () => Promise<void>;
    };
    screenieOverlayAPI: {
      submitSelection: (selection: RegionSelection) => void;
      cancelSelection: () => void;
      onPrepareSelection: (callback: (payload: { displayId?: number }) => void) => () => void;
    };
    screenieMarkupAPI: {
      getImage: () => Promise<{ dataUrl: string; width: number; height: number } | null>;
      submit: (imageDataUrl: string) => void;
      cancel: () => void;
    };
  }
}

export {};
