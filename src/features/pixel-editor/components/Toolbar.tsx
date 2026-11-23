import { Cog6ToothIcon } from "@heroicons/react/20/solid";
import {
	type CSSProperties,
	Fragment,
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	type ReactNode,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import type { FunctionComponent } from "../../../common/types";
import type { ToolInfo } from "../constants";
import { useEditorStore } from "../store/editorStore";
import {
	clampToolbarWidth,
	DEFAULT_TOOLBAR_WIDTH,
	getVisibleOrderedTools,
	MAX_TOOLBAR_WIDTH,
	MIN_TOOLBAR_WIDTH,
	useUiSettingsStore,
} from "../store/uiSettingsStore";
import type {
	PerspectiveMode,
	TiledPreviewAxis,
	Tool,
} from "../types";
import { GuideIcon, ToolIcon } from "./ToolIcon";
import { Kbd, TextButton, Toggle } from "./ui";

const KEYBOARD_RESIZE_STEP = 12;

const SUPPORTS_FOCUSGROUP =
	typeof HTMLElement !== "undefined" &&
	"focusGroup" in HTMLElement.prototype;

const GRID_PRESETS = [4, 8, 16, 32];
const GRID_COLORS = ["#38bdf8", "#a855f7", "#22c55e", "#f59e0b", "#f43f5e", "#ffffff"];

const PERSPECTIVE_MODES: Array<{ id: PerspectiveMode; label: string }> = [
	{ id: "1-point", label: "1-Point" },
	{ id: "2-point", label: "2-Point" },
	{ id: "3-point", label: "3-Point" },
	{ id: "fisheye", label: "Fisheye" },
];

const TILED_AXES: Array<{ id: TiledPreviewAxis; label: string }> = [
	{ id: "both", label: "Both" },
	{ id: "horizontal", label: "Horizontal" },
	{ id: "vertical", label: "Vertical" },
];

type ToolbarSlot = {
	id: string;
	category: ToolInfo["category"];
	primary: ToolInfo;
	children: Array<ToolInfo>;
};

function positionSidePopoverFallback(
	trigger: HTMLElement | null,
	popover: HTMLElement | null
): void {
	if (!trigger || !popover) return;
	if (
		typeof CSS !== "undefined" &&
		typeof CSS.supports === "function" &&
		CSS.supports("position-area", "inline-end")
	) {
		return;
	}
	const triggerRect = trigger.getBoundingClientRect();
	const popoverRect = popover.getBoundingClientRect();
	const fitsRight =
		triggerRect.right + popoverRect.width + 12 <= window.innerWidth;
	const left = fitsRight
		? triggerRect.right + 6
		: Math.max(8, triggerRect.left - popoverRect.width - 6);
	const top = Math.max(
		8,
		Math.min(triggerRect.top, window.innerHeight - popoverRect.height - 8)
	);
	popover.style.left = `${left}px`;
	popover.style.top = `${top}px`;
}

function buildToolSlots(visibleTools: Array<ToolInfo>): Array<ToolbarSlot> {
	const enabledIds = new Set(visibleTools.map((info) => info.id));
	const childrenByParent = new Map<Tool, Array<ToolInfo>>();
	for (const info of visibleTools) {
		if (info.parent && enabledIds.has(info.parent)) {
			const list = childrenByParent.get(info.parent) ?? [];
			list.push(info);
			childrenByParent.set(info.parent, list);
		}
	}

	const slots: Array<ToolbarSlot> = [];
	for (const info of visibleTools) {
		if (info.parent && enabledIds.has(info.parent)) continue;
		const children = childrenByParent.get(info.id) ?? [];
		slots.push({
			id: info.id,
			category: info.category,
			primary: info,
			children,
		});
	}
	return slots;
}

const CornerFlyoutCaret = ({
	popoverId,
	label,
	anchorStyle,
}: {
	popoverId: string;
	label: string;
	anchorStyle: CSSProperties;
}): FunctionComponent => (
	<button
		aria-label={label}
		className="pe-corner-badge-btn"
		popoverTarget={popoverId}
		style={anchorStyle}
		title={label}
		type="button"
	>
		<svg aria-hidden="true" className="h-2.5 w-2.5" viewBox="0 0 8 8">
			<path d="M7 2v5H2z" fill="currentColor" />
		</svg>
	</button>
);

const CornerGearButton = ({
	popoverId,
	label,
}: {
	popoverId: string;
	label: string;
}): FunctionComponent => (
	<button
		aria-label={label}
		className="pe-corner-badge-btn"
		popoverTarget={popoverId}
		title={label}
		type="button"
	>
		<Cog6ToothIcon aria-hidden="true" className="h-2.5 w-2.5" />
	</button>
);

const PopoverSection = ({
	title,
	action,
	children,
}: {
	title: string;
	action?: ReactNode;
	children: ReactNode;
}): FunctionComponent => (
	<div className="space-y-2.5">
		<div className="flex items-center justify-between gap-2 border-b border-(--pe-border-subtle) pb-1.5">
			<span className="text-[11px] font-semibold uppercase tracking-wide text-(--pe-text-muted)">
				{title}
			</span>
			{action}
		</div>
		{children}
	</div>
);

export const Toolbar = (): FunctionComponent => {
	const tool = useEditorStore((state) => state.tool);
	const setTool = useEditorStore((state) => state.setTool);
	const primaryColor = useEditorStore((state) => state.primaryColor);
	const secondaryColor = useEditorStore((state) => state.secondaryColor);
	const swapColors = useEditorStore((state) => state.swapColors);

	const canvasWidth = useEditorStore((state) => state.width);
	const canvasHeight = useEditorStore((state) => state.height);
	const symmetryX = useEditorStore((state) => state.symmetryX);
	const symmetryY = useEditorStore((state) => state.symmetryY);
	const toggleSymmetryX = useEditorStore((state) => state.toggleSymmetryX);
	const toggleSymmetryY = useEditorStore((state) => state.toggleSymmetryY);

	const rulerGrid = useEditorStore((state) => state.rulerGrid);
	const toggleRulerGrid = useEditorStore((state) => state.toggleRulerGrid);
	const setRulerGrid = useEditorStore((state) => state.setRulerGrid);
	const resetRulerGrid = useEditorStore((state) => state.resetRulerGrid);

	const perspectiveGuide = useEditorStore((state) => state.perspectiveGuide);
	const togglePerspectiveGuide = useEditorStore(
		(state) => state.togglePerspectiveGuide
	);
	const setPerspectiveGuide = useEditorStore(
		(state) => state.setPerspectiveGuide
	);
	const resetPerspectiveGuide = useEditorStore(
		(state) => state.resetPerspectiveGuide
	);

	const tiledPreview = useEditorStore((state) => state.tiledPreview);
	const toggleTiledPreview = useEditorStore(
		(state) => state.toggleTiledPreview
	);
	const setTiledPreview = useEditorStore((state) => state.setTiledPreview);

	const width = useUiSettingsStore((state) => state.toolbarWidth);
	const setWidth = useUiSettingsStore((state) => state.setToolbarWidth);
	const toolSortMode = useUiSettingsStore((state) => state.toolSortMode);
	const toolOrder = useUiSettingsStore((state) => state.toolOrder);
	const enabledTools = useUiSettingsStore((state) => state.enabledTools);
	const toolUsage = useUiSettingsStore((state) => state.toolUsage);

	const visibleTools = useMemo(
		() =>
			getVisibleOrderedTools(toolSortMode, toolOrder, enabledTools, toolUsage),
		[toolSortMode, toolOrder, enabledTools, toolUsage]
	);

	const slots = useMemo(() => buildToolSlots(visibleTools), [visibleTools]);

	// Track which tool was last selected inside each parent-child group.
	const [groupLastSelected, setGroupLastSelected] = useState<
		Partial<Record<Tool, Tool>>
	>({});

	const activeSlotTool = (slot: ToolbarSlot): ToolInfo => {
		const members = [slot.primary, ...slot.children];
		const activeMember = members.find((member) => member.id === tool);
		if (activeMember) return activeMember;
		const remembered = groupLastSelected[slot.primary.id];
		if (remembered) {
			const match = members.find((member) => member.id === remembered);
			if (match) return match;
		}
		return slot.primary;
	};

	const [isResizing, setIsResizing] = useState(false);
	const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
	const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
	const flyoutRefs = useRef<Record<string, HTMLDivElement | null>>({});

	const gridTriggerRef = useRef<HTMLButtonElement>(null);
	const gridPopoverRef = useRef<HTMLDivElement>(null);
	const perspectiveTriggerRef = useRef<HTMLButtonElement>(null);
	const perspectivePopoverRef = useRef<HTMLDivElement>(null);
	const tiledTriggerRef = useRef<HTMLButtonElement>(null);
	const tiledPopoverRef = useRef<HTMLDivElement>(null);

	const baseId = useId();
	const gridPopoverId = `${baseId}-grid-settings`;
	const perspectivePopoverId = `${baseId}-perspective-settings`;
	const tiledPopoverId = `${baseId}-tiled-settings`;

	const guideItems = useMemo(
		() => [
			"guide:mirror-h",
			"guide:mirror-v",
			"guide:grid",
			"guide:perspective",
			"guide:tiled",
		],
		[]
	);

	const focusOrderIds = useMemo(
		() => [...slots.map((slot) => `tool:${slot.id}`), ...guideItems],
		[slots, guideItems]
	);

	const activeTabStopId = useMemo<string | null>(() => {
		if (focusedItemId && focusOrderIds.includes(focusedItemId)) {
			return focusedItemId;
		}
		const matchingSlot = slots.find(
			(slot) =>
				slot.primary.id === tool ||
				slot.children.some((child) => child.id === tool)
		);
		if (matchingSlot) return `tool:${matchingSlot.id}`;
		return focusOrderIds[0] ?? null;
	}, [focusedItemId, focusOrderIds, slots, tool]);

	const handleToolbarKeyDown = (
		event: ReactKeyboardEvent<HTMLDivElement>
	): void => {
		if (SUPPORTS_FOCUSGROUP || focusOrderIds.length === 0) return;
		const targetElement =
			document.activeElement instanceof HTMLButtonElement
				? document.activeElement
				: null;
		const currentIndex = focusOrderIds.findIndex(
			(itemId) => itemRefs.current[itemId] === targetElement
		);
		if (currentIndex < 0) return;

		let nextIndex: number | null = null;
		if (event.key === "ArrowDown") {
			nextIndex = (currentIndex + 1) % focusOrderIds.length;
		} else if (event.key === "ArrowUp") {
			nextIndex =
				(currentIndex - 1 + focusOrderIds.length) % focusOrderIds.length;
		} else if (event.key === "Home") {
			nextIndex = 0;
		} else if (event.key === "End") {
			nextIndex = focusOrderIds.length - 1;
		}

		if (nextIndex !== null) {
			const nextId = focusOrderIds[nextIndex];
			if (nextId) {
				event.preventDefault();
				setFocusedItemId(nextId);
				itemRefs.current[nextId]?.focus();
			}
		}
	};

	const handleResizePointerDown = (
		event: ReactPointerEvent<HTMLDivElement>
	): void => {
		event.preventDefault();
		const startX = event.clientX;
		const startWidth = width;
		setIsResizing(true);

		const onPointerMove = (moveEvent: PointerEvent): void => {
			setWidth(clampToolbarWidth(startWidth + (moveEvent.clientX - startX)));
		};

		const onPointerUp = (): void => {
			setIsResizing(false);
			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("pointerup", onPointerUp);
			window.removeEventListener("pointercancel", onPointerUp);
		};

		window.addEventListener("pointermove", onPointerMove);
		window.addEventListener("pointerup", onPointerUp);
		window.addEventListener("pointercancel", onPointerUp);
	};

	const handleResizeKeyDown = (
		event: ReactKeyboardEvent<HTMLDivElement>
	): void => {
		if (event.key === "ArrowRight") {
			event.preventDefault();
			setWidth(clampToolbarWidth(width + KEYBOARD_RESIZE_STEP));
		} else if (event.key === "ArrowLeft") {
			event.preventDefault();
			setWidth(clampToolbarWidth(width - KEYBOARD_RESIZE_STEP));
		} else if (event.key === "Home") {
			event.preventDefault();
			setWidth(DEFAULT_TOOLBAR_WIDTH);
		}
	};

	const focusGroupAttributes = {
		focusgroup: "toolbar wrap block",
	} as Record<string, string>;

	const selectToolFromGroup = (parentId: Tool, chosenId: Tool): void => {
		setGroupLastSelected((previous) => ({ ...previous, [parentId]: chosenId }));
		setTool(chosenId);
	};

	const tabStopFor = (itemId: string): number | undefined => {
		if (SUPPORTS_FOCUSGROUP) return undefined;
		return activeTabStopId === itemId ? 0 : -1;
	};

	const inputClass =
		"w-full rounded-md border border-(--pe-border) bg-(--pe-bg-control) px-2 py-1 text-xs tabular-nums text-(--pe-text) outline-none focus:border-(--pe-accent)";

	return (
		<aside className="flex shrink-0 bg-(--pe-bg-panel)">
			<div
				className="editor-scrollbar flex flex-1 flex-col overflow-x-hidden overflow-y-auto px-1.5 py-2.5"
				style={{ width }}
			>
				<div
					aria-label="Drawing tools"
					aria-orientation="vertical"
					className="grid grid-cols-[repeat(auto-fill,36px)] justify-center gap-1"
					role="toolbar"
					{...focusGroupAttributes}
					onKeyDown={handleToolbarKeyDown}
				>
					{slots.map((slot, index) => {
						const previous = slots[index - 1];
						const showGroupSeparator =
							toolSortMode === "category" &&
							index > 0 &&
							previous !== undefined &&
							previous.category !== slot.category;
						const displayed = activeSlotTool(slot);
						const members = [slot.primary, ...slot.children];
						const isActive = members.some((member) => member.id === tool);
						const hasChildren = slot.children.length > 0;
						const itemId = `tool:${slot.id}`;
						const flyoutId = `${baseId}-flyout-${slot.id}`;
						const anchorName = `--tool-slot-${slot.id}`;
						const anchorStyle = { anchorName } as CSSProperties;
						const popoverPositionStyle = {
							positionAnchor: anchorName,
						} as CSSProperties;

						return (
							<Fragment key={slot.id}>
								{showGroupSeparator && (
									<div
										aria-orientation="horizontal"
										className="col-span-full my-1 h-px border-t border-(--pe-border-subtle)"
										role="separator"
									/>
								)}
								<div className="relative h-9 w-9">
									<button
										ref={(element) => {
											itemRefs.current[itemId] = element;
										}}
										aria-label={`${displayed.label} (${displayed.shortcut})`}
										aria-pressed={isActive}
										className="pe-tool-btn h-9 w-9"
										style={hasChildren ? anchorStyle : undefined}
										tabIndex={tabStopFor(itemId)}
										type="button"
										title={
											hasChildren
												? `${displayed.label} (${displayed.shortcut}) · Click corner or active tool for sub-tools`
												: `${displayed.label} (${displayed.shortcut})`
										}
										onClick={() => {
											if (hasChildren && isActive) {
												flyoutRefs.current[slot.id]?.togglePopover();
											} else {
												selectToolFromGroup(slot.primary.id, displayed.id);
											}
										}}
										onContextMenu={(event) => {
											if (!hasChildren) return;
											event.preventDefault();
											flyoutRefs.current[slot.id]?.togglePopover();
										}}
										onFocus={() => {
											setFocusedItemId(itemId);
										}}
									>
										<ToolIcon className="h-4.5 w-4.5" tool={displayed.id} />
									</button>
									{hasChildren && (
										<>
											<CornerFlyoutCaret
												anchorStyle={{}}
												label={`${slot.primary.label} sub-tools`}
												popoverId={flyoutId}
											/>
											<div
												ref={(element) => {
													flyoutRefs.current[slot.id] = element;
												}}
												className="editor-side-popover w-52 rounded-xl border border-(--pe-border-strong) bg-(--pe-bg-panel) p-1.5 text-xs text-(--pe-text)"
												id={flyoutId}
												popover="auto"
												style={popoverPositionStyle}
												onToggle={(event) => {
													if (event.newState === "open") {
														positionSidePopoverFallback(
															itemRefs.current[itemId] ?? null,
															flyoutRefs.current[slot.id] ?? null
														);
													}
												}}
											>
												<div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-(--pe-text-muted)">
													{slot.primary.label} tools
												</div>
												<div className="space-y-0.5">
													{members.map((member) => {
														const memberActive = tool === member.id;
														return (
															<button
																key={member.id}
																aria-pressed={memberActive}
																type="button"
																className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--pe-accent) ${
																	memberActive
																		? "bg-(--pe-accent-soft) text-(--pe-accent-soft-ink) font-semibold"
																		: "text-(--pe-text) hover:bg-(--pe-bg-control-hover)"
																}`}
																onClick={() => {
																	selectToolFromGroup(slot.primary.id, member.id);
																	flyoutRefs.current[slot.id]?.hidePopover();
																}}
															>
																<span className="flex items-center gap-2">
																	<ToolIcon
																		className="h-4 w-4 shrink-0"
																		tool={member.id}
																	/>
																	<span>{member.label}</span>
																</span>
																<Kbd>{member.shortcut}</Kbd>
															</button>
														);
													})}
												</div>
											</div>
										</>
									)}
								</div>
							</Fragment>
						);
					})}

					<div
						aria-orientation="horizontal"
						className="col-span-full my-1 h-px border-t border-(--pe-border-subtle)"
						role="separator"
					/>

					{/* Guides & Assists Switch Toggles */}
					<div
						aria-label="Canvas guides and assists"
						className="contents"
						role="group"
					>
						<button
							ref={(element) => {
								itemRefs.current["guide:mirror-h"] = element;
							}}
							aria-label="Mirror Horizontal"
							aria-pressed={symmetryX}
							className="pe-tool-btn h-9 w-9"
							tabIndex={tabStopFor("guide:mirror-h")}
							title="Mirror Horizontal (vertical axis)"
							type="button"
							onClick={toggleSymmetryX}
							onFocus={() => {
								setFocusedItemId("guide:mirror-h");
							}}
						>
							<GuideIcon className="h-4.5 w-4.5" kind="mirror-h" />
						</button>

						<button
							ref={(element) => {
								itemRefs.current["guide:mirror-v"] = element;
							}}
							aria-label="Mirror Vertical"
							aria-pressed={symmetryY}
							className="pe-tool-btn h-9 w-9"
							tabIndex={tabStopFor("guide:mirror-v")}
							title="Mirror Vertical (horizontal axis)"
							type="button"
							onClick={toggleSymmetryY}
							onFocus={() => {
								setFocusedItemId("guide:mirror-v");
							}}
						>
							<GuideIcon className="h-4.5 w-4.5" kind="mirror-v" />
						</button>

						{/* Ruler Grid Tool + Corner Settings Gear */}
						<div className="relative h-9 w-9">
							<button
									ref={(element) => {
										itemRefs.current["guide:grid"] = element;
										gridTriggerRef.current = element;
									}}
									aria-label="Grid Ruler Tool"
									aria-pressed={rulerGrid.enabled}
									className="pe-tool-btn h-9 w-9"
									style={{ anchorName: "--guide-grid-anchor" }}
									tabIndex={tabStopFor("guide:grid")}
									title="Grid Ruler Tool (snap & cell draw bounds)"
									type="button"
									onClick={toggleRulerGrid}
									onFocus={() => {
										setFocusedItemId("guide:grid");
									}}
								>
									<GuideIcon className="h-4.5 w-4.5" kind="ruler-grid" />
								</button>
								<CornerGearButton
									label="Grid Ruler settings"
									popoverId={gridPopoverId}
								/>
								<div
									ref={gridPopoverRef}
									className="editor-side-popover w-64 rounded-xl border border-(--pe-border-strong) bg-(--pe-bg-panel) p-3 text-xs text-(--pe-text)"
									id={gridPopoverId}
									popover="auto"
									style={{ positionAnchor: "--guide-grid-anchor" }}
									onToggle={(event) => {
										if (event.newState === "open") {
											positionSidePopoverFallback(
												gridTriggerRef.current,
												gridPopoverRef.current
											);
										}
									}}
								>
									<PopoverSection
										title="Grid Ruler Settings"
										action={
											<TextButton onClick={resetRulerGrid}>Reset</TextButton>
										}
									>
										<div className="flex flex-wrap gap-1">
											{GRID_PRESETS.map((size) => (
												<TextButton
													key={size}
													active={
														rulerGrid.cellWidth === size &&
														rulerGrid.cellHeight === size
													}
													onClick={() => {
														setRulerGrid({ cellWidth: size, cellHeight: size });
													}}
												>
													{size}×{size}
												</TextButton>
											))}
										</div>
										<div className="grid grid-cols-2 gap-2">
											<label className="text-[11px] text-(--pe-text-muted)">
												Cell W
												<input
													className={`mt-1 ${inputClass}`}
													max={canvasWidth}
													min={1}
													type="number"
													value={rulerGrid.cellWidth}
													onChange={(event) => {
														setRulerGrid({
															cellWidth: Math.max(
																1,
																Math.round(Number(event.target.value) || 1)
															),
														});
													}}
												/>
											</label>
											<label className="text-[11px] text-(--pe-text-muted)">
												Cell H
												<input
													className={`mt-1 ${inputClass}`}
													max={canvasHeight}
													min={1}
													type="number"
													value={rulerGrid.cellHeight}
													onChange={(event) => {
														setRulerGrid({
															cellHeight: Math.max(
																1,
																Math.round(Number(event.target.value) || 1)
															),
														});
													}}
												/>
											</label>
											<label className="text-[11px] text-(--pe-text-muted)">
												Offset X
												<input
													className={`mt-1 ${inputClass}`}
													max={canvasWidth}
													min={0}
													type="number"
													value={rulerGrid.offsetX}
													onChange={(event) => {
														setRulerGrid({
															offsetX: Math.max(
																0,
																Math.round(Number(event.target.value) || 0)
															),
														});
													}}
												/>
											</label>
											<label className="text-[11px] text-(--pe-text-muted)">
												Offset Y
												<input
													className={`mt-1 ${inputClass}`}
													max={canvasHeight}
													min={0}
													type="number"
													value={rulerGrid.offsetY}
													onChange={(event) => {
														setRulerGrid({
															offsetY: Math.max(
																0,
																Math.round(Number(event.target.value) || 0)
															),
														});
													}}
												/>
											</label>
										</div>
										<div className="space-y-1.5 border-t border-(--pe-border-subtle) pt-2">
											<Toggle
												checked={rulerGrid.snapToGrid}
												label="Snap to grid"
												onChange={() => {
													setRulerGrid({ snapToGrid: !rulerGrid.snapToGrid });
												}}
											/>
											<Toggle
												checked={rulerGrid.limitToCell}
												label="Limit draw inside grid cell"
												onChange={() => {
													setRulerGrid({ limitToCell: !rulerGrid.limitToCell });
												}}
											/>
											<Toggle
												checked={rulerGrid.showRuler}
												label="Show pixel ruler ticks"
												onChange={() => {
													setRulerGrid({ showRuler: !rulerGrid.showRuler });
												}}
											/>
										</div>
										<div className="space-y-1.5 border-t border-(--pe-border-subtle) pt-2">
											<div className="flex items-center justify-between">
												<span className="text-[11px] text-(--pe-text-muted)">
													Color
												</span>
												<div className="flex items-center gap-1">
													{GRID_COLORS.map((swatch) => (
														<button
															key={swatch}
															aria-label={`Grid color ${swatch}`}
															aria-pressed={rulerGrid.color === swatch}
															style={{ backgroundColor: swatch }}
															type="button"
															className={`swatch-preserve h-4 w-4 rounded-full border ${
																rulerGrid.color === swatch
																	? "ring-2 ring-(--pe-accent) border-white"
																	: "border-(--pe-border-strong)"
															}`}
															onClick={() => {
																setRulerGrid({ color: swatch });
															}}
														/>
													))}
												</div>
											</div>
											<label className="flex items-center justify-between gap-2 text-[11px] text-(--pe-text-muted)">
												Opacity
												<input
													className="w-28 accent-(--pe-accent)"
													max={100}
													min={15}
													type="range"
													value={rulerGrid.opacity}
													onChange={(event) => {
														setRulerGrid({ opacity: Number(event.target.value) });
													}}
												/>
												<span className="w-8 text-right tabular-nums text-(--pe-text)">
													{rulerGrid.opacity}%
												</span>
											</label>
										</div>
									</PopoverSection>
								</div>
							</div>

							{/* Perspective Guide Tool + Corner Settings Gear */}
							<div className="relative h-9 w-9">
								<button
									ref={(element) => {
										itemRefs.current["guide:perspective"] = element;
										perspectiveTriggerRef.current = element;
									}}
									aria-label="Perspective Guide Tool"
									aria-pressed={perspectiveGuide.enabled}
									className="pe-tool-btn h-9 w-9"
									style={{ anchorName: "--guide-perspective-anchor" }}
									tabIndex={tabStopFor("guide:perspective")}
									title="Perspective Guide (1, 2, 3 point & fisheye)"
									type="button"
									onClick={togglePerspectiveGuide}
									onFocus={() => {
										setFocusedItemId("guide:perspective");
									}}
								>
									<GuideIcon className="h-4.5 w-4.5" kind="perspective" />
								</button>
								<CornerGearButton
									label="Perspective Guide settings"
									popoverId={perspectivePopoverId}
								/>
								<div
									ref={perspectivePopoverRef}
									className="editor-side-popover w-64 rounded-xl border border-(--pe-border-strong) bg-(--pe-bg-panel) p-3 text-xs text-(--pe-text)"
									id={perspectivePopoverId}
									popover="auto"
									style={{ positionAnchor: "--guide-perspective-anchor" }}
									onToggle={(event) => {
										if (event.newState === "open") {
											positionSidePopoverFallback(
												perspectiveTriggerRef.current,
												perspectivePopoverRef.current
											);
										}
									}}
								>
									<PopoverSection
										title="Perspective Guide"
										action={
											<TextButton onClick={resetPerspectiveGuide}>Reset</TextButton>
										}
									>
										<div className="grid grid-cols-2 gap-1">
											{PERSPECTIVE_MODES.map((mode) => (
												<TextButton
													key={mode.id}
													active={perspectiveGuide.mode === mode.id}
													onClick={() => {
														setPerspectiveGuide({
															mode: mode.id,
															point1: null,
															point2: null,
															point3: null,
														});
													}}
												>
													{mode.label}
												</TextButton>
											))}
										</div>
										{perspectiveGuide.mode !== "fisheye" ? (
											<label className="flex items-center justify-between gap-2 text-[11px] text-(--pe-text-muted)">
												Horizon Y
												<input
													className={`${inputClass} w-20`}
													step={0.5}
													type="number"
													value={
														perspectiveGuide.horizonY ??
														Math.round(canvasHeight * 0.45 * 10) / 10
													}
													onChange={(event) => {
														setPerspectiveGuide({
															horizonY: Number(event.target.value),
														});
													}}
												/>
											</label>
										) : (
											<div className="space-y-1.5">
												<label className="flex items-center justify-between gap-2 text-[11px] text-(--pe-text-muted)">
													Radius
													<input
														className="w-28 accent-(--pe-accent)"
														max={Math.max(canvasWidth, canvasHeight)}
														min={4}
														type="range"
														value={perspectiveGuide.fisheyeRadius}
														onChange={(event) => {
															setPerspectiveGuide({
																fisheyeRadius: Number(event.target.value),
															});
														}}
													/>
													<span className="w-8 text-right tabular-nums text-(--pe-text)">
														{perspectiveGuide.fisheyeRadius}
													</span>
												</label>
												<label className="flex items-center justify-between gap-2 text-[11px] text-(--pe-text-muted)">
													Curve
													<input
														className="w-28 accent-(--pe-accent)"
														max={100}
														min={10}
														type="range"
														value={perspectiveGuide.fisheyeCurvature}
														onChange={(event) => {
															setPerspectiveGuide({
																fisheyeCurvature: Number(event.target.value),
															});
														}}
													/>
													<span className="w-8 text-right tabular-nums text-(--pe-text)">
														{perspectiveGuide.fisheyeCurvature}%
													</span>
												</label>
											</div>
										)}
										{perspectiveGuide.mode === "3-point" && (
											<div className="flex items-center justify-between gap-2">
												<span className="text-[11px] text-(--pe-text-muted)">
													3rd point
												</span>
												<div className="flex gap-1">
													<TextButton
														active={
															perspectiveGuide.thirdPointDirection === "bottom"
														}
														onClick={() => {
															setPerspectiveGuide({
																thirdPointDirection: "bottom",
																point3: null,
															});
														}}
													>
														Below
													</TextButton>
													<TextButton
														active={perspectiveGuide.thirdPointDirection === "top"}
														onClick={() => {
															setPerspectiveGuide({
																thirdPointDirection: "top",
																point3: null,
															});
														}}
													>
														Above
													</TextButton>
												</div>
											</div>
										)}
										<label className="flex items-center justify-between gap-2 text-[11px] text-(--pe-text-muted)">
											Rays
											<input
												className="w-28 accent-(--pe-accent)"
												max={24}
												min={4}
												step={2}
												type="range"
												value={perspectiveGuide.lineCount}
												onChange={(event) => {
													setPerspectiveGuide({
														lineCount: Number(event.target.value),
													});
												}}
											/>
											<span className="w-8 text-right tabular-nums text-(--pe-text)">
												{perspectiveGuide.lineCount}
											</span>
										</label>
										<label className="flex items-center justify-between gap-2 text-[11px] text-(--pe-text-muted)">
											Opacity
											<input
												className="w-28 accent-(--pe-accent)"
												max={100}
												min={15}
												type="range"
												value={perspectiveGuide.opacity}
												onChange={(event) => {
													setPerspectiveGuide({
														opacity: Number(event.target.value),
													});
												}}
											/>
											<span className="w-8 text-right tabular-nums text-(--pe-text)">
												{perspectiveGuide.opacity}%
											</span>
										</label>
										<Toggle
											checked={perspectiveGuide.lockHandles}
											label="Lock vanishing points"
											onChange={() => {
												setPerspectiveGuide({
													lockHandles: !perspectiveGuide.lockHandles,
												});
											}}
										/>
										<p className="text-[10px] leading-snug text-(--pe-text-muted)">
											Drag the VP markers directly on the canvas to adjust.
										</p>
									</PopoverSection>
								</div>
							</div>

							{/* Tiled Preview Tool + Corner Settings Gear */}
							<div className="relative h-9 w-9">
								<button
									ref={(element) => {
										itemRefs.current["guide:tiled"] = element;
										tiledTriggerRef.current = element;
									}}
									aria-label="Tiled Preview Tool"
									aria-pressed={tiledPreview.enabled}
									className="pe-tool-btn h-9 w-9"
									style={{ anchorName: "--guide-tiled-anchor" }}
									tabIndex={tabStopFor("guide:tiled")}
									title="Tiled Preview (live seamless tiling around canvas)"
									type="button"
									onClick={toggleTiledPreview}
									onFocus={() => {
										setFocusedItemId("guide:tiled");
									}}
								>
									<GuideIcon className="h-4.5 w-4.5" kind="tiled" />
								</button>
								<CornerGearButton
									label="Tiled Preview settings"
									popoverId={tiledPopoverId}
								/>
								<div
									ref={tiledPopoverRef}
									className="editor-side-popover w-56 rounded-xl border border-(--pe-border-strong) bg-(--pe-bg-panel) p-3 text-xs text-(--pe-text)"
									id={tiledPopoverId}
									popover="auto"
									style={{ positionAnchor: "--guide-tiled-anchor" }}
									onToggle={(event) => {
										if (event.newState === "open") {
											positionSidePopoverFallback(
												tiledTriggerRef.current,
												tiledPopoverRef.current
											);
										}
									}}
								>
									<PopoverSection title="Tiled Preview">
										<div className="flex flex-wrap gap-1">
											{TILED_AXES.map((axis) => (
												<TextButton
													key={axis.id}
													active={tiledPreview.axis === axis.id}
													onClick={() => {
														setTiledPreview({ axis: axis.id });
													}}
												>
													{axis.label}
												</TextButton>
											))}
										</div>
										<label className="flex items-center justify-between gap-2 text-[11px] text-(--pe-text-muted)">
											Opacity
											<input
												className="w-24 accent-(--pe-accent)"
												max={100}
												min={15}
												type="range"
												value={tiledPreview.opacity}
												onChange={(event) => {
													setTiledPreview({
														opacity: Number(event.target.value),
													});
												}}
											/>
											<span className="w-8 text-right tabular-nums text-(--pe-text)">
												{tiledPreview.opacity}%
											</span>
										</label>
								</PopoverSection>
							</div>
						</div>
					</div>
				</div>

				{/* Tactile Primary / Secondary Color Well */}
				<div className="mt-auto flex flex-col items-center gap-1.5 pt-3">
					<div className="relative h-9 w-9">
						<div
							className="swatch-preserve absolute right-0 bottom-0 h-6 w-6 rounded-md border border-(--pe-border-strong) shadow-xs"
							style={{ background: secondaryColor }}
							title="Secondary color (right click)"
						/>
						<div
							className="swatch-preserve absolute top-0 left-0 h-6 w-6 rounded-md border-2 border-(--pe-bg-panel) ring-1 ring-(--pe-border-strong) shadow-sm"
							style={{ background: primaryColor }}
							title="Primary color (left click)"
						/>
					</div>
					<button
						aria-label="Swap primary and secondary colors (X)"
						className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-(--pe-text-muted) transition-colors hover:bg-(--pe-bg-control) hover:text-(--pe-text)"
						title="Swap colors (X)"
						type="button"
						onClick={swapColors}
					>
						⇄ swap
					</button>
				</div>
			</div>

			<div
				aria-label="Resize toolbar"
				aria-orientation="vertical"
				aria-valuemax={MAX_TOOLBAR_WIDTH}
				aria-valuemin={MIN_TOOLBAR_WIDTH}
				aria-valuenow={width}
				role="separator"
				tabIndex={0}
				title="Drag to resize toolbar (double-click to reset)"
				className={`group relative w-1.5 shrink-0 cursor-col-resize touch-none select-none transition-colors hover:bg-(--pe-accent-soft) focus-visible:bg-(--pe-accent-soft) focus-visible:outline-none ${
					isResizing ? "bg-(--pe-accent-soft)" : ""
				}`}
				onKeyDown={handleResizeKeyDown}
				onPointerDown={handleResizePointerDown}
				onDoubleClick={() => {
					setWidth(DEFAULT_TOOLBAR_WIDTH);
				}}
			>
				<div
					className={`pointer-events-none absolute inset-y-0 left-0 w-px transition-colors group-hover:bg-(--pe-accent) group-focus-visible:bg-(--pe-accent) ${
						isResizing ? "bg-(--pe-accent)" : "bg-(--pe-border)"
					}`}
				/>
			</div>
		</aside>
	);
};
