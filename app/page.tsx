"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  canvasToBlob,
  defaultTileStyle,
  getTileAtPoint,
  loadImageFromFile,
  renderFrame,
  type Rect,
  type TileStyle,
} from "@/lib/renderer";
import {
  encodePermToSeed,
  isPermSeed,
  randomSeedString,
  seededShuffle,
  tryDecodePermSeed,
} from "@/lib/random";
import { downloadZip } from "@/lib/download";

const GRID_OPTIONS = [3, 4, 5, 6, 7] as const;

type OutputAspectKey = "content" | "1:1" | "9:16" | "16:9";
const OUTPUT_ASPECTS: {
  key: OutputAspectKey;
  label: string;
  ratio: number | null;
}[] = [
  { key: "content", label: "内容そのまま", ratio: null },
  { key: "1:1", label: "1:1 (正方形)", ratio: 1 },
  { key: "9:16", label: "9:16 (縦長・下寄せ)", ratio: 9 / 16 },
  { key: "16:9", label: "16:9 (横長・下寄せ)", ratio: 16 / 9 },
];

const WIDTH_PRESETS = [1080, 1440, 1920, 2160] as const;

type Aspect = { w: number; h: number };
const ASPECT_PRESETS: { label: string; aspect: Aspect }[] = [
  { label: "1:1", aspect: { w: 1, h: 1 } },
  { label: "4:3", aspect: { w: 4, h: 3 } },
  { label: "3:4", aspect: { w: 3, h: 4 } },
  { label: "16:9", aspect: { w: 16, h: 9 } },
  { label: "9:16", aspect: { w: 9, h: 16 } },
];

type Theme = { name: string; style: TileStyle };
const THEMES: Theme[] = [
  { name: "レッド", style: defaultTileStyle },
  {
    name: "ブルー",
    style: { ...defaultTileStyle, fillColor: "#2563eb" },
  },
  {
    name: "ブラック",
    style: { ...defaultTileStyle, fillColor: "#171717" },
  },
  {
    name: "パープル",
    style: { ...defaultTileStyle, fillColor: "#7c3aed" },
  },
  {
    name: "グリーン",
    style: { ...defaultTileStyle, fillColor: "#16a34a" },
  },
  {
    name: "オレンジ",
    style: { ...defaultTileStyle, fillColor: "#ea580c" },
  },
];

const SUFFIX_OPTIONS = [
  { label: "「N位」", value: "位" },
  { label: "「N」のみ", value: "" },
] as const;

type EditMode = "sequence" | "arrangement";

function computeCanvasSize(
  aspect: OutputAspectKey,
  baseWidth: number,
  tileAspect: Aspect,
): { width: number; height: number } {
  if (aspect === "content") {
    const contentAspect = tileAspect.w / tileAspect.h;
    const height = Math.round(baseWidth / contentAspect);
    return { width: baseWidth, height };
  }
  const spec = OUTPUT_ASPECTS.find((o) => o.key === aspect);
  const ratio = spec?.ratio ?? 1;
  const height = Math.round(baseWidth / ratio);
  return { width: baseWidth, height };
}

function computeContentRect(
  canvasWidth: number,
  canvasHeight: number,
  tileAspect: Aspect,
): Rect {
  const contentAspect = tileAspect.w / tileAspect.h;
  const canvasAspect = canvasWidth / canvasHeight;
  let contentWidth: number;
  let contentHeight: number;
  if (contentAspect >= canvasAspect) {
    contentWidth = canvasWidth;
    contentHeight = canvasWidth / contentAspect;
  } else {
    contentHeight = canvasHeight;
    contentWidth = canvasHeight * contentAspect;
  }
  const x = (canvasWidth - contentWidth) / 2;
  const y = canvasHeight - contentHeight;
  return { x, y, width: contentWidth, height: contentHeight };
}

export default function Home() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageName, setImageName] = useState<string>("");
  const [gridSize, setGridSize] = useState<number>(5);
  const [seed, setSeed] = useState<string>("quiz-01");
  const [outputAspect, setOutputAspect] = useState<OutputAspectKey>("content");
  const [outputWidth, setOutputWidth] = useState<number>(1080);
  const [tileAspect, setTileAspect] = useState<Aspect>({ w: 1, h: 1 });
  const [themeIndex, setThemeIndex] = useState<number>(0);
  const [showCircledIndex, setShowCircledIndex] = useState<boolean>(true);
  const [numberSuffix, setNumberSuffix] = useState<string>("位");
  const [numbers, setNumbers] = useState<number[]>([]);
  const [sequence, setSequence] = useState<number[]>([]);
  const [revealedStep, setRevealedStep] = useState<number>(0);
  const [editMode, setEditMode] = useState<EditMode>("sequence");
  const [draggingNum, setDraggingNum] = useState<number | null>(null);
  const [hoverNum, setHoverNum] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const totalTiles = gridSize * gridSize;

  const tileStyle: TileStyle = useMemo(
    () => ({
      ...THEMES[themeIndex].style,
      showCircledIndex,
      numberSuffix,
    }),
    [themeIndex, showCircledIndex, numberSuffix],
  );

  const { width: canvasWidth, height: canvasHeight } = useMemo(
    () => computeCanvasSize(outputAspect, outputWidth, tileAspect),
    [outputAspect, outputWidth, tileAspect],
  );

  const content = useMemo(
    () => computeContentRect(canvasWidth, canvasHeight, tileAspect),
    [canvasWidth, canvasHeight, tileAspect],
  );

  useEffect(() => {
    const decoded = tryDecodePermSeed(seed, totalTiles);
    if (decoded) {
      setNumbers(decoded);
    } else {
      setNumbers(
        seededShuffle(
          Array.from({ length: totalTiles }, (_, i) => i + 1),
          `${seed}::${gridSize}`,
        ),
      );
    }
    setSequence([]);
    setRevealedStep(0);
  }, [seed, gridSize, totalTiles]);

  useEffect(() => {
    setSequence((prev) => prev.filter((n) => n >= 1 && n <= totalTiles));
  }, [totalTiles]);

  useEffect(() => {
    if (revealedStep > sequence.length) setRevealedStep(sequence.length);
  }, [sequence.length, revealedStep]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    if (!image) {
      ctx.fillStyle = "#111111";
      ctx.fillRect(content.x, content.y, content.width, content.height);
      ctx.fillStyle = "#525252";
      const minSide = Math.min(content.width, content.height);
      ctx.font = `${minSide * 0.035}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        "背景画像をアップロード",
        content.x + content.width / 2,
        content.y + content.height / 2,
      );
      return;
    }

    const revealedSet = new Set<number>(sequence.slice(0, revealedStep));
    renderFrame(ctx, {
      image,
      imageWidth: image.naturalWidth,
      imageHeight: image.naturalHeight,
      gridSize,
      numbers,
      revealedNumbers: revealedSet,
      canvasWidth,
      canvasHeight,
      content,
      tileStyle,
      highlight:
        editMode === "arrangement" ? { draggingNum, hoverNum } : undefined,
    });
  }, [
    image,
    gridSize,
    numbers,
    sequence,
    revealedStep,
    canvasWidth,
    canvasHeight,
    content,
    tileStyle,
    editMode,
    draggingNum,
    hoverNum,
  ]);

  const onFileSelect = useCallback(async (file: File) => {
    try {
      const img = await loadImageFromFile(file);
      setImage(img);
      setImageName(file.name);
      setSequence([]);
      setRevealedStep(0);
    } catch (e) {
      console.error(e);
      alert("画像を読み込めませんでした。JPEG / PNG / WebP を指定してください。");
    }
  }, []);

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void onFileSelect(file);
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) void onFileSelect(file);
  };

  const onDragOver = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const pickTile = (clientX: number, clientY: number): number | null => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return null;
    return getTileAtPoint(
      clientX,
      clientY,
      canvas,
      gridSize,
      numbers,
      canvasWidth,
      canvasHeight,
      content,
    );
  };

  const onCanvasClick = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (!image || editMode !== "sequence") return;
    const num = pickTile(e.clientX, e.clientY);
    if (num == null) return;
    setSequence((prev) => {
      const idx = prev.indexOf(num);
      const next = idx >= 0 ? prev.filter((n) => n !== num) : [...prev, num];
      if (idx < 0) {
        setRevealedStep(next.length);
      } else if (idx < revealedStep) {
        setRevealedStep((s) => Math.max(0, s - 1));
      }
      return next;
    });
  };

  const onCanvasMouseDown = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (!image || editMode !== "arrangement") return;
    const num = pickTile(e.clientX, e.clientY);
    if (num == null) return;
    setDraggingNum(num);
    setHoverNum(num);
  };

  const onCanvasMouseMove = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (editMode !== "arrangement" || draggingNum == null) return;
    const num = pickTile(e.clientX, e.clientY);
    setHoverNum(num);
  };

  const commitSwap = () => {
    if (draggingNum == null) return;
    if (hoverNum != null && hoverNum !== draggingNum) {
      const i = numbers.indexOf(draggingNum);
      const j = numbers.indexOf(hoverNum);
      if (i >= 0 && j >= 0) {
        const next = numbers.slice();
        [next[i], next[j]] = [next[j], next[i]];
        setNumbers(next);
      }
    }
    setDraggingNum(null);
    setHoverNum(null);
  };

  const onCanvasMouseUp = () => {
    if (editMode === "arrangement") commitSwap();
  };

  const onCanvasMouseLeave = () => {
    if (editMode === "arrangement" && draggingNum != null) {
      setDraggingNum(null);
      setHoverNum(null);
    }
  };

  const reshuffle = () => {
    setNumbers(
      seededShuffle(
        Array.from({ length: totalTiles }, (_, i) => i + 1),
        `${seed}::${gridSize}::${Math.random()}`,
      ),
    );
  };

  const resetArrangement = () => {
    const decoded = tryDecodePermSeed(seed, totalTiles);
    if (decoded) {
      setNumbers(decoded);
    } else {
      setNumbers(
        seededShuffle(
          Array.from({ length: totalTiles }, (_, i) => i + 1),
          `${seed}::${gridSize}`,
        ),
      );
    }
  };

  const applyCurrentArrangementToSeed = () => {
    setSeed(encodePermToSeed(numbers));
  };

  const currentIsPermSeed = isPermSeed(seed);

  const removeFromSequence = (num: number) => {
    setSequence((prev) => {
      const idx = prev.indexOf(num);
      const next = prev.filter((n) => n !== num);
      if (idx >= 0 && idx < revealedStep) {
        setRevealedStep((s) => Math.max(0, s - 1));
      }
      return next;
    });
  };

  const clearSequence = () => {
    setSequence([]);
    setRevealedStep(0);
  };

  const fillAscending = () => {
    const next = Array.from({ length: totalTiles }, (_, i) => i + 1);
    setSequence(next);
    setRevealedStep(next.length);
  };

  const onTileAspectChange = (axis: "w" | "h", value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    setTileAspect((prev) => ({ ...prev, [axis]: value }));
  };

  const onDownload = async () => {
    if (!image) return;
    if (sequence.length === 0) {
      alert("先に「開ける順」を1つ以上追加してください（プレビューのタイルをクリック）。");
      return;
    }
    setIsGenerating(true);
    const totalFrames = sequence.length + 1;
    setProgress({ current: 0, total: totalFrames });
    try {
      const canvas = document.createElement("canvas");
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas context unavailable");

      const files: { name: string; blob: Blob }[] = [];
      const digits = Math.max(2, String(sequence.length).length);
      for (let step = 0; step <= sequence.length; step++) {
        const revealedSet = new Set<number>(sequence.slice(0, step));
        renderFrame(ctx, {
          image,
          imageWidth: image.naturalWidth,
          imageHeight: image.naturalHeight,
          gridSize,
          numbers,
          revealedNumbers: revealedSet,
          canvasWidth,
          canvasHeight,
          content,
          tileStyle,
        });
        const blob = await canvasToBlob(canvas, "image/png");
        const padded = String(step).padStart(digits, "0");
        const openedNum =
          step === 0
            ? "start"
            : `open${String(sequence[step - 1]).padStart(2, "0")}`;
        files.push({ name: `frame_${padded}_${openedNum}.png`, blob });
        setProgress({ current: step + 1, total: totalFrames });
        await new Promise((r) => setTimeout(r, 0));
      }

      const sequenceLabel = sequence.join("-");
      await downloadZip(
        files,
        `quiz_${seed}_${gridSize}x${gridSize}_seq[${sequenceLabel}].zip`,
      );
    } catch (e) {
      console.error(e);
      alert("ZIP の生成に失敗しました。");
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  };

  const previewCursor = !image
    ? "cursor-default"
    : editMode === "arrangement"
      ? draggingNum != null
        ? "cursor-grabbing"
        : "cursor-grab"
      : "cursor-pointer";

  const previewAspect = `${canvasWidth} / ${canvasHeight}`;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 p-6 md:p-8">
      <header className="flex flex-col gap-1 border-b border-neutral-800 pb-4">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          ランキングクイズ画像ジェネレーター
        </h1>
        <p className="text-sm text-neutral-400">
          背景画像とグリッドを指定し、プレビューのタイルをクリックして「開ける順」を組み立てると、その順に応じた画像を一括で書き出します。
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <aside className="flex flex-col gap-5">
          <section>
            <h2 className="mb-2 text-sm font-semibold text-neutral-300">
              背景画像
            </h2>
            <label
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition ${
                isDragging
                  ? "border-amber-400 bg-amber-400/10"
                  : "border-neutral-700 bg-neutral-900 hover:border-neutral-500"
              }`}
            >
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onInputChange}
              />
              {image ? (
                <div className="flex flex-col items-center gap-1">
                  <span className="max-w-full truncate text-sm text-neutral-200">
                    {imageName}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {image.naturalWidth} × {image.naturalHeight}px
                  </span>
                  <span className="mt-1 text-xs text-neutral-500">
                    クリック / ドロップで差し替え
                  </span>
                </div>
              ) : (
                <>
                  <span className="text-sm text-neutral-300">
                    クリック / ドラッグ&ドロップ
                  </span>
                  <span className="text-xs text-neutral-500">
                    JPEG / PNG / WebP
                  </span>
                </>
              )}
            </label>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-neutral-300">
              グリッド
            </h2>
            <div className="flex flex-wrap gap-2">
              {GRID_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => setGridSize(n)}
                  className={`rounded-md px-3 py-1.5 text-sm transition ${
                    gridSize === n
                      ? "bg-amber-500 font-semibold text-neutral-950"
                      : "bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
                  }`}
                >
                  {n} × {n}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-neutral-500">
              合計 {totalTiles} 枚のタイル
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-neutral-300">
              タイル比率（幅 : 高さ）
            </h2>
            <div className="mb-2 flex flex-wrap gap-2">
              {ASPECT_PRESETS.map((p) => {
                const active =
                  tileAspect.w === p.aspect.w && tileAspect.h === p.aspect.h;
                return (
                  <button
                    key={p.label}
                    onClick={() => setTileAspect(p.aspect)}
                    className={`rounded-md px-3 py-1.5 text-sm transition ${
                      active
                        ? "bg-amber-500 font-semibold text-neutral-950"
                        : "bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <input
                type="number"
                min={1}
                step={1}
                value={tileAspect.w}
                onChange={(e) =>
                  onTileAspectChange("w", Number(e.target.value))
                }
                className="w-20 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-100 focus:border-amber-500 focus:outline-none"
              />
              <span className="text-neutral-500">:</span>
              <input
                type="number"
                min={1}
                step={1}
                value={tileAspect.h}
                onChange={(e) =>
                  onTileAspectChange("h", Number(e.target.value))
                }
                className="w-20 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-100 focus:border-amber-500 focus:outline-none"
              />
              <span className="text-xs text-neutral-500">
                （タイル1枚の比率）
              </span>
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-300">
                配置シード
              </h2>
              <div className="flex gap-1">
                <button
                  onClick={reshuffle}
                  className="rounded-md bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300 transition hover:bg-neutral-700"
                >
                  再シャッフル
                </button>
                <button
                  onClick={() => setSeed(randomSeedString())}
                  className="rounded-md bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300 transition hover:bg-neutral-700"
                >
                  ランダム
                </button>
              </div>
            </div>
            <input
              type="text"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="例: quiz-01"
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-amber-500 focus:outline-none"
            />
            <p className="mt-1.5 text-xs text-neutral-500">
              {currentIsPermSeed
                ? "配置固定シード (perm:v1:…) — 配置をそのまま復元します。コピーして保存すればいつでも同じ配置を再現可能。"
                : "同じシード & グリッドなら同じ配置を再現できます。手動入れ替え後は「現在の配置をシード化」で固定シードに変換可能。"}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              <button
                onClick={applyCurrentArrangementToSeed}
                className="rounded-md bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300 transition hover:bg-neutral-700"
              >
                現在の配置をシード化
              </button>
              <button
                onClick={resetArrangement}
                className="rounded-md bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300 transition hover:bg-neutral-700"
              >
                配置リセット
              </button>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-neutral-300">
              出力キャンバス
            </h2>
            <div className="mb-2 flex flex-wrap gap-2">
              {OUTPUT_ASPECTS.map((o) => (
                <button
                  key={o.key}
                  onClick={() => setOutputAspect(o.key)}
                  className={`rounded-md px-3 py-1.5 text-sm transition ${
                    outputAspect === o.key
                      ? "bg-amber-500 font-semibold text-neutral-950"
                      : "bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <label className="mb-1 block text-xs text-neutral-500">
              書き出し幅 (px)
            </label>
            <select
              value={outputWidth}
              onChange={(e) => setOutputWidth(Number(e.target.value))}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-amber-500 focus:outline-none"
            >
              {WIDTH_PRESETS.map((w) => (
                <option key={w} value={w}>
                  {w} px
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-neutral-500">
              出力サイズ: {canvasWidth} × {canvasHeight} px
              {outputAspect !== "content" && (
                <>
                  （内容{Math.round(content.width)}×
                  {Math.round(content.height)}を下寄せ、上は透明）
                </>
              )}
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-neutral-300">
              タイル色
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map((t, i) => (
                <button
                  key={t.name}
                  onClick={() => setThemeIndex(i)}
                  className={`flex items-center gap-2 rounded-md border p-2 text-left text-xs transition ${
                    themeIndex === i
                      ? "border-amber-500 bg-neutral-800"
                      : "border-neutral-700 bg-neutral-900 hover:border-neutral-500"
                  }`}
                >
                  <span
                    className="h-5 w-5 shrink-0 rounded-sm"
                    style={{
                      background: t.style.fillColor,
                      border: `1.5px solid ${t.style.borderColor}`,
                    }}
                  />
                  <span className="text-neutral-200">{t.name}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-neutral-300">
              ラベル表記
            </h2>
            <div className="flex flex-wrap gap-2">
              {SUFFIX_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => setNumberSuffix(opt.value)}
                  className={`rounded-md px-3 py-1.5 text-sm transition ${
                    numberSuffix === opt.value
                      ? "bg-amber-500 font-semibold text-neutral-950"
                      : "bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={showCircledIndex}
                onChange={(e) => setShowCircledIndex(e.target.checked)}
                className="h-4 w-4 accent-amber-500"
              />
              左上に○囲みの番号を表示
            </label>
          </section>
        </aside>

        <section className="flex flex-col gap-4">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1 rounded-md bg-neutral-800 p-1">
                <button
                  onClick={() => setEditMode("sequence")}
                  className={`rounded px-3 py-1 text-xs font-medium transition ${
                    editMode === "sequence"
                      ? "bg-amber-500 text-neutral-950"
                      : "text-neutral-300 hover:text-neutral-100"
                  }`}
                >
                  順序編集（クリックで追加）
                </button>
                <button
                  onClick={() => setEditMode("arrangement")}
                  className={`rounded px-3 py-1 text-xs font-medium transition ${
                    editMode === "arrangement"
                      ? "bg-amber-500 text-neutral-950"
                      : "text-neutral-300 hover:text-neutral-100"
                  }`}
                >
                  配置編集（ドラッグで入替）
                </button>
              </div>
              <span className="text-xs text-neutral-500">
                {editMode === "sequence"
                  ? "タイルをクリックで「開ける順」に追加/解除"
                  : "タイルをドラッグして別タイルにドロップで入れ替え"}
              </span>
            </div>
            <div
              className="mx-auto w-full max-w-[720px] overflow-hidden rounded-md"
              style={{
                aspectRatio: previewAspect,
                background:
                  "repeating-conic-gradient(#262626 0% 25%, #1a1a1a 0% 50%) 0 0 / 24px 24px",
              }}
            >
              <canvas
                ref={previewCanvasRef}
                onClick={onCanvasClick}
                onMouseDown={onCanvasMouseDown}
                onMouseMove={onCanvasMouseMove}
                onMouseUp={onCanvasMouseUp}
                onMouseLeave={onCanvasMouseLeave}
                className={`h-full w-full ${previewCursor}`}
              />
            </div>
            {image && (
              <p className="mt-2 text-center text-xs text-neutral-500">
                {outputAspect !== "content"
                  ? "上部の市松模様は透明領域（出力PNGでは透過）です。"
                  : "プレビューと出力の比率は一致しています。"}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-300">
                開ける順（{sequence.length} / {totalTiles}）
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={fillAscending}
                  className="rounded-md bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300 transition hover:bg-neutral-700"
                >
                  1→{totalTiles} で埋める
                </button>
                <button
                  onClick={clearSequence}
                  disabled={sequence.length === 0}
                  className="rounded-md bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300 transition enabled:hover:bg-neutral-700 disabled:opacity-40"
                >
                  クリア
                </button>
              </div>
            </div>
            {sequence.length === 0 ? (
              <p className="rounded border border-dashed border-neutral-700 p-4 text-center text-xs text-neutral-500">
                まだ順序が指定されていません。プレビューのタイルをクリックしてください。
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {sequence.map((num, i) => (
                  <span
                    key={`${num}-${i}`}
                    className="inline-flex items-center gap-1.5 rounded-md bg-neutral-800 py-1 pl-2 pr-1 text-xs"
                  >
                    <span className="font-mono text-neutral-500">{i + 1}.</span>
                    <span className="font-semibold text-neutral-100">
                      {num}
                      {numberSuffix || ""}
                    </span>
                    <button
                      onClick={() => removeFromSequence(num)}
                      aria-label={`${num} を削除`}
                      className="ml-0.5 rounded p-0.5 text-neutral-500 transition hover:bg-neutral-700 hover:text-neutral-100"
                    >
                      <svg
                        viewBox="0 0 12 12"
                        className="h-3 w-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <path d="M3 3l6 6M9 3l-6 6" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-neutral-300">プレビュー: ステップ</span>
              <span className="font-mono text-neutral-100">
                {revealedStep} / {sequence.length}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={sequence.length}
              value={revealedStep}
              onChange={(e) => setRevealedStep(Number(e.target.value))}
              className="w-full accent-amber-500"
              disabled={!image || sequence.length === 0}
            />
            <p className="mt-1 text-xs text-neutral-500">
              書き出し枚数: {sequence.length === 0 ? 0 : sequence.length + 1} 枚
              (ステップ 0 = 全部閉じ → ステップ {sequence.length} = 指定分を全て開いた状態)
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={onDownload}
              disabled={!image || sequence.length === 0 || isGenerating}
              className="flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-3 font-semibold text-neutral-950 transition enabled:hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isGenerating
                ? progress
                  ? `生成中... (${progress.current}/${progress.total})`
                  : "生成中..."
                : sequence.length === 0
                  ? "順序を指定してください"
                  : `ZIP をダウンロード（${sequence.length + 1} 枚）`}
            </button>
            {progress && (
              <div className="h-1 w-full overflow-hidden rounded bg-neutral-800">
                <div
                  className="h-full bg-amber-500 transition-all"
                  style={{
                    width: `${(progress.current / progress.total) * 100}%`,
                  }}
                />
              </div>
            )}
          </div>
        </section>
      </div>

      <footer className="mt-4 border-t border-neutral-800 pt-4 text-xs text-neutral-500">
        書き出しファイル名は{" "}
        <code className="rounded bg-neutral-800 px-1.5 py-0.5">frame_00_start.png</code>{" "}
        から{" "}
        <code className="rounded bg-neutral-800 px-1.5 py-0.5">frame_NN_openXX.png</code>{" "}
        の形式。<code className="rounded bg-neutral-800 px-1.5 py-0.5">XX</code>{" "}
        はそのステップで開いた番号です。
      </footer>
    </main>
  );
}
