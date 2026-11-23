import { LockClosedIcon, LockOpenIcon } from "@heroicons/react/20/solid";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FunctionComponent } from "../../../common/types";
import { MAX_CANVAS_SIZE, MIN_CANVAS_SIZE, SIZE_PRESETS } from "../constants";
import { resamplePixels, resizePixels } from "../lib/raster";
import { flattenedPixels, useEditorStore } from "../store/editorStore";
import type { ResampleAlgorithm, ResizeAnchor, ResizeMode } from "../types";
import { Modal, TextButton } from "./ui";

const PREVIEW_BOX = 192;

const SCALE_FACTORS: Array<{ label: string; factor: number }> = [
	{ label: "⅛×", factor: 0.125 },
	{ label: "¼×", factor: 0.25 },
	{ label: "½×", factor: 0.5 },
	{ label: "2×", factor: 2 },
	{ label: "4×", factor: 4 },
];

const ALGORITHMS: Array<{
	id: ResampleAlgorithm;
	label: string;
	description: string;
}> = [
	{
		id: "nearest",
		label: "Nearest",
		description:
			"Crisp pixels, exact colors (best for integer scales like 512→128)",
	},
	{
		id: "majority",
		label: "Dominant",
		description:
			"Block mode picks the most frequent color per cell (sharp downscaling)",
	},
	{
		id: "smooth",
		label: "Smooth",
		description:
			"Premultiplied area / bilinear blend (best for high-res painted art)",
	},
];

const ANCHORS: Array<{ id: ResizeAnchor; symbol: string }> = [
	{ id: "top-left", symbol: "↖" },
	{ id: "top", symbol: "↑" },
	{ id: "top-right", symbol: "↗" },
	{ id: "left", symbol: "←" },
	{ id: "center", symbol: "•" },
	{ id: "right", symbol: "→" },
	{ id: "bottom-left", symbol: "↙" },
	{ id: "bottom", symbol: "↓" },
	{ id: "bottom-right", symbol: "↘" },
];

function clampDimension(rawValue: string): number {
	return Math.max(
		MIN_CANVAS_SIZE,
		Math.min(MAX_CANVAS_SIZE, Math.round(Number(rawValue)) || MIN_CANVAS_SIZE)
	);
}

function formatAxisDelta(delta: number): string {
	if (delta === 0) return "unchanged";
	return delta > 0 ? `+${delta}px pad` : `${Math.abs(delta)}px crop`;
}

export const ResizeCanvasDialog = ({
	onClose,
}: {
	onClose: () => void;
}): FunctionComponent => {
	const currentWidth = useEditorStore((state) => state.width);
	const currentHeight = useEditorStore((state) => state.height);
	const frameCount = useEditorStore((state) => state.frames.length);
	const layerCount = useEditorStore((state) => state.layers.length);
	const resizeCanvas = useEditorStore((state) => state.resizeCanvas);

	const [mode, setMode] = useState<ResizeMode>("scale");
	const [algorithm, setAlgorithm] = useState<ResampleAlgorithm>("nearest");
	const [anchor, setAnchor] = useState<ResizeAnchor>("center");
	const [lockAspect, setLockAspect] = useState(true);
	const [widthInput, setWidthInput] = useState(String(currentWidth));
	const [heightInput, setHeightInput] = useState(String(currentHeight));
	const canvasRef = useRef<HTMLCanvasElement>(null);

	const sourcePixels = useMemo(
		() => flattenedPixels(useEditorStore.getState()),
		[]
	);

	const targetWidth = clampDimension(widthInput);
	const targetHeight = clampDimension(heightInput);
	const unchanged =
		targetWidth === currentWidth && targetHeight === currentHeight;

	const previewPixels = useMemo(
		() =>
			mode === "scale"
				? resamplePixels(
						sourcePixels,
						currentWidth,
						currentHeight,
						targetWidth,
						targetHeight,
						algorithm
					)
				: resizePixels(
						sourcePixels,
						currentWidth,
						currentHeight,
						targetWidth,
						targetHeight,
						anchor
					),
		[
			algorithm,
			anchor,
			currentHeight,
			currentWidth,
			mode,
			sourcePixels,
			targetHeight,
			targetWidth,
		]
	);

	const largestSide = Math.max(targetWidth, targetHeight);
	const previewScale = largestSide > 0 ? PREVIEW_BOX / largestSide : 1;
	const displayWidth = Math.max(1, Math.round(targetWidth * previewScale));
	const displayHeight = Math.max(1, Math.round(targetHeight * previewScale));

	useEffect(() => {
		const canvas = canvasRef.current;
		const context = canvas?.getContext("2d");
		if (
			!canvas ||
			!context ||
			typeof ImageData === "undefined" ||
			previewPixels.length !== targetWidth * targetHeight
		) {
			return;
		}
		canvas.width = targetWidth;
		canvas.height = targetHeight;
		context.putImageData(
			new ImageData(
				new Uint8ClampedArray(previewPixels.buffer.slice(0)),
				targetWidth,
				targetHeight
			),
			0,
			0
		);
	}, [previewPixels, targetHeight, targetWidth]);

	const handleWidthChange = (nextRaw: string): void => {
		setWidthInput(nextRaw);
		if (!lockAspect) return;
		const parsed = Number(nextRaw);
		if (Number.isFinite(parsed) && parsed > 0) {
			const proportional = Math.round((parsed * currentHeight) / currentWidth);
			setHeightInput(String(clampDimension(String(proportional))));
		}
	};

	const handleHeightChange = (nextRaw: string): void => {
		setHeightInput(nextRaw);
		if (!lockAspect) return;
		const parsed = Number(nextRaw);
		if (Number.isFinite(parsed) && parsed > 0) {
			const proportional = Math.round((parsed * currentWidth) / currentHeight);
			setWidthInput(String(clampDimension(String(proportional))));
		}
	};

	const ratioX = Number((targetWidth / currentWidth).toFixed(3));
	const ratioY = Number((targetHeight / currentHeight).toFixed(3));
	const ratioLabel = ratioX === ratioY ? `${ratioX}×` : `${ratioX}× × ${ratioY}×`;
	const deltaW = targetWidth - currentWidth;
	const deltaH = targetHeight - currentHeight;

	const inputClass =
		"w-20 rounded-md border border-(--pe-border) bg-(--pe-bg-control) px-2 py-1 text-xs tabular-nums text-(--pe-text) outline-none focus:border-(--pe-accent)";

	return (
		<Modal
			size="lg"
			subtitle="Scale artwork to a new base size or crop / expand canvas bounds"
			title="Resize canvas"
			footer={
				<>
					<TextButton onClick={onClose}>Cancel</TextButton>
					<TextButton
						disabled={unchanged}
						variant="primary"
						onClick={() => {
							resizeCanvas(
								targetWidth,
								targetHeight,
								mode === "scale"
									? { mode: "scale", algorithm }
									: { mode: "crop", anchor }
							);
							onClose();
						}}
					>
						Resize to {targetWidth}×{targetHeight}
					</TextButton>
				</>
			}
			onClose={onClose}
		>
			<div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_216px]">
				<div className="min-w-0 space-y-4">
					<div>
						<p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-(--pe-text-muted)">
							Resize mode
						</p>
						<div className="flex flex-wrap gap-1.5">
							<TextButton
								active={mode === "scale"}
								title="Resample pixel artwork to fit the new dimensions"
								onClick={() => {
									setMode("scale");
								}}
							>
								Scale artwork
							</TextButton>
							<TextButton
								active={mode === "crop"}
								title="Keep original pixels at 1:1 size and crop or pad around an anchor"
								onClick={() => {
									setMode("crop");
								}}
							>
								Crop / Pad bounds
							</TextButton>
						</div>
						<p className="mt-1 text-[11px] text-(--pe-text-muted)">
							{mode === "scale"
								? "Resamples artwork across every layer & frame to match the target base size."
								: "Keeps pixel scale 1:1 and trims or expands canvas edges around the chosen anchor."}
						</p>
					</div>

					<div>
						<p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-(--pe-text-muted)">
							Base size presets
						</p>
						<div className="flex flex-wrap gap-1.5">
							{SIZE_PRESETS.map((size) => (
								<TextButton
									key={size}
									active={targetWidth === size && targetHeight === size}
									onClick={() => {
										setWidthInput(String(size));
										setHeightInput(String(size));
										if (currentWidth !== currentHeight && lockAspect) {
											setLockAspect(false);
										}
									}}
								>
									{size}×{size}
								</TextButton>
							))}
						</div>
					</div>

					{mode === "scale" && (
						<div>
							<p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-(--pe-text-muted)">
								Quick scale factors
							</p>
							<div className="flex flex-wrap gap-1.5">
								{SCALE_FACTORS.map((item) => {
									const scaledW = Math.round(currentWidth * item.factor);
									const scaledH = Math.round(currentHeight * item.factor);
									const invalid =
										scaledW < MIN_CANVAS_SIZE ||
										scaledH < MIN_CANVAS_SIZE ||
										scaledW > MAX_CANVAS_SIZE ||
										scaledH > MAX_CANVAS_SIZE ||
										(scaledW === currentWidth && scaledH === currentHeight);
									return (
										<TextButton
											key={item.label}
											disabled={invalid}
											title={`Scale ${item.factor}× (${scaledW}×${scaledH})`}
											active={
												!invalid &&
												targetWidth === scaledW &&
												targetHeight === scaledH
											}
											onClick={() => {
												setWidthInput(String(scaledW));
												setHeightInput(String(scaledH));
											}}
										>
											{item.label}
										</TextButton>
									);
								})}
							</div>
						</div>
					)}

					<div>
						<p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-(--pe-text-muted)">
							Custom dimensions
						</p>
						<div className="flex flex-wrap items-center gap-2">
							<label className="flex items-center gap-1.5 text-xs text-(--pe-text-secondary)">
								W
								<input
									autoFocus
									className={inputClass}
									max={MAX_CANVAS_SIZE}
									min={MIN_CANVAS_SIZE}
									type="number"
									value={widthInput}
									onChange={(event) => {
										handleWidthChange(event.target.value);
									}}
								/>
							</label>
							<button
								aria-label="Lock aspect ratio"
								aria-pressed={lockAspect}
								type="button"
								className={`pe-btn flex h-7 w-7 items-center justify-center rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--pe-accent) ${
									lockAspect
										? "border-(--pe-accent-ring) bg-(--pe-accent-soft) text-(--pe-accent-soft-ink)"
										: "border-(--pe-border) bg-(--pe-bg-control) text-(--pe-text-muted) hover:bg-(--pe-bg-control-hover) hover:text-(--pe-text)"
								}`}
								title={
									lockAspect
										? "Aspect ratio locked (click to unlock)"
										: "Aspect ratio unlocked (click to lock)"
								}
								onClick={() => {
									setLockAspect((current) => !current);
								}}
							>
								{lockAspect ? (
									<LockClosedIcon className="h-3.5 w-3.5" />
								) : (
									<LockOpenIcon className="h-3.5 w-3.5" />
								)}
							</button>
							<label className="flex items-center gap-1.5 text-xs text-(--pe-text-secondary)">
								H
								<input
									className={inputClass}
									max={MAX_CANVAS_SIZE}
									min={MIN_CANVAS_SIZE}
									type="number"
									value={heightInput}
									onChange={(event) => {
										handleHeightChange(event.target.value);
									}}
								/>
							</label>
							<span className="text-[11px] text-(--pe-text-muted)">
								{MIN_CANVAS_SIZE}–{MAX_CANVAS_SIZE} px
							</span>
						</div>
					</div>

					{mode === "scale" ? (
						<div>
							<p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-(--pe-text-muted)">
								Resampling algorithm
							</p>
							<div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
								{ALGORITHMS.map((option) => {
									const selected = algorithm === option.id;
									return (
										<button
											key={option.id}
											aria-pressed={selected}
											type="button"
											className={`flex flex-col rounded-xl border px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--pe-accent) ${
												selected
													? "border-(--pe-accent) bg-(--pe-accent-soft) text-(--pe-text)"
													: "border-(--pe-border) bg-(--pe-bg-panel-subtle) text-(--pe-text-secondary) hover:bg-(--pe-bg-control)"
											}`}
											onClick={() => {
												setAlgorithm(option.id);
											}}
										>
											<span className="text-xs font-semibold">
												{option.label}
											</span>
											<span className="mt-0.5 text-[10px] leading-snug text-(--pe-text-muted)">
												{option.description}
											</span>
										</button>
									);
								})}
							</div>
						</div>
					) : (
						<div>
							<p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-(--pe-text-muted)">
								Anchor position
							</p>
							<div className="flex flex-wrap items-center gap-4">
								<div
									aria-label="Anchor position grid"
									className="grid grid-cols-3 gap-1 rounded-xl border border-(--pe-border) bg-(--pe-bg-panel-subtle) p-1.5"
									role="group"
								>
									{ANCHORS.map((item) => {
										const selected = anchor === item.id;
										return (
											<button
												key={item.id}
												aria-label={`Anchor ${item.id}`}
												aria-pressed={selected}
												title={item.id}
												type="button"
												className={`flex h-7 w-7 items-center justify-center rounded-md border text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--pe-accent) ${
													selected
														? "border-(--pe-accent-ring) bg-(--pe-accent) text-(--pe-accent-ink)"
														: "border-(--pe-border-subtle) bg-(--pe-bg-control) text-(--pe-text-secondary) hover:bg-(--pe-bg-control-hover) hover:text-(--pe-text)"
												}`}
												onClick={() => {
													setAnchor(item.id);
												}}
											>
												{item.symbol}
											</button>
										);
									})}
								</div>
								<div className="min-w-0 flex-1 text-[11px] text-(--pe-text-muted)">
									{unchanged ? (
										<span>No dimension change</span>
									) : (
										<>
											<p className="font-medium text-(--pe-text-secondary)">
												Anchor: {anchor}
											</p>
											<p className="mt-0.5">
												Width: {formatAxisDelta(deltaW)} · Height:{" "}
												{formatAxisDelta(deltaH)}
											</p>
										</>
									)}
								</div>
							</div>
						</div>
					)}
				</div>

				<div className="flex flex-col">
					<p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-(--pe-text-muted)">
						Live preview
					</p>
					<div className="preview-checker flex h-52 w-full items-center justify-center rounded-xl border border-(--pe-border) p-2">
						<canvas
							ref={canvasRef}
							style={{
								width: displayWidth,
								height: displayHeight,
								imageRendering: "pixelated",
							}}
						/>
					</div>
					<div className="mt-2 flex items-center justify-between gap-2 text-xs">
						<span className="font-medium tabular-nums text-(--pe-text)">
							{currentWidth}×{currentHeight} → {targetWidth}×{targetHeight}
						</span>
						{mode === "scale" && !unchanged && (
							<span className="rounded-full bg-(--pe-accent-soft) px-2 py-0.5 text-[10px] font-semibold tabular-nums text-(--pe-accent-soft-ink)">
								{ratioLabel}
							</span>
						)}
					</div>
					<p className="mt-1 text-[11px] leading-snug text-(--pe-text-muted)">
						Applies to all {frameCount}{" "}
						{frameCount === 1 ? "frame" : "frames"} &amp; {layerCount}{" "}
						{layerCount === 1 ? "layer" : "layers"} · undoable with Ctrl+Z
					</p>
				</div>
			</div>
		</Modal>
	);
};
