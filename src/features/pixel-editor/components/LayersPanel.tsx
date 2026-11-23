import {
	ArrowDownOnSquareStackIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	DocumentDuplicateIcon,
	EyeIcon,
	EyeSlashIcon,
	LockClosedIcon,
	LockOpenIcon,
	PhotoIcon,
	PlusIcon,
	Square3Stack3DIcon,
	TrashIcon,
} from "@heroicons/react/20/solid";
import { useState } from "react";
import type { FunctionComponent } from "../../../common/types";
import { MAX_LAYERS } from "../constants";
import { importReferenceImage } from "../lib/files";
import { useEditorStore } from "../store/editorStore";
import { IconButton, PanelCard } from "./ui";

const LayerItem = ({
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
			className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-colors ${
				isActive
					? "border-[var(--pe-accent-ring)] bg-[var(--pe-accent-soft)] text-[var(--pe-text)]"
					: "border-transparent bg-[var(--pe-bg-panel-subtle)] text-[var(--pe-text-secondary)] hover:bg-[var(--pe-bg-control)]"
			} ${dropTarget ? "outline-2 -outline-offset-2 outline-[var(--pe-accent)]" : ""}`}
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
				className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--pe-text-muted)] hover:bg-[var(--pe-bg-control-hover)] hover:text-[var(--pe-text)]"
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
				className={`flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-[var(--pe-bg-control-hover)] ${
					layer.locked
						? "text-[var(--pe-warn-ink)]"
						: "text-[var(--pe-text-muted)] hover:text-[var(--pe-text)]"
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
					className="shrink-0 rounded bg-[var(--pe-warn-soft)] px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--pe-warn-ink)]"
					title="Reference layer (high-res guide, excluded from export)"
				>
					Ref
				</span>
			)}

			{editing ? (
				<input
					autoFocus
					className="min-w-0 flex-1 rounded border border-[var(--pe-accent)] bg-[var(--pe-bg-panel)] px-1 py-0 text-[11px] text-[var(--pe-text)] outline-none"
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
				<button
					aria-pressed={isActive}
					title="Click to select · Double-click to rename · Drag to reorder layers"
					type="button"
					className={`min-w-0 flex-1 truncate text-left text-[11px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--pe-accent)] ${
						!layer.visible
							? "text-[var(--pe-text-muted)] line-through"
							: isActive
								? "font-semibold text-[var(--pe-text)]"
								: "text-[var(--pe-text-secondary)]"
					}`}
					onClick={() => {
						setActiveLayer(layerIndex);
					}}
					onDoubleClick={(event) => {
						event.stopPropagation();
						startRename();
					}}
				>
					{layer.name}
				</button>
			)}

			{layer.opacity < 100 && !editing && (
				<span className="shrink-0 text-[10px] tabular-nums text-[var(--pe-text-muted)]">
					{layer.opacity}%
				</span>
			)}
		</div>
	);
};

export const LayersPanel = (): FunctionComponent => {
	const layers = useEditorStore((state) => state.layers);
	const activeLayer = useEditorStore((state) => state.activeLayer);
	const addLayer = useEditorStore((state) => state.addLayer);
	const duplicateLayer = useEditorStore((state) => state.duplicateLayer);
	const moveLayer = useEditorStore((state) => state.moveLayer);
	const moveLayerTo = useEditorStore((state) => state.moveLayerTo);
	const mergeDown = useEditorStore((state) => state.mergeDown);
	const flattenImage = useEditorStore((state) => state.flattenImage);
	const deleteLayer = useEditorStore((state) => state.deleteLayer);
	const setLayerOpacity = useEditorStore((state) => state.setLayerOpacity);

	const layerCount = layers.length;
	const activeLayerObject = layers[activeLayer];
	const activeIsReference = activeLayerObject?.kind === "reference";
	const order = Array.from(
		{ length: layerCount },
		(_, position) => layerCount - 1 - position
	);

	const small = "h-6 w-6";
	const icon = "h-3.5 w-3.5";

	return (
		<PanelCard collapsible badge={layerCount} title="Layers">
			<div className="mb-2 flex flex-wrap items-center gap-0.5 rounded-lg border border-[var(--pe-border-subtle)] bg-[var(--pe-bg-panel-subtle)] p-1">
				<IconButton
					className={small}
					disabled={layerCount >= MAX_LAYERS}
					label="New pixel layer (Shift+N)"
					onClick={addLayer}
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
					onClick={duplicateLayer}
				>
					<DocumentDuplicateIcon className={icon} />
				</IconButton>
				<IconButton
					className={small}
					disabled={activeLayer >= layerCount - 1}
					label="Move layer up"
					onClick={() => {
						moveLayer(1);
					}}
				>
					<ChevronUpIcon className={icon} />
				</IconButton>
				<IconButton
					className={small}
					disabled={activeLayer <= 0}
					label="Move layer down"
					onClick={() => {
						moveLayer(-1);
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
					onClick={mergeDown}
				>
					<ArrowDownOnSquareStackIcon className={icon} />
				</IconButton>
				<IconButton
					className={small}
					label="Flatten pixel layers"
					disabled={
						layers.filter((layer) => layer.kind !== "reference").length < 2
					}
					onClick={flattenImage}
				>
					<Square3Stack3DIcon className={icon} />
				</IconButton>
				<IconButton
					className={`${small} ml-auto`}
					disabled={layerCount <= 1}
					label="Delete layer"
					onClick={deleteLayer}
				>
					<TrashIcon className={icon} />
				</IconButton>
			</div>

			{activeLayerObject && (
				<label className="mb-2 flex items-center justify-between gap-2 text-[11px] text-[var(--pe-text-muted)]">
					<span>Opacity</span>
					<input
						className="w-28 accent-[var(--pe-accent)]"
						max={100}
						min={0}
						type="range"
						value={activeLayerObject.opacity}
						onChange={(event) => {
							setLayerOpacity(activeLayer, Number(event.target.value));
						}}
					/>
					<span className="w-8 text-right tabular-nums text-[var(--pe-text)]">
						{activeLayerObject.opacity}%
					</span>
				</label>
			)}

			<div className="editor-scrollbar max-h-48 space-y-1 overflow-y-auto pr-0.5">
				{order.map((layerIndex) => (
					<LayerItem
						key={layers[layerIndex]?.id ?? layerIndex}
						layerIndex={layerIndex}
						onDropLayer={moveLayerTo}
					/>
				))}
			</div>
		</PanelCard>
	);
};
