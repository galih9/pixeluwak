import {
	ArrowDownTrayIcon,
	ArrowsPointingInIcon,
	ArrowsPointingOutIcon,
	ArrowsRightLeftIcon,
	ArrowsUpDownIcon,
	ArrowUturnLeftIcon,
	ArrowUturnRightIcon,
	ChevronDownIcon,
	Cog6ToothIcon,
	DocumentPlusIcon,
	FolderOpenIcon,
	MagnifyingGlassMinusIcon,
	MagnifyingGlassPlusIcon,
	MapIcon,
	PhotoIcon,
	QuestionMarkCircleIcon,
	SparklesIcon,
	Squares2X2Icon,
	TableCellsIcon,
} from "@heroicons/react/20/solid";
import { type CSSProperties, type ReactNode, useId, useRef } from "react";
import type { FunctionComponent } from "../../../common/types";
import { openFile, saveProject } from "../lib/files";
import { useEditorStore } from "../store/editorStore";
import { PixeluwakEmblem } from "./PixeluwakEmblem";
import { Divider, IconButton, Kbd } from "./ui";

const FILE_ANCHOR = { anchorName: "--topbar-file-anchor" } as CSSProperties;
const FILE_POPOVER_POS = {
	positionAnchor: "--topbar-file-anchor",
} as CSSProperties;

const CANVAS_ANCHOR = { anchorName: "--topbar-canvas-anchor" } as CSSProperties;
const CANVAS_POPOVER_POS = {
	positionAnchor: "--topbar-canvas-anchor",
} as CSSProperties;

function positionPopoverFallback(
	trigger: HTMLElement | null,
	popover: HTMLElement | null
): void {
	if (!trigger || !popover) return;
	if (
		typeof CSS !== "undefined" &&
		typeof CSS.supports === "function" &&
		CSS.supports("position-area", "block-end")
	) {
		return;
	}
	const triggerRect = trigger.getBoundingClientRect();
	const popoverRect = popover.getBoundingClientRect();
	const fitsBelow = triggerRect.bottom + popoverRect.height + 8 <= window.innerHeight;
	const top = fitsBelow
		? triggerRect.bottom + 6
		: Math.max(8, triggerRect.top - popoverRect.height - 6);
	const left = Math.max(
		8,
		Math.min(triggerRect.left, window.innerWidth - popoverRect.width - 8)
	);
	popover.style.top = `${top}px`;
	popover.style.left = `${left}px`;
	popover.style.transform = "none";
}

const MenuItem = ({
	icon,
	label,
	shortcut,
	onClick,
}: {
	icon: ReactNode;
	label: string;
	shortcut?: string;
	onClick: () => void;
}): FunctionComponent => (
	<button
		className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-xs text-(--pe-text) transition-colors hover:bg-(--pe-bg-control-hover) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--pe-accent)"
		type="button"
		onClick={onClick}
	>
		<span className="flex min-w-0 items-center gap-2">
			<span className="text-(--pe-text-muted)">{icon}</span>
			<span className="truncate font-medium">{label}</span>
		</span>
		{shortcut && <Kbd>{shortcut}</Kbd>}
	</button>
);

export const TopBar = (): FunctionComponent => {
	const filePopoverId = useId();
	const canvasPopoverId = useId();

	const fileTriggerRef = useRef<HTMLButtonElement>(null);
	const filePopoverRef = useRef<HTMLDivElement>(null);
	const canvasTriggerRef = useRef<HTMLButtonElement>(null);
	const canvasPopoverRef = useRef<HTMLDivElement>(null);

	const name = useEditorStore((state) => state.name);
	const setName = useEditorStore((state) => state.setName);
	const canUndo = useEditorStore(
		(state) => state.undoStack.length > 0 || state.floating !== null
	);
	const canRedo = useEditorStore((state) => state.redoStack.length > 0);
	const undo = useEditorStore((state) => state.undo);
	const redo = useEditorStore((state) => state.redo);
	const flip = useEditorStore((state) => state.flip);
	const showGrid = useEditorStore((state) => state.showGrid);
	const toggleGrid = useEditorStore((state) => state.toggleGrid);
	const zoom = useEditorStore((state) => state.zoom);
	const zoomStep = useEditorStore((state) => state.zoomStep);
	const fitView = useEditorStore((state) => state.fitView);
	const dialog = useEditorStore((state) => state.dialog);
	const openDialog = useEditorStore((state) => state.openDialog);

	const iconClass = "h-7 w-7";
	const svgClass = "h-4 w-4";

	return (
		<header className="pe-topbar flex h-12 shrink-0 items-center justify-between gap-2 border-b border-(--pe-border) bg-(--pe-bg-chrome) px-3">
			{/* Left Zone: Brand + Project Name + File & Canvas Menus */}
			<div className="flex min-w-0 items-center gap-1.5">
				<div className="flex items-center gap-2 pr-1">
					<PixeluwakEmblem />
					<span className="hidden text-xs font-bold tracking-tight text-(--pe-text) sm:inline">
						Pixeluwak
					</span>
				</div>

				<input
					aria-label="Project name"
					className="w-28 rounded-lg border border-transparent bg-transparent px-2 py-1 text-xs font-medium text-(--pe-text) outline-none transition-colors hover:border-(--pe-border) hover:bg-(--pe-bg-control) focus:border-(--pe-accent) focus:bg-(--pe-bg-panel) sm:w-36"
					value={name}
					onChange={(event) => {
						setName(event.target.value);
					}}
				/>

				<Divider />

				<button
					ref={fileTriggerRef}
					className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-(--pe-text-secondary) transition-colors hover:bg-(--pe-bg-control-hover) hover:text-(--pe-text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--pe-accent)"
					popoverTarget={filePopoverId}
					style={FILE_ANCHOR}
					type="button"
				>
					<span>File</span>
					<ChevronDownIcon className="h-3.5 w-3.5 opacity-70" />
				</button>

				<div
					ref={filePopoverRef}
					className="editor-popover w-60 rounded-xl border border-(--pe-border-strong) bg-(--pe-bg-panel) p-1.5 text-xs text-(--pe-text)"
					id={filePopoverId}
					popover="auto"
					style={FILE_POPOVER_POS}
					onToggle={(event) => {
						if (event.newState === "open") {
							positionPopoverFallback(
								fileTriggerRef.current,
								filePopoverRef.current
							);
						}
					}}
				>
					<MenuItem
						icon={<DocumentPlusIcon className={svgClass} />}
						label="New Canvas…"
						onClick={() => {
							filePopoverRef.current?.hidePopover();
							openDialog("new");
						}}
					/>
					<MenuItem
						icon={<ArrowsPointingOutIcon className={svgClass} />}
						label="Resize Canvas…"
						shortcut="Shift+R"
						onClick={() => {
							filePopoverRef.current?.hidePopover();
							openDialog("resize");
						}}
					/>
					<MenuItem
						icon={<FolderOpenIcon className={svgClass} />}
						label="Open Project or Image…"
						shortcut="Ctrl+O"
						onClick={() => {
							filePopoverRef.current?.hidePopover();
							void openFile();
						}}
					/>
					<MenuItem
						icon={<ArrowDownTrayIcon className={svgClass} />}
						label="Save Project"
						shortcut="Ctrl+S"
						onClick={() => {
							filePopoverRef.current?.hidePopover();
							saveProject();
						}}
					/>
					<div className="my-1 h-px bg-(--pe-border-subtle)" />
					<MenuItem
						icon={<PhotoIcon className={svgClass} />}
						label="Export PNG / GIF…"
						shortcut="Ctrl+E"
						onClick={() => {
							filePopoverRef.current?.hidePopover();
							openDialog("export");
						}}
					/>
					<MenuItem
						icon={<TableCellsIcon className={svgClass} />}
						label="Export Sprite Sheet…"
						shortcut="Ctrl+Shift+E"
						onClick={() => {
							filePopoverRef.current?.hidePopover();
							openDialog("spritesheet");
						}}
					/>
				</div>

				<button
					ref={canvasTriggerRef}
					className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-(--pe-text-secondary) transition-colors hover:bg-(--pe-bg-control-hover) hover:text-(--pe-text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--pe-accent)"
					popoverTarget={canvasPopoverId}
					style={CANVAS_ANCHOR}
					type="button"
				>
					<span>Canvas</span>
					<ChevronDownIcon className="h-3.5 w-3.5 opacity-70" />
				</button>

				<div
					ref={canvasPopoverRef}
					className="editor-popover w-56 rounded-xl border border-(--pe-border-strong) bg-(--pe-bg-panel) p-1.5 text-xs text-(--pe-text)"
					id={canvasPopoverId}
					popover="auto"
					style={CANVAS_POPOVER_POS}
					onToggle={(event) => {
						if (event.newState === "open") {
							positionPopoverFallback(
								canvasTriggerRef.current,
								canvasPopoverRef.current
							);
						}
					}}
				>
					<MenuItem
						icon={<ArrowsPointingOutIcon className={svgClass} />}
						label="Resize Canvas…"
						shortcut="Shift+R"
						onClick={() => {
							canvasPopoverRef.current?.hidePopover();
							openDialog("resize");
						}}
					/>
					<div className="my-1 h-px bg-(--pe-border-subtle)" />
					<MenuItem
						icon={<ArrowsRightLeftIcon className={svgClass} />}
						label="Flip Horizontal"
						onClick={() => {
							canvasPopoverRef.current?.hidePopover();
							flip("horizontal");
						}}
					/>
					<MenuItem
						icon={<ArrowsUpDownIcon className={svgClass} />}
						label="Flip Vertical"
						onClick={() => {
							canvasPopoverRef.current?.hidePopover();
							flip("vertical");
						}}
					/>
					<div className="my-1 h-px bg-(--pe-border-subtle)" />
					<MenuItem
						icon={<SparklesIcon className={svgClass} />}
						label="Auto Outline…"
						shortcut="Shift+O"
						onClick={() => {
							canvasPopoverRef.current?.hidePopover();
							openDialog("outline");
						}}
					/>
					<MenuItem
						icon={<MapIcon className={svgClass} />}
						label="Tilemap Large View…"
						shortcut="Shift+T"
						onClick={() => {
							canvasPopoverRef.current?.hidePopover();
							openDialog("tilemap");
						}}
					/>
				</div>
			</div>

			{/* Center Zone: History + Grid Pill */}
			<div className="flex items-center gap-1 rounded-xl border border-(--pe-border) bg-(--pe-bg-panel-subtle) p-0.5">
				<IconButton
					className={iconClass}
					disabled={!canUndo}
					label="Undo (Ctrl+Z)"
					onClick={undo}
				>
					<ArrowUturnLeftIcon className={svgClass} />
				</IconButton>
				<IconButton
					className={iconClass}
					disabled={!canRedo}
					label="Redo (Ctrl+Y)"
					onClick={redo}
				>
					<ArrowUturnRightIcon className={svgClass} />
				</IconButton>

				<div className="mx-0.5 h-4 w-px bg-(--pe-border)" />

				<IconButton
					active={showGrid}
					className={iconClass}
					label="Toggle pixel grid (#)"
					onClick={toggleGrid}
				>
					<Squares2X2Icon className={svgClass} />
				</IconButton>
			</div>

			{/* Right Zone: Zoom Pill + Help + Settings */}
			<div className="flex items-center gap-1.5">
				<div className="hidden items-center gap-0.5 rounded-xl border border-(--pe-border) bg-(--pe-bg-panel-subtle) p-0.5 md:flex">
					<IconButton
						className={iconClass}
						label="Zoom out (-)"
						onClick={() => {
							zoomStep(-1);
						}}
					>
						<MagnifyingGlassMinusIcon className={svgClass} />
					</IconButton>
					<span className="w-12 text-center text-xs font-medium tabular-nums text-(--pe-text-secondary)">
						{Math.round(zoom * 100)}%
					</span>
					<IconButton
						className={iconClass}
						label="Zoom in (+)"
						onClick={() => {
							zoomStep(1);
						}}
					>
						<MagnifyingGlassPlusIcon className={svgClass} />
					</IconButton>
					<IconButton
						className={iconClass}
						label="Fit to screen (0)"
						onClick={fitView}
					>
						<ArrowsPointingInIcon className={svgClass} />
					</IconButton>
				</div>

				<IconButton
					className="h-8 w-8"
					label="Keyboard shortcuts (?)"
					onClick={() => {
						openDialog("help");
					}}
				>
					<QuestionMarkCircleIcon className="h-4.5 w-4.5" />
				</IconButton>

				<button
					aria-label="Studio Settings"
					aria-pressed={dialog === "settings"}
					title="Studio settings (Ctrl+,)"
					type="button"
					className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--pe-accent) ${
						dialog === "settings"
							? "border-(--pe-accent-ring) bg-(--pe-accent) text-(--pe-accent-ink)"
							: "border-(--pe-border) bg-(--pe-bg-control) text-(--pe-text) hover:bg-(--pe-bg-control-hover)"
					}`}
					onClick={() => {
						openDialog("settings");
					}}
				>
					<Cog6ToothIcon className="h-4 w-4 shrink-0" />
					<span className="hidden sm:inline">Settings</span>
				</button>
			</div>
		</header>
	);
};
