import { useMemo, useState } from "react";
import { HexColorInput, HexColorPicker } from "react-colorful";
import type { FunctionComponent } from "../../../common/types";
import { generateColorRamp } from "../lib/color";
import { useEditorStore } from "../store/editorStore";
import { PanelCard } from "./ui";

type Slot = "primary" | "secondary";

const SlotButton = ({
	slot,
	color,
	active,
	onSelect,
}: {
	slot: Slot;
	color: string;
	active: boolean;
	onSelect: (slot: Slot) => void;
}): FunctionComponent => (
	<button
		aria-pressed={active}
		type="button"
		className={`flex flex-1 items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--pe-accent) ${
			active
				? "border-(--pe-accent) bg-(--pe-accent-soft)"
				: "border-(--pe-border) bg-(--pe-bg-control) hover:bg-(--pe-bg-control-hover)"
		}`}
		onClick={() => {
			onSelect(slot);
		}}
	>
		<span
			className="swatch-preserve h-5 w-5 shrink-0 rounded border border-(--pe-border-strong)"
			style={{ background: color }}
		/>
		<span className="min-w-0">
			<span className="block text-[9px] font-semibold uppercase tracking-wide text-(--pe-text-muted)">
				{slot === "primary" ? "Left" : "Right"}
			</span>
			<span className="block truncate font-mono text-[11px] text-(--pe-text)">
				{color}
			</span>
		</span>
	</button>
);

export const ColorPickerPanel = (): FunctionComponent => {
	const [slot, setSlot] = useState<Slot>("primary");
	const [rampOpen, setRampOpen] = useState(true);
	const [rampOptionsOpen, setRampOptionsOpen] = useState(false);

	const primaryColor = useEditorStore((state) => state.primaryColor);
	const secondaryColor = useEditorStore((state) => state.secondaryColor);
	const setPrimaryColor = useEditorStore((state) => state.setPrimaryColor);
	const setSecondaryColor = useEditorStore((state) => state.setSecondaryColor);
	const swapColors = useEditorStore((state) => state.swapColors);
	const addPaletteColor = useEditorStore((state) => state.addPaletteColor);
	const colorRampOptions = useEditorStore((state) => state.colorRampOptions);
	const setColorRampOptions = useEditorStore(
		(state) => state.setColorRampOptions
	);
	const stepPrimaryShade = useEditorStore((state) => state.stepPrimaryShade);

	const color = slot === "primary" ? primaryColor : secondaryColor;
	const setColor = slot === "primary" ? setPrimaryColor : setSecondaryColor;
	const rampColors = useMemo(
		() => generateColorRamp(color, colorRampOptions),
		[color, colorRampOptions]
	);

	return (
		<PanelCard
			collapsible
			title="Color"
			actions={
				<div className="flex gap-1">
					<button
						className="rounded-md border border-(--pe-border) bg-(--pe-bg-control) px-1.5 py-0.5 text-[10px] font-medium text-(--pe-text-secondary) hover:bg-(--pe-bg-control-hover) hover:text-(--pe-text)"
						title="Step primary color one hue-shifted shade darker"
						type="button"
						onClick={() => {
							stepPrimaryShade("shadow");
						}}
					>
						− Shade
					</button>
					<button
						className="rounded-md border border-(--pe-border) bg-(--pe-bg-control) px-1.5 py-0.5 text-[10px] font-medium text-(--pe-text-secondary) hover:bg-(--pe-bg-control-hover) hover:text-(--pe-text)"
						title="Step primary color one hue-shifted shade lighter"
						type="button"
						onClick={() => {
							stepPrimaryShade("highlight");
						}}
					>
						+ Light
					</button>
				</div>
			}
		>
			<div className="mb-2 flex items-center gap-1">
				<SlotButton
					active={slot === "primary"}
					color={primaryColor}
					slot="primary"
					onSelect={setSlot}
				/>
				<button
					aria-label="Swap primary and secondary colors (X)"
					className="rounded-md px-1 py-1 text-xs text-(--pe-text-muted) hover:bg-(--pe-bg-control) hover:text-(--pe-text)"
					title="Swap (X)"
					type="button"
					onClick={swapColors}
				>
					⇄
				</button>
				<SlotButton
					active={slot === "secondary"}
					color={secondaryColor}
					slot="secondary"
					onSelect={setSlot}
				/>
			</div>

			<div className="pixel-color-picker">
				<HexColorPicker color={color} onChange={setColor} />
			</div>

			<div className="mt-2 flex gap-1.5">
				<HexColorInput
					prefixed
					aria-label="Hex color"
					className="w-full rounded-lg border border-(--pe-border) bg-(--pe-bg-control) px-2 py-1 font-mono text-xs text-(--pe-text) outline-none focus:border-(--pe-accent)"
					color={color}
					onChange={setColor}
				/>
				<button
					className="shrink-0 rounded-lg border border-(--pe-border) bg-(--pe-bg-control) px-2 text-xs font-medium text-(--pe-text) transition-colors hover:bg-(--pe-bg-control-hover)"
					title="Add this color to the palette"
					type="button"
					onClick={() => {
						addPaletteColor(color);
					}}
				>
					+ Palette
				</button>
			</div>

			{/* Hue-shifted color ramp */}
			<div className="mt-2.5 rounded-lg border border-(--pe-border-subtle) bg-(--pe-bg-panel-subtle) p-2">
				<div className="flex items-center justify-between gap-1">
					<button
						aria-expanded={rampOpen}
						className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-(--pe-text-muted) hover:text-(--pe-text)"
						type="button"
						onClick={() => {
							setRampOpen((open) => !open);
						}}
					>
						<span>{rampOpen ? "▾" : "▸"} Color Ramp</span>
					</button>
					<div className="flex items-center gap-2 text-[10px]">
						<button
							aria-pressed={rampOptionsOpen}
							className="font-medium text-(--pe-text-muted) hover:text-(--pe-text)"
							title="Configure hue shift parameters"
							type="button"
							onClick={() => {
								setRampOptionsOpen((open) => !open);
							}}
						>
							Tune
						</button>
						<button
							className="font-semibold text-(--pe-accent) hover:underline"
							title="Append generated ramp shades to palette"
							type="button"
							onClick={() => {
								for (const rampColor of rampColors) {
									addPaletteColor(rampColor);
								}
							}}
						>
							+ Ramp
						</button>
					</div>
				</div>

				{rampOpen && (
					<>
						<div className="mt-1.5 flex gap-1">
							{rampColors.map((swatch, index) => {
								const isCenter = index === Math.floor(rampColors.length / 2);
								return (
									<button
										key={`${index}-${swatch}`}
										aria-label={`Ramp shade ${swatch}`}
										style={{ background: swatch }}
										title={`${swatch} — left: primary, right: secondary`}
										type="button"
										className={`swatch-preserve relative h-5 flex-1 rounded-sm border transition-transform hover:scale-105 ${
											swatch === primaryColor
												? "border-white ring-2 ring-(--pe-accent)"
												: isCenter
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
									>
										{isCenter && (
											<span className="pointer-events-none absolute inset-x-0 -bottom-0.5 mx-auto block h-1 w-1 rounded-full bg-white shadow" />
										)}
									</button>
								);
							})}
						</div>

						{rampOptionsOpen && (
							<div className="mt-2 space-y-1.5 border-t border-(--pe-border-subtle) pt-2 text-[11px] text-(--pe-text-muted)">
								<div className="flex items-center justify-between gap-2">
									<span>Mode</span>
									<div className="flex gap-1">
										{(["smart", "linear"] as const).map((mode) => (
											<button
												key={mode}
												aria-pressed={colorRampOptions.mode === mode}
												type="button"
												className={`rounded px-1.5 py-0.5 text-[10px] capitalize ${
													colorRampOptions.mode === mode
														? "bg-(--pe-accent) text-(--pe-accent-ink)"
														: "bg-(--pe-bg-control) text-(--pe-text-secondary) hover:bg-(--pe-bg-control-hover)"
												}`}
												onClick={() => {
													setColorRampOptions({ mode });
												}}
											>
												{mode}
											</button>
										))}
									</div>
								</div>

								<label className="flex items-center justify-between gap-2">
									<span>Steps ({colorRampOptions.steps})</span>
									<input
										className="w-24 accent-(--pe-accent)"
										max={9}
										min={3}
										step={2}
										type="range"
										value={colorRampOptions.steps}
										onChange={(event) => {
											setColorRampOptions({
												steps: Number(event.target.value),
											});
										}}
									/>
								</label>

								<label className="flex items-center justify-between gap-2">
									<span>
										Shadow shift ({colorRampOptions.shadowHueShift}°)
									</span>
									<input
										className="w-24 accent-(--pe-accent)"
										max={90}
										min={-90}
										step={5}
										type="range"
										value={colorRampOptions.shadowHueShift}
										onChange={(event) => {
											setColorRampOptions({
												shadowHueShift: Number(event.target.value),
											});
										}}
									/>
								</label>

								<label className="flex items-center justify-between gap-2">
									<span>
										Light shift ({colorRampOptions.highlightHueShift}°)
									</span>
									<input
										className="w-24 accent-(--pe-accent)"
										max={90}
										min={-90}
										step={5}
										type="range"
										value={colorRampOptions.highlightHueShift}
										onChange={(event) => {
											setColorRampOptions({
												highlightHueShift: Number(event.target.value),
											});
										}}
									/>
								</label>

								<label className="flex items-center justify-between gap-2">
									<span>Saturation ({colorRampOptions.saturationBoost}%)</span>
									<input
										className="w-24 accent-(--pe-accent)"
										max={40}
										min={-20}
										step={5}
										type="range"
										value={colorRampOptions.saturationBoost}
										onChange={(event) => {
											setColorRampOptions({
												saturationBoost: Number(event.target.value),
											});
										}}
									/>
								</label>
							</div>
						)}
					</>
				)}
			</div>
		</PanelCard>
	);
};
