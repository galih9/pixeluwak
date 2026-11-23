import { useEffect, useMemo, useRef, useState } from "react";
import type { FunctionComponent } from "../../../common/types";
import { EXPORT_SCALES } from "../constants";
import { exportSpriteSheet } from "../lib/files";
import {
	computeSheetLayout,
	DEFAULT_SPRITE_SHEET_OPTIONS,
	MAX_SHEET_GRID,
	renderSheetPixels,
	scaledSheetSize,
	sheetProblem,
} from "../lib/spritesheet";
import { framePixels, useEditorStore } from "../store/editorStore";
import type { SpriteSheetLayoutMode, SpriteSheetOptions } from "../types";
import { Modal, TextButton, Toggle } from "./ui";

const LAYOUTS: Array<{
	id: SpriteSheetLayoutMode;
	label: string;
	hint: string;
}> = [
	{
		id: "columns",
		label: "Fixed columns",
		hint: "Pick the number of columns, rows follow from the frame count",
	},
	{
		id: "rows",
		label: "Fixed rows",
		hint: "Pick the number of rows, columns follow from the frame count",
	},
	{
		id: "tags",
		label: "By tags",
		hint: "One row per animation tag",
	},
	{
		id: "custom",
		label: "Custom grid",
		hint: "Pick both the number of columns and rows",
	},
];

const PREVIEW_BOX = 280;

const numberClass =
	"w-20 rounded-md border border-(--pe-border) bg-(--pe-bg-control) px-2 py-1 tabular-nums text-(--pe-text) outline-none focus:border-(--pe-accent)";

const toInt = (value: string, min: number, max: number): number =>
	Math.max(min, Math.min(max, Math.round(Number(value)) || min));

const NumberField = ({
	label,
	value,
	min,
	max,
	title,
	onChange,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	title?: string;
	onChange: (value: number) => void;
}): FunctionComponent => (
	<label className="flex items-center gap-2" title={title}>
		{label}
		<input
			className={numberClass}
			max={max}
			min={min}
			type="number"
			value={value}
			onChange={(event) => {
				onChange(toInt(event.target.value, min, max));
			}}
		/>
	</label>
);

export const SpriteSheetDialog = ({
	onClose,
}: {
	onClose: () => void;
}): FunctionComponent => {
	const width = useEditorStore((state) => state.width);
	const height = useEditorStore((state) => state.height);
	const name = useEditorStore((state) => state.name);
	const frames = useEditorStore((state) => state.frames);
	const tags = useEditorStore((state) => state.tags);
	const previewRef = useRef<HTMLCanvasElement>(null);
	const frameCount = frames.length;
	const [options, setOptions] = useState<SpriteSheetOptions>(() => ({
		...DEFAULT_SPRITE_SHEET_OPTIONS,
		layout: tags.length > 0 ? "tags" : "columns",
		columns: Math.min(8, frameCount),
		rows: Math.max(1, Math.ceil(frameCount / 8)),
		scale: width <= 32 ? 4 : 1,
	}));
	const [withJson, setWithJson] = useState(false);
	const [fileName, setFileName] = useState(name);

	const patch = (change: Partial<SpriteSheetOptions>): void => {
		setOptions((previous) => ({ ...previous, ...change }));
	};

	const layout = useMemo(
		() => computeSheetLayout(frameCount, tags, width, height, options),
		[frameCount, tags, width, height, options]
	);
	const problem = sheetProblem(layout, options.scale);
	const size = scaledSheetSize(layout, options.scale);
	const tagsLayoutWithoutTags = options.layout === "tags" && tags.length === 0;

	useEffect(() => {
		const canvas = previewRef.current;
		const context = canvas?.getContext("2d");
		if (!canvas || !context) return;
		if (layout.width * layout.height > 16_000_000) {
			canvas.width = 1;
			canvas.height = 1;
			return;
		}
		const state = useEditorStore.getState();
		const pixels = renderSheetPixels(layout, (frame) =>
			framePixels(state, frame)
		);
		canvas.width = layout.width;
		canvas.height = layout.height;
		context.putImageData(
			new ImageData(
				new Uint8ClampedArray(pixels.buffer),
				layout.width,
				layout.height
			),
			0,
			0
		);
	}, [layout]);

	const zoom = Math.max(
		1,
		Math.floor(
			Math.min(PREVIEW_BOX / layout.width, PREVIEW_BOX / layout.height)
		)
	);

	return (
		<Modal
			wide
			title="Export sprite sheet"
			footer={
				<>
					<TextButton onClick={onClose}>Cancel</TextButton>
					<TextButton
						disabled={problem !== null}
						variant="primary"
						onClick={() => {
							if (exportSpriteSheet(options, fileName, withJson)) onClose();
						}}
					>
						Download sprite sheet
					</TextButton>
				</>
			}
			onClose={onClose}
		>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto] md:gap-5">
				<div className="min-w-0 space-y-4">
					<div>
						<p className="mb-2 text-xs text-(--pe-text-muted)">Layout</p>
						<div className="flex flex-wrap gap-1.5">
							{LAYOUTS.map((entry) => (
								<TextButton
									key={entry.id}
									active={options.layout === entry.id}
									title={entry.hint}
									onClick={() => {
										patch({ layout: entry.id });
									}}
								>
									{entry.label}
								</TextButton>
							))}
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-3">
						{(options.layout === "columns" || options.layout === "custom") && (
							<NumberField
								label="Columns"
								max={options.layout === "columns" ? frameCount : MAX_SHEET_GRID}
								min={1}
								value={options.columns}
								onChange={(columns) => {
									patch({ columns });
								}}
							/>
						)}
						{(options.layout === "rows" || options.layout === "custom") && (
							<NumberField
								label="Rows"
								max={options.layout === "rows" ? frameCount : MAX_SHEET_GRID}
								min={1}
								value={options.rows}
								onChange={(rows) => {
									patch({ rows });
								}}
							/>
						)}
						{options.layout === "tags" && (
							<Toggle
								checked={options.includeUntagged}
								label="Add frames without a tag as a last row"
								onChange={() => {
									patch({ includeUntagged: !options.includeUntagged });
								}}
							/>
						)}
					</div>
					{tagsLayoutWithoutTags && (
						<p className="text-xs text-(--pe-warn-ink)">
							There are no tags yet (add them in the timeline), so all frames go
							in a single row.
						</p>
					)}

					<div className="flex flex-wrap items-center gap-3">
						<NumberField
							label="Padding"
							max={64}
							min={0}
							title="Empty pixels between frames"
							value={options.padding}
							onChange={(padding) => {
								patch({ padding });
							}}
						/>
						<NumberField
							label="Margin"
							max={64}
							min={0}
							title="Empty pixels around the whole sheet"
							value={options.margin}
							onChange={(margin) => {
								patch({ margin });
							}}
						/>
					</div>

					<div>
						<p className="mb-2 text-xs text-(--pe-text-muted)">
							Scale (nearest neighbour, stays crisp)
						</p>
						<div className="flex flex-wrap gap-1.5">
							{EXPORT_SCALES.map((option) => (
								<TextButton
									key={option}
									active={options.scale === option}
									onClick={() => {
										patch({ scale: option });
									}}
								>
									{option}×
								</TextButton>
							))}
						</div>
					</div>

					<label className="flex flex-wrap items-center gap-2">
						File name
						<input
							className="min-w-0 flex-1 rounded-md border border-(--pe-border) bg-(--pe-bg-control) px-2 py-1 text-(--pe-text) outline-none focus:border-(--pe-accent)"
							value={fileName}
							onChange={(event) => {
								setFileName(event.target.value);
							}}
						/>
					</label>
					<Toggle
						checked={withJson}
						label="Also download a JSON file with frame positions, durations and tags"
						onChange={() => {
							setWithJson(!withJson);
						}}
					/>
				</div>

				<div className="w-full space-y-2 md:w-75">
					<div className="preview-checker flex items-center justify-center overflow-auto rounded-lg border border-(--pe-border) p-1">
						<canvas
							ref={previewRef}
							style={{
								width: layout.width * zoom,
								height: layout.height * zoom,
								maxWidth: "100%",
								aspectRatio: `${layout.width} / ${layout.height}`,
								imageRendering: "pixelated",
							}}
						/>
					</div>
					<p className="text-[11px] text-(--pe-text-muted)">
						{layout.columns} × {layout.rows} cells of {width}×{height} ·{" "}
						{size.width}×{size.height}px
					</p>
					{options.layout === "tags" && layout.tagRows.length > 0 && (
						<ol className="space-y-0.5 text-[11px] text-(--pe-text-muted)">
							{layout.tagRows.map((entry) => (
								<li key={entry.row}>
									Row {entry.row + 1}: {entry.name}
								</li>
							))}
						</ol>
					)}
					{layout.skipped > 0 && (
						<p className="text-[11px] text-(--pe-warn-ink)">
							{layout.skipped} frame{layout.skipped === 1 ? "" : "s"} do not fit
							in a {layout.columns}×{layout.rows} grid and will be left out.
						</p>
					)}
					{problem && (
						<p className="text-[11px] text-(--pe-danger)">{problem}</p>
					)}
				</div>
			</div>
		</Modal>
	);
};
