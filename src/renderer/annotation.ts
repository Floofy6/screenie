type Tool = 'pen' | 'rectangle' | 'arrow' | 'highlight';

type PenCommand = {
  kind: 'pen';
  color: string;
  size: number;
  points: Array<{ x: number; y: number }>;
};

type RectangleCommand = {
  kind: 'rectangle';
  color: string;
  size: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type ArrowCommand = {
  kind: 'arrow';
  color: string;
  size: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type HighlightCommand = {
  kind: 'highlight';
  color: string;
  size: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type DrawCommand = PenCommand | RectangleCommand | ArrowCommand | HighlightCommand;

type AnnotationImagePayload = {
  dataUrl: string;
  width: number;
  height: number;
};

const statusElement = document.getElementById('status') as HTMLDivElement;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
const toolbarButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-tool]'));
const colorInput = document.getElementById('color') as HTMLInputElement;
const sizeInput = document.getElementById('size') as HTMLInputElement;
const undoButton = document.getElementById('undo') as HTMLButtonElement;
const clearButton = document.getElementById('clear') as HTMLButtonElement;
const saveButton = document.getElementById('save') as HTMLButtonElement;
const cancelButton = document.getElementById('cancel') as HTMLButtonElement;

if (!canvas || !ctx || !statusElement || !window.screenieMarkupAPI) {
  throw new Error('Annotation UI not fully initialized.');
}

let currentTool: Tool = 'pen';
let isDrawing = false;
let drawingCommand: DrawCommand | null = null;
let commands: DrawCommand[] = [];
let image = new Image();
let imageLoaded = false;
let sourceWidth = 0;
let sourceHeight = 0;

const setTool = (next: Tool) => {
  currentTool = next;
  toolbarButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.tool === next);
  });
};

toolbarButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const next = button.dataset.tool as Tool | undefined;
    if (next) {
      setTool(next);
    }
  });
});

const getPointerPoint = (event: PointerEvent) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = sourceWidth / rect.width;
  const scaleY = sourceHeight / rect.height;
  return {
    x: Math.max(0, Math.min(sourceWidth, Math.round((event.clientX - rect.left) * scaleX))),
    y: Math.max(0, Math.min(sourceHeight, Math.round((event.clientY - rect.top) * scaleY)))
  };
};

const normalizeBox = (command: RectangleCommand | HighlightCommand) => {
  const x = command.width >= 0 ? command.x : command.x + command.width;
  const y = command.height >= 0 ? command.y : command.y + command.height;
  return {
    x,
    y,
    width: Math.abs(command.width),
    height: Math.abs(command.height)
  };
};

const drawArrowHead = (x1: number, y1: number, x2: number, y2: number, size: number) => {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = Math.max(10, size * 3);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
};

const redraw = () => {
  if (!imageLoaded) {
    return;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, sourceWidth, sourceHeight);

  const applyCommandStyle = (command: DrawCommand) => {
    ctx.strokeStyle = command.color;
    ctx.fillStyle = command.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = command.size;
  };

  for (const command of commands) {
    applyCommandStyle(command);
    if (command.kind === 'pen') {
      if (command.points.length < 2) {
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(command.points[0]!.x, command.points[0]!.y);
      for (const point of command.points.slice(1)) {
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
      continue;
    }

    if (command.kind === 'rectangle') {
      const bounds = normalizeBox(command);
      ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
      continue;
    }

    if (command.kind === 'highlight') {
      const bounds = normalizeBox(command);
      const previousAlpha = ctx.globalAlpha;
      ctx.globalAlpha = 0.26;
      ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
      ctx.globalAlpha = previousAlpha;
      ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
      continue;
    }

    ctx.beginPath();
    ctx.moveTo(command.x1, command.y1);
    ctx.lineTo(command.x2, command.y2);
    ctx.stroke();
    drawArrowHead(command.x1, command.y1, command.x2, command.y2, command.size);
  }

  if (!drawingCommand) {
    return;
  }

  applyCommandStyle(drawingCommand);
  if (drawingCommand.kind === 'pen') {
    if (drawingCommand.points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(drawingCommand.points[0]!.x, drawingCommand.points[0]!.y);
      for (const point of drawingCommand.points.slice(1)) {
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
    }
    return;
  }

  if (drawingCommand.kind === 'rectangle') {
    const bounds = normalizeBox(drawingCommand);
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    return;
  }

  if (drawingCommand.kind === 'highlight') {
    const bounds = normalizeBox(drawingCommand);
    const previousAlpha = ctx.globalAlpha;
    ctx.globalAlpha = 0.26;
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.globalAlpha = previousAlpha;
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    return;
  }

  ctx.beginPath();
  ctx.moveTo(drawingCommand.x1, drawingCommand.y1);
  ctx.lineTo(drawingCommand.x2, drawingCommand.y2);
  ctx.stroke();
  drawArrowHead(drawingCommand.x1, drawingCommand.y1, drawingCommand.x2, drawingCommand.y2, drawingCommand.size);
};

const finishDrawing = () => {
  if (!isDrawing || !drawingCommand) {
    return;
  }
  isDrawing = false;
  if (drawingCommand.kind === 'pen') {
    if (drawingCommand.points.length > 1) {
      commands.push(drawingCommand);
    }
  } else {
    commands.push(drawingCommand);
  }
  drawingCommand = null;
  redraw();
};

const beginDrawing = (event: PointerEvent) => {
  if (!imageLoaded) {
    return;
  }
  isDrawing = true;
  canvas.setPointerCapture(event.pointerId);
  const pointer = getPointerPoint(event);
  const color = colorInput.value;
  const size = Number(sizeInput.value);
  if (currentTool === 'pen') {
    drawingCommand = { kind: 'pen', color, size, points: [pointer] };
  } else if (currentTool === 'rectangle') {
    drawingCommand = { kind: 'rectangle', color, size, x: pointer.x, y: pointer.y, width: 0, height: 0 };
  } else if (currentTool === 'highlight') {
    drawingCommand = { kind: 'highlight', color, size, x: pointer.x, y: pointer.y, width: 0, height: 0 };
  } else {
    drawingCommand = { kind: 'arrow', color, size, x1: pointer.x, y1: pointer.y, x2: pointer.x, y2: pointer.y };
  }
  redraw();
};

const continueDrawing = (event: PointerEvent) => {
  if (!isDrawing || !drawingCommand) {
    return;
  }
  const pointer = getPointerPoint(event);

  if (drawingCommand.kind === 'pen') {
    drawingCommand.points.push(pointer);
    redraw();
    return;
  }

  if (drawingCommand.kind === 'rectangle') {
    drawingCommand.width = pointer.x - drawingCommand.x;
    drawingCommand.height = pointer.y - drawingCommand.y;
    redraw();
    return;
  }

  if (drawingCommand.kind === 'highlight') {
    drawingCommand.width = pointer.x - drawingCommand.x;
    drawingCommand.height = pointer.y - drawingCommand.y;
    redraw();
    return;
  }

  drawingCommand.x2 = pointer.x;
  drawingCommand.y2 = pointer.y;
  redraw();
};

const startLoad = async () => {
  const payload = (await window.screenieMarkupAPI.getImage()) as AnnotationImagePayload | null;
  if (!payload?.dataUrl) {
    statusElement.textContent = 'Failed to load image.';
    return;
  }

  image = new Image();
  image.onload = () => {
    sourceWidth = Math.max(1, image.naturalWidth);
    sourceHeight = Math.max(1, image.naturalHeight);
    const maxWidth = Math.max(520, window.innerWidth - 24);
    const maxHeight = Math.max(360, window.innerHeight - 146);
    const fit = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
    const displayWidth = Math.max(1, Math.round(sourceWidth * fit));
    const displayHeight = Math.max(1, Math.round(sourceHeight * fit));

    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    imageLoaded = true;
    redraw();
    statusElement.textContent = `Image loaded (${sourceWidth} x ${sourceHeight}). Tools: 1 Pen, 2 Rectangle, 3 Arrow, 4 Highlight, Cmd/Ctrl+Enter Save.`;
  };
  image.src = payload.dataUrl;
};

canvas.addEventListener('pointerdown', beginDrawing);
canvas.addEventListener('pointermove', continueDrawing);
canvas.addEventListener('pointerup', finishDrawing);
canvas.addEventListener('pointercancel', finishDrawing);
canvas.addEventListener('pointerleave', finishDrawing);

undoButton.addEventListener('click', () => {
  commands.pop();
  redraw();
});

clearButton.addEventListener('click', () => {
  commands = [];
  drawingCommand = null;
  redraw();
});

saveButton.addEventListener('click', () => {
  const imageDataUrl = canvas.toDataURL('image/png');
  window.screenieMarkupAPI.submit(imageDataUrl);
});

cancelButton.addEventListener('click', () => {
  window.screenieMarkupAPI.cancel();
});

window.addEventListener('keydown', (event) => {
  if (event.key === '1') {
    setTool('pen');
    return;
  }

  if (event.key === '2') {
    setTool('rectangle');
    return;
  }

  if (event.key === '3') {
    setTool('arrow');
    return;
  }

  if (event.key === '4') {
    setTool('highlight');
    return;
  }

  if (event.key === 'Escape') {
    window.screenieMarkupAPI.cancel();
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    const imageDataUrl = canvas.toDataURL('image/png');
    window.screenieMarkupAPI.submit(imageDataUrl);
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key === 'z') {
    commands.pop();
    redraw();
    return;
  }
});

void startLoad();
