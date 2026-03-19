import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import type { CaptureMode, CaptureResult, CaptureSettings, WindowCloseBehavior } from '@shared/types';

type TabId = 'capture' | 'history' | 'settings';
type CaptureState = {
  success: boolean;
  capture?: CaptureResult;
  error?: string;
  cancelled?: boolean;
};

type SettingsNotice = {
  type: 'success' | 'error';
  message: string;
};

const tabs: Array<{ id: TabId; label: string; blurb: string }> = [
  { id: 'capture', label: 'Capture', blurb: 'Quick actions and live status' },
  { id: 'history', label: 'History', blurb: 'Recent screenshots and file access' },
  { id: 'settings', label: 'Settings', blurb: 'Output defaults, shortcuts, and app behavior' }
];

const captureModes: Array<{
  mode: CaptureMode;
  eyebrow: string;
  title: string;
  description: string;
  detail: string;
}> = [
  {
    mode: 'fullscreen',
    eyebrow: 'Whole display',
    title: 'Fullscreen capture',
    description: 'Grab the active display instantly and send it straight to disk and clipboard.',
    detail: 'Best for quick references or complete-window contexts.'
  },
  {
    mode: 'window',
    eyebrow: 'Focused app',
    title: 'Window capture',
    description: 'Target a single application window without dragging out a selection first.',
    detail: 'Useful when you want clean edges and less manual cleanup.'
  },
  {
    mode: 'region',
    eyebrow: 'Custom frame',
    title: 'Region capture',
    description: 'Draw exactly what you need, then nudge the selection with the keyboard before saving.',
    detail: 'Optional markup can still be enabled for the next region shot.'
  }
];

const tabHeaders: Record<TabId, { kicker: string; title: string; description: string }> = {
  capture: {
    kicker: 'Studio Console',
    title: 'Fast local capture, arranged like a proper desktop tool.',
    description: 'The main actions stay up front, recent activity stays visible, and the utility details stay nearby without stealing focus.'
  },
  history: {
    kicker: 'Recent Output',
    title: 'A cleaner record of what you have already saved.',
    description: 'Every screenshot gets a clearer card, quicker scanning, and one-click access back into Finder.'
  },
  settings: {
    kicker: 'Control Surface',
    title: 'Local defaults feel grouped and intentional now.',
    description: 'Output rules, shortcut bindings, and close behavior are separated into calmer panels so the app reads more like a desktop utility than a raw form.'
  }
};

const closeBehaviorLabels: Record<WindowCloseBehavior, string> = {
  close: 'Fully quit when the window closes',
  'hide-to-tray': 'Keep running in the system tray when closed'
};

const getFilename = (filePath: string) => filePath.split(/[\\/]/).pop() ?? filePath;

const formatTimestamp = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));

const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const humanizeShortcut = (value: string) => {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');

  return value
    .replace(/CommandOrControl/gi, isMac ? 'Cmd' : 'Ctrl')
    .replace(/Command/gi, 'Cmd')
    .replace(/Control/gi, 'Ctrl')
    .replace(/Option/gi, 'Opt')
    .replace(/Shift/gi, 'Shift')
    .replace(/\+/g, ' + ');
};

const statusClassName = (payload: CaptureState | null) => {
  if (!payload || payload.cancelled) return 'status-banner neutral';
  if (payload.success) return 'status-banner success';
  return 'status-banner error';
};

function App() {
  const isMacPlatform = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');
  const fileManagerName = isMacPlatform ? 'Finder' : 'File Explorer';
  const revealVerb = isMacPlatform ? 'Reveal' : 'Show in File Explorer';
  const [tab, setTab] = useState<TabId>('capture');
  const [captures, setCaptures] = useState<CaptureResult[]>([]);
  const [lastCaptureStatus, setLastCaptureStatus] = useState<CaptureState | null>(null);
  const [annotateRegion, setAnnotateRegion] = useState(false);
  const [template, setTemplate] = useState('');
  const [defaultMode, setDefaultMode] = useState<CaptureMode>('region');
  const [hotFullscreen, setHotFullscreen] = useState('');
  const [hotWindow, setHotWindow] = useState('');
  const [hotRegion, setHotRegion] = useState('');
  const [directory, setDirectory] = useState('');
  const [closeBehavior, setCloseBehavior] = useState<WindowCloseBehavior>(isMacPlatform ? 'close' : 'hide-to-tray');
  const [settingsNotice, setSettingsNotice] = useState<SettingsNotice | null>(null);

  const sortedCaptures = useMemo(
    () => [...captures].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [captures]
  );

  const latestCapture = sortedCaptures[0] ?? null;

  const shortcutMap = useMemo(
    () => ({
      fullscreen: hotFullscreen,
      window: hotWindow,
      region: hotRegion
    }),
    [hotFullscreen, hotRegion, hotWindow]
  );

  const applySettings = (settings: CaptureSettings) => {
    setDirectory(settings.outputDirectory);
    setTemplate(settings.filenameTemplate);
    setDefaultMode(settings.defaultMode);
    setHotFullscreen(settings.shortcuts.fullscreen);
    setHotWindow(settings.shortcuts.window);
    setHotRegion(settings.shortcuts.region);
    setCloseBehavior(settings.closeBehavior);
  };

  const loadSettings = useEffectEvent(async () => {
    const settings = await window.screenieAPI.getSettings();
    applySettings(settings);
  });

  const loadCaptures = useEffectEvent(async () => {
    const nextCaptures = await window.screenieAPI.listCaptures();
    setCaptures(nextCaptures);
  });

  const saveSettings = async () => {
    const nextSettings: CaptureSettings = {
      outputDirectory: directory,
      filenameTemplate: template,
      defaultMode,
      closeBehavior,
      shortcuts: {
        fullscreen: hotFullscreen,
        window: hotWindow,
        region: hotRegion
      }
    };

    try {
      const saved = await window.screenieAPI.setSettings(nextSettings);
      applySettings(saved);
      setSettingsNotice({
        type: 'success',
        message: 'Settings saved.'
      });
    } catch (error) {
      setSettingsNotice({
        type: 'error',
        message: error instanceof Error ? error.message : 'Could not save settings.'
      });
    }
  };

  const startCapture = async (mode: CaptureMode) => {
    const payload = await window.screenieAPI.startCapture({
      mode,
      annotate: mode === 'region' ? annotateRegion : false
    });

    if (!payload.success || payload.cancelled) {
      setLastCaptureStatus(payload);
    }

    if (payload.success && payload.capture) {
      setLastCaptureStatus(payload);
      await loadCaptures();
    }
  };

  const openCapture = async (id: string) => {
    await window.screenieAPI.openCapture(id);
  };

  const chooseOutputFolder = async () => {
    const selected = await window.screenieAPI.chooseOutputFolder();
    if (selected) {
      setDirectory(selected);
    }
  };

  const removeCapture = async (id: string) => {
    await window.screenieAPI.removeCapture(id);
    await loadCaptures();
  };

  useEffect(() => {
    let active = true;

    void Promise.all([loadSettings(), loadCaptures()]);

    const unsubscribe = window.screenieAPI.onCaptureResult((payload) => {
      if (!active) return;
      setLastCaptureStatus(payload);
      void loadCaptures();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [loadCaptures, loadSettings]);

  const activeHeader =
    tab === 'history'
      ? {
          ...tabHeaders.history,
          description: `Every screenshot gets a clearer card, quicker scanning, and one-click access back into ${fileManagerName}.`
        }
      : tabHeaders[tab];
  const statusLabel = !lastCaptureStatus
    ? 'Ready for capture'
    : lastCaptureStatus.cancelled
      ? 'Capture cancelled'
      : lastCaptureStatus.success && lastCaptureStatus.capture
        ? `Saved ${getFilename(lastCaptureStatus.capture.filePath)}`
        : lastCaptureStatus.error ?? 'Capture failed';

  const outputDirectoryLabel = directory.split(/[\\/]/).filter(Boolean).pop() ?? directory;

  return (
    <div className="app-shell">
      <aside className="nav-rail">
        <div className="brand-panel">
          <div className="brand-mark" aria-hidden="true" />
          <div>
            <p className="eyebrow">Screenie</p>
            <h1>Local screenshot studio</h1>
          </div>
        </div>

        <nav className="nav-tabs" aria-label="Primary">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-tab ${tab === item.id ? 'active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              <span className="nav-tab__label">{item.label}</span>
              <span className="nav-tab__blurb">{item.blurb}</span>
            </button>
          ))}
        </nav>

        <div className="rail-note">
          <p className="eyebrow">Current setup</p>
          <h2>{sortedCaptures.length} saved captures</h2>
          <p>
            Everything stays local-first: files save to your chosen folder, clipboard stays ready, and uploads remain out of the
            way unless you decide to build them later.
          </p>
        </div>
      </aside>

      <main className="console">
        <header className="console-header">
          <div className="console-copy">
            <p className="eyebrow">{activeHeader.kicker}</p>
            <h2>{activeHeader.title}</h2>
            <p>{activeHeader.description}</p>
          </div>

          <div className="header-utilities">
            <div className="metric-pill">
              <span className="metric-pill__label">Default mode</span>
              <strong>{captureModes.find((item) => item.mode === defaultMode)?.title ?? 'Region capture'}</strong>
            </div>
            <div className={statusClassName(lastCaptureStatus)}>
              <span className="status-dot" aria-hidden="true" />
              <span>{statusLabel}</span>
            </div>
          </div>
        </header>

        {tab === 'capture' && (
          <div className="screen-layout">
            <section className="panel-surface hero-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Capture modes</p>
                  <h3>Primary actions stay front and center.</h3>
                </div>
                <p className="panel-note">
                  Shortcut labels are surfaced directly on each action so you do not have to go hunting through settings to remember
                  what fires what.
                </p>
              </div>

              <div className="capture-grid">
                {captureModes.map((item) => (
                  <button key={item.mode} type="button" className="capture-card" onClick={() => void startCapture(item.mode)}>
                    <span className="capture-card__eyebrow">{item.eyebrow}</span>
                    <strong className="capture-card__title">{item.title}</strong>
                    <span className="capture-card__description">{item.description}</span>
                    <span className="capture-card__detail">{item.detail}</span>
                    <span className="capture-card__footer">
                      <span className="shortcut-chip">{humanizeShortcut(shortcutMap[item.mode])}</span>
                      {defaultMode === item.mode ? <span className="default-chip">Default</span> : <span className="quiet-chip">Quick launch</span>}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <aside className="stack-column">
              <section className="panel-surface">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">Region workflow</p>
                    <h3>Only mark up when you actually want it.</h3>
                  </div>
                </div>

                <label className="toggle-card">
                  <span className="toggle-copy">
                    <span className="toggle-title">Open markup after region capture</span>
                    <span className="toggle-description">Leave this off for the fastest flow. Turn it on only when you want to annotate the very next region shot.</span>
                  </span>
                  <input type="checkbox" checked={annotateRegion} onChange={(event) => setAnnotateRegion(event.target.checked)} />
                </label>

                <div className="detail-list">
                  <div className="detail-row">
                    <span>Output folder</span>
                    <strong>{outputDirectoryLabel || 'Not set'}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Filename template</span>
                    <strong>{template || 'screenshot-{timestamp}'}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Close behavior</span>
                    <strong>{closeBehaviorLabels[closeBehavior]}</strong>
                  </div>
                </div>
              </section>

              <section className="panel-surface">
                <div className="panel-heading compact">
                  <div>
                    <p className="eyebrow">Last capture</p>
                    <h3>Recent activity is easy to scan now.</h3>
                  </div>
                </div>

                {latestCapture ? (
                  <article className="recent-card">
                    <div className="recent-card__head">
                      <strong>{getFilename(latestCapture.filePath)}</strong>
                      <span className="mode-tag">{latestCapture.mode}</span>
                    </div>
                    <p>{formatTimestamp(latestCapture.createdAt)}</p>
                    <div className="recent-card__meta">
                      <span>
                        {latestCapture.width} x {latestCapture.height}
                      </span>
                      <span>{formatBytes(latestCapture.sizeBytes)}</span>
                    </div>
                    <button type="button" className="ghost-button" onClick={() => void openCapture(latestCapture.id)}>
                      {isMacPlatform ? 'Reveal latest capture' : 'Show latest capture'}
                    </button>
                  </article>
                ) : (
                  <div className="empty-card">
                    <p className="eyebrow">Nothing captured yet</p>
                    <h4>Your next screenshot will appear here.</h4>
                    <p>Use one of the capture cards or the global hotkeys to start building a history.</p>
                  </div>
                )}
              </section>
            </aside>
          </div>
        )}

        {tab === 'history' && (
          <section className="panel-surface history-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Capture history</p>
                <h3>{sortedCaptures.length ? `${sortedCaptures.length} screenshots available locally` : 'Your history is still empty'}</h3>
              </div>

              <button type="button" className="secondary-button" onClick={() => void window.screenieAPI.openOutputFolder()}>
                Open output folder
              </button>
            </div>

            {sortedCaptures.length ? (
              <div className="history-list">
                {sortedCaptures.map((capture) => (
                  <article key={capture.id} className="history-card">
                    <div className="history-card__main">
                      <div className="history-card__title-row">
                        <strong>{getFilename(capture.filePath)}</strong>
                        <span className="mode-tag">{capture.mode}</span>
                      </div>
                      <p className="history-path">{capture.filePath}</p>
                      <div className="history-meta">
                        <span>{formatTimestamp(capture.createdAt)}</span>
                        <span>
                          {capture.width} x {capture.height}
                        </span>
                        <span>{formatBytes(capture.sizeBytes)}</span>
                      </div>
                    </div>

                    <div className="history-actions">
                      <button type="button" className="ghost-button" onClick={() => void openCapture(capture.id)}>
                        {revealVerb}
                      </button>
                      <button type="button" className="ghost-button danger" onClick={() => void removeCapture(capture.id)}>
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-card large">
                <p className="eyebrow">No captures yet</p>
                <h4>The history view is ready once you take the first shot.</h4>
                <p>This layout is intentionally kept clean so scanning stays easy even after a lot of screenshots pile up.</p>
              </div>
            )}
          </section>
        )}

        {tab === 'settings' && (
          <div className="settings-grid">
            <section className="panel-surface">
              <div className="panel-heading compact">
                <div>
                  <p className="eyebrow">Output</p>
                  <h3>Where files land and how they are named.</h3>
                </div>
              </div>

              <label className="field">
                <span className="field__label">Output folder</span>
                <span className="field__hint">Use {fileManagerName} to pick the destination or type it directly.</span>
                <div className="field__row">
                  <input value={directory} onChange={(event) => setDirectory(event.target.value)} />
                  <button type="button" className="secondary-button" onClick={() => void chooseOutputFolder()}>
                    {isMacPlatform ? 'Choose in Finder' : 'Choose in File Explorer'}
                  </button>
                </div>
              </label>

              <label className="field">
                <span className="field__label">Filename template</span>
                <span className="field__hint">Keep a readable default so repeated captures are easy to sort later.</span>
                <input value={template} onChange={(event) => setTemplate(event.target.value)} />
              </label>
            </section>

            <section className="panel-surface">
              <div className="panel-heading compact">
                <div>
                  <p className="eyebrow">Capture defaults</p>
                  <h3>Set the behavior you reach for most often.</h3>
                </div>
              </div>

              <label className="field">
                <span className="field__label">Default capture mode</span>
                <select value={defaultMode} onChange={(event) => setDefaultMode(event.target.value as CaptureMode)}>
                  <option value="fullscreen">Fullscreen</option>
                  <option value="window">Window</option>
                  <option value="region">Region</option>
                </select>
              </label>

              <div className="mini-summary">
                <div className="mini-summary__row">
                  <span>Preferred launch mode</span>
                  <strong>{captureModes.find((item) => item.mode === defaultMode)?.title ?? 'Region capture'}</strong>
                </div>
                <div className="mini-summary__row">
                  <span>Region markup</span>
                  <strong>{annotateRegion ? 'Enabled for next region shot' : 'Off by default'}</strong>
                </div>
              </div>
            </section>

            <section className="panel-surface">
              <div className="panel-heading compact">
                <div>
                  <p className="eyebrow">Hotkeys</p>
                  <h3>Shortcut bindings read like a dedicated control deck.</h3>
                </div>
              </div>

              <div className="field-stack">
                <label className="field">
                  <span className="field__label">Fullscreen shortcut</span>
                  <input value={hotFullscreen} onChange={(event) => setHotFullscreen(event.target.value)} />
                </label>
                <label className="field">
                  <span className="field__label">Window shortcut</span>
                  <input value={hotWindow} onChange={(event) => setHotWindow(event.target.value)} />
                </label>
                <label className="field">
                  <span className="field__label">Region shortcut</span>
                  <input value={hotRegion} onChange={(event) => setHotRegion(event.target.value)} />
                </label>
              </div>
            </section>

            <section className="panel-surface">
              <div className="panel-heading compact">
                <div>
                  <p className="eyebrow">App window</p>
                  <h3>Decide what happens when you close the main interface.</h3>
                </div>
              </div>

              <label className="field">
                <span className="field__label">Close behavior</span>
                <select value={closeBehavior} onChange={(event) => setCloseBehavior(event.target.value as WindowCloseBehavior)}>
                  <option value="close">Fully close</option>
                  <option value="hide-to-tray">Hide to tray</option>
                </select>
              </label>

              <div className="mini-summary">
                <div className="mini-summary__row">
                  <span>Current choice</span>
                  <strong>{closeBehaviorLabels[closeBehavior]}</strong>
                </div>
              </div>
            </section>

            <div className="settings-footer">
              <div className="settings-footer__copy">
                <p>
                  Changes stay local and persist across restart. Save once after adjusting folders, naming, or shortcut bindings.
                </p>
                {settingsNotice ? <p className={`settings-feedback ${settingsNotice.type}`}>{settingsNotice.message}</p> : null}
              </div>
              <button type="button" className="save-button" onClick={() => void saveSettings()}>
                Save settings
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
