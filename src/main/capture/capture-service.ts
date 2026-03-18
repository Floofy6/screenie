import { desktopCapturer, screen, Rectangle } from 'electron';
import type { RegionSelection } from '@shared/types';

type CapturedImage = {
  buffer: Buffer;
  sourceId: string;
  sourceName: string;
  width: number;
  height: number;
};

function safeRound(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

async function pickScreenSource(displayId?: number): Promise<Electron.DesktopCapturerSource> {
  const displays = screen.getAllDisplays();
  const display = displayId != null ? displays.find((entry) => entry.id === displayId) : screen.getPrimaryDisplay();
  const fallback = screen.getPrimaryDisplay();
  const chosen = display ?? fallback;
  const width = Math.max(64, Math.round(chosen.bounds.width * chosen.scaleFactor));
  const height = Math.max(64, Math.round(chosen.bounds.height * chosen.scaleFactor));

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height }
  });
  if (sources.length === 0) {
    throw new Error('No screen sources found.');
  }

  const matched = sources.find((source) => {
    const rawDisplayId = (source as { display_id?: string }).display_id;
    return rawDisplayId != null && String(rawDisplayId) === String(chosen.id);
  });
  return matched ?? sources[0];
}

async function pickWindowSource(): Promise<Electron.DesktopCapturerSource> {
  const displays = screen.getAllDisplays();
  const width = displays[0]
    ? Math.max(64, Math.round(displays[0].size.width * displays[0].scaleFactor))
    : 1920;
  const height = displays[0]
    ? Math.max(64, Math.round(displays[0].size.height * displays[0].scaleFactor))
    : 1080;

  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width, height }
  });

  if (sources.length === 0) {
    throw new Error('No window sources found.');
  }

  return sources.reduce((best, current) => {
    const currentArea = current.thumbnail.getSize();
    const bestArea = best.thumbnail.getSize();
    return currentArea.width * currentArea.height > bestArea.width * bestArea.height ? current : best;
  });
}

function imageToCapture(source: Electron.DesktopCapturerSource, fallbackName: string): CapturedImage {
  const image = source.thumbnail;
  const size = image.getSize();
  if (!size.width || !size.height) {
    throw new Error('Captured image has invalid dimensions.');
  }
  return {
    buffer: image.toPNG(),
    sourceId: source.id,
    sourceName: fallbackName,
    width: size.width,
    height: size.height
  };
}

export async function captureFullscreen(): Promise<CapturedImage> {
  const source = await pickScreenSource();
  return imageToCapture(source, source.name || 'fullscreen');
}

export async function captureActiveWindow(): Promise<CapturedImage> {
  const source = await pickWindowSource();
  return imageToCapture(source, source.name || 'window');
}

function clampRect(value: Rectangle, bounds: { width: number; height: number }): Rectangle {
  const x = safeRound(value.x);
  const y = safeRound(value.y);
  const width = safeRound(value.width);
  const height = safeRound(value.height);
  const safeWidth = Math.max(1, Math.min(width, Math.max(0, bounds.width - x)));
  const safeHeight = Math.max(1, Math.min(height, Math.max(0, bounds.height - y)));
  return { x, y, width: safeWidth, height: safeHeight };
}

export async function captureArea(region: RegionSelection): Promise<CapturedImage> {
  const source = await pickScreenSource(region.displayId);
  const image = source.thumbnail;
  const fullSize = image.getSize();
  if (!fullSize.width || !fullSize.height) {
    throw new Error('Unable to capture full-screen source for region crop.');
  }

  const target = clampRect(
    {
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height
    },
    fullSize
  );
  const cropped = image.crop(target);
  const croppedSize = cropped.getSize();

  return {
    buffer: cropped.toPNG(),
    sourceId: source.id,
    sourceName: source.name || 'region',
    width: croppedSize.width,
    height: croppedSize.height
  };
}
