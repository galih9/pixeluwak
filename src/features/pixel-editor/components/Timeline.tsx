import {
	ArrowDownOnSquareStackIcon,
	BackwardIcon,
	ChevronDownIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	ChevronUpIcon,
	ClipboardDocumentIcon,
	DocumentDuplicateIcon,
	EyeIcon,
	EyeSlashIcon,
	FilmIcon,
	ForwardIcon,
	LinkIcon,
	LockClosedIcon,
	LockOpenIcon,
	PauseIcon,
	PhotoIcon,
	PlayIcon,
	PlusIcon,
	Square2StackIcon,
	Square3Stack3DIcon,
	TagIcon,
	TrashIcon,
} from "@heroicons/react/20/solid";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FunctionComponent } from "../../../common/types";
import { MAX_FRAMES, MAX_LAYERS } from "../constants";
import {
	compositeFrame,
	isEmptyCel,
	sequenceDuration,
	sequenceFor,
	TAG_COLORS,
	tagsAt,
} from "../lib/animation";
import { importReferenceImage } from "../lib/files";
import { subscribeFrames } from "../lib/liveView";
import { useEditorStore } from "../store/editorStore";
import { useUiSettingsStore } from "../store/uiSettingsStore";
import type { FrameTag, PixelBuffer, TagDirection } from "../types";
import { Divider, IconButton, Modal, TextButton } from "./ui";

const COLUMN = 34;
const FRAME_CARD_COLUMN = 58;
const THUMB = 26;
const FRAME_CARD_THUMB = 36;
const ROW = 26;
const NAMES = 236;
const TAG_LANE = 16;

const getState = useEditorStore.getState;

type Range = { from: number; to: number };

/* -------------------------------------------------------------------------- */
/*                                  Playback                                  */
/* -------------------------------------------------------------------------- */

/** Steps through frames while `playing` is on, honouring tag direction. */
function usePlayback(): void {
	const playing = useEditorStore((state) => state.playing);
	const playTag = useEditorStore((state) => state.playTag);
	const frameCount = useEditorStore((state) => state.frames.length);
	const tags = useEditorStore((state) => state.tags);

	useEffect(() => {
		if (!playing) return;
		const tag = tags.find((candidate) => candidate.id === playTag) ?? null;
		const sequence = sequenceFor(tag, frameCount);
		if (sequence.length < 2) {
			getState().showNotice("The loop needs at least 2 frames to play");
			getState().setPlaying(false);
			return;
		}
		let position = sequence.indexOf(getState().currentFrame);
		if (position < 0) {
			position = 0;
			getState().setCurrentFrame(sequence[0] ?? 0);
		}
		let timer = 0;
		const schedule = (): void => {
			const state = getState();
			const duration = state.frames[state.currentFrame]?.duration ?? 100;
			timer = window.setTimeout(() => {
				position = (position + 1) % sequence.length;
				getState().setCurrentFrame(sequence[position] ?? 0);
				schedule();
			}, duration);
		};
		schedule();
		return (): void => {
			window.clearTimeout(timer);
		};
	}, [playing, playTag, frameCount, tags]);
}

/* -------------------------------------------------------------------------- */
/*                                 Thumbnails                                 */
/* -------------------------------------------------------------------------- */

/** Changes only when a layer's id / visibility / opacity changes. */
const layerPropsKey = (state: ReturnType<typeof getState>): string =>
	state.layers
		.map((layer) => `${layer.id}:${layer.visible ? 1 : 0}:${layer.opacity}`)
		.join(",");

const FrameThumb = ({
	index,
	size = THUMB,
}: {
	index: number;
	size?: number;
}): FunctionComponent => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const width = useEditorStore((state) => state.width);
	const height = useEditorStore((state) => state.height);
	const isCurrent = useEditorStore((state) => state.currentFrame === index);
	const frame = useEditorStore((state) => state.frames[index]);
	const layersKey = useEditorStore(layerPropsKey);

	useEffect(() => {
		const canvas = canvasRef.current;
		const context = canvas?.getContext("2d");
		if (!canvas || !context) return;
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}
		if (isCurrent) {
			// The frame being edited mirrors the canvas, strokes included.
			return subscribeFrames((source) => {
				context.clearRect(0, 0, width, height);
				context.drawImage(source, 0, 0);
			});
		}
		const pixels: PixelBuffer = compositeFrame(
			getState().layers,
			frame,
			width * height
		);
		context.putImageData(
			new ImageData(new Uint8ClampedArray(pixels.buffer), width, height),
			0,
			0
		);
		return undefined;
	}, [isCurrent, frame, layersKey, width, height]);

	const scale = size / Math.max(width, height);
	return (
		<div
			className="preview-checker flex items-center justify-center overflow-hidden rounded-sm border border-(--pe-border)"
			style={{ width: size, height: size }}
		>
			<canvas
				ref={canvasRef}
				style={{
					width: width * scale,
					height: height * scale,
					imageRendering: "pixelated",
				}}
			/>
		</div>
	);
};

/* -------------------------------------------------------------------------- */
/*                                 Tag editor                                 */
/* -------------------------------------------------------------------------- */

const DIRECTIONS: Array<[TagDirection, string]> = [
	["forward", "Forward →"],
	["reverse", "Reverse ←"],
	["pingpong", "Ping-pong ↔"],
];

const TagDialog = ({
	tag,
	onClose,
}: {
	tag: FrameTag;
	onClose: () => void;
}): FunctionComponent => {
	const frameCount = useEditorStore((state) => state.frames.length);
	const updateTag = useEditorStore((state) => state.updateTag);
	const deleteTag = useEditorStore((state) => state.deleteTag);
	const [name, setName] = useState(tag.name);
	const [from, setFrom] = useState(String(tag.from + 1));
	const [to, setTo] = useState(String(tag.to + 1));
	const [color, setColor] = useState(tag.color);
	const [direction, setDirection] = useState(tag.direction);

	const save = (): void => {
		updateTag(tag.id, {
			name,
			from: (Number(from) || 1) - 1,
			to: (Number(to) || 1) - 1,
			color,
			direction,
		});
		onClose();
	};
	const inputClass =
		"rounded-md border border-(--pe-border) bg-(--pe-bg-control) px-2 py-1 text-(--pe-text) outline-none focus:border-(--pe-accent)";

	return (
		<Modal
			title="Tag"
			footer={
				<>
					<TextButton
						variant="danger"
						onClick={() => {
							deleteTag(tag.id);
							onClose();
						}}
					>
						Delete tag
					</TextButton>
					<span className="flex-1" />
					<TextButton onClick={onClose}>Cancel</TextButton>
					<TextButton variant="primary" onClick={save}>
						Save
					</TextButton>
				</>
			}
			onClose={onClose}
		>
			<div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-3">
				<span className="text-xs text-(--pe-text-muted)">Name</span>
				<input
					autoFocus
					className={inputClass}
					value={name}
					onChange={(event) => {
						setName(event.target.value);
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter") save();
					}}
				/>
				<span className="text-xs text-(--pe-text-muted)">Frames</span>
				<div className="flex items-center gap-2">
					<input
						aria-label="First frame"
						className={`${inputClass} w-20`}
						max={frameCount}
						min={1}
						type="number"
						value={from}
						onChange={(event) => {
							setFrom(event.target.value);
						}}
					/>
					<span className="text-(--pe-text-muted)">to</span>
					<input
						aria-label="Last frame"
						className={`${inputClass} w-20`}
						max={frameCount}
						min={1}
						type="number"
						value={to}
						onChange={(event) => {
							setTo(event.target.value);
						}}
					/>
					<span className="text-xs text-(--pe-text-muted)">
						of {frameCount}
					</span>
				</div>
				<span className="text-xs text-(--pe-text-muted)">Direction</span>
				<div className="flex gap-1.5">
					{DIRECTIONS.map(([value, label]) => (
						<TextButton
							key={value}
							active={direction === value}
							onClick={() => {
								setDirection(value);
							}}
						>
							{label}
						</TextButton>
					))}
				</div>
				<span className="text-xs text-(--pe-text-muted)">Color</span>
				<div className="flex items-center gap-1.5">
					{TAG_COLORS.map((swatch) => (
						<button
							key={swatch}
							aria-label={`Tag color ${swatch}`}
							style={{ backgroundColor: swatch }}
							type="button"
							className={`swatch-preserve h-5 w-5 rounded ${
								swatch === color ? "ring-2 ring-(--pe-text)" : ""
							}`}
							onClick={() => {
								setColor(swatch);
							}}
						/>
					))}
					<input
						aria-label="Custom tag color"
						className="h-6 w-8 cursor-pointer rounded border border-(--pe-border) bg-transparent"
						type="color"
						value={color}
						onChange={(event) => {
							setColor(event.target.value);
						}}
					/>
				</div>
			</div>
		</Modal>
	);
};

/* -------------------------------------------------------------------------- */
/*                                  Tag lane                                  */
/* -------------------------------------------------------------------------- */

/** Stacks overlapping tags into lanes. */
function laneTags(tags: Array<FrameTag>): Array<Array<FrameTag>> {
	const lanes: Array<Array<FrameTag>> = [];
	const sorted = [...tags].sort((a, b) => a.from - b.from || b.to - a.to);
	for (const tag of sorted) {
		const lane = lanes.find((candidate) =>
			candidate.every((other) => tag.from > other.to || tag.to < other.from)
		);
		if (lane) lane.push(tag);
		else lanes.push([tag]);
	}
	return lanes;
}

const TagLanes = ({
	columnWidth,
	onSelectRange,
	onEdit,
}: {
	columnWidth: number;
	onSelectRange: (range: Range) => void;
	onEdit: (tag: FrameTag) => void;
}): FunctionComponent => {
	const tags = useEditorStore((state) => state.tags);
	const playTag = useEditorStore((state) => state.playTag);
	const lanes = useMemo(() => laneTags(tags), [tags]);

	if (lanes.length === 0) {
		return (
			<div
				className="flex items-center whitespace-nowrap px-1.5 text-[10px] text-(--pe-text-muted)"
				style={{ height: TAG_LANE }}
			>
				Shift+click frames, then press <TagIcon className="mx-1 h-3 w-3" />
				to tag an animation
			</div>
		);
	}
	return (
		<div className="flex flex-col gap-px">
			{lanes.map((lane, laneIndex) => (
				<div key={laneIndex} className="relative" style={{ height: TAG_LANE }}>
					{lane.map((tag) => (
						<button
							key={tag.id}
							title={`${tag.name} · frames ${tag.from + 1}–${tag.to + 1} · click to select, double-click to edit`}
							type="button"
							className={`swatch-preserve absolute top-0 flex h-full items-center gap-1 overflow-hidden whitespace-nowrap rounded-sm px-1.5 text-left text-[10px] font-semibold text-zinc-950 ${
								playTag === tag.id ? "ring-1 ring-white" : ""
							}`}
							style={{
								left: tag.from * columnWidth + 1,
								width: (tag.to - tag.from + 1) * columnWidth - 2,
								backgroundColor: tag.color,
							}}
							onClick={() => {
								onSelectRange({ from: tag.from, to: tag.to });
								getState().setCurrentFrame(tag.from);
							}}
							onDoubleClick={() => {
								onEdit(tag);
							}}
						>
							{tag.direction === "reverse" && "←"}
							{tag.direction === "pingpong" && "↔"}
							<span className="truncate">{tag.name}</span>
						</button>
					))}
				</div>
			))}
		</div>
	);
};

/* -------------------------------------------------------------------------- */
/*                                 Frame grid                                 */
/* -------------------------------------------------------------------------- */

const CelCell = ({
	layerIndex,
	frameIndex,
	inRange,
	onSelect,
}: {
	layerIndex: number;
	frameIndex: number;
	inRange: boolean;
	onSelect: (layerIndex: number, frameIndex: number, shift: boolean) => void;
}): FunctionComponent => {
	const layer = useEditorStore((state) => state.layers[layerIndex]);
	const isReference = layer?.kind === "reference";
	const empty = useEditorStore((state) => {
		if (!layer || layer.kind === "reference") return true;
		if (frameIndex === state.currentFrame) {
			return isEmptyCel(
				layerIndex === state.activeLayer ? state.pixels : layer.pixels
			);
		}
		return isEmptyCel(state.frames[frameIndex]?.cels[layer.id]);
	});
	const linkState = useEditorStore((state) => {
		if (!layer || layer.kind === "reference") return "none";
		const currentGroup = state.frames[frameIndex]?.linked?.[layer.id];
		if (!currentGroup) return "none";
		const hasPrevious =
			state.frames[frameIndex - 1]?.linked?.[layer.id] === currentGroup;
		const hasNext =
			state.frames[frameIndex + 1]?.linked?.[layer.id] === currentGroup;
		if (hasPrevious && hasNext) return "middle";
		if (hasPrevious) return "end";
		if (hasNext) return "start";
		return "solo";
	});
	const isActive = useEditorStore(
		(state) =>
			state.currentFrame === frameIndex && state.activeLayer === layerIndex
	);

	return (
		<button
			aria-label={`Layer ${layerIndex + 1}, frame ${frameIndex + 1}`}
			style={{ width: COLUMN, height: ROW }}
			type="button"
			className={`relative flex shrink-0 items-center justify-center border-r border-(--pe-border-subtle) ${
				isActive
					? "bg-(--pe-accent-soft)"
					: inRange && isActive === false
						? "bg-(--pe-accent-soft)/50 hover:bg-(--pe-accent-soft)"
						: isReference
							? "bg-(--pe-warn-soft)/50 hover:bg-(--pe-warn-soft)"
							: "hover:bg-(--pe-bg-control-hover)"
			}`}
			title={
				isReference
					? "Reference layer spans every frame"
					: linkState !== "none"
						? "Linked cel (edits apply across linked frames)"
						: "Click to select · Shift+click range to link cels"
			}
			onClick={(event) => {
				onSelect(layerIndex, frameIndex, event.shiftKey);
			}}
		>
			{isReference ? (
				<>
					<span className="pointer-events-none absolute inset-x-0 h-0.5 bg-(--pe-warn-ink)/35" />
					<span className="relative h-1.5 w-1.5 rounded-full bg-(--pe-warn-ink)" />
				</>
			) : (
				<>
					{(linkState === "middle" || linkState === "end") && (
						<span className="pointer-events-none absolute right-1/2 left-0 h-0.5 bg-(--pe-accent)" />
					)}
					{(linkState === "middle" || linkState === "start") && (
						<span className="pointer-events-none absolute right-0 left-1/2 h-0.5 bg-(--pe-accent)" />
					)}
					<span
						className={`relative h-2.5 w-2.5 rounded-full ${
							linkState !== "none"
								? empty
									? "border-2 border-(--pe-accent) bg-(--pe-bg-panel)"
									: "border border-(--pe-accent-ink) bg-(--pe-accent)"
								: empty
									? "border border-(--pe-border-strong)"
									: "bg-(--pe-text-secondary)"
						}`}
					/>
				</>
			)}
		</button>
	);
};

const LayerRowHeader = ({
	layerIndex,
	onDropLayer,
}: {
	layerIndex: number;
	onDropLayer: (fromIndex: number, toIndex: number) => void;
}): FunctionComponent => {
	const layer = useEditorStore((state) => state.layers[layerIndex]);
	const isActive = useEditorStore((state) => state.activeLayer === layerIndex);
	const setActiveLayer = useEditorStore((state) => state.setActiveLayer);
	const setLayerVisible = useEditorStore((state) => state.setLayerVisible);
	const soloLayer = useEditorStore((state) => state.soloLayer);
	const toggleLayerLock = useEditorStore((state) => state.toggleLayerLock);
	const renameLayer = useEditorStore((state) => state.renameLayer);

	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState("");
	const [dropTarget, setDropTarget] = useState(false);

	if (!layer) return null;

	const startRename = (): void => {
		setDraft(layer.name);
		setEditing(true);
	};

	const commitRename = (): void => {
		const trimmed = draft.trim();
		if (trimmed && trimmed !== layer.name) {
			renameLayer(layerIndex, trimmed);
		}
		setEditing(false);
	};

	return (
		<div
			draggable={!editing}
			style={{ width: NAMES, height: ROW }}
			className={`sticky left-0 z-5 flex shrink-0 items-center gap-1 border-r border-(--pe-border) px-1.5 ${
				isActive
					? "bg-(--pe-bg-active-row) text-(--pe-text)"
					: "bg-(--pe-bg-panel) text-(--pe-text-secondary)"
			} ${dropTarget ? "outline-2 -outline-offset-2 outline-(--pe-accent)" : ""}`}
			onClick={() => {
				setActiveLayer(layerIndex);
			}}
			onDragLeave={() => {
				setDropTarget(false);
			}}
			onDragOver={(event) => {
				if (!event.dataTransfer.types.includes("application/x-pixel-layer")) {
					return;
				}
				event.preventDefault();
				event.dataTransfer.dropEffect = "move";
				setDropTarget(true);
			}}
			onDragStart={(event) => {
				event.dataTransfer.setData(
					"application/x-pixel-layer",
					String(layerIndex)
				);
				event.dataTransfer.effectAllowed = "move";
			}}
			onDrop={(event) => {
				event.preventDefault();
				setDropTarget(false);
				const from = Number(
					event.dataTransfer.getData("application/x-pixel-layer")
				);
				if (Number.isInteger(from)) onDropLayer(from, layerIndex);
			}}
		>
			<button
				aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
				aria-pressed={layer.visible}
				className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-(--pe-text-muted) hover:bg-(--pe-bg-control-hover) hover:text-(--pe-text)"
				title="Toggle visibility (Alt+click to solo)"
				type="button"
				onClick={(event) => {
					event.stopPropagation();
					if (event.altKey) soloLayer(layerIndex);
					else setLayerVisible(layerIndex, !layer.visible);
				}}
			>
				{layer.visible ? (
					<EyeIcon className="h-3.5 w-3.5" />
				) : (
					<EyeSlashIcon className="h-3.5 w-3.5 opacity-45" />
				)}
			</button>

			<button
				aria-label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
				aria-pressed={Boolean(layer.locked)}
				title={layer.locked ? "Unlock layer" : "Lock layer"}
				type="button"
				className={`flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-(--pe-bg-control-hover) ${
					layer.locked
						? "text-(--pe-warn-ink)"
						: "text-(--pe-text-muted) hover:text-(--pe-text)"
				}`}
				onClick={(event) => {
					event.stopPropagation();
					toggleLayerLock(layerIndex);
				}}
			>
				{layer.locked ? (
					<LockClosedIcon className="h-3 w-3" />
				) : (
					<LockOpenIcon className="h-3 w-3" />
				)}
			</button>

			{layer.kind === "reference" && (
				<span
					className="shrink-0 rounded bg-(--pe-warn-soft) px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-(--pe-warn-ink)"
					title="Reference layer (high-res guide, excluded from export)"
				>
					Ref
				</span>
			)}

			{editing ? (
				<input
					autoFocus
					className="min-w-0 flex-1 rounded border border-(--pe-accent) bg-(--pe-bg-panel) px-1 py-0 text-[11px] text-(--pe-text) outline-none"
					value={draft}
					onBlur={commitRename}
					onChange={(event) => {
						setDraft(event.target.value);
					}}
					onClick={(event) => {
						event.stopPropagation();
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter") commitRename();
						else if (event.key === "Escape") setEditing(false);
					}}
				/>
			) : (
				<span
					title="Double-click to rename · drag to reorder layers"
					className={`min-w-0 flex-1 truncate text-left text-[11px] ${
						!layer.visible
							? "text-(--pe-text-muted) line-through"
							: isActive
								? "font-semibold text-(--pe-accent-soft-ink)"
								: "text-(--pe-text-secondary)"
					}`}
					onDoubleClick={(event) => {
						event.stopPropagation();
						startRename();
					}}
				>
					{layer.name}
				</span>
			)}

			{layer.opacity < 100 && !editing && (
				<span className="shrink-0 text-[10px] tabular-nums text-(--pe-text-muted)">
					{layer.opacity}%
				</span>
			)}
		</div>
	);
};

const FrameHeader = ({
	index,
	inRange,
	compact,
	onClick,
	onDropFrame,
}: {
	index: number;
	inRange: boolean;
	compact: boolean;
	onClick: (index: number, shift: boolean) => void;
	onDropFrame: (from: number, to: number) => void;
}): FunctionComponent => {
	const isCurrent = useEditorStore((state) => state.currentFrame === index);
	const duration = useEditorStore(
		(state) => state.frames[index]?.duration ?? 100
	);
	const [dropTarget, setDropTarget] = useState(false);

	return (
		<button
			draggable
			style={{ width: compact ? COLUMN : FRAME_CARD_COLUMN }}
			title={`Frame ${index + 1} · ${duration} ms · drag to reorder, Shift+click to select a range`}
			type="button"
			className={`relative flex shrink-0 flex-col items-center gap-1 border-r border-(--pe-border-subtle) ${
				compact ? "pt-1 pb-0.5" : "px-1 py-1.5"
			} ${
				isCurrent
					? "bg-(--pe-accent-soft)"
					: inRange
						? "bg-(--pe-accent-soft)/45"
						: "hover:bg-(--pe-bg-control-hover)"
			} ${dropTarget ? "outline-2 -outline-offset-2 outline-(--pe-accent)" : ""}`}
			onClick={(event) => {
				onClick(index, event.shiftKey);
			}}
			onDragLeave={() => {
				setDropTarget(false);
			}}
			onDragOver={(event) => {
				if (!event.dataTransfer.types.includes("application/x-pixel-frame")) {
					return;
				}
				event.preventDefault();
				event.dataTransfer.dropEffect = "move";
				setDropTarget(true);
			}}
			onDragStart={(event) => {
				event.dataTransfer.setData("application/x-pixel-frame", String(index));
				event.dataTransfer.effectAllowed = "move";
			}}
			onDrop={(event) => {
				event.preventDefault();
				setDropTarget(false);
				const from = Number(
					event.dataTransfer.getData("application/x-pixel-frame")
				);
				if (Number.isInteger(from)) onDropFrame(from, index);
			}}
		>
			<FrameThumb
				index={index}
				size={compact ? THUMB : FRAME_CARD_THUMB}
			/>
			<div className="flex items-center gap-1">
				<span
					className={`text-[10px] leading-none tabular-nums ${
						isCurrent
							? "font-semibold text-(--pe-accent-soft-ink)"
							: "text-(--pe-text-muted)"
					}`}
				>
					{compact ? index + 1 : `#${index + 1}`}
				</span>
			</div>
			{!compact && (
				<span className="text-[9px] leading-none tabular-nums text-(--pe-text-muted)">
					{duration}ms
				</span>
			)}
		</button>
	);
};

/* -------------------------------------------------------------------------- */
/*                                  Timeline                                  */
/* -------------------------------------------------------------------------- */

export const Timeline = (): FunctionComponent => {
	usePlayback();
	const showLayers = useUiSettingsStore((state) => state.panels.layers);
	const frames = useEditorStore((state) => state.frames);
	const frameCount = frames.length;
	const layers = useEditorStore((state) => state.layers);
	const layerCount = layers.length;
	const activeLayer = useEditorStore((state) => state.activeLayer);
	const currentFrame = useEditorStore((state) => state.currentFrame);
	const tags = useEditorStore((state) => state.tags);
	const playing = useEditorStore((state) => state.playing);
	const playTag = useEditorStore((state) => state.playTag);
	const onionSkin = useEditorStore((state) => state.onionSkin);
	const onionBefore = useEditorStore((state) => state.onionBefore);
	const onionAfter = useEditorStore((state) => state.onionAfter);
	const celClipboard = useEditorStore((state) => state.celClipboard);
	const store = useEditorStore.getState();

	const [collapsed, setCollapsed] = useState(false);
	const [gridHeight, setGridHeight] = useState(148);
	const [range, setRange] = useState<Range>({ from: 0, to: 0 });
	const [anchor, setAnchor] = useState(0);
	const [editing, setEditing] = useState<FrameTag | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);

	const columnWidth = showLayers ? COLUMN : FRAME_CARD_COLUMN;

	// Moving outside the selected range (keys, playback, clicks) resets it.
	if (currentFrame < range.from || currentFrame > range.to) {
		setRange({ from: currentFrame, to: currentFrame });
		setAnchor(currentFrame);
	} else if (range.to >= frameCount) {
		setRange({
			from: Math.min(range.from, frameCount - 1),
			to: frameCount - 1,
		});
	}

	// Keep the current frame in view (e.g. while playing).
	useEffect(() => {
		const scroller = scrollRef.current;
		if (!scroller) return;
		const left = currentFrame * columnWidth;
		const visible = scroller.clientWidth - (showLayers ? NAMES : 0);
		if (left < scroller.scrollLeft) {
			scroller.scrollLeft = left;
		} else if (left + columnWidth > scroller.scrollLeft + visible) {
			scroller.scrollLeft = left + columnWidth - visible;
		}
	}, [currentFrame, columnWidth, showLayers]);

	// Top layer is listed first, like Aseprite / Photoshop.
	const order = Array.from(
		{ length: layerCount },
		(_, position) => layerCount - 1 - position
	);
	const rangeSize = range.to - range.from + 1;
	const current = frames[currentFrame];
	const activeLayerObject = layers[activeLayer];
	const activeIsReference = activeLayerObject?.kind === "reference";
	const activeIsLinked = Boolean(
		activeLayerObject && current?.linked?.[activeLayerObject.id]
	);
	const loopTag = tags.find((tag) => tag.id === playTag) ?? null;
	const loopLength = sequenceDuration(sequenceFor(loopTag, frameCount), frames);
	const currentTags = tagsAt(tags, currentFrame);

	const onHeaderClick = (index: number, shift: boolean): void => {
		if (shift) {
			setRange({ from: Math.min(anchor, index), to: Math.max(anchor, index) });
		} else {
			setAnchor(index);
			setRange({ from: index, to: index });
		}
		store.setCurrentFrame(index);
	};

	const onCelClick = (
		layerIndex: number,
		frameIndex: number,
		shift: boolean
	): void => {
		if (shift) {
			setRange({
				from: Math.min(anchor, frameIndex),
				to: Math.max(anchor, frameIndex),
			});
		} else {
			setAnchor(frameIndex);
			setRange({ from: frameIndex, to: frameIndex });
		}
		store.selectCel(layerIndex, frameIndex);
	};

	const startResize = (event: React.PointerEvent<HTMLDivElement>): void => {
		event.preventDefault();
		const startY = event.clientY;
		const startHeight = gridHeight;
		const onMove = (moveEvent: PointerEvent): void => {
			setGridHeight(
				Math.max(96, Math.min(440, startHeight + (startY - moveEvent.clientY)))
			);
		};
		const onUp = (): void => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
		};
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
	};

	const small = "h-7 w-7";
	const icon = "h-4 w-4";

	return (
		<section className="shrink-0 border-t border-(--pe-border) bg-(--pe-bg-panel)">
			{!collapsed && (
				<div
					className="h-1 cursor-row-resize bg-transparent transition-colors hover:bg-(--pe-accent-soft)"
					title="Drag to resize timeline height"
					onPointerDown={startResize}
				/>
			)}
			{/* ----------------------------- toolbar ----------------------------- */}
			<div className="editor-scrollbar flex h-9 items-center gap-1 overflow-x-auto px-2">
				<IconButton
					className={small}
					label={collapsed ? "Show timeline" : "Hide timeline"}
					onClick={() => {
						setCollapsed(!collapsed);
					}}
				>
					{collapsed ? (
						<ChevronUpIcon className={icon} />
					) : (
						<ChevronDownIcon className={icon} />
					)}
				</IconButton>
				<FilmIcon className="h-4 w-4 shrink-0 text-(--pe-text-muted)" />
				<span className="mr-1 shrink-0 text-xs font-semibold uppercase tracking-wide text-(--pe-text-muted)">
					{showLayers ? "Timeline" : "Frames"}
				</span>
				<span className="mr-1 shrink-0 text-xs tabular-nums text-(--pe-text-muted)">
					{currentFrame + 1}/{frameCount}
				</span>

				<Divider />
				<IconButton
					className={small}
					label="First frame (Home)"
					onClick={() => {
						store.setCurrentFrame(loopTag?.from ?? 0);
					}}
				>
					<BackwardIcon className={icon} />
				</IconButton>
				<IconButton
					className={small}
					label="Previous frame (, or ←)"
					onClick={() => {
						store.setCurrentFrame((currentFrame - 1 + frameCount) % frameCount);
					}}
				>
					<ChevronLeftIcon className={icon} />
				</IconButton>
				<IconButton
					active={playing}
					className={small}
					disabled={frameCount < 2}
					label={playing ? "Pause (Enter)" : "Play (Enter)"}
					onClick={store.togglePlaying}
				>
					{playing ? (
						<PauseIcon className={icon} />
					) : (
						<PlayIcon className={icon} />
					)}
				</IconButton>
				<IconButton
					className={small}
					label="Next frame (. or →)"
					onClick={() => {
						store.setCurrentFrame((currentFrame + 1) % frameCount);
					}}
				>
					<ChevronRightIcon className={icon} />
				</IconButton>
				<IconButton
					className={small}
					label="Last frame (End)"
					onClick={() => {
						store.setCurrentFrame(loopTag?.to ?? frameCount - 1);
					}}
				>
					<ForwardIcon className={icon} />
				</IconButton>
				<label className="ml-1 flex shrink-0 items-center gap-1.5 text-xs text-(--pe-text-secondary)">
					Loop
					<select
						className="max-w-32 rounded-md border border-(--pe-border) bg-(--pe-bg-control) px-1.5 py-0.5 text-xs text-(--pe-text)"
						title="What Play loops over"
						value={playTag ?? ""}
						onChange={(event) => {
							store.setPlayTag(
								event.target.value === "" ? null : Number(event.target.value)
							);
						}}
					>
						<option value="">All frames</option>
						{tags.map((tag) => (
							<option key={tag.id} value={tag.id}>
								{tag.name}
							</option>
						))}
					</select>
				</label>
				<span
					className="shrink-0 text-[10px] tabular-nums text-(--pe-text-muted)"
					title="Length of one loop"
				>
					{(loopLength / 1000).toFixed(2)}s
				</span>

				<Divider />
				<IconButton
					className={small}
					disabled={frameCount >= MAX_FRAMES}
					label="New empty frame (Alt+Shift+N)"
					onClick={store.addFrame}
				>
					<PlusIcon className={icon} />
				</IconButton>
				<IconButton
					className={small}
					disabled={frameCount >= MAX_FRAMES}
					label="Duplicate frame (Alt+N)"
					onClick={store.duplicateFrame}
				>
					<DocumentDuplicateIcon className={icon} />
				</IconButton>
				<IconButton
					className={small}
					disabled={frameCount <= 1}
					label="Delete frame"
					onClick={store.deleteFrame}
				>
					<TrashIcon className={icon} />
				</IconButton>
				<IconButton
					className={small}
					label={
						rangeSize > 1
							? `Tag frames ${range.from + 1}–${range.to + 1}`
							: `Tag frame ${currentFrame + 1} (Shift+click frames to tag a range)`
					}
					onClick={() => {
						store.addTag(range.from, range.to);
					}}
				>
					<TagIcon className={icon} />
				</IconButton>

				<Divider />
				<label
					className="flex shrink-0 items-center gap-1.5 text-xs text-(--pe-text-secondary)"
					title={
						rangeSize > 1
							? `Sets the duration of frames ${range.from + 1}–${range.to + 1}`
							: "How long this frame is shown"
					}
				>
					{rangeSize > 1 ? `${rangeSize} frames` : "Duration"}
					<input
						key={`${current?.id ?? 0}-${current?.duration ?? 0}-${rangeSize}`}
						aria-label="Frame duration in milliseconds"
						className="w-16 rounded-md border border-(--pe-border) bg-(--pe-bg-control) px-1.5 py-0.5 text-right text-xs tabular-nums text-(--pe-text) outline-none focus:border-(--pe-accent)"
						defaultValue={current?.duration ?? 100}
						max={10_000}
						min={10}
						step={10}
						type="number"
						onBlur={(event) => {
							store.setFramesDuration(
								range.from,
								range.to,
								Number(event.target.value)
							);
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter") event.currentTarget.blur();
						}}
					/>
					ms
				</label>
				<TextButton
					title="Use this frame's duration for every frame"
					onClick={() => {
						store.setFramesDuration(
							0,
							frameCount - 1,
							current?.duration ?? 100
						);
						store.showNotice(
							`Every frame is now ${current?.duration ?? 100} ms`
						);
					}}
				>
					All
				</TextButton>

				<Divider />
				<IconButton
					active={onionSkin}
					className={small}
					label="Onion skin (K)"
					onClick={store.toggleOnionSkin}
				>
					<Square2StackIcon className={icon} />
				</IconButton>
				{onionSkin && (
					<span className="flex shrink-0 items-center gap-1 text-[10px] text-(--pe-text-muted)">
						<input
							aria-label="Onion skin frames before"
							className="w-9 rounded border border-(--pe-border) bg-(--pe-bg-control) px-1 py-0.5 text-right tabular-nums text-rose-400"
							max={5}
							min={0}
							title="Frames before (red)"
							type="number"
							value={onionBefore}
							onChange={(event) => {
								store.setOnionRange(Number(event.target.value), onionAfter);
							}}
						/>
						<input
							aria-label="Onion skin frames after"
							className="w-9 rounded border border-(--pe-border) bg-(--pe-bg-control) px-1 py-0.5 text-right tabular-nums text-sky-400"
							max={5}
							min={0}
							title="Frames after (blue)"
							type="number"
							value={onionAfter}
							onChange={(event) => {
								store.setOnionRange(onionBefore, Number(event.target.value));
							}}
						/>
					</span>
				)}

				{currentTags.length > 0 && (
					<span className="ml-auto flex shrink-0 items-center gap-1 pl-2 text-[10px] text-(--pe-text-muted)">
						in
						{currentTags.map((tag) => (
							<span
								key={tag.id}
								className="swatch-preserve rounded-sm px-1 font-semibold text-zinc-950"
								style={{ backgroundColor: tag.color }}
							>
								{tag.name}
							</span>
						))}
					</span>
				)}
			</div>

			{/* ------------------------ layers & cels bar ------------------------ */}
			{!collapsed && showLayers && (
				<div className="editor-scrollbar flex h-8 items-center gap-1 overflow-x-auto border-t border-(--pe-border-subtle) bg-(--pe-bg-panel-subtle) px-2">
					<span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-(--pe-text-muted)">
						Layers
					</span>
					<IconButton
						className={small}
						disabled={layerCount >= MAX_LAYERS}
						label="New pixel layer (Shift+N)"
						onClick={store.addLayer}
					>
						<PlusIcon className={icon} />
					</IconButton>
					<IconButton
						className={small}
						disabled={layerCount >= MAX_LAYERS}
						label="Add reference image layer"
						onClick={() => {
							void importReferenceImage();
						}}
					>
						<PhotoIcon className={icon} />
					</IconButton>
					<IconButton
						className={small}
						disabled={layerCount >= MAX_LAYERS}
						label="Duplicate layer"
						onClick={store.duplicateLayer}
					>
						<DocumentDuplicateIcon className={icon} />
					</IconButton>
					<IconButton
						className={small}
						disabled={activeLayer >= layerCount - 1}
						label="Move layer up"
						onClick={() => {
							store.moveLayer(1);
						}}
					>
						<ChevronUpIcon className={icon} />
					</IconButton>
					<IconButton
						className={small}
						disabled={activeLayer <= 0}
						label="Move layer down"
						onClick={() => {
							store.moveLayer(-1);
						}}
					>
						<ChevronDownIcon className={icon} />
					</IconButton>
					<IconButton
						className={small}
						label="Merge down"
						disabled={
							activeLayer <= 0 ||
							activeIsReference ||
							layers[activeLayer - 1]?.kind === "reference"
						}
						onClick={store.mergeDown}
					>
						<ArrowDownOnSquareStackIcon className={icon} />
					</IconButton>
					<IconButton
						className={small}
						label="Flatten pixel layers"
						disabled={
							layers.filter((layer) => layer.kind !== "reference").length < 2
						}
						onClick={store.flattenImage}
					>
						<Square3Stack3DIcon className={icon} />
					</IconButton>
					<IconButton
						className={small}
						disabled={layerCount <= 1}
						label="Delete layer"
						onClick={store.deleteLayer}
					>
						<TrashIcon className={icon} />
					</IconButton>

					{activeLayerObject && (
						<label className="ml-1 flex shrink-0 items-center gap-1.5 text-[11px] text-(--pe-text-muted)">
							Opacity
							<input
								className="w-16 accent-(--pe-accent)"
								max={100}
								min={0}
								type="range"
								value={activeLayerObject.opacity}
								onChange={(event) => {
									store.setLayerOpacity(activeLayer, Number(event.target.value));
								}}
							/>
							<span className="w-7 tabular-nums text-(--pe-text)">
								{activeLayerObject.opacity}%
							</span>
						</label>
					)}

					<Divider />
					<span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-(--pe-text-muted)">
						Cels
					</span>
					<TextButton
						disabled={activeIsReference}
						title="Clear active cel"
						onClick={() => {
							store.clearCel(activeLayer, currentFrame);
						}}
					>
						Clear
					</TextButton>
					<TextButton
						disabled={activeIsReference || currentFrame >= frameCount - 1}
						title="Copy active cel to the next frame"
						onClick={() => {
							store.duplicateCel(activeLayer, currentFrame);
						}}
					>
						Dup →
					</TextButton>
					<IconButton
						className={small}
						disabled={activeIsReference}
						label="Copy cel"
						onClick={() => {
							store.copyCel(activeLayer, currentFrame);
						}}
					>
						<ClipboardDocumentIcon className={icon} />
					</IconButton>
					<TextButton
						disabled={activeIsReference || !celClipboard}
						title="Paste copied cel into active cel"
						onClick={() => {
							store.pasteCel(activeLayer, currentFrame);
						}}
					>
						Paste
					</TextButton>
					<TextButton
						disabled={activeIsReference || rangeSize < 2}
						title="Shift+click frames to select a range, then link cels"
						onClick={() => {
							store.linkCels(activeLayer, range.from, range.to);
						}}
					>
						<span className="inline-flex items-center gap-1">
							<LinkIcon className="h-3 w-3" />
							Link
						</span>
					</TextButton>
					{activeIsLinked && (
						<TextButton
							title="Unlink active cel from its shared cel group"
							onClick={() => {
								store.unlinkCel(activeLayer, currentFrame);
							}}
						>
							Unlink
						</TextButton>
					)}
				</div>
			)}

			{/* ------------------------------- grid ------------------------------ */}
			{!collapsed && (
				<div
					ref={scrollRef}
					className="editor-scrollbar overflow-auto border-t border-(--pe-border-subtle) bg-(--pe-bg-chrome)"
					style={{ maxHeight: gridHeight }}
				>
					{showLayers ? (
						<div style={{ width: NAMES + frameCount * COLUMN }}>
							<div className="sticky top-0 z-10 flex bg-(--pe-bg-panel)">
								<div
									className="sticky left-0 z-10 flex shrink-0 flex-col justify-between border-r border-(--pe-border) bg-(--pe-bg-panel) px-2 py-1 text-[10px] uppercase tracking-wide text-(--pe-text-muted)"
									style={{ width: NAMES }}
								>
									<span>Tags</span>
									<span>Layers ↓ · Frames →</span>
								</div>
								<div className="flex flex-col">
									<div className="py-0.5">
										<TagLanes
											columnWidth={COLUMN}
											onEdit={setEditing}
											onSelectRange={(next) => {
												setAnchor(next.from);
												setRange(next);
											}}
										/>
									</div>
									<div className="flex border-b border-(--pe-border)">
										{frames.map((frame, index) => (
											<FrameHeader
												key={frame.id}
												compact
												inRange={index >= range.from && index <= range.to}
												index={index}
												onClick={onHeaderClick}
												onDropFrame={store.moveFrame}
											/>
										))}
									</div>
								</div>
							</div>
							{order.map((layerIndex) => (
								<div
									key={layers[layerIndex]?.id ?? layerIndex}
									className={`flex border-b border-(--pe-border-subtle) ${
										layerIndex === activeLayer
											? "bg-(--pe-bg-active-row)/45"
											: ""
									}`}
								>
									<LayerRowHeader
										layerIndex={layerIndex}
										onDropLayer={store.moveLayerTo}
									/>
									{frames.map((frame, frameIndex) => (
										<CelCell
											key={frame.id}
											frameIndex={frameIndex}
											inRange={frameIndex >= range.from && frameIndex <= range.to}
											layerIndex={layerIndex}
											onSelect={onCelClick}
										/>
									))}
								</div>
							))}
						</div>
					) : (
						<div style={{ width: frameCount * FRAME_CARD_COLUMN }}>
							<div className="border-b border-(--pe-border-subtle) py-0.5">
								<TagLanes
									columnWidth={FRAME_CARD_COLUMN}
									onEdit={setEditing}
									onSelectRange={(next) => {
										setAnchor(next.from);
										setRange(next);
									}}
								/>
							</div>
							<div className="flex">
								{frames.map((frame, index) => (
									<FrameHeader
										key={frame.id}
										compact={false}
										inRange={index >= range.from && index <= range.to}
										index={index}
										onClick={onHeaderClick}
										onDropFrame={store.moveFrame}
									/>
								))}
							</div>
						</div>
					)}
				</div>
			)}
			{editing && (
				<TagDialog
					tag={editing}
					onClose={() => {
						setEditing(null);
					}}
				/>
			)}
		</section>
	);
};
