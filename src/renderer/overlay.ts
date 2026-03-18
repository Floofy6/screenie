import type { RegionSelection } from '@shared/types';

const layer = document.getElementById('layer') as HTMLDivElement;
const box = document.getElementById('box') as HTMLDivElement;
const instruction = document.getElementById('instruction') as HTMLDivElement;
const params = new URLSearchParams(window.location.search);
const rawDisplayId = params.get('displayId');
const parsedDisplayId = rawDisplayId == null ? Number.NaN : Number(rawDisplayId);
let displayId = Number.isFinite(parsedDisplayId) ? parsedDisplayId : undefined;
let startX = 0;
let startY = 0;
let dragging = false;
let selection: { x: number; y: number; width: number; height: number } | null = null;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getLayerBounds() {
  return {
    width: Math.max(1, layer.clientWidth),
    height: Math.max(1, layer.clientHeight)
  };
}

function setInstruction(message: string) {
  instruction.textContent = message;
}

function drawSelection(next: { x: number; y: number; width: number; height: number } | null) {
  selection = next;
  if (!next) {
    box.style.display = 'none';
    return;
  }

  box.style.display = 'block';
  box.style.left = `${next.x}px`;
  box.style.top = `${next.y}px`;
  box.style.width = `${next.width}px`;
  box.style.height = `${next.height}px`;
}

function toSelection(x: number, y: number, width: number, height: number): RegionSelection {
  const dpr = window.devicePixelRatio || 1;
  return {
    x: Math.max(0, Math.round(x * dpr)),
    y: Math.max(0, Math.round(y * dpr)),
    width: Math.max(1, Math.round(width * dpr)),
    height: Math.max(1, Math.round(height * dpr)),
    ...(displayId == null ? {} : { displayId }),
    dpr
  };
}

function commitSelection() {
  if (!selection || !window.screenieOverlayAPI) {
    return;
  }

  window.screenieOverlayAPI.submitSelection(
    toSelection(selection.x, selection.y, selection.width, selection.height)
  );
}

function resetSelection(nextDisplayId?: number) {
  displayId = nextDisplayId;
  dragging = false;
  selection = null;
  box.style.display = 'none';
  setInstruction('Drag to select an area. Then use Arrow keys to nudge it, Enter to capture, Esc to cancel.');
}

if (window.screenieOverlayAPI?.onPrepareSelection) {
  window.screenieOverlayAPI.onPrepareSelection((payload) => {
    resetSelection(payload.displayId);
  });
}

layer.addEventListener('mousedown', (event) => {
  dragging = true;
  startX = event.clientX;
  startY = event.clientY;
  setInstruction('Release the mouse to place the selection, then use Arrow keys to fine-tune it.');
  drawSelection({
    x: startX,
    y: startY,
    width: 0,
    height: 0
  });
});

layer.addEventListener('mousemove', (event) => {
  if (!dragging) return;
  const x = Math.min(event.clientX, startX);
  const y = Math.min(event.clientY, startY);
  const width = Math.abs(event.clientX - startX);
  const height = Math.abs(event.clientY - startY);

  drawSelection({ x, y, width, height });
});

layer.addEventListener('mouseup', (event) => {
  if (!dragging) {
    return;
  }
  dragging = false;

  const x = Math.min(event.clientX, startX);
  const y = Math.min(event.clientY, startY);
  const width = Math.abs(event.clientX - startX);
  const height = Math.abs(event.clientY - startY);
  if (width < 4 || height < 4) {
    drawSelection(null);
    setInstruction('Drag to select an area. Then use Arrow keys to nudge it, Enter to capture, Esc to cancel.');
    return;
  }

  drawSelection({ x, y, width, height });
  setInstruction('Selection ready. Arrow keys move it, Shift+Arrow moves faster, Enter captures, Esc cancels.');
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    window.screenieOverlayAPI.cancelSelection();
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    commitSelection();
    return;
  }

  if (!selection) {
    return;
  }

  const step = event.shiftKey ? 10 : 1;
  const bounds = getLayerBounds();

  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    drawSelection({
      ...selection,
      x: clamp(selection.x - step, 0, bounds.width - selection.width)
    });
    return;
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault();
    drawSelection({
      ...selection,
      x: clamp(selection.x + step, 0, bounds.width - selection.width)
    });
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    drawSelection({
      ...selection,
      y: clamp(selection.y - step, 0, bounds.height - selection.height)
    });
    return;
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    drawSelection({
      ...selection,
      y: clamp(selection.y + step, 0, bounds.height - selection.height)
    });
  }
});
