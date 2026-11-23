import { useRef, useState } from "react";
import type { FunctionComponent } from "../../../common/types";
import { cloneCustomBrush, transformCustomBrush } from "../lib/brushPresets";
import { hexToPacked, packedAlpha, packedToHex, TRANSPARENT } from "../lib/color";
import { useEditorStore } from "../store/editorStore";
import type { CustomBrush } from "../types";
import { Modal, TextButton } from "./ui";

const SIZES = [3, 5, 7, 9, 12, 16];

function resizeBrush(
	brush: CustomBrush,
	newWidth: number,
	newHeight: number
): CustomBrush {
	const mask = new Uint8Array(newWidth * newHeight);
	const colors = brush.colors
		? new Uint32Array(newWidth * newHeight)
		: undefined;
	const offsetX = Math.floor((newWidth - brush.width) / 2);
	const offsetY = Math.floor((newHeight - brush.height) / 2);
	for (let row = 0; row < brush.height; row++) {
		for (let column = 0; column < brush.width; column++) {
			const targetX = column + offsetX;
			const targetY = row + offsetY;
			if (
				targetX >= 0 &&
				targetX < newWidth &&
				targetY >= 0 &&
				targetY < newHeight
			) {
				const sourceIndex = row * brush.width + column;
				const targetIndex = targetY * newWidth + targetX;
				mask[targetIndex] = brush.mask[sourceIndex] ?? 0;
				if (colors && brush.colors) {
					colors[targetIndex] = brush.colors[sourceIndex] ?? TRANSPARENT;
				}
			}
		}
	}
	return {
		...brush,
		width: newWidth,
		height: newHeight,
		mask,
		...(colors ? { colors } : {}),
	};
}

function mapMask(
	mask: Uint8Array<ArrayBuffer>,
	mapper: (value: number) => 0 | 1
): Uint8Array<ArrayBuffer> {
	const next = new Uint8Array(mask.length);
	for (let index = 0; index < mask.length; index++) {
		next[index] = mapper(mask[index] ?? 0);
	}
	return next;
}

export const CustomBrushDialog = ({
	onClose,
}: {
	onClose: () => void;
}): FunctionComponent => {
	const currentBrush = useEditorStore((state) => state.customBrush);
	const presets = useEditorStore((state) => state.customBrushPresets);
	const selection = useEditorStore((state) => state.selection);
	const palette = useEditorStore((state) => state.palette);
	const primaryColor = useEditorStore((state) => state.primaryColor);
	const setCustomBrush = useEditorStore((state) => state.setCustomBrush);
	const saveCustomBrushPreset = useEditorStore(
		(state) => state.saveCustomBrushPreset
	);
	const deleteCustomBrushPreset = useEditorStore(
		(state) => state.deleteCustomBrushPreset
	);
	const setTool = useEditorStore((state) => state.setTool);
	const captureCustomBrush = useEditorStore(
		(state) => state.captureCustomBrush
	);

	const [draft, setDraft] = useState<CustomBrush>(() =>
		cloneCustomBrush(currentBrush)
	);
	const [paintColor, setPaintColor] = useState<string>(primaryColor);
	const [multiColorMode, setMultiColorMode] = useState<boolean>(
		currentBrush.colors !== undefined
	);
	const [presetName, setPresetName] = useState<string>("");
	const paintModeReference = useRef<"draw" | "erase" | null>(null);

	const setCell = (index: number, action: "draw" | "erase"): void => {
		setDraft((previous) => {
			const nextMask = new Uint8Array(previous.mask);
			const nextColors =
				multiColorMode || previous.colors
					? new Uint32Array(
							previous.colors ?? new Uint32Array(previous.width * previous.height)
						)
					: undefined;
			if (action === "erase") {
				nextMask[index] = 0;
				if (nextColors) nextColors[index] = TRANSPARENT;
			} else {
				nextMask[index] = 1;
				if (nextColors) nextColors[index] = hexToPacked(paintColor);
			}
			return {
				...previous,
				mask: nextMask,
				...(nextColors ? { colors: nextColors } : {}),
			};
		});
	};

	const setGridSize = (size: number): void => {
		setDraft((previous) => resizeBrush(previous, size, size));
	};

	const toggleMultiColorMode = (nextMulti: boolean): void => {
		setMultiColorMode(nextMulti);
		setDraft((previous) => {
			if (!nextMulti) {
				return {
					width: previous.width,
					height: previous.height,
					mask: new Uint8Array(previous.mask),
				};
			}
			const packed = hexToPacked(paintColor);
			const colors = new Uint32Array(previous.width * previous.height);
			for (let index = 0; index < previous.mask.length; index++) {
				if (previous.mask[index] === 1) {
					colors[index] = previous.colors?.[index] || packed;
				}
			}
			return { ...previous, colors };
		});
	};

	const cells = Array.from(draft.mask);

	return (
		<Modal
			title="Custom Pattern Brush"
			footer={
				<>
					<TextButton onClick={onClose}>Cancel</TextButton>
					<TextButton
						variant="primary"
						onClick={() => {
							const hasAny = draft.mask.some((cell) => cell !== 0);
							if (!hasAny) {
								onClose();
								return;
							}
							setCustomBrush(draft);
							setTool("custom-brush");
							onClose();
						}}
					>
						Use pattern brush
					</TextButton>
				</>
			}
			onClose={onClose}
		>
			<div className="mb-3 space-y-1.5">
				<span className="text-[11px] font-semibold uppercase tracking-wide text-(--pe-text-muted)">
					Presets
				</span>
				<div className="flex flex-wrap gap-1.5">
					{presets.map((preset) => {
						const presetId = preset.id ?? preset.name ?? "preset";
						const isUserPreset = presetId.startsWith("user-");
						return (
							<div key={presetId} className="inline-flex items-center gap-0.5">
								<TextButton
									active={draft.id === presetId}
									onClick={() => {
										setDraft(cloneCustomBrush(preset));
										setMultiColorMode(preset.colors !== undefined);
									}}
								>
									{preset.name ?? presetId}
								</TextButton>
								{isUserPreset && (
									<button
										aria-label={`Delete ${preset.name ?? "preset"}`}
										className="rounded px-1 text-[11px] text-(--pe-text-muted) hover:bg-(--pe-danger-soft) hover:text-(--pe-danger)"
										title="Delete preset"
										type="button"
										onClick={() => {
											deleteCustomBrushPreset(presetId);
										}}
									>
										×
									</button>
								)}
							</div>
						);
					})}
				</div>
			</div>

			<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-1.5">
					<TextButton
						active={!multiColorMode}
						onClick={() => {
							toggleMultiColorMode(false);
						}}
					>
						Mask (Tint)
					</TextButton>
					<TextButton
						active={multiColorMode}
						onClick={() => {
							toggleMultiColorMode(true);
						}}
					>
						Multi-color
					</TextButton>
				</div>
				<div className="flex flex-wrap gap-1">
					{SIZES.map((size) => (
						<TextButton
							key={size}
							active={draft.width === size && draft.height === size}
							onClick={() => {
								setGridSize(size);
							}}
						>
							{size}×{size}
						</TextButton>
					))}
				</div>
			</div>

			{multiColorMode && (
				<div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-(--pe-border-subtle) bg-(--pe-bg-panel-subtle) p-2">
					<span className="text-[11px] text-(--pe-text-muted)">
						Color:
					</span>
					{palette.slice(0, 16).map((swatch) => (
						<button
							key={swatch}
							aria-label={`Pattern color ${swatch}`}
							aria-pressed={paintColor === swatch}
							style={{ backgroundColor: swatch }}
							type="button"
							className={`swatch-preserve h-4 w-4 rounded-sm border ${
								paintColor === swatch
									? "ring-2 ring-(--pe-accent) border-white"
									: "border-(--pe-border-strong)"
							}`}
							onClick={() => {
								setPaintColor(swatch);
							}}
						/>
					))}
					<input
						aria-label="Custom pattern color"
						className="h-5 w-6 cursor-pointer rounded border border-(--pe-border) bg-transparent p-0"
						type="color"
						value={paintColor}
						onChange={(event) => {
							setPaintColor(event.target.value);
						}}
					/>
				</div>
			)}

			<div
				className="mx-auto grid w-fit select-none gap-px rounded-md border border-(--pe-border) bg-(--pe-border) p-px"
				style={{
					gridTemplateColumns: `repeat(${draft.width}, minmax(0, 1fr))`,
				}}
				onPointerLeave={() => {
					paintModeReference.current = null;
				}}
				onPointerUp={() => {
					paintModeReference.current = null;
				}}
			>
				{cells.map((value, index) => {
					const active = value !== 0;
					const packed = draft.colors?.[index] ?? 0;
					const cellHex =
						active && multiColorMode && packedAlpha(packed) > 0
							? packedToHex(packed)
							: null;
					const row = Math.floor(index / draft.width) + 1;
					const column = (index % draft.width) + 1;
					return (
						<button
							key={index}
							aria-label={`Brush cell ${column},${row}`}
							aria-pressed={active}
							style={cellHex ? { backgroundColor: cellHex } : undefined}
							type="button"
							className={`swatch-preserve h-4 w-4 transition-colors ${
								active
									? cellHex
										? ""
										: "bg-(--pe-accent) hover:bg-(--pe-accent-hover)"
									: "bg-(--pe-bg-panel) hover:bg-(--pe-bg-control)"
							}`}
							onPointerDown={(event) => {
								event.preventDefault();
								const isSameColor =
									active &&
									(!multiColorMode || cellHex === paintColor.toLowerCase());
								const nextAction: "draw" | "erase" = isSameColor
									? "erase"
									: "draw";
								paintModeReference.current = nextAction;
								setCell(index, nextAction);
							}}
							onPointerEnter={() => {
								if (paintModeReference.current !== null) {
									setCell(index, paintModeReference.current);
								}
							}}
						/>
					);
				})}
			</div>

			<div className="mt-3 flex flex-wrap items-center justify-between gap-1.5">
				<div className="flex flex-wrap gap-1">
					<TextButton
						onClick={() => {
							setDraft((previous) => ({
								...previous,
								mask: mapMask(previous.mask, () => 0),
								...(previous.colors
									? { colors: new Uint32Array(previous.mask.length) }
									: {}),
							}));
						}}
					>
						Clear
					</TextButton>
					<TextButton
						onClick={() => {
							setDraft((previous) => {
								const nextMask = mapMask(previous.mask, (cell) =>
									cell !== 0 ? 0 : 1
								);
								if (!previous.colors) return { ...previous, mask: nextMask };
								const nextColors = new Uint32Array(previous.mask.length);
								const packed = hexToPacked(paintColor);
								for (let index = 0; index < nextMask.length; index++) {
									nextColors[index] =
										nextMask[index] === 1 ? packed : TRANSPARENT;
								}
								return { ...previous, mask: nextMask, colors: nextColors };
							});
						}}
					>
						Invert
					</TextButton>
					<TextButton
						onClick={() => {
							setDraft((previous) =>
								transformCustomBrush(previous, true, false, 0)
							);
						}}
					>
						Flip H
					</TextButton>
					<TextButton
						onClick={() => {
							setDraft((previous) =>
								transformCustomBrush(previous, false, true, 0)
							);
						}}
					>
						Flip V
					</TextButton>
					<TextButton
						onClick={() => {
							setDraft((previous) =>
								transformCustomBrush(previous, false, false, 1)
							);
						}}
					>
						Rotate 90°
					</TextButton>
				</div>
				<TextButton
					disabled={!selection}
					title={
						selection
							? "Capture the current canvas selection as your custom brush"
							: "Make a selection on the canvas first"
					}
					onClick={() => {
						if (captureCustomBrush()) {
							const captured = useEditorStore.getState().customBrush;
							setDraft(cloneCustomBrush(captured));
							setMultiColorMode(captured.colors !== undefined);
						}
					}}
				>
					From selection
				</TextButton>
			</div>

			<div className="mt-3 flex items-center gap-2 border-t border-(--pe-border-subtle) pt-3">
				<input
					aria-label="New preset name"
					className="flex-1 rounded-md border border-(--pe-border) bg-(--pe-bg-control) px-2 py-1 text-xs text-(--pe-text) outline-none focus:border-(--pe-accent)"
					placeholder="Save pattern as preset…"
					value={presetName}
					onChange={(event) => {
						setPresetName(event.target.value);
					}}
				/>
				<TextButton
					disabled={!draft.mask.some((cell) => cell !== 0)}
					onClick={() => {
						saveCustomBrushPreset(presetName || "My Pattern", draft);
						setPresetName("");
					}}
				>
					Save preset
				</TextButton>
			</div>
		</Modal>
	);
};
