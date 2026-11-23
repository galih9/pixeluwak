import { useEffect, useMemo, useRef } from "react";
import type { FunctionComponent } from "../../../common/types";
import {
	BRUSH_SHAPES,
	DITHER_PATTERNS,
	MAX_BRUSH_SIZE,
	TOOLS,
} from "../constants";
import { packedAlpha, packedToHex } from "../lib/color";
import { importReferenceImage } from "../lib/files";
import { isPixelFont, TEXT_FONTS } from "../lib/text";
import { pickLayerAtPoint } from "../lib/tools";
import { useEditorStore } from "../store/editorStore";
import type {
	CustomBrush,
	DitherPattern,
	GradientDither,
	GradientType,
	ReplaceScope,
	TextFont,
} from "../types";
import { ToolIcon } from "./ToolIcon";
import { Divider, TextButton, Toggle } from "./ui";

const inputClass =
	"rounded-md border border-[var(--pe-border)] bg-[var(--pe-bg-control)] px-1.5 py-0.5 text-xs text-[var(--pe-text)] outline-none focus:border-[var(--pe-accent)]";

const Hint = ({ children }: { children: string }): FunctionComponent => (
	<span className="ml-auto hidden shrink-0 pl-2 text-[11px] text-[var(--pe-text-muted)] xl:inline">
		{children}
	</span>
);

const NumberSlider = ({
	label,
	value,
	min,
	max,
	suffix = "",
	width = "w-24",
	onChange,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	suffix?: string;
	width?: string;
	onChange: (value: number) => void;
}): FunctionComponent => (
	<label className="flex shrink-0 items-center gap-2 text-xs text-[var(--pe-text-secondary)]">
		{label}
		<input
			className={`${width} accent-[var(--pe-accent)]`}
			max={max}
			min={min}
			type="range"
			value={value}
			onChange={(event) => {
				onChange(Number(event.target.value));
			}}
		/>
		<span className="w-9 tabular-nums text-[var(--pe-text)]">
			{value}
			{suffix}
		</span>
	</label>
);

const BrushOptions = ({
	showPixelPerfect,
}: {
	showPixelPerfect: boolean;
}): FunctionComponent => {
	const brushSize = useEditorStore((state) => state.brushSize);
	const setBrushSize = useEditorStore((state) => state.setBrushSize);
	const brushShape = useEditorStore((state) => state.brushShape);
	const setBrushShape = useEditorStore((state) => state.setBrushShape);
	const customBrush = useEditorStore((state) => state.customBrush);
	const captureCustomBrush = useEditorStore(
		(state) => state.captureCustomBrush
	);
	const hasSelection = useEditorStore((state) => state.selection !== null);
	const openDialog = useEditorStore((state) => state.openDialog);
	const pixelPerfect = useEditorStore((state) => state.pixelPerfect);
	const togglePixelPerfect = useEditorStore(
		(state) => state.togglePixelPerfect
	);

	return (
		<>
			<label className="flex shrink-0 items-center gap-2 text-xs text-[var(--pe-text-secondary)]">
				Size
				<input
					className="w-24 accent-[var(--pe-accent)]"
					disabled={brushShape === "custom"}
					max={MAX_BRUSH_SIZE}
					min={1}
					type="range"
					value={brushSize}
					onChange={(event) => {
						setBrushSize(Number(event.target.value));
					}}
				/>
				<span className="w-10 tabular-nums text-[var(--pe-text)]">
					{brushShape === "custom"
						? `${customBrush.width}×${customBrush.height}`
						: `${brushSize}px`}
				</span>
			</label>
			<div className="flex shrink-0 gap-1">
				{BRUSH_SHAPES.map((shape) => (
					<TextButton
						key={shape.id}
						active={brushShape === shape.id}
						title={shape.label}
						onClick={() => {
							setBrushShape(shape.id);
						}}
					>
						{shape.symbol}
					</TextButton>
				))}
				<TextButton
					title="Open custom brush editor"
					onClick={() => {
						openDialog("custom-brush");
					}}
				>
					Edit…
				</TextButton>
				{hasSelection && (
					<TextButton
						title="Capture current selection as custom brush"
						onClick={() => {
							captureCustomBrush();
						}}
					>
						From selection
					</TextButton>
				)}
			</div>
			{showPixelPerfect && brushSize === 1 && brushShape !== "custom" && (
				<Toggle
					checked={pixelPerfect}
					label="Pixel perfect"
					onChange={togglePixelPerfect}
				/>
			)}
		</>
	);
};

const CustomBrushThumbnail = ({
	brush,
}: {
	brush: CustomBrush;
}): FunctionComponent => {
	const primaryColor = useEditorStore((state) => state.primaryColor);
	const cells = Array.from(brush.mask);
	return (
		<div
			aria-hidden="true"
			className="swatch-preserve grid h-6 w-6 shrink-0 overflow-hidden rounded border border-[var(--pe-border)] bg-[var(--pe-bg-control)] p-0.5"
			style={{
				gridTemplateColumns: `repeat(${brush.width}, minmax(0, 1fr))`,
				gridTemplateRows: `repeat(${brush.height}, minmax(0, 1fr))`,
			}}
		>
			{cells.map((value, index) => {
				const packed = brush.colors?.[index] ?? 0;
				const active = value === 1;
				const fill = !active
					? "transparent"
					: packedAlpha(packed) > 0
						? packedToHex(packed)
						: primaryColor;
				return <span key={index} style={{ backgroundColor: fill }} />;
			})}
		</div>
	);
};

const CustomBrushOptionsBar = (): FunctionComponent => {
	const customBrush = useEditorStore((state) => state.customBrush);
	const presets = useEditorStore((state) => state.customBrushPresets);
	const activeId = useEditorStore((state) => state.activeCustomBrushId);
	const selectPreset = useEditorStore((state) => state.selectCustomBrushPreset);
	const options = useEditorStore((state) => state.customBrushOptions);
	const setOptions = useEditorStore((state) => state.setCustomBrushOptions);
	const captureCustomBrush = useEditorStore(
		(state) => state.captureCustomBrush
	);
	const hasSelection = useEditorStore((state) => state.selection !== null);
	const openDialog = useEditorStore((state) => state.openDialog);
	const hasColors = customBrush.colors !== undefined;

	return (
		<>
			<CustomBrushThumbnail brush={customBrush} />
			<label className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--pe-text-secondary)]">
				Pattern
				<select
					className={`${inputClass} py-1`}
					value={presets.some((item) => item.id === activeId) ? activeId : "custom"}
					onChange={(event) => {
						if (event.target.value !== "custom") {
							selectPreset(event.target.value);
						}
					}}
				>
					{presets.map((preset) => (
						<option key={preset.id ?? preset.name} value={preset.id}>
							{preset.name ?? "Pattern"} ({preset.width}×{preset.height})
						</option>
					))}
					{!presets.some((item) => item.id === activeId) && (
						<option value="custom">
							Custom ({customBrush.width}×{customBrush.height})
						</option>
					)}
				</select>
			</label>
			<TextButton
				title="Open custom pattern brush editor"
				onClick={() => {
					openDialog("custom-brush");
				}}
			>
				Edit pattern…
			</TextButton>
			{hasSelection && (
				<TextButton
					title="Capture current selection as custom brush"
					onClick={() => {
						captureCustomBrush();
					}}
				>
					From selection
				</TextButton>
			)}
			<Divider />
			<NumberSlider
				label="Spacing"
				max={16}
				min={1}
				suffix="px"
				value={options.spacing}
				width="w-16"
				onChange={(spacing) => {
					setOptions({ spacing });
				}}
			/>
			<NumberSlider
				label="Scatter"
				max={12}
				min={0}
				suffix="px"
				value={options.scatter}
				width="w-16"
				onChange={(scatter) => {
					setOptions({ scatter });
				}}
			/>
			<Toggle
				checked={options.randomFlipX || options.randomFlipY}
				label="Random flip"
				onChange={() => {
					const next = !(options.randomFlipX || options.randomFlipY);
					setOptions({ randomFlipX: next, randomFlipY: next });
				}}
			/>
			<Toggle
				checked={options.randomRotate}
				label="Random rotate"
				onChange={() => {
					setOptions({ randomRotate: !options.randomRotate });
				}}
			/>
			{hasColors && (
				<Toggle
					checked={options.colorMode === "original"}
					label="Use colors"
					onChange={() => {
						setOptions({
							colorMode:
								options.colorMode === "original" ? "tint" : "original",
						});
					}}
				/>
			)}
			<Hint>Draw foliage, leaves, grass or hair stamps smoothly</Hint>
		</>
	);
};

const SprayOptionsBar = (): FunctionComponent => {
	const options = useEditorStore((state) => state.sprayOptions);
	const setOptions = useEditorStore((state) => state.setSprayOptions);

	return (
		<>
			<NumberSlider
				label="Radius"
				max={24}
				min={2}
				suffix="px"
				value={options.radius}
				width="w-20"
				onChange={(radius) => {
					setOptions({ radius });
				}}
			/>
			<NumberSlider
				label="Density"
				max={100}
				min={5}
				suffix="%"
				value={options.density}
				width="w-20"
				onChange={(density) => {
					setOptions({ density });
				}}
			/>
			<NumberSlider
				label="Dot"
				max={4}
				min={1}
				suffix="px"
				value={options.dotSize}
				width="w-14"
				onChange={(dotSize) => {
					setOptions({ dotSize });
				}}
			/>
			<Divider />
			<div className="flex shrink-0 items-center gap-1">
				<TextButton
					active={options.distribution === "uniform"}
					onClick={() => {
						setOptions({ distribution: "uniform" });
					}}
				>
					Uniform
				</TextButton>
				<TextButton
					active={options.distribution === "gaussian"}
					onClick={() => {
						setOptions({ distribution: "gaussian" });
					}}
				>
					Soft
				</TextButton>
			</div>
			<Hint>Hold pointer to spray particles · Right click: secondary color</Hint>
		</>
	);
};

const GRADIENT_TYPES: Array<{ id: GradientType; label: string }> = [
	{ id: "linear", label: "Linear" },
	{ id: "radial", label: "Radial" },
	{ id: "diamond", label: "Diamond" },
];

const GRADIENT_DITHERS: Array<{ id: GradientDither; label: string }> = [
	{ id: "bayer4", label: "Bayer 4×4" },
	{ id: "bayer2", label: "Bayer 2×2" },
	{ id: "checker", label: "Checker" },
	{ id: "noise", label: "Noise" },
	{ id: "smooth", label: "Smooth" },
];

const GradientOptionsBar = (): FunctionComponent => {
	const options = useEditorStore((state) => state.gradientOptions);
	const setOptions = useEditorStore((state) => state.setGradientOptions);

	return (
		<>
			<div className="flex shrink-0 items-center gap-1">
				{GRADIENT_TYPES.map((item) => (
					<TextButton
						key={item.id}
						active={options.type === item.id}
						onClick={() => {
							setOptions({ type: item.id });
						}}
					>
						{item.label}
					</TextButton>
				))}
			</div>
			<Divider />
			<label className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--pe-text-secondary)]">
				Dither
				<select
					className={`${inputClass} py-1`}
					value={options.dither}
					onChange={(event) => {
						setOptions({ dither: event.target.value as GradientDither });
					}}
				>
					{GRADIENT_DITHERS.map((dither) => (
						<option key={dither.id} value={dither.id}>
							{dither.label}
						</option>
					))}
				</select>
			</label>
			<label className="flex shrink-0 items-center gap-2 text-xs text-[var(--pe-text-secondary)]">
				Bands
				<input
					className="w-16 accent-[var(--pe-accent)]"
					max={16}
					min={0}
					type="range"
					value={options.steps}
					onChange={(event) => {
						setOptions({ steps: Number(event.target.value) });
					}}
				/>
				<span className="w-9 tabular-nums text-[var(--pe-text)]">
					{options.steps < 2 ? "Auto" : options.steps}
				</span>
			</label>
			<Toggle
				checked={options.regionOnly}
				label="Region"
				onChange={() => {
					setOptions({ regionOnly: !options.regionOnly });
				}}
			/>
			{options.regionOnly && (
				<Toggle
					checked={options.contiguous}
					label="Contiguous"
					onChange={() => {
						setOptions({ contiguous: !options.contiguous });
					}}
				/>
			)}
			<Toggle
				checked={options.reverse}
				label="Reverse"
				onChange={() => {
					setOptions({ reverse: !options.reverse });
				}}
			/>
			<Hint>Drag to set angle &amp; length · Shift: snap angle</Hint>
		</>
	);
};

const LayerPickerOptionsBar = (): FunctionComponent => {
	const layers = useEditorStore((state) => state.layers);
	const activeLayerIndex = useEditorStore((state) => state.activeLayer);
	const pixels = useEditorStore((state) => state.pixels);
	const width = useEditorStore((state) => state.width);
	const height = useEditorStore((state) => state.height);
	const cursor = useEditorStore((state) => state.cursor);
	const activeLayer = layers[activeLayerIndex];

	const hoveredLayer = useMemo(() => {
		if (!cursor) return null;
		const hit = pickLayerAtPoint(
			layers,
			activeLayerIndex,
			pixels,
			width,
			height,
			{ x: cursor.x + 0.5, y: cursor.y + 0.5 },
			cursor
		);
		return hit?.layer ?? null;
	}, [cursor, layers, activeLayerIndex, pixels, width, height]);

	return (
		<>
			<span className="shrink-0 text-xs text-[var(--pe-text-secondary)]">
				Active:{" "}
				<strong className="font-semibold text-[var(--pe-text)]">
					{activeLayer?.name ?? "Layer"}
				</strong>
			</span>
			{hoveredLayer && (
				<>
					<Divider />
					<span className="shrink-0 rounded bg-[var(--pe-accent-soft)] px-2 py-0.5 text-xs font-medium text-[var(--pe-accent-soft-ink)]">
						Hover: {hoveredLayer.name}
					</span>
				</>
			)}
			<Hint>Click any pixel on canvas to switch to its layer</Hint>
		</>
	);
};

const SelectionActions = (): FunctionComponent => {
	const selectAll = useEditorStore((state) => state.selectAll);
	const deselect = useEditorStore((state) => state.deselect);
	const invertSelection = useEditorStore((state) => state.invertSelection);
	const hasSelection = useEditorStore((state) => state.selection !== null);
	return (
		<>
			<Divider />
			<TextButton title="Ctrl+A" onClick={selectAll}>
				Select all
			</TextButton>
			<TextButton
				disabled={!hasSelection}
				title="Ctrl+D / Esc"
				onClick={deselect}
			>
				Deselect
			</TextButton>
			<TextButton title="Ctrl+Shift+I" onClick={invertSelection}>
				Invert
			</TextButton>
		</>
	);
};

const BlurOptions = (): FunctionComponent => {
	const strength = useEditorStore((state) => state.blurStrength);
	const setStrength = useEditorStore((state) => state.setBlurStrength);
	const radius = useEditorStore((state) => state.blurRadius);
	const setRadius = useEditorStore((state) => state.setBlurRadius);
	const preserveAlpha = useEditorStore((state) => state.blurPreserveAlpha);
	const togglePreserveAlpha = useEditorStore(
		(state) => state.toggleBlurPreserveAlpha
	);
	const snapPalette = useEditorStore((state) => state.blurSnapPalette);
	const toggleSnapPalette = useEditorStore(
		(state) => state.toggleBlurSnapPalette
	);
	const blurLayer = useEditorStore((state) => state.blurLayer);
	const hasSelection = useEditorStore((state) => state.selection !== null);
	return (
		<>
			<Divider />
			<NumberSlider
				label="Strength"
				max={100}
				min={5}
				suffix="%"
				value={strength}
				onChange={setStrength}
			/>
			<NumberSlider
				label="Radius"
				max={3}
				min={1}
				suffix="px"
				value={radius}
				width="w-14"
				onChange={setRadius}
			/>
			<Toggle
				checked={preserveAlpha}
				label="Keep transparency"
				onChange={togglePreserveAlpha}
			/>
			<Toggle
				checked={snapPalette}
				label="Snap to palette"
				onChange={toggleSnapPalette}
			/>
			<Divider />
			<TextButton
				title="Blur the whole active layer (or the selection) once"
				onClick={blurLayer}
			>
				{hasSelection ? "Blur selection" : "Blur layer"}
			</TextButton>
		</>
	);
};

const TextOptions = (): FunctionComponent => {
	const inputRef = useRef<HTMLInputElement>(null);
	const textValue = useEditorStore((state) => state.textValue);
	const setTextValue = useEditorStore((state) => state.setTextValue);
	const style = useEditorStore((state) => state.textStyle);
	const setStyle = useEditorStore((state) => state.setTextStyle);
	const draft = useEditorStore((state) => state.textDraft);
	const commitText = useEditorStore((state) => state.commitText);
	const cancelText = useEditorStore((state) => state.cancelText);
	const pixelFont = isPixelFont(style.font);

	const placed = draft !== null;
	useEffect(() => {
		if (!placed) return;
		const frame = window.requestAnimationFrame(() => {
			inputRef.current?.focus();
		});
		return (): void => {
			window.cancelAnimationFrame(frame);
		};
	}, [placed, draft]);

	return (
		<>
			<input
				ref={inputRef}
				aria-label="Text"
				className="h-7 w-44 shrink-0 rounded-md border border-[var(--pe-border)] bg-[var(--pe-bg-control)] px-2 text-xs text-[var(--pe-text)] outline-none placeholder:text-[var(--pe-text-muted)] focus:border-[var(--pe-accent)]"
				placeholder={placed ? "Type your text…" : "Click the canvas first"}
				value={textValue}
				onChange={(event) => {
					setTextValue(event.target.value);
				}}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						commitText();
					}
					if (event.key === "Escape") {
						event.preventDefault();
						cancelText();
						inputRef.current?.blur();
					}
				}}
			/>
			<select
				aria-label="Font"
				className={`${inputClass} h-7 shrink-0`}
				value={style.font}
				onChange={(event) => {
					setStyle({ font: event.target.value as TextFont });
				}}
			>
				{TEXT_FONTS.map((font) => (
					<option key={font.id} value={font.id}>
						{font.label}
					</option>
				))}
			</select>
			{pixelFont ? (
				<NumberSlider
					label="Scale"
					max={4}
					min={1}
					suffix="×"
					value={style.scale}
					width="w-16"
					onChange={(scale) => {
						setStyle({ scale });
					}}
				/>
			) : (
				<>
					<NumberSlider
						label="Size"
						max={48}
						min={6}
						suffix="px"
						value={style.size}
						onChange={(size) => {
							setStyle({ size });
						}}
					/>
					<Toggle
						checked={style.bold}
						label="Bold"
						onChange={() => {
							setStyle({ bold: !style.bold });
						}}
					/>
				</>
			)}
			<NumberSlider
				label="Spacing"
				max={4}
				min={0}
				suffix="px"
				value={style.spacing}
				width="w-14"
				onChange={(spacing) => {
					setStyle({ spacing });
				}}
			/>
			<Divider />
			<TextButton
				disabled={!placed || textValue === ""}
				title="Enter"
				variant="primary"
				onClick={commitText}
			>
				Apply
			</TextButton>
			<TextButton disabled={!placed} title="Esc" onClick={cancelText}>
				Cancel
			</TextButton>
			<Hint>Uses the left color · drag the box to move it</Hint>
		</>
	);
};

const DitherOptions = (): FunctionComponent => {
	const ditherPattern = useEditorStore((state) => state.ditherPattern);
	const setDitherPattern = useEditorStore((state) => state.setDitherPattern);
	const ditherDensity = useEditorStore((state) => state.ditherDensity);
	const setDitherDensity = useEditorStore((state) => state.setDitherDensity);
	const ditherTwoColor = useEditorStore((state) => state.ditherTwoColor);
	const toggleDitherTwoColor = useEditorStore(
		(state) => state.toggleDitherTwoColor
	);

	return (
		<>
			<Divider />
			<label className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--pe-text-secondary)]">
				Pattern
				<select
					className={`${inputClass} py-1`}
					value={ditherPattern}
					onChange={(event) => {
						setDitherPattern(event.target.value as DitherPattern);
					}}
				>
					{DITHER_PATTERNS.map((pattern) => (
						<option key={pattern.id} value={pattern.id}>
							{pattern.label}
						</option>
					))}
				</select>
			</label>
			<NumberSlider
				label="Density"
				max={100}
				min={5}
				suffix="%"
				value={ditherDensity}
				width="w-20"
				onChange={setDitherDensity}
			/>
			<Toggle
				checked={ditherTwoColor}
				label="2-color"
				onChange={toggleDitherTwoColor}
			/>
		</>
	);
};

const ReplaceOptions = (): FunctionComponent => {
	const replaceFromColor = useEditorStore((state) => state.replaceFromColor);
	const setReplaceFromColor = useEditorStore(
		(state) => state.setReplaceFromColor
	);
	const replaceTolerance = useEditorStore((state) => state.replaceTolerance);
	const setReplaceTolerance = useEditorStore(
		(state) => state.setReplaceTolerance
	);
	const replaceScope = useEditorStore((state) => state.replaceScope);
	const setReplaceScope = useEditorStore((state) => state.setReplaceScope);
	const primaryColor = useEditorStore((state) => state.primaryColor);
	const replaceColor = useEditorStore((state) => state.replaceColor);
	const hasSelection = useEditorStore((state) => state.selection !== null);

	return (
		<>
			<div className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--pe-text-secondary)]">
				<span>From</span>
				{replaceFromColor ? (
					<button
						className="flex items-center gap-1 rounded border border-[var(--pe-border)] bg-[var(--pe-bg-control)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--pe-text)] hover:border-[var(--pe-border-strong)]"
						title="Click to clear source color"
						type="button"
						onClick={() => {
							setReplaceFromColor(null);
						}}
					>
						<span
							className="swatch-preserve h-3 w-3 rounded-sm border border-[var(--pe-border-strong)]"
							style={{ background: replaceFromColor }}
						/>
						{replaceFromColor}
					</button>
				) : (
					<span className="rounded border border-dashed border-[var(--pe-border-strong)] px-1.5 py-0.5 text-[11px] text-[var(--pe-text-muted)]">
						Click canvas
					</span>
				)}
				<span>→</span>
				<span
					className="swatch-preserve h-4 w-4 rounded-sm border border-[var(--pe-border-strong)]"
					style={{ background: primaryColor }}
					title={`Replace with ${primaryColor}`}
				/>
			</div>
			<Divider />
			<NumberSlider
				label="Tolerance"
				max={100}
				min={0}
				value={replaceTolerance}
				width="w-20"
				onChange={setReplaceTolerance}
			/>
			<label className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--pe-text-secondary)]">
				Scope
				<select
					className={`${inputClass} py-1`}
					value={replaceScope}
					onChange={(event) => {
						setReplaceScope(event.target.value as ReplaceScope);
					}}
				>
					<option value="layer">Active layer</option>
					<option value="all-layers">All layers</option>
					<option value="all-frames">All frames</option>
				</select>
			</label>
			<TextButton
				disabled={!replaceFromColor}
				variant="primary"
				onClick={() => {
					if (replaceFromColor) {
						replaceColor(replaceFromColor, primaryColor);
					}
				}}
			>
				{hasSelection ? "Replace in selection" : "Replace all"}
			</TextButton>
			<Hint>Click canvas color to replace it</Hint>
		</>
	);
};

const ReferenceOptions = (): FunctionComponent => {
	const activeLayerIndex = useEditorStore((state) => state.activeLayer);
	const activeLayer = useEditorStore(
		(state) => state.layers[state.activeLayer]
	);
	const updateReferenceLayer = useEditorStore(
		(state) => state.updateReferenceLayer
	);
	const fitReferenceLayer = useEditorStore((state) => state.fitReferenceLayer);
	const setLayerOpacity = useEditorStore((state) => state.setLayerOpacity);

	if (
		!activeLayer ||
		activeLayer.kind !== "reference" ||
		!activeLayer.reference
	) {
		return null;
	}
	const reference = activeLayer.reference;
	const scalePercent = Math.round(
		(reference.width / Math.max(1, reference.naturalWidth)) * 100
	);

	return (
		<>
			<Divider />
			<span className="shrink-0 rounded bg-[var(--pe-warn-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--pe-warn-ink)]">
				Reference
			</span>
			<NumberSlider
				label="Opacity"
				max={100}
				min={10}
				suffix="%"
				value={activeLayer.opacity}
				width="w-16"
				onChange={(value) => {
					setLayerOpacity(activeLayerIndex, value);
				}}
			/>
			<NumberSlider
				label="Scale"
				max={200}
				min={2}
				suffix="%"
				value={scalePercent}
				width="w-20"
				onChange={(value) => {
					const ratio = value / 100;
					updateReferenceLayer(activeLayerIndex, {
						width: reference.naturalWidth * ratio,
						height: reference.naturalHeight * ratio,
					});
				}}
			/>
			<Toggle
				checked={reference.smooth}
				label="Smooth"
				onChange={() => {
					updateReferenceLayer(activeLayerIndex, { smooth: !reference.smooth });
				}}
			/>
			<TextButton
				onClick={() => {
					fitReferenceLayer(activeLayerIndex);
				}}
			>
				Fit
			</TextButton>
			<TextButton
				onClick={() => {
					void importReferenceImage(activeLayerIndex);
				}}
			>
				Replace image…
			</TextButton>
		</>
	);
};

export const ToolOptions = (): FunctionComponent => {
	const tool = useEditorStore((state) => state.tool);
	const activeLayer = useEditorStore(
		(state) => state.layers[state.activeLayer]
	);
	const shapeFilled = useEditorStore((state) => state.shapeFilled);
	const toggleShapeFilled = useEditorStore((state) => state.toggleShapeFilled);
	const fillContiguous = useEditorStore((state) => state.fillContiguous);
	const toggleFillContiguous = useEditorStore(
		(state) => state.toggleFillContiguous
	);
	const flip = useEditorStore((state) => state.flip);
	const label = TOOLS.find((info) => info.id === tool)?.label ?? "";

	let content: React.ReactNode = null;
	switch (tool) {
		case "pencil":
		case "eraser": {
			content = (
				<>
					<BrushOptions showPixelPerfect />
					<Hint>Shift+click: line from last point · Alt: pick color</Hint>
				</>
			);
			break;
		}
		case "custom-brush": {
			content = <CustomBrushOptionsBar />;
			break;
		}
		case "spray": {
			content = <SprayOptionsBar />;
			break;
		}
		case "dither": {
			content = (
				<>
					<BrushOptions showPixelPerfect={false} />
					<DitherOptions />
					<Hint>Left: primary · Right: swap · World-aligned pattern</Hint>
				</>
			);
			break;
		}
		case "line":
		case "rectangle":
		case "ellipse": {
			content = (
				<>
					<BrushOptions showPixelPerfect={false} />
					{tool !== "line" && (
						<Toggle
							checked={shapeFilled}
							label="Filled"
							onChange={toggleShapeFilled}
						/>
					)}
					<Hint>
						{tool === "line"
							? "Shift: snap angle"
							: "Shift: perfect square/circle"}
					</Hint>
				</>
			);
			break;
		}
		case "contour": {
			content = (
				<>
					<BrushOptions showPixelPerfect={false} />
					<Hint>Draw around a shape · it fills when you let go</Hint>
				</>
			);
			break;
		}
		case "blur": {
			content = (
				<>
					<BrushOptions showPixelPerfect={false} />
					<BlurOptions />
					<Hint>Each stroke blurs once · stroke again for more</Hint>
				</>
			);
			break;
		}
		case "text": {
			content = <TextOptions />;
			break;
		}
		case "fill": {
			content = (
				<>
					<Toggle
						checked={fillContiguous}
						label="Contiguous"
						onChange={toggleFillContiguous}
					/>
					<Hint>Off = replace that color everywhere</Hint>
				</>
			);
			break;
		}
		case "gradient": {
			content = <GradientOptionsBar />;
			break;
		}
		case "replace": {
			content = <ReplaceOptions />;
			break;
		}
		case "wand": {
			content = (
				<>
					<Toggle
						checked={fillContiguous}
						label="Contiguous"
						onChange={toggleFillContiguous}
					/>
					<Hint>Shift: add · Alt/Ctrl: subtract</Hint>
					<SelectionActions />
				</>
			);
			break;
		}
		case "select-rect":
		case "lasso": {
			content = (
				<>
					<Hint>Shift: add · Alt/Ctrl: subtract · Click: deselect</Hint>
					<SelectionActions />
				</>
			);
			break;
		}
		case "move": {
			content = (
				<>
					<Hint>Drag or use arrow keys (Shift = 8px) · Enter: apply</Hint>
					<Divider />
					<TextButton
						onClick={() => {
							flip("horizontal");
						}}
					>
						Flip H
					</TextButton>
					<TextButton
						onClick={() => {
							flip("vertical");
						}}
					>
						Flip V
					</TextButton>
				</>
			);
			break;
		}
		case "layer-picker": {
			content = <LayerPickerOptionsBar />;
			break;
		}
		case "eyedropper": {
			content = <Hint>Left click: primary · Right click: secondary</Hint>;
			break;
		}
		case "hand": {
			content = (
				<Hint>Drag to pan · Tip: hold Space or middle mouse with any tool</Hint>
			);
			break;
		}
	}

	return (
		<div className="editor-scrollbar flex h-10 shrink-0 items-center gap-2.5 overflow-x-auto border-b border-[var(--pe-border-subtle)] bg-[var(--pe-bg-panel-subtle)] px-3">
			<span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--pe-border)] bg-[var(--pe-bg-panel)] px-2 py-1 text-[11px] font-semibold text-[var(--pe-text)] shadow-2xs">
				<ToolIcon
					className="h-3.5 w-3.5 text-[var(--pe-accent)]"
					tool={tool}
				/>
				<span>{label}</span>
			</span>
			{content}
			{activeLayer?.kind === "reference" && <ReferenceOptions />}
		</div>
	);
};
