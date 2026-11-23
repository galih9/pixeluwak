import { useEffect, useMemo, useRef, useState } from "react";
import type { FunctionComponent } from "../../../common/types";
import { hexToPacked } from "../lib/color";
import {
	computeOutline,
	countOpaque,
	DEFAULT_OUTLINE,
	type OutlineCorners,
	type OutlineOptions,
	overlayPixels,
} from "../lib/filters";
import {
	compositeView,
	useEditorStore,
	visiblePixels,
} from "../store/editorStore";
import { Modal, TextButton, Toggle } from "./ui";

type DialogOptions = Omit<OutlineOptions, "color"> & {
	colorHex: string;
	toNewLayer: boolean;
};

// Remember the last settings while the app is open.
let lastOptions: DialogOptions | null = null;

const PREVIEW_BOX = 232;

const Segmented = <T extends string>({
	value,
	options,
	onChange,
}: {
	value: T;
	options: Array<{ id: T; label: string; title: string }>;
	onChange: (value: T) => void;
}): FunctionComponent => (
	<div className="flex gap-1">
		{options.map((option) => (
			<TextButton
				key={option.id}
				active={value === option.id}
				title={option.title}
				onClick={() => {
					onChange(option.id);
				}}
			>
				{option.label}
			</TextButton>
		))}
	</div>
);

const Slider = ({
	label,
	value,
	min,
	max,
	suffix = "",
	hint,
	onChange,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	suffix?: string;
	hint?: string;
	onChange: (value: number) => void;
}): FunctionComponent => (
	<label className="block text-xs text-(--pe-text-muted)" title={hint}>
		<span className="flex justify-between">
			{label}
			<span className="tabular-nums text-(--pe-text)">
				{value}
				{suffix}
			</span>
		</span>
		<input
			className="mt-1 w-full accent-(--pe-accent)"
			max={max}
			min={min}
			type="range"
			value={value}
			onChange={(event) => {
				onChange(Number(event.target.value));
			}}
		/>
	</label>
);

const Heading = ({ children }: { children: string }): FunctionComponent => (
	<p className="mt-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-(--pe-text-muted) first:mt-0">
		{children}
	</p>
);

export const OutlineDialog = ({
	onClose,
}: {
	onClose: () => void;
}): FunctionComponent => {
	const palette = useEditorStore((state) => state.palette);
	const width = useEditorStore((state) => state.width);
	const height = useEditorStore((state) => state.height);
	const hasSelection = useEditorStore((state) => state.selection !== null);
	const layerName = useEditorStore(
		(state) => state.layers[state.activeLayer]?.name ?? "layer"
	);
	const applyOutline = useEditorStore((state) => state.applyOutline);
	const canvasRef = useRef<HTMLCanvasElement>(null);

	const [options, setOptions] = useState<DialogOptions>(
		() =>
			lastOptions ?? {
				...DEFAULT_OUTLINE,
				colorHex: "#000000",
				toNewLayer: true,
			}
	);
	const update = (patch: Partial<DialogOptions>): void => {
		setOptions((current) => ({ ...current, ...patch }));
	};

	const outlineOptions = useMemo<OutlineOptions>(
		() => ({ ...options, color: hexToPacked(options.colorHex) }),
		[options]
	);

	// Live preview of the whole image with the outline applied.
	const { preview, outlineCount } = useMemo(() => {
		const state = useEditorStore.getState();
		const active = visiblePixels(state);
		const outline = computeOutline(
			active,
			state.width,
			state.height,
			state.selection,
			outlineOptions
		);
		return {
			preview: compositeView(state, overlayPixels(active, outline)),
			outlineCount: countOpaque(outline),
		};
	}, [outlineOptions]);

	useEffect(() => {
		const canvas = canvasRef.current;
		const context = canvas?.getContext("2d");
		if (!canvas || !context || preview.length !== width * height) return;
		canvas.width = width;
		canvas.height = height;
		context.putImageData(
			new ImageData(
				new Uint8ClampedArray(preview.buffer.slice(0)),
				width,
				height
			),
			0,
			0
		);
	}, [preview, width, height]);

	const scale = Math.max(1, Math.floor(PREVIEW_BOX / Math.max(width, height)));

	return (
		<Modal
			wide
			title="Auto outline"
			footer={
				<>
					<TextButton onClick={onClose}>Cancel</TextButton>
					<TextButton
						disabled={outlineCount === 0}
						variant="primary"
						onClick={() => {
							lastOptions = options;
							applyOutline(outlineOptions, options.toNewLayer);
							onClose();
						}}
					>
						Apply outline
					</TextButton>
				</>
			}
			onClose={onClose}
		>
			<div className="flex gap-5">
				<div className="w-56 shrink-0">
					<Heading>Boldness</Heading>
					<Slider
						hint="How many pixels wide the outline is"
						label="Thickness"
						max={4}
						min={1}
						suffix="px"
						value={options.thickness}
						onChange={(thickness) => {
							update({ thickness });
						}}
					/>
					<p className="mt-2 mb-1 text-xs text-(--pe-text-muted)">Corners</p>
					<Segmented<OutlineCorners>
						value={options.corners}
						options={[
							{
								id: "cut",
								label: "Clean",
								title:
									"No diagonal corner pixels (the classic pixel-art outline)",
							},
							{
								id: "sharp",
								label: "Square",
								title: "Includes diagonal corners, fully closed",
							},
							{
								id: "round",
								label: "Round",
								title: "Rounded corners on thick outlines",
							},
						]}
						onChange={(corners) => {
							update({ corners });
						}}
					/>
					<p className="mt-2 mb-1 text-xs text-(--pe-text-muted)">Placement</p>
					<Segmented<"outside" | "inside">
						value={options.placement}
						options={[
							{
								id: "outside",
								label: "Outside",
								title: "Grow the outline around the shape",
							},
							{
								id: "inside",
								label: "Inside",
								title: "Recolor the shape's own edge pixels (keeps its size)",
							},
						]}
						onChange={(placement) => {
							update({ placement });
						}}
					/>

					<Heading>Color</Heading>
					<Segmented<"solid" | "shade">
						value={options.colorMode}
						options={[
							{
								id: "solid",
								label: "Solid",
								title: "One color for the outline",
							},
							{
								id: "shade",
								label: "Auto shade",
								title:
									"Darker version of the neighbouring colors (selective outline)",
							},
						]}
						onChange={(colorMode) => {
							update({ colorMode });
						}}
					/>
					{options.colorMode === "solid" ? (
						<div className="mt-2 flex flex-wrap items-center gap-1">
							<input
								aria-label="Outline color"
								className="h-6 w-8 cursor-pointer rounded border border-(--pe-border) bg-transparent"
								type="color"
								value={options.colorHex}
								onChange={(event) => {
									update({ colorHex: event.target.value });
								}}
							/>
							{palette.slice(0, 16).map((swatch) => (
								<button
									key={swatch}
									aria-label={`Use ${swatch}`}
									style={{ background: swatch }}
									type="button"
									className={`swatch-preserve h-4 w-4 rounded-sm border ${
										swatch === options.colorHex
											? "border-white ring-2 ring-(--pe-accent)"
											: "border-(--pe-border)"
									}`}
									onClick={() => {
										update({ colorHex: swatch });
									}}
								/>
							))}
						</div>
					) : (
						<div className="mt-2">
							<Slider
								label="Darkness"
								max={90}
								min={10}
								suffix="%"
								value={options.shade}
								onChange={(shade) => {
									update({ shade });
								}}
							/>
						</div>
					)}

					<Heading>Accuracy</Heading>
					<Toggle
						checked={options.holes}
						label="Outline holes inside the shape"
						onChange={() => {
							update({ holes: !options.holes });
						}}
					/>
					<div className="mt-2 space-y-2">
						<Slider
							hint="Pixels at least this opaque count as part of the shape"
							label="Solid when opacity ≥"
							max={100}
							min={1}
							suffix="%"
							value={Math.round((options.alphaThreshold / 255) * 100)}
							onChange={(percent) => {
								update({ alphaThreshold: Math.round((percent / 100) * 255) });
							}}
						/>
						<Slider
							hint="Stray dots this small or smaller are not outlined"
							label="Ignore specks up to"
							max={16}
							min={0}
							suffix="px"
							value={options.ignoreSpecks}
							onChange={(ignoreSpecks) => {
								update({ ignoreSpecks });
							}}
						/>
					</div>
				</div>

				<div className="flex min-w-0 flex-1 flex-col">
					<Heading>Preview</Heading>
					<div className="preview-checker flex flex-1 items-center justify-center rounded-lg border border-(--pe-border) p-2">
						<canvas
							ref={canvasRef}
							style={{
								width: width * scale,
								height: height * scale,
								imageRendering: "pixelated",
							}}
						/>
					</div>
					<p className="mt-1.5 text-[11px] text-(--pe-text-muted)">
						{outlineCount === 0
							? `Nothing to outline on “${layerName}”`
							: `${outlineCount} outline pixels on “${layerName}”${
									hasSelection ? " · selected area only" : ""
								}`}
					</p>
					<div className="mt-3">
						<Toggle
							checked={options.toNewLayer}
							label="Put the outline on its own layer"
							onChange={() => {
								update({ toNewLayer: !options.toNewLayer });
							}}
						/>
					</div>
				</div>
			</div>
		</Modal>
	);
};
