# screenie

Local-first screenshot utility scaffold (macOS-first Electron + React + TypeScript app).

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

## Notes

- macOS requires Screen Recording permission on first run.
- In this scaffold, capture save is local-only (no automatic network upload).

