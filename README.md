# screenie

Local-first screenshot utility scaffold (Electron + React + TypeScript) with active work toward macOS and Windows 11 support.

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

## Notes

- macOS requires Screen Recording permission on first run.
- Windows 11 uses the Electron desktop capture path for fullscreen, window, and region capture. Build and installer support now live in the Windows branch, but the packaged Windows app should still be smoke-tested on an actual Windows 11 machine.
- In this scaffold, capture save is local-only (no automatic network upload).
