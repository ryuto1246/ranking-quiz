export type TileStyle = {
  fillColor: string;
  borderColor: string;
  borderWidthRatio: number;
  numberColor: string;
  numberStrokeColor: string;
  numberStrokeRatio: number;
  fontFamily: string;
  shadowColor: string;
  shadowBlurRatio: number;
  cornerRadiusRatio: number;
  numberSuffix: string;
  showCircledIndex: boolean;
};

export const defaultTileStyle: TileStyle = {
  fillColor: "#e94456",
  borderColor: "#000000",
  borderWidthRatio: 0.006,
  numberColor: "#ffffff",
  numberStrokeColor: "rgba(0,0,0,0.35)",
  numberStrokeRatio: 0.045,
  fontFamily:
    '"Hiragino Sans W8", "Hiragino Sans", "Yu Gothic UI Bold", "Yu Gothic Bold", "Arial Black", sans-serif',
  shadowColor: "rgba(0,0,0,0)",
  shadowBlurRatio: 0,
  cornerRadiusRatio: 0,
  numberSuffix: "位",
  showCircledIndex: true,
};

export type RenderOptions = {
  image: CanvasImageSource;
  imageWidth: number;
  imageHeight: number;
  gridSize: number;
  numbers: number[];
  revealedNumbers: ReadonlySet<number>;
  canvasSize: number;
  tileStyle: TileStyle;
};

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  opts: RenderOptions,
): void {
  const {
    image,
    imageWidth,
    imageHeight,
    gridSize,
    numbers,
    revealedNumbers,
    canvasSize,
    tileStyle,
  } = opts;

  ctx.clearRect(0, 0, canvasSize, canvasSize);
  drawBackgroundCovered(ctx, image, imageWidth, imageHeight, canvasSize);

  const cellSize = canvasSize / gridSize;
  const maxNumber = numbers.length;
  const labelFontSize = computeUniformLabelFontSize(
    ctx,
    cellSize,
    maxNumber,
    tileStyle,
  );

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const idx = row * gridSize + col;
      const num = numbers[idx];
      if (revealedNumbers.has(num)) continue;
      const tx = col * cellSize;
      const ty = row * cellSize;
      drawTile(ctx, tx, ty, cellSize, num, tileStyle, labelFontSize);
    }
  }
}

const SUFFIX_SCALE = 0.65;

function computeUniformLabelFontSize(
  ctx: CanvasRenderingContext2D,
  cellSize: number,
  maxNumber: number,
  style: TileStyle,
): number {
  const digitStr = String(maxNumber);
  const suffix = style.numberSuffix;
  const maxWidth = cellSize * 0.82;
  let fontSize = cellSize * 0.55;
  ctx.font = `900 ${fontSize}px ${style.fontFamily}`;
  const digitWidth = ctx.measureText(digitStr).width;
  const suffixWidth = suffix
    ? ctx.measureText(suffix).width * SUFFIX_SCALE
    : 0;
  const totalWidth = digitWidth + suffixWidth;
  if (totalWidth > maxWidth) {
    fontSize *= maxWidth / totalWidth;
  }
  return fontSize;
}

function drawBackgroundCovered(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  iw: number,
  ih: number,
  size: number,
): void {
  const scale = Math.max(size / iw, size / ih);
  const sw = size / scale;
  const sh = size / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  num: number,
  style: TileStyle,
  labelFontSize: number,
): void {
  const radius = size * style.cornerRadiusRatio;
  const borderWidth = size * style.borderWidthRatio;
  const shadowBlur = size * style.shadowBlurRatio;

  ctx.save();
  ctx.shadowColor = style.shadowColor;
  ctx.shadowBlur = shadowBlur;
  ctx.shadowOffsetY = size * 0.015;
  ctx.fillStyle = style.fillColor;
  roundedRectPath(ctx, x, y, size, size, radius);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = style.borderColor;
  ctx.lineWidth = borderWidth;
  roundedRectPath(
    ctx,
    x + borderWidth / 2,
    y + borderWidth / 2,
    size - borderWidth,
    size - borderWidth,
    Math.max(0, radius - borderWidth / 2),
  );
  ctx.stroke();
  ctx.restore();

  if (style.showCircledIndex) {
    drawCircledNumber(ctx, x, y, size, num, style);
  }

  drawCenteredLabel(ctx, x, y, size, num, style, labelFontSize);
}

function drawCircledNumber(
  ctx: CanvasRenderingContext2D,
  tileX: number,
  tileY: number,
  tileSize: number,
  num: number,
  style: TileStyle,
): void {
  const circleRadius = tileSize * 0.085;
  const margin = tileSize * 0.06;
  const cx = tileX + margin + circleRadius;
  const cy = tileY + margin + circleRadius;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, circleRadius, 0, Math.PI * 2);
  ctx.strokeStyle = style.borderColor;
  ctx.lineWidth = Math.max(1, tileSize * 0.006);
  ctx.stroke();

  const fontSize = circleRadius * 0.95;
  ctx.font = `700 ${fontSize}px ${style.fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = style.numberColor;
  ctx.fillText(String(num), cx, cy + fontSize * 0.05);
  ctx.restore();
}

function drawCenteredLabel(
  ctx: CanvasRenderingContext2D,
  tileX: number,
  tileY: number,
  tileSize: number,
  num: number,
  style: TileStyle,
  fontSize: number,
): void {
  const digit = String(num);
  const suffix = style.numberSuffix;
  const suffixFontSize = fontSize * SUFFIX_SCALE;

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";

  ctx.font = `900 ${fontSize}px ${style.fontFamily}`;
  const digitWidth = ctx.measureText(digit).width;
  let suffixWidth = 0;
  if (suffix) {
    ctx.font = `900 ${suffixFontSize}px ${style.fontFamily}`;
    suffixWidth = ctx.measureText(suffix).width;
  }

  const totalWidth = digitWidth + suffixWidth;
  const startX = tileX + (tileSize - totalWidth) / 2;
  const centerY = tileY + tileSize / 2 + fontSize * 0.05;

  ctx.font = `900 ${fontSize}px ${style.fontFamily}`;
  ctx.lineWidth = fontSize * style.numberStrokeRatio;
  ctx.strokeStyle = style.numberStrokeColor;
  ctx.strokeText(digit, startX, centerY);
  ctx.fillStyle = style.numberColor;
  ctx.fillText(digit, startX, centerY);

  if (suffix) {
    ctx.font = `900 ${suffixFontSize}px ${style.fontFamily}`;
    ctx.lineWidth = suffixFontSize * style.numberStrokeRatio;
    ctx.strokeStyle = style.numberStrokeColor;
    ctx.strokeText(suffix, startX + digitWidth, centerY);
    ctx.fillStyle = style.numberColor;
    ctx.fillText(suffix, startX + digitWidth, centerY);
  }
  ctx.restore();
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = "image/png",
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("canvas.toBlob returned null"));
      },
      type,
      quality,
    );
  });
}

export function getTileAtPoint(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  gridSize: number,
  numbers: number[],
): number | null {
  const rect = canvas.getBoundingClientRect();
  const relX = (clientX - rect.left) / rect.width;
  const relY = (clientY - rect.top) / rect.height;
  if (relX < 0 || relX >= 1 || relY < 0 || relY >= 1) return null;
  const col = Math.floor(relX * gridSize);
  const row = Math.floor(relY * gridSize);
  const idx = row * gridSize + col;
  return numbers[idx] ?? null;
}
