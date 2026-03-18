import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { desktopCapturer, nativeImage, screen, Rectangle } from 'electron';
import type { RegionSelection } from '@shared/types';

type CapturedImage = {
  buffer: Buffer;
  sourceId: string;
  sourceName: string;
  width: number;
  height: number;
};

type FrontmostWindowHint = {
  appName: string;
  title: string;
};

const execFileAsync = promisify(execFile);

function safeRound(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

async function pickScreenSource(displayId?: number): Promise<Electron.DesktopCapturerSource> {
  const displays = screen.getAllDisplays();
  const fallback = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const display = displayId != null ? displays.find((entry) => entry.id === displayId) : fallback;
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

function getLargestWindowSource(sources: Electron.DesktopCapturerSource[]): Electron.DesktopCapturerSource {
  return sources.reduce((best, current) => {
    const currentArea = current.thumbnail.getSize();
    const bestArea = best.thumbnail.getSize();
    return currentArea.width * currentArea.height > bestArea.width * bestArea.height ? current : best;
  });
}

function normalizeWindowText(value: string): string {
  return value.trim().toLowerCase();
}

async function getFrontmostWindowHint(): Promise<FrontmostWindowHint | null> {
  if (process.platform !== 'darwin') {
    return null;
  }

  const script = `
    tell application "System Events"
      set frontApp to first application process whose frontmost is true
      set appName to name of frontApp
      try
        set windowTitle to name of front window of frontApp
      on error
        set windowTitle to ""
      end try
      return appName & linefeed & windowTitle
    end tell
  `;

  try {
    const { stdout } = await execFileAsync('/usr/bin/osascript', ['-e', script]);
    const [rawAppName = '', rawTitle = ''] = stdout.split(/\r?\n/, 2);
    const appName = rawAppName.trim();
    const title = rawTitle.trim();

    return appName || title ? { appName, title } : null;
  } catch (error) {
    console.warn('active window lookup failed', error);
    return null;
  }
}

function scoreWindowSource(source: Electron.DesktopCapturerSource, hint: FrontmostWindowHint): number {
  const sourceName = normalizeWindowText(source.name || '');
  if (!sourceName) {
    return 0;
  }

  const hintTitle = normalizeWindowText(hint.title);
  const hintAppName = normalizeWindowText(hint.appName);
  let score = 0;

  if (hintTitle) {
    if (sourceName === hintTitle) {
      score += 10;
    } else if (sourceName.includes(hintTitle)) {
      score += 7;
    } else if (hintTitle.includes(sourceName)) {
      score += 4;
    }
  }

  if (hintAppName && sourceName.includes(hintAppName)) {
    score += 2;
  }

  return score;
}

async function pickWindowSource(): Promise<{ source: Electron.DesktopCapturerSource; fallbackName: string }> {
  const targetDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const width = Math.max(64, Math.round(targetDisplay.size.width * targetDisplay.scaleFactor));
  const height = Math.max(64, Math.round(targetDisplay.size.height * targetDisplay.scaleFactor));

  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width, height }
  });

  if (sources.length === 0) {
    throw new Error('No window sources found.');
  }

  const hint = await getFrontmostWindowHint();
  if (hint) {
    const bestMatch = sources
      .map((source) => ({ source, score: scoreWindowSource(source, hint) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)[0];

    if (bestMatch) {
      return {
        source: bestMatch.source,
        fallbackName: bestMatch.source.name || hint.title || hint.appName || 'window'
      };
    }
  }

  const source = getLargestWindowSource(sources);
  return {
    source,
    fallbackName: source.name || hint?.title || hint?.appName || 'window'
  };
}

function imageBufferToCapture(buffer: Buffer, fallbackName: string, sourceId: string): CapturedImage {
  const image = nativeImage.createFromBuffer(buffer);
  const size = image.getSize();
  if (!size.width || !size.height) {
    throw new Error('Captured image has invalid dimensions.');
  }

  return {
    buffer,
    sourceId,
    sourceName: fallbackName,
    width: size.width,
    height: size.height
  };
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
  const { source, fallbackName } = await pickWindowSource();
  return imageToCapture(source, fallbackName);
}

export async function captureNativeRegion(): Promise<CapturedImage | null> {
  if (process.platform !== 'darwin') {
    return null;
  }

  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'screenie-region-'));
  const outputPath = path.join(tempDirectory, 'capture.png');

  try {
    await execFileAsync('/usr/sbin/screencapture', ['-x', '-i', '-s', '-r', '-t', 'png', outputPath]);
    const buffer = await fs.readFile(outputPath);
    return imageBufferToCapture(buffer, 'region', 'native-region');
  } catch (error) {
    const fileExists = await fs
      .access(outputPath)
      .then(() => true)
      .catch(() => false);

    if (!fileExists) {
      return null;
    }

    throw error;
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
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
