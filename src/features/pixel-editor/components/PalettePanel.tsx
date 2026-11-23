import { type CSSProperties, useId, useMemo, useRef } from "react";
import type { FunctionComponent } from "../../../common/types";
import { DEFAULT_PALETTE } from "../constants";
import { paletteFromCanvas } from "../lib/files";
import { BUILT_IN_PALETTES, findMatchingPalette } from "../lib/palettes";
import { useEditorStore } from "../store/editorStore";
import { PanelCard } from "./ui";

const PRESET_ANCHOR = { anchorName: "--palette-preset-anchor" } as CSSProperties;
const PRESET_POPOVER_POS = {
	positionAnchor: "--palette-preset-anchor",
} as CSSProperties;

function positionPresetPopoverFallback(
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
		Math.min(triggerRect.right - popoverRect.width, window.innerWidth - popoverRect.width - 8)
	);
	popover.style.top = `${top}px`;
	popover.style.left = `${left}px`;
	popover.style.transform = "none";
}

export const PalettePanel = (): FunctionComponent => {
	const popoverId = useId();
	const triggerReference = useRef<HTMLButtonElement>(null);
	const popoverReference = useRef<HTMLDivElement>(null);

	const primaryColor = useEditorStore((state) => state.primaryColor);
	const secondaryColor = useEditorStore((state) => state.secondaryColor);
	const setPrimaryColor = useEditorStore((state) => state.setPrimaryColor);
	const setSecondaryColor = useEditorStore((state) => state.setSecondaryColor);
	const palette = useEditorStore((state) => state.palette);
	const removePaletteColor = useEditorStore(
		(state) => state.removePaletteColor
	);
	const setPalette = useEditorStore((state) => state.setPalette);

	const activePreset = useMemo(() => findMatchingPalette(palette), [palette]);

	return (
		<PanelCard
			collapsible
			badge={palette.length}
			title="Palette"
			actions={
				<div className="flex items-center gap-2 text-[10px]">
					<button
						className="font-medium text-(--pe-text-muted) hover:text-(--pe-text)"
						title="Extract colors already on the canvas"
						type="button"
						onClick={paletteFromCanvas}
					>
						From canvas
					</button>
					<button
						className="font-medium text-(--pe-text-muted) hover:text-(--pe-text)"
						type="button"
						onClick={() => {
							setPalette(DEFAULT_PALETTE);
						}}
					>
						Reset
					</button>
				</div>
			}
		>
			<div className="mb-2">
				<button
					ref={triggerReference}
					className="flex w-full items-center justify-between rounded-lg border border-(--pe-border) bg-(--pe-bg-control) px-2.5 py-1.5 text-left text-xs text-(--pe-text) transition-colors hover:bg-(--pe-bg-control-hover)"
					popoverTarget={popoverId}
					style={PRESET_ANCHOR}
					type="button"
				>
					<span className="truncate font-medium">
						{activePreset
							? activePreset.name
							: `Custom Palette (${palette.length})`}
					</span>
					<span className="ml-1 shrink-0 text-[10px] text-(--pe-text-muted)">
						Presets ▾
					</span>
				</button>

				<div
					ref={popoverReference}
					className="editor-popover editor-scrollbar w-64 rounded-xl border border-(--pe-border-strong) bg-(--pe-bg-panel) p-1.5 text-xs text-(--pe-text)"
					id={popoverId}
					popover="auto"
					style={PRESET_POPOVER_POS}
					onToggle={(event) => {
						if (event.newState === "open") {
							positionPresetPopoverFallback(
								triggerReference.current,
								popoverReference.current
							);
						}
					}}
				>
					<div className="mb-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-(--pe-text-muted)">
						Built-in Palettes ({BUILT_IN_PALETTES.length})
					</div>
					<div className="space-y-1">
						{BUILT_IN_PALETTES.map((preset) => {
							const isSelected = activePreset?.id === preset.id;
							return (
								<button
									key={preset.id}
									aria-pressed={isSelected}
									type="button"
									className={`flex w-full flex-col gap-1 rounded-lg px-2 py-1.5 text-left transition-colors ${
										isSelected
											? "bg-(--pe-accent-soft) text-(--pe-text) ring-1 ring-(--pe-accent-ring)"
											: "hover:bg-(--pe-bg-control-hover)"
									}`}
									onClick={() => {
										setPalette(preset.colors);
										popoverReference.current?.hidePopover();
									}}
								>
									<div className="flex w-full items-center justify-between gap-2">
										<span className="truncate font-medium">
											{isSelected ? "✓ " : ""}
											{preset.name}
										</span>
										<span className="shrink-0 text-[10px] text-(--pe-text-muted)">
											{preset.colors.length}
										</span>
									</div>
									<div className="flex h-2 w-full overflow-hidden rounded-sm border border-(--pe-border)">
										{preset.colors.slice(0, 16).map((swatch) => (
											<span
												key={swatch}
												className="swatch-preserve flex-1"
												style={{ background: swatch }}
											/>
										))}
									</div>
								</button>
							);
						})}
					</div>
				</div>
			</div>

			<div className="pe-palette-grid grid gap-1">
				{palette.map((swatch, index) => (
					<div key={swatch} className="group relative">
						<button
							aria-label={`Palette color ${swatch}`}
							style={{ background: swatch }}
							title={`${swatch} — left: primary, right: secondary`}
							type="button"
							className={`swatch-preserve block aspect-square w-full rounded-sm border transition-transform hover:scale-105 ${
								swatch === primaryColor
									? "border-white ring-2 ring-(--pe-accent)"
									: swatch === secondaryColor
										? "border-(--pe-text)"
										: "border-(--pe-border)"
							}`}
							onClick={() => {
								setPrimaryColor(swatch);
							}}
							onContextMenu={(event) => {
								event.preventDefault();
								setSecondaryColor(swatch);
							}}
						/>
						<button
							aria-label={`Remove ${swatch}`}
							className="absolute -top-1 -right-1 hidden h-3.5 w-3.5 items-center justify-center rounded-full bg-(--pe-bg-chrome) text-[9px] leading-none text-(--pe-text) ring-1 ring-(--pe-border-strong) group-focus-within:flex group-hover:flex hover:bg-(--pe-danger) hover:text-white"
							type="button"
							onClick={() => {
								removePaletteColor(index);
							}}
						>
							×
						</button>
					</div>
				))}
			</div>
		</PanelCard>
	);
};
