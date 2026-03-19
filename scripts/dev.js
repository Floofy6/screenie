import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = dirname(__dirname);
const electronViteCli = join(rootDir, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js');
const sourceDist = join(rootDir, 'node_modules', 'electron', 'dist');
const sourceAppBundle = join(sourceDist, 'Electron.app');
const devDist = join(rootDir, '.electron-dev', 'dist');
const stagedAppBundle = join(devDist, 'Electron.app');
const devAppBundle = join(devDist, 'Screenie.app');
const stagedExecutablePath = join(devAppBundle, 'Contents', 'MacOS', 'Electron');
const devExecutablePath = join(devAppBundle, 'Contents', 'MacOS', 'Screenie');
const devInfoPlist = join(devAppBundle, 'Contents', 'Info.plist');
const devIconPath = join(devAppBundle, 'Contents', 'Resources', 'electron.icns');
const appIconPath = join(rootDir, 'resources', 'icon.icns');
const devMetaPath = join(devDist, '.screenie-dev-meta.json');

function replacePlistString(contents, key, value) {
  const pattern = new RegExp(`(<key>${key}</key>\\s*<string>)([^<]*)(</string>)`);
  if (!pattern.test(contents)) {
    throw new Error(`Could not find ${key} in ${devInfoPlist}`);
  }
  return contents.replace(pattern, `$1${value}$3`);
}

function buildDevBundleMeta() {
  return JSON.stringify(
    {
      bundleFormatVersion: 4,
      bundleName: 'Screenie',
      electronMtimeMs: statSync(sourceAppBundle).mtimeMs,
      iconMtimeMs: statSync(appIconPath).mtimeMs
    },
    null,
    2
  );
}

function ensureMacDevBundle() {
  const expectedMeta = buildDevBundleMeta();
  const currentMeta = existsSync(devMetaPath) ? readFileSync(devMetaPath, 'utf8') : null;

  if (currentMeta === expectedMeta && existsSync(devInfoPlist) && existsSync(devIconPath)) {
    return;
  }

  rmSync(devDist, { recursive: true, force: true });
  mkdirSync(devDist, { recursive: true });
  execFileSync('/usr/bin/ditto', [sourceDist, devDist]);
  renameSync(stagedAppBundle, devAppBundle);
  renameSync(stagedExecutablePath, devExecutablePath);

  let infoPlist = readFileSync(devInfoPlist, 'utf8');
  infoPlist = replacePlistString(infoPlist, 'CFBundleDisplayName', 'Screenie');
  infoPlist = replacePlistString(infoPlist, 'CFBundleExecutable', 'Screenie');
  infoPlist = replacePlistString(infoPlist, 'CFBundleName', 'Screenie');
  infoPlist = replacePlistString(infoPlist, 'CFBundleIdentifier', 'com.screenie.app.dev');
  writeFileSync(devInfoPlist, infoPlist, 'utf8');

  copyFileSync(appIconPath, devIconPath);
  writeFileSync(devMetaPath, expectedMeta, 'utf8');
}

function run() {
  const args = [electronViteCli, 'dev', ...process.argv.slice(2)];
  const env = { ...process.env };

  if (process.platform === 'darwin') {
    ensureMacDevBundle();
    env.ELECTRON_EXEC_PATH = devExecutablePath;
  }

  const child = spawn(process.execPath, args, {
    cwd: rootDir,
    env,
    stdio: 'inherit'
  });

  const forwardSignal = (signal) => {
    process.on(signal, () => {
      if (!child.killed) {
        child.kill(signal);
      }
    });
  };

  forwardSignal('SIGINT');
  forwardSignal('SIGTERM');

  child.on('exit', (code, signal) => {
    if (code === null) {
      console.error(`electron-vite dev exited with signal ${signal}`);
      process.exit(1);
    }
    process.exit(code);
  });
}

run();
