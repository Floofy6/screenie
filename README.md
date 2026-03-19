# screenie

Local-first screenshot utility (Electron + React + TypeScript) for macOS and Windows 11.

## What you get

- Tray application with global hotkeys.
- Main process capture shell with IPC for renderer actions.
- Capture modes:
  - fullscreen
  - active window
  - region (drag-to-select overlay)
- Local history store in `~/Pictures/screenie` (configurable).
- Clipboard integration for latest capture.
- Settings, history and basic UI tabs in the renderer.
- Extension points for uploader and annotation modules.

## Setup

```bash
npm install
npm run dev
```

For packaging:

```bash
npm run package
```

Platform-specific packaging:

```bash
npm run package:mac
npm run package:win
```

Windows-only packaging shortcuts:

```bash
npm run package:win:x64
npm run package:win:arm64
```

## Notes

- macOS requires Screen Recording permission on first run.
- Windows 11 uses the Electron desktop capture path for fullscreen, window, and region capture.
- Windows packaging now produces `x64` and `arm64` NSIS installers with a native `.ico` app icon, but the packaged app should still be smoke-tested on an actual Windows 11 machine before calling parity complete.
- In this scaffold, capture save is local-only (no automatic network upload).
