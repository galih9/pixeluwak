import {
	ArrowsPointingInIcon,
	ArrowTopRightOnSquareIcon,
	ArrowUturnLeftIcon,
	ArrowUturnRightIcon,
	Squares2X2Icon,
} from "@heroicons/react/20/solid";
import type { FunctionComponent } from "../../../common/types";
import { MAX_BRUSH_SIZE } from "../constants";
import type { StealthWindowMode } from "../lib/stealthWindow";
import { useEditorStore } from "../store/editorStore";
import type { Tool } from "../types";
import { PixelCanvas } from "./PixelCanvas";
import { ToolIcon } from "./ToolIcon";
import { IconButton, TextButton } from "./ui";

const QUICK_TOOLS: Array<{ id: Tool; label: string; shortcut: string }> = [
	{ id: "pencil", label: "Pencil", shortcut: "B" },
	{ id: "eraser", label: "Eraser", shortcut: "E" },
	{ id: "fill", label: "Fill bucket", shortcut: "G" },
	{ id: "eyedropper", label: "Eyedropper", shortcut: "I" },
];

const StealthMiniWindowGlyph = ({
	className = "h-5 w-5",
}: {
	className?: string;
}): FunctionComponent => (
	<svg
		aria-hidden="true"
		className={className}
		fill="none"
		viewBox="0 0 20 20"
	>
		<rect
			height="13"
			rx="2.5"
			stroke="currentColor"
			strokeWidth="1.5"
			width="16"
			x="2"
			y="3.5"
		/>
		<rect fill="currentColor" height="5.5" rx="1" width="7.5" x="9" y="9.5" />
	</svg>
);

export const StealthWindowView = ({
	onClose,
}: {
	onClose: () => void;
}): FunctionComponent => {
	const tool = useEditorStore((state) => state.tool);
	const setTool = useEditorStore((state) => state.setTool);
	const primaryColor = useEditorStore((state) => state.primaryColor);
	const secondaryColor = useEditorStore((state) => state.secondaryColor);
	const setPrimaryColor = useEditorStore((state) => state.setPrimaryColor);
	const setSecondaryColor = useEditorStore((state) => state.setSecondaryColor);
	const swapColors = useEditorStore((state) => state.swapColors);
	const palette = useEditorStore((state) => state.palette);
	const brushSize = useEditorStore((state) => state.brushSize);
	const setBrushSize = useEditorStore((state) => state.setBrushSize);
	const showGrid = useEditorStore((state) => state.showGrid);
	const toggleGrid = useEditorStore((state) => state.toggleGrid);
	const fitView = useEditorStore((state) => state.fitView);
	const undo = useEditorStore((state) => state.undo);
	const redo = useEditorStore((state) => state.redo);
	const canUndo = useEditorStore(
		(state) => state.undoStack.length > 0 || state.floating !== null
	);
	const canRedo = useEditorStore((state) => state.redoStack.length > 0);
	const notice = useEditorStore((state) => state.notice);

	return (
		<div className="pe-stealth-root">
			<header className="pe-stealth-header flex shrink-0 items-center justify-between gap-1 border-b border-(--pe-border) bg-(--pe-bg-chrome) px-1.5 py-1">
				<div className="flex min-w-0 items-center gap-0.5">
					<div
						aria-label="Stealth drawing tools"
						className="flex items-center gap-0.5"
						role="toolbar"
					>
						{QUICK_TOOLS.map((item) => (
							<IconButton
								key={item.id}
								active={tool === item.id}
								className="h-6 w-6"
								label={`${item.label} (${item.shortcut})`}
								onClick={() => {
									setTool(item.id);
								}}
							>
								<ToolIcon className="h-3.5 w-3.5" tool={item.id} />
							</IconButton>
						))}
					</div>

					<div className="mx-0.5 h-4 w-px shrink-0 bg-(--pe-border)" />

					<IconButton
						className="h-6 w-6"
						disabled={!canUndo}
						label="Undo (Ctrl+Z)"
						onClick={undo}
					>
						<ArrowUturnLeftIcon className="h-3.5 w-3.5" />
					</IconButton>
					<IconButton
						className="h-6 w-6"
						disabled={!canRedo}
						label="Redo (Ctrl+Y)"
						onClick={redo}
					>
						<ArrowUturnRightIcon className="h-3.5 w-3.5" />
					</IconButton>

					<div className="pe-stealth-size-control items-center gap-0.5 border-l border-(--pe-border) pl-1">
						<button
							aria-label="Decrease brush size ([)"
							className="flex h-5 w-5 items-center justify-center rounded-md text-xs font-semibold text-(--pe-text-secondary) hover:bg-(--pe-bg-control-hover) hover:text-(--pe-text) disabled:opacity-35"
							disabled={brushSize <= 1}
							title="Decrease brush size ([)"
							type="button"
							onClick={() => {
								setBrushSize(brushSize - 1);
							}}
						>
							-
						</button>
						<span className="min-w-4 text-center text-[10px] font-semibold tabular-nums text-(--pe-text-secondary)">
							{brushSize}
						</span>
						<button
							aria-label="Increase brush size (])"
							className="flex h-5 w-5 items-center justify-center rounded-md text-xs font-semibold text-(--pe-text-secondary) hover:bg-(--pe-bg-control-hover) hover:text-(--pe-text) disabled:opacity-35"
							disabled={brushSize >= MAX_BRUSH_SIZE}
							title="Increase brush size (])"
							type="button"
							onClick={() => {
								setBrushSize(brushSize + 1);
							}}
						>
							+
						</button>
					</div>
				</div>

				<div className="flex shrink-0 items-center gap-0.5">
					<IconButton
						active={showGrid}
						className="pe-stealth-extra-control h-6 w-6"
						label="Toggle pixel grid (#)"
						onClick={toggleGrid}
					>
						<Squares2X2Icon className="h-3.5 w-3.5" />
					</IconButton>
					<IconButton
						className="pe-stealth-extra-control h-6 w-6"
						label="Fit to window (0)"
						onClick={fitView}
					>
						<ArrowsPointingInIcon className="h-3.5 w-3.5" />
					</IconButton>

					<button
						aria-label="Swap primary and secondary colors (X)"
						className="relative mx-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-(--pe-border) bg-(--pe-bg-control) hover:bg-(--pe-bg-control-hover)"
						title={`Primary ${primaryColor} / Secondary ${secondaryColor} · Click to swap · Resize window for quick palette`}
						type="button"
						onClick={swapColors}
					>
						<span
							className="swatch-preserve absolute right-0.5 bottom-0.5 h-3 w-3 rounded-xs border border-(--pe-border-strong)"
							style={{ background: secondaryColor }}
						/>
						<span
							className="swatch-preserve absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-xs border border-(--pe-bg-panel) ring-1 ring-(--pe-border-strong)"
							style={{ background: primaryColor }}
						/>
					</button>

					<IconButton
						className="h-6 w-6"
						label="Return to studio"
						onClick={() => {
							window.focus();
							onClose();
						}}
					>
						<ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
					</IconButton>
				</div>
			</header>

			<div className="pe-stealth-workspace">
				<main className="pe-stealth-canvas canvas-backdrop">
					<PixelCanvas fitOnMount />
					{notice && (
						<div className="pointer-events-none absolute inset-x-2 bottom-2 flex justify-center">
							<span className="max-w-full truncate rounded-full border border-(--pe-border-strong) bg-(--pe-bg-panel) px-2.5 py-0.5 text-[10px] font-medium text-(--pe-text) shadow-sm">
								{notice.message}
							</span>
						</div>
					)}
				</main>

				<aside
					aria-label="Quick palette"
					className="pe-stealth-palette bg-(--pe-bg-chrome)"
				>
					<div className="mb-1 flex shrink-0 items-center justify-between gap-1.5">
						<span className="text-[10px] font-semibold uppercase tracking-wider text-(--pe-text-muted)">
							Palette
						</span>
						<div className="flex items-center gap-1">
							<span className="font-mono text-[10px] text-(--pe-text-secondary)">
								{primaryColor.toUpperCase()}
							</span>
							<button
								aria-label="Swap colors"
								className="rounded px-1 text-[10px] text-(--pe-text-muted) hover:bg-(--pe-bg-control-hover) hover:text-(--pe-text)"
								title="Swap primary and secondary colors (X)"
								type="button"
								onClick={swapColors}
							>
								⇄
							</button>
						</div>
					</div>
					<div className="editor-scrollbar min-h-0 flex-1 overflow-y-auto pr-0.5">
						<div className="pe-stealth-palette-grid grid gap-1">
							{palette.map((swatch) => {
								const isPrimary = swatch === primaryColor;
								const isSecondary = swatch === secondaryColor;
								let swatchClass = "border-(--pe-border)";
								if (isPrimary) {
									swatchClass = "border-white ring-2 ring-(--pe-accent)";
								} else if (isSecondary) {
									swatchClass = "border-(--pe-text)";
								}
								return (
									<button
										key={swatch}
										aria-label={`Quick palette color ${swatch}`}
										aria-pressed={isPrimary}
										className={`swatch-preserve aspect-square w-full rounded-xs border transition-transform hover:scale-105 ${swatchClass}`}
										style={{ background: swatch }}
										title={`${swatch} — left: primary, right: secondary`}
										type="button"
										onClick={() => {
											setPrimaryColor(swatch);
										}}
										onContextMenu={(event) => {
											event.preventDefault();
											setSecondaryColor(swatch);
										}}
									/>
								);
							})}
						</div>
					</div>
				</aside>
			</div>
		</div>
	);
};

export const StealthActivePlaceholder = ({
	mode,
	onFocus,
	onClose,
}: {
	mode: StealthWindowMode | null;
	onFocus: () => void;
	onClose: () => void;
}): FunctionComponent => (
	<div className="flex h-full w-full items-center justify-center p-4">
		<div className="pe-panel-card flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-(--pe-border) bg-(--pe-bg-panel) p-5 text-center shadow-sm">
			<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-(--pe-accent-soft) text-(--pe-accent-soft-ink)">
				<StealthMiniWindowGlyph className="h-5 w-5" />
			</div>
			<div className="space-y-1">
				<h2 className="text-sm font-semibold text-(--pe-text)">
					Stealth Mode Active
				</h2>
				<p className="text-xs font-medium text-(--pe-text-secondary)">
					{mode === "pip"
						? "Always-on-top Picture-in-Picture window"
						: "Floating resizable pop-up window"}
				</p>
				<p className="text-[11px] leading-relaxed text-(--pe-text-muted)">
					Resize the mini window wider or taller to reveal the Quick Palette.
					All edits sync live and autosave automatically.
				</p>
			</div>
			<div className="flex flex-wrap items-center justify-center gap-2 pt-1">
				<TextButton onClick={onFocus}>Focus mini window</TextButton>
				<TextButton variant="primary" onClick={onClose}>
					Return to studio
				</TextButton>
			</div>
		</div>
	</div>
);
