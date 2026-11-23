import { useCallback, useEffect, useRef, useState } from "react";
import type { FunctionComponent } from "../../../common/types";
import { subscribeFrames } from "../lib/liveView";
import {
	computeTileMapLayout,
	fitTileMapScale,
	TILEMAP_SIZES,
} from "../lib/tilemap";
import { drawTileMap } from "../lib/tilemapRender";
import { useEditorStore } from "../store/editorStore";
import { useTilemapStore } from "../store/tilemapStore";
import type { HexOrientation, TileMapPattern, TileMapType } from "../types";
import { Modal, PanelCard, TextButton, Toggle } from "./ui";

const MAP_TYPES: Array<{ id: TileMapType; label: string; hint: string }> = [
	{
		id: "top-down",
		label: "Top-down",
		hint: "Square tiles on a flat grid. Use it to check seams between neighbours.",
	},
	{
		id: "isometric",
		label: "Isometric",
		hint: "Diamond tiles. The flat ground diamond sits at the bottom of the tile image.",
	},
	{
		id: "hexagonal",
		label: "Hexagonal",
		hint: "Hex tiles that fill the tile image, with every other column or row shifted.",
	},
];

const PATTERNS: Array<{ id: TileMapPattern; label: string; hint: string }> = [
	{ id: "repeat", label: "Repeat", hint: "The same tile in every cell" },
	{
		id: "mirror",
		label: "Mirror",
		hint: "Every other cell is flipped so touching edges mirror each other",
	},
	{
		id: "rotate",
		label: "Rotate",
		hint: "Cells rotate in steps of 90° to test how corners meet",
	},
];

const selectClass =
	"rounded-md border border-(--pe-border) bg-(--pe-bg-control) px-1.5 py-1 text-xs text-(--pe-text) outline-none focus:border-(--pe-accent)";

/**
 * Live preview of the canvas used as a tile in a tilemap. `box` is the area
 * (in CSS pixels) the map is zoomed to fit.
 */
const TilemapPreview = ({
	boxWidth,
	boxHeight,
}: {
	boxWidth: number;
	boxHeight: number;
}): FunctionComponent => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const width = useEditorStore((state) => state.width);
	const height = useEditorStore((state) => state.height);
	const type = useTilemapStore((state) => state.type);
	const size = useTilemapStore((state) => state.size);
	const pattern = useTilemapStore((state) => state.pattern);
	const hexOrientation = useTilemapStore((state) => state.hexOrientation);
	const isoGroundHeight = useTilemapStore((state) => state.isoGroundHeight);
	const showGrid = useTilemapStore((state) => state.showGrid);
	const setType = useTilemapStore((state) => state.setType);
	const setSize = useTilemapStore((state) => state.setSize);
	const setPattern = useTilemapStore((state) => state.setPattern);
	const setHexOrientation = useTilemapStore((state) => state.setHexOrientation);
	const setIsoGroundHeight = useTilemapStore(
		(state) => state.setIsoGroundHeight
	);
	const setShowGrid = useTilemapStore((state) => state.setShowGrid);
	const [mapSize, setMapSize] = useState({ width: 0, height: 0, scale: 1 });
	const square = width === height;
	const typeInfo = MAP_TYPES.find((entry) => entry.id === type);

	const draw = useCallback(
		(source: HTMLCanvasElement): void => {
			const canvas = canvasRef.current;
			if (!canvas) return;
			const config = {
				type,
				columns: size,
				rows: size,
				pattern,
				hexOrientation,
				isoGroundHeight,
			};
			const layout = computeTileMapLayout({
				...config,
				tileWidth: source.width,
				tileHeight: source.height,
			});
			const scale = fitTileMapScale(layout, boxWidth, boxHeight);
			drawTileMap(canvas, source, config, { scale, showGrid });
			setMapSize((previous) =>
				previous.width === layout.width &&
				previous.height === layout.height &&
				previous.scale === scale
					? previous
					: { width: layout.width, height: layout.height, scale }
			);
		},
		[
			type,
			size,
			pattern,
			hexOrientation,
			isoGroundHeight,
			showGrid,
			boxWidth,
			boxHeight,
		]
	);

	// Re-draws on every stroke and whenever a setting changes.
	useEffect(() => subscribeFrames(draw), [draw, width, height]);

	return (
		<div className="space-y-2 text-xs text-(--pe-text-secondary)">
			<div className="flex flex-wrap gap-1.5">
				{MAP_TYPES.map((entry) => (
					<TextButton
						key={entry.id}
						active={type === entry.id}
						title={entry.hint}
						onClick={() => {
							setType(entry.id);
						}}
					>
						{entry.label}
					</TextButton>
				))}
			</div>

			<div className="flex flex-wrap items-center gap-1.5">
				<span className="text-(--pe-text-muted)">Map</span>
				{TILEMAP_SIZES.map((option) => (
					<TextButton
						key={option}
						active={size === option}
						title={`${option}×${option} tiles`}
						onClick={() => {
							setSize(option);
						}}
					>
						{option}×{option}
					</TextButton>
				))}
			</div>

			{type === "top-down" && (
				<div className="flex flex-wrap items-center gap-1.5">
					<span className="text-(--pe-text-muted)">Cells</span>
					{PATTERNS.map((entry) => (
						<TextButton
							key={entry.id}
							active={pattern === entry.id}
							title={entry.hint}
							onClick={() => {
								setPattern(entry.id);
							}}
						>
							{entry.label}
						</TextButton>
					))}
				</div>
			)}

			{type === "isometric" && (
				<label className="flex items-center gap-2">
					<span className="text-(--pe-text-muted)">Ground height</span>
					<input
						className="w-16 rounded-md border border-(--pe-border) bg-(--pe-bg-control) px-2 py-1 tabular-nums text-(--pe-text) outline-none focus:border-(--pe-accent)"
						max={height}
						min={1}
						placeholder={String(Math.floor(width / 2))}
						title="Height of the ground diamond in pixels. Empty = half the tile width (2:1)."
						type="number"
						value={isoGroundHeight ?? ""}
						onChange={(event) => {
							const value = Math.round(Number(event.target.value));
							setIsoGroundHeight(
								event.target.value === "" || !(value >= 1) ? null : value
							);
						}}
					/>
					<span className="text-(--pe-text-muted)">px</span>
				</label>
			)}

			{type === "hexagonal" && (
				<label className="flex items-center gap-2">
					<span className="text-(--pe-text-muted)">Orientation</span>
					<select
						className={selectClass}
						value={hexOrientation}
						onChange={(event) => {
							setHexOrientation(event.target.value as HexOrientation);
						}}
					>
						<option value="flat">Flat-top</option>
						<option value="pointy">Pointy-top</option>
					</select>
				</label>
			)}

			<Toggle
				checked={showGrid}
				label="Show tile outlines"
				onChange={() => {
					setShowGrid(!showGrid);
				}}
			/>

			<div className="editor-scrollbar max-h-[70vh] overflow-auto">
				<div
					className="preview-checker inline-block rounded-lg border border-(--pe-border)"
					style={{ minWidth: 24, minHeight: 24 }}
				>
					<canvas
						ref={canvasRef}
						className="block"
						style={{
							width: mapSize.width * mapSize.scale || undefined,
							height: mapSize.height * mapSize.scale || undefined,
							imageRendering: "pixelated",
						}}
					/>
				</div>
			</div>

			<p className="text-[11px] text-(--pe-text-muted)">
				{width}×{height}px tile · map {mapSize.width}×{mapSize.height}px at{" "}
				{mapSize.scale}×
				{type === "top-down" && pattern === "rotate" && !square
					? " · non-square tiles only turn 180°"
					: ""}
			</p>
			{typeInfo && (
				<p className="text-[11px] text-(--pe-text-muted)">{typeInfo.hint}</p>
			)}
		</div>
	);
};

/** Sidebar tilemap preview card. */
export const TilemapPanel = (): FunctionComponent => {
	const openDialog = useEditorStore((state) => state.openDialog);

	return (
		<PanelCard
			collapsible
			title="Tilemap"
			actions={
				<TextButton
					title="Open a bigger tilemap preview (Shift+T)"
					onClick={() => {
						openDialog("tilemap");
					}}
				>
					Large view
				</TextButton>
			}
		>
			<TilemapPreview boxHeight={224} boxWidth={224} />
		</PanelCard>
	);
};

export const TilemapDialog = ({
	onClose,
}: {
	onClose: () => void;
}): FunctionComponent => (
	<Modal
		wide
		footer={<TextButton onClick={onClose}>Close</TextButton>}
		title="Tilemap preview"
		onClose={onClose}
	>
		<TilemapPreview boxHeight={380} boxWidth={620} />
	</Modal>
);
