import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { app } from 'electron';
import type { CaptureMode, CaptureResult, CaptureSettings } from '@shared/types';

export const DEFAULT_FILENAME_TEMPLATE = 'screenie-{timestamp}';
export const DEFAULT_REGION_SHORTCUT = 'CommandOrControl+Shift+V';

export async function getDefaultOutputDirectory(): Promise<string> {
  const pictures = app.getPath('pictures');
  return path.join(pictures, 'screenie');
}

export function generateCaptureId(): string {
  return randomUUID();
}

function sanitize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/gi, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildTimestamp(now = new Date()): string {
  const iso = now.toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  return iso.replace('T', '_');
}

function formatFileName(template: string, input: { mode: CaptureMode; sourceName?: string }): string {
  const safeSource = sanitize(input.sourceName ?? 'screen');
  const timestamp = buildTimestamp(new Date());
  const rawName = template
    .replace('{timestamp}', timestamp)
    .replace('{mode}', input.mode)
    .replace('{source}', safeSource);
  const normalized = rawName.trim().length > 0 ? rawName : 'screenie';
  return `${normalized}.png`;
}

async function writeUniqueCaptureImage(outputDirectory: string, outputFileName: string, buffer: Buffer): Promise<string> {
  const extension = path.extname(outputFileName) || '.png';
  const baseName = path.basename(outputFileName, extension);

  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${attempt + 1}`;
    const candidatePath = path.join(outputDirectory, `${baseName}${suffix}${extension}`);

    try {
      await fs.writeFile(candidatePath, buffer, { flag: 'wx' });
      return candidatePath;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        continue;
      }
      throw error;
    }
  }

  throw new Error('Could not find an available filename for the new capture.');
}

export async function resolveOutputDirectory(configuredPath: string): Promise<string> {
  const fallback = await getDefaultOutputDirectory();
  const trimmed = configuredPath.trim();
  const output = trimmed.length > 0 ? trimmed : fallback;
  const expanded = output.startsWith('~/') ? path.join(os.homedir(), output.slice(2)) : output;
  const fullPath = path.isAbsolute(expanded) ? expanded : path.join(os.homedir(), expanded);
  await fs.mkdir(fullPath, { recursive: true });
  return fullPath;
}

export async function writeCaptureImage(params: {
  outputDirectory: string;
  filenameTemplate: string;
  mode: CaptureMode;
  sourceName?: string;
  buffer: Buffer;
  sourceId?: string;
  id?: string;
  width: number;
  height: number;
}): Promise<CaptureResult> {
  const resolvedDir = await resolveOutputDirectory(params.outputDirectory);
  const outputFileName = formatFileName(params.filenameTemplate, {
    mode: params.mode,
    sourceName: params.sourceName
  });

  const safeName = outputFileName.includes('.png') ? outputFileName : `${outputFileName}.png`;
  const filePath = await writeUniqueCaptureImage(resolvedDir, safeName, params.buffer);
  const createdAt = new Date().toISOString();
  return {
    id: params.id ?? generateCaptureId(),
    filePath,
    createdAt,
    width: params.width,
    height: params.height,
    mode: params.mode,
    sourceId: params.sourceId,
    sourceName: params.sourceName,
    sizeBytes: params.buffer.length
  };
}

export function settingsTemplatePreview(template: string): string {
  const now = new Date();
  return template
    .replace('{timestamp}', buildTimestamp(now))
    .replace('{mode}', 'preview')
    .replace('{source}', 'source');
}

export function buildDefaultSettings(): CaptureSettings {
  return {
    outputDirectory: path.join(os.homedir(), 'Pictures', 'screenie'),
    filenameTemplate: DEFAULT_FILENAME_TEMPLATE,
    defaultMode: 'fullscreen',
    closeBehavior: process.platform === 'win32' ? 'hide-to-tray' : 'close',
    shortcuts: {
      fullscreen: 'CommandOrControl+Shift+1',
      window: 'CommandOrControl+Shift+2',
      region: DEFAULT_REGION_SHORTCUT
    }
  };
}
