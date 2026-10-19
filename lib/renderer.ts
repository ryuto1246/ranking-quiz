export type TileStyle = {
  fillColor: string;
  borderColor: string;
  borderWidthRatio: number;
  numberColor: string;
  numberShadowColor: string;
  numberShadowOffsetRatio: number;
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
  numberShadowColor: "#000000",
  numberShadowOffsetRatio: 0.04,
  fontFamily:
    '"Impact", "Arial Black", "Helvetica Neue", "Hiragino Sans W8", "Yu Gothic UI Bold", sans-serif',
  shadowColor: "rgba(0,0,0,0)",
  shadowBlurRatio: 0,
  cornerRadiusRatio: 0,
  numberSuffix: "位",
  showCircledIndex: true,
};

export type Rect = { x: number; y: number; width: number; height: number };

export type TileHighlight = {
  draggingNum?: number | null;
  hoverNum?: number | null;
};

export type RenderOptions = {
  image: CanvasImageSource;
  imageWidth: number;
  imageHeight: number;
  gridSize: number;
  numbers: number[];
  revealedNumbers: ReadonlySet<number>;
  canvasWidth: number;
  canvasHeight: number;
  content: Rect;
  tileStyle: TileStyle;
  highlight?: TileHighlight;
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
    canvasWidth,
    canvasHeight,
    content,
    tileStyle,
    highlight,
  } = opts;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  drawBackgroundCovered(ctx, image, imageWidth, imageHeight, content);

  const cellW = content.width / gridSize;
  const cellH = content.height / gridSize;
  const maxNumber = numbers.length;
  const labelFontSize = computeUniformLabelFontSize(
    ctx,
    cellW,
    cellH,
    maxNumber,
    tileStyle,
  );

  const draggingNum = highlight?.draggingNum ?? null;
  const hoverNum = highlight?.hoverNum ?? null;

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const idx = row * gridSize + col;
      const num = numbers[idx];
      if (revealedNumbers.has(num)) continue;
      const tx = content.x + col * cellW;
      const ty = content.y + row * cellH;
      const isDragging = draggingNum != null && num === draggingNum;
      const isHover =
        hoverNum != null && num === hoverNum && hoverNum !== draggingNum;

      if (isDragging) ctx.globalAlpha = 0.4;
      drawTile(ctx, tx, ty, cellW, cellH, num, tileStyle, labelFontSize);
      ctx.globalAlpha = 1;

      if (isHover) {
        drawHoverOutline(ctx, tx, ty, cellW, cellH, tileStyle);
      }
    }
  }
}

const SUFFIX_SCALE = 0.65;

function computeUniformLabelFontSize(
  ctx: CanvasRenderingContext2D,
  cellW: number,
  cellH: number,
  maxNumber: number,
  style: TileStyle,
): number {
  const digitStr = String(maxNumber);
  const suffix = style.numberSuffix;
  const maxWidth = cellW * 0.82;
  const maxHeight = cellH * 0.82;
  let fontSize = Math.min(cellW, cellH) * 0.55;
  ctx.font = `900 ${fontSize}px ${style.fontFamily}`;
  const digitWidth = ctx.measureText(digitStr).width;
  const suffixWidth = suffix
    ? ctx.measureText(suffix).width * SUFFIX_SCALE
    : 0;
  const totalWidth = digitWidth + suffixWidth;
  if (totalWidth > maxWidth) {
    fontSize *= maxWidth / totalWidth;
  }
  if (fontSize > maxHeight) {
    fontSize = maxHeight;
  }
  return fontSize;
}

function drawBackgroundCovered(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  iw: number,
  ih: number,
  content: Rect,
): void {
  const scale = Math.max(content.width / iw, content.height / ih);
  const sw = content.width / scale;
  const sh = content.height / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  ctx.drawImage(
    img,
    sx,
    sy,
    sw,
    sh,
    content.x,
    content.y,
    content.width,
    content.height,
  );
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  num: number,
  style: TileStyle,
  labelFontSize: number,
): void {
  const minSize = Math.min(w, h);
  const radius = minSize * style.cornerRadiusRatio;
  const borderWidth = minSize * style.borderWidthRatio;
  const shadowBlur = minSize * style.shadowBlurRatio;

  ctx.save();
  ctx.shadowColor = style.shadowColor;
  ctx.shadowBlur = shadowBlur;
  ctx.shadowOffsetY = minSize * 0.015;
  ctx.fillStyle = style.fillColor;
  roundedRectPath(ctx, x, y, w, h, radius);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = style.borderColor;
  ctx.lineWidth = borderWidth;
  roundedRectPath(
    ctx,
    x + borderWidth / 2,
    y + borderWidth / 2,
    w - borderWidth,
    h - borderWidth,
    Math.max(0, radius - borderWidth / 2),
  );
  ctx.stroke();
  ctx.restore();

  if (style.showCircledIndex) {
    drawCircledNumber(ctx, x, y, w, h, num, style);
  }

  drawCenteredLabel(ctx, x, y, w, h, num, style, labelFontSize);
}

function drawHoverOutline(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  style: TileStyle,
): void {
  const minSize = Math.min(w, h);
  const radius = minSize * style.cornerRadiusRatio;
  const lineWidth = Math.max(2, minSize * 0.025);
  ctx.save();
  ctx.strokeStyle = "#fbbf24";
  ctx.lineWidth = lineWidth;
  roundedRectPath(
    ctx,
    x + lineWidth / 2,
    y + lineWidth / 2,
    w - lineWidth,
    h - lineWidth,
    Math.max(0, radius - lineWidth / 2),
  );
  ctx.stroke();
  ctx.restore();
}

function drawCircledNumber(
  ctx: CanvasRenderingContext2D,
  tileX: number,
  tileY: number,
  tileW: number,
  tileH: number,
  num: number,
  style: TileStyle,
): void {
  const minSize = Math.min(tileW, tileH);
  const circleRadius = minSize * 0.055;
  const margin = minSize * 0.045;
  const cx = tileX + margin + circleRadius;
  const cy = tileY + margin + circleRadius;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, circleRadius, 0, Math.PI * 2);
  ctx.strokeStyle = style.numberColor;
  ctx.lineWidth = Math.max(1, minSize * 0.006);
  ctx.stroke();

  const fontSize = circleRadius * 1.35;
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
  tileW: number,
  tileH: number,
  num: number,
  style: TileStyle,
  fontSize: number,
): void {
  const digit = String(num);
  const suffix = style.numberSuffix;
  const suffixFontSize = fontSize * SUFFIX_SCALE;

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.font = `900 ${fontSize}px ${style.fontFamily}`;
  const digitMetrics = ctx.measureText(digit);
  const digitWidth = digitMetrics.width;
  const ascent = digitMetrics.actualBoundingBoxAscent || fontSize * 0.75;
  const descent = digitMetrics.actualBoundingBoxDescent || fontSize * 0.05;

  let suffixWidth = 0;
  if (suffix) {
    ctx.font = `900 ${suffixFontSize}px ${style.fontFamily}`;
    suffixWidth = ctx.measureText(suffix).width;
  }

  const totalWidth = digitWidth + suffixWidth;
  const startX = tileX + (tileW - totalWidth) / 2;
  const baselineY = tileY + tileH / 2 + (ascent - descent) / 2;

  const offset = fontSize * style.numberShadowOffsetRatio;

  ctx.fillStyle = style.numberShadowColor;
  ctx.font = `900 ${fontSize}px ${style.fontFamily}`;
  ctx.fillText(digit, startX + offset, baselineY + offset);
  if (suffix) {
    ctx.font = `900 ${suffixFontSize}px ${style.fontFamily}`;
    ctx.fillText(suffix, startX + digitWidth + offset, baselineY + offset);
  }

  ctx.fillStyle = style.numberColor;
  ctx.font = `900 ${fontSize}px ${style.fontFamily}`;
  ctx.fillText(digit, startX, baselineY);
  if (suffix) {
    ctx.font = `900 ${suffixFontSize}px ${style.fontFamily}`;
    ctx.fillText(suffix, startX + digitWidth, baselineY);
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
  canvasWidth: number,
  canvasHeight: number,
  content: Rect,
): number | null {
  const rect = canvas.getBoundingClientRect();
  const canvasX = ((clientX - rect.left) / rect.width) * canvasWidth;
  const canvasY = ((clientY - rect.top) / rect.height) * canvasHeight;
  if (
    canvasX < content.x ||
    canvasX >= content.x + content.width ||
    canvasY < content.y ||
    canvasY >= content.y + content.height
  ) {
    return null;
  }
  const col = Math.floor(((canvasX - content.x) / content.width) * gridSize);
  const row = Math.floor(((canvasY - content.y) / content.height) * gridSize);
  const idx = row * gridSize + col;
  return numbers[idx] ?? null;
}
