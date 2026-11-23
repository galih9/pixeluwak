import {
	AdjustmentsHorizontalIcon,
	Bars3Icon,
	CheckIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	SwatchIcon,
	ViewColumnsIcon,
	WrenchScrewdriverIcon,
} from "@heroicons/react/20/solid";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import type { FunctionComponent } from "../../../common/types";
import { TOOL_CATEGORY_LABELS, TOOLS } from "../constants";
import { useEditorStore } from "../store/editorStore";
import {
	DEFAULT_TOOLBAR_WIDTH,
	getOrderedTools,
	THEME_DEFINITIONS,
	type ThemeDefinition,
	useUiSettingsStore,
	WORKSPACE_PRESETS,
} from "../store/uiSettingsStore";
import type {
	PanelId,
	ThemeId,
	ToolSortMode,
	WorkspacePresetId,
} from "../types";
import { ToolIcon } from "./ToolIcon";
import { Kbd, Modal, Switch, TextButton } from "./ui";

type SettingsTabId = "appearance" | "panels" | "toolbar" | "editor";

const TABS: Array<{
	id: SettingsTabId;
	label: string;
	Icon: typeof SwatchIcon;
}> = [
	{ id: "appearance", label: "Appearance", Icon: SwatchIcon },
	{ id: "panels", label: "Panels", Icon: ViewColumnsIcon },
	{ id: "toolbar", label: "Toolbar", Icon: WrenchScrewdriverIcon },
	{ id: "editor", label: "Editor", Icon: AdjustmentsHorizontalIcon },
];

const PANEL_ITEMS: Array<{
	id: PanelId;
	label: string;
	description: string;
}> = [
	{
		id: "colorPicker",
		label: "Color Picker",
		description: "Primary & secondary swatches, HSV picker, and hue-shifted color ramp",
	},
	{
		id: "palette",
		label: "Palettes",
		description: "Built-in palette presets, canvas extraction, and custom swatches",
	},
	{
		id: "preview",
		label: "Preview",
		description: "Live scaled & 1× actual-size preview with animation loop toggle",
	},
	{
		id: "layers",
		label: "Layers",
		description: "Layer stack, opacity, visibility, lock, and reference image guides",
	},
	{
		id: "frames",
		label: "Frames & Timeline",
		description: "Animation frame strip, playback, tags, cel linking, and onion skin",
	},
	{
		id: "tilemap",
		label: "Tilemap",
		description: "Seamless top-down, isometric, and hexagonal tile preview",
	},
	{
		id: "toolOptions",
		label: "Tool Options Bar",
		description: "Contextual brush size, shapes, symmetry, and active tool settings",
	},
	{
		id: "statusBar",
		label: "Status Bar",
		description: "Cursor coordinates, canvas dimensions, zoom factor, and notices",
	},
];

const PRESET_META: Array<{
	id: WorkspacePresetId;
	label: string;
	hint: string;
}> = [
	{ id: "studio", label: "Studio", hint: "Balanced sprite & animation workspace" },
	{ id: "illustration", label: "Illustration", hint: "Full-height canvas with docked Layers" },
	{ id: "animation", label: "Animation", hint: "Full timeline & cel sheet focus" },
	{ id: "zen", label: "Zen Focus", hint: "Hide all panels for pure pixel drawing" },
];

const SORT_MODES: Array<{
	id: ToolSortMode;
	label: string;
	group: "auto" | "manual";
}> = [
	{ id: "category", label: "Category", group: "auto" },
	{ id: "alphabetical", label: "A → Z", group: "auto" },
	{ id: "most-used", label: "Most Used", group: "auto" },
	{ id: "manual", label: "Manual", group: "manual" },
];

const SUPPORTS_FOCUSGROUP =
	typeof HTMLElement !== "undefined" &&
	"focusGroup" in HTMLElement.prototype;

function useSystemDarkPreference(): boolean {
	const [systemDark, setSystemDark] = useState<boolean>(() => {
		if (typeof window === "undefined" || !window.matchMedia) return true;
		return window.matchMedia("(prefers-color-scheme: dark)").matches;
	});

	useEffect(() => {
		if (typeof window === "undefined" || !window.matchMedia) return;
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const update = (): void => {
			setSystemDark(media.matches);
		};
		update();
		media.addEventListener("change", update);
		return (): void => {
			media.removeEventListener("change", update);
		};
	}, []);

	return systemDark;
}

const ThemePreviewCard = ({
	definition,
	selected,
	systemDark,
	onSelect,
}: {
	definition: ThemeDefinition;
	selected: boolean;
	systemDark: boolean;
	onSelect: (id: ThemeId) => void;
}): FunctionComponent => {
	const systemSubtitle = systemDark
		? "System (Currently Dark)"
		: "System (Currently Light)";
	const lightSwatch = THEME_DEFINITIONS.find((item) => item.id === "light");
	const darkSwatch = THEME_DEFINITIONS.find((item) => item.id === "dark");
	const displaySwatches =
		definition.id === "system"
			? (systemDark ? darkSwatch?.swatches : lightSwatch?.swatches) ??
				definition.swatches
			: definition.swatches;

	return (
		<button
			aria-pressed={selected}
			type="button"
			className={`group flex flex-col overflow-hidden rounded-xl border text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pe-accent)] ${
				selected
					? "border-[var(--pe-accent)] bg-[var(--pe-accent-soft)] ring-1 ring-[var(--pe-accent-ring)]"
					: "border-[var(--pe-border)] bg-[var(--pe-bg-panel-subtle)] hover:border-[var(--pe-border-strong)] hover:bg-[var(--pe-bg-control)]"
			}`}
			onClick={() => {
				onSelect(definition.id);
			}}
		>
			{/* Mini studio wireframe preview */}
			<div
				className="swatch-preserve relative flex h-16 w-full flex-col overflow-hidden border-b border-black/10 p-1.5"
				style={{ backgroundColor: displaySwatches.desk }}
			>
				<div
					className="flex h-2.5 items-center justify-between rounded-xs px-1"
					style={{ backgroundColor: displaySwatches.chrome }}
				>
					<div className="flex items-center gap-0.5">
						<span
							className="h-1.5 w-1.5 rounded-xs"
							style={{ backgroundColor: displaySwatches.accent }}
						/>
						<span
							className="h-1 w-5 rounded-xs opacity-60"
							style={{ backgroundColor: displaySwatches.text }}
						/>
					</div>
					<span
						className="h-1.5 w-3 rounded-xs"
						style={{ backgroundColor: displaySwatches.elevated }}
					/>
				</div>
				<div className="mt-1 flex flex-1 gap-1">
					<div
						className="flex w-2.5 flex-col items-center gap-0.5 rounded-xs py-0.5"
						style={{ backgroundColor: displaySwatches.panel }}
					>
						<span
							className="h-1.5 w-1.5 rounded-xs"
							style={{ backgroundColor: displaySwatches.accent }}
						/>
						<span
							className="h-1.5 w-1.5 rounded-xs opacity-45"
							style={{ backgroundColor: displaySwatches.text }}
						/>
					</div>
					<div className="flex flex-1 items-center justify-center">
						<div className="grid grid-cols-3 gap-px opacity-85">
							<span
								className="h-1.5 w-1.5"
								style={{ backgroundColor: displaySwatches.accent }}
							/>
							<span
								className="h-1.5 w-1.5"
								style={{ backgroundColor: displaySwatches.elevated }}
							/>
							<span
								className="h-1.5 w-1.5"
								style={{ backgroundColor: displaySwatches.accent }}
							/>
							<span
								className="h-1.5 w-1.5"
								style={{ backgroundColor: displaySwatches.text }}
							/>
							<span
								className="h-1.5 w-1.5"
								style={{ backgroundColor: displaySwatches.accent }}
							/>
							<span
								className="h-1.5 w-1.5"
								style={{ backgroundColor: displaySwatches.text }}
							/>
						</div>
					</div>
					<div
						className="flex w-7 flex-col gap-0.5 rounded-xs p-0.5"
						style={{ backgroundColor: displaySwatches.panel }}
					>
						<span
							className="h-2 w-full rounded-xs"
							style={{ backgroundColor: displaySwatches.elevated }}
						/>
						<span
							className="h-1 w-4 rounded-xs opacity-50"
							style={{ backgroundColor: displaySwatches.text }}
						/>
					</div>
				</div>
				{selected && (
					<span
						aria-hidden="true"
						className="swatch-preserve absolute right-1.5 bottom-1.5 flex h-4 w-4 items-center justify-center rounded-full shadow"
						style={{
							backgroundColor: displaySwatches.accent,
							color:
								definition.id === "espresso"
									? "#1a120d"
									: definition.id === "midnight"
										? "#1b0a14"
										: "#ffffff",
						}}
					>
						<CheckIcon className="h-3 w-3" />
					</span>
				)}
			</div>

			<div className="flex flex-1 flex-col justify-between p-2.5">
				<div className="flex items-center justify-between gap-2">
					<span className="text-xs font-semibold text-[var(--pe-text)]">
						{definition.id === "system" ? systemSubtitle : definition.name}
					</span>
					<span className="rounded-full bg-[var(--pe-bg-control)] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[var(--pe-text-muted)]">
						{definition.scheme}
					</span>
				</div>
				<p className="mt-1 text-[11px] leading-snug text-[var(--pe-text-muted)]">
					{definition.subtitle}
				</p>
			</div>
		</button>
	);
};

const AppearanceTab = (): FunctionComponent => {
	const theme = useUiSettingsStore((state) => state.theme);
	const setTheme = useUiSettingsStore((state) => state.setTheme);
	const systemDark = useSystemDarkPreference();

	const standardThemes = THEME_DEFINITIONS.filter(
		(definition) => definition.group === "standard"
	);
	const studioThemes = THEME_DEFINITIONS.filter(
		(definition) => definition.group === "studio"
	);

	return (
		<div className="space-y-5">
			<div>
				<h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--pe-text-muted)]">
					Standard Themes
				</h3>
				<p className="mt-0.5 text-xs text-[var(--pe-text-muted)]">
					Switch between system-synced, crisp paper light, or neutral dark.
				</p>
				<div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
					{standardThemes.map((definition) => (
						<ThemePreviewCard
							key={definition.id}
							definition={definition}
							selected={theme === definition.id}
							systemDark={systemDark}
							onSelect={setTheme}
						/>
					))}
				</div>
			</div>

			<div>
				<h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--pe-text-muted)]">
					Studio Palettes
				</h3>
				<p className="mt-0.5 text-xs text-[var(--pe-text-muted)]">
					Crafted color atmospheres designed to give your workspace character.
				</p>
				<div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
					{studioThemes.map((definition) => (
						<ThemePreviewCard
							key={definition.id}
							definition={definition}
							selected={theme === definition.id}
							systemDark={systemDark}
							onSelect={setTheme}
						/>
					))}
				</div>
			</div>
		</div>
	);
};

const PanelsTab = (): FunctionComponent => {
	const panels = useUiSettingsStore((state) => state.panels);
	const setPanelVisible = useUiSettingsStore((state) => state.setPanelVisible);
	const applyWorkspacePreset = useUiSettingsStore(
		(state) => state.applyWorkspacePreset
	);

	const activePreset = (
		Object.keys(WORKSPACE_PRESETS) as Array<WorkspacePresetId>
	).find((presetId) => {
		const preset = WORKSPACE_PRESETS[presetId];
		return (Object.keys(preset) as Array<PanelId>).every(
			(panelId) => panels[panelId] === preset[panelId]
		);
	});

	return (
		<div className="space-y-4">
			<div>
				<h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--pe-text-muted)]">
					Quick Layouts
				</h3>
				<div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
					{PRESET_META.map((preset) => (
						<button
							key={preset.id}
							aria-pressed={activePreset === preset.id}
							title={preset.hint}
							type="button"
							className={`flex flex-col rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--pe-accent)] ${
								activePreset === preset.id
									? "border-[var(--pe-accent)] bg-[var(--pe-accent-soft)] text-[var(--pe-text)]"
									: "border-[var(--pe-border)] bg-[var(--pe-bg-panel-subtle)] text-[var(--pe-text-secondary)] hover:bg-[var(--pe-bg-control)]"
							}`}
							onClick={() => {
								applyWorkspacePreset(preset.id);
							}}
						>
							<span className="text-xs font-semibold">{preset.label}</span>
							<span className="mt-0.5 text-[10px] leading-tight text-[var(--pe-text-muted)]">
								{preset.hint}
							</span>
						</button>
					))}
				</div>
			</div>

			<div className="divide-y divide-[var(--pe-border-subtle)] rounded-xl border border-[var(--pe-border)] bg-[var(--pe-bg-panel-subtle)]">
				{PANEL_ITEMS.map((item) => (
					<div key={item.id} className="px-3.5 py-2.5">
						<Switch
							checked={panels[item.id]}
							description={item.description}
							label={item.label}
							onChange={(checked) => {
								setPanelVisible(item.id, checked);
							}}
						/>
					</div>
				))}
			</div>

			<p className="rounded-lg border border-[var(--pe-border-subtle)] bg-[var(--pe-bg-panel-subtle)] px-3 py-2 text-[11px] text-[var(--pe-text-muted)]">
				Tip: When <strong>Frames &amp; Timeline</strong> is hidden while{" "}
				<strong>Layers</strong> stays enabled, Layers automatically docks into
				the right sidebar so you keep full layer control with maximum vertical
				canvas space.
			</p>
		</div>
	);
};

const ToolbarTab = (): FunctionComponent => {
	const showToolbar = useUiSettingsStore((state) => state.showToolbar);
	const setShowToolbar = useUiSettingsStore((state) => state.setShowToolbar);
	const toolSortMode = useUiSettingsStore((state) => state.toolSortMode);
	const setToolSortMode = useUiSettingsStore((state) => state.setToolSortMode);
	const toolOrder = useUiSettingsStore((state) => state.toolOrder);
	const enabledTools = useUiSettingsStore((state) => state.enabledTools);
	const toolUsage = useUiSettingsStore((state) => state.toolUsage);
	const setToolEnabled = useUiSettingsStore((state) => state.setToolEnabled);
	const enableAllTools = useUiSettingsStore((state) => state.enableAllTools);
	const enableEssentialTools = useUiSettingsStore(
		(state) => state.enableEssentialTools
	);
	const moveTool = useUiSettingsStore((state) => state.moveTool);
	const moveToolByDelta = useUiSettingsStore((state) => state.moveToolByDelta);
	const resetToolOrder = useUiSettingsStore((state) => state.resetToolOrder);
	const resetToolUsage = useUiSettingsStore((state) => state.resetToolUsage);

	const activeTool = useEditorStore((state) => state.tool);
	const setActiveTool = useEditorStore((state) => state.setTool);

	const [dragIndex, setDragIndex] = useState<number | null>(null);
	const [dropIndex, setDropIndex] = useState<number | null>(null);

	const orderedTools = useMemo(
		() => getOrderedTools(toolSortMode, toolOrder, toolUsage),
		[toolSortMode, toolOrder, toolUsage]
	);

	const enabledCount = useMemo(
		() => TOOLS.filter((info) => enabledTools[info.id] !== false).length,
		[enabledTools]
	);

	return (
		<div className="space-y-4">
			<div className="rounded-xl border border-[var(--pe-border)] bg-[var(--pe-bg-panel-subtle)] px-3.5 py-3">
				<Switch
					checked={showToolbar}
					description="Display the vertical tool strip alongside the canvas"
					label="Show Toolbar"
					onChange={setShowToolbar}
				/>
			</div>

			<div className="space-y-2 rounded-xl border border-[var(--pe-border)] bg-[var(--pe-bg-panel-subtle)] p-3">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div>
						<span className="text-xs font-semibold text-[var(--pe-text)]">
							Sort Order
						</span>
						<span className="ml-2 text-[11px] text-[var(--pe-text-muted)]">
							{toolSortMode === "manual"
								? "Manual drag or arrows"
								: "Automatic sorting"}
						</span>
					</div>
					<div className="flex flex-wrap items-center gap-1">
						{SORT_MODES.map((mode) => (
							<TextButton
								key={mode.id}
								active={toolSortMode === mode.id}
								onClick={() => {
									setToolSortMode(mode.id);
								}}
							>
								{mode.label}
							</TextButton>
						))}
					</div>
				</div>

				<div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--pe-border-subtle)] pt-2">
					<div className="flex items-center gap-1.5">
						<TextButton onClick={enableAllTools}>
							Show all ({TOOLS.length})
						</TextButton>
						<TextButton onClick={enableEssentialTools}>
							Essentials (9)
						</TextButton>
						<span className="ml-1 text-[11px] text-[var(--pe-text-muted)]">
							{enabledCount} of {TOOLS.length} enabled
						</span>
					</div>
					<div className="flex items-center gap-1.5">
						{toolSortMode === "most-used" && (
							<TextButton onClick={resetToolUsage}>Reset usage</TextButton>
						)}
						{toolSortMode === "manual" && (
							<TextButton onClick={resetToolOrder}>Reset order</TextButton>
						)}
					</div>
				</div>
			</div>

			<div className="divide-y divide-[var(--pe-border-subtle)] rounded-xl border border-[var(--pe-border)] bg-[var(--pe-bg-panel-subtle)]">
				{orderedTools.map((info, index) => {
					const isEnabled = enabledTools[info.id] !== false;
					const isLastEnabled = isEnabled && enabledCount <= 1;
					const usageCount = toolUsage[info.id] ?? 0;
					const isDropTarget = dropIndex === index && dragIndex !== index;

					return (
						<div
							key={info.id}
							draggable
							className={`flex items-center gap-2 px-3 py-2 transition-colors ${
								isEnabled ? "" : "opacity-60"
							} ${
								isDropTarget
									? "border-t-2 border-t-[var(--pe-accent)] bg-[var(--pe-accent-soft)]"
									: ""
							}`}
							onDragEnd={() => {
								setDragIndex(null);
								setDropIndex(null);
							}}
							onDragOver={(event) => {
								if (dragIndex === null) return;
								event.preventDefault();
								event.dataTransfer.dropEffect = "move";
								if (dropIndex !== index) {
									setDropIndex(index);
								}
							}}
							onDragStart={(event) => {
								setDragIndex(index);
								event.dataTransfer.effectAllowed = "move";
								event.dataTransfer.setData("text/plain", info.id);
							}}
							onDrop={(event) => {
								event.preventDefault();
								if (dragIndex !== null && dragIndex !== index) {
									moveTool(dragIndex, index);
								}
								setDragIndex(null);
								setDropIndex(null);
							}}
						>
							<span
								aria-hidden="true"
								className="cursor-grab text-[var(--pe-text-muted)] active:cursor-grabbing"
								title="Drag to reorder (switches to Manual sort)"
							>
								<Bars3Icon className="h-4 w-4" />
							</span>

							<div className="flex items-center gap-0.5">
								<button
									aria-label={`Move ${info.label} up`}
									className="flex h-6 w-6 items-center justify-center rounded text-[var(--pe-text-muted)] hover:bg-[var(--pe-bg-control-hover)] hover:text-[var(--pe-text)] disabled:cursor-not-allowed disabled:opacity-30"
									disabled={index === 0}
									title="Move up (switches to Manual)"
									type="button"
									onClick={() => {
										moveToolByDelta(info.id, -1);
									}}
								>
									<ChevronUpIcon className="h-3.5 w-3.5" />
								</button>
								<button
									aria-label={`Move ${info.label} down`}
									className="flex h-6 w-6 items-center justify-center rounded text-[var(--pe-text-muted)] hover:bg-[var(--pe-bg-control-hover)] hover:text-[var(--pe-text)] disabled:cursor-not-allowed disabled:opacity-30"
									disabled={index === orderedTools.length - 1}
									title="Move down (switches to Manual)"
									type="button"
									onClick={() => {
										moveToolByDelta(info.id, 1);
									}}
								>
									<ChevronDownIcon className="h-3.5 w-3.5" />
								</button>
							</div>

							<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--pe-border)] bg-[var(--pe-bg-panel)] text-[var(--pe-text)]">
								<ToolIcon className="h-4 w-4" tool={info.id} />
							</span>

							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<span className="truncate text-xs font-medium text-[var(--pe-text)]">
										{info.label}
									</span>
									<span className="hidden rounded bg-[var(--pe-bg-control)] px-1.5 py-px text-[10px] text-[var(--pe-text-muted)] sm:inline">
										{TOOL_CATEGORY_LABELS[info.category]}
									</span>
								</div>
							</div>

							{toolSortMode === "most-used" && (
								<span className="shrink-0 rounded-full bg-[var(--pe-bg-control)] px-2 py-0.5 text-[10px] tabular-nums text-[var(--pe-text-muted)]">
									{usageCount} {usageCount === 1 ? "use" : "uses"}
								</span>
							)}

							<Kbd>{info.shortcut}</Kbd>

							<div className="ml-1 shrink-0">
								<Switch
									hideLabel
									checked={isEnabled}
									disabled={isLastEnabled}
									label={`Show ${info.label} in toolbar`}
									title={
										isLastEnabled
											? "At least one tool must stay enabled"
											: isEnabled
												? `Hide ${info.label} from toolbar`
												: `Show ${info.label} in toolbar`
									}
									onChange={(checked) => {
										setToolEnabled(info.id, checked);
										if (!checked && activeTool === info.id) {
											const fallback = orderedTools.find(
												(candidate) =>
													candidate.id !== info.id &&
													enabledTools[candidate.id] !== false
											);
											if (fallback) {
												setActiveTool(fallback.id);
											}
										}
									}}
								/>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
};

const EditorTab = (): FunctionComponent => {
	const showGrid = useEditorStore((state) => state.showGrid);
	const toggleGrid = useEditorStore((state) => state.toggleGrid);
	const pixelPerfect = useEditorStore((state) => state.pixelPerfect);
	const togglePixelPerfect = useEditorStore(
		(state) => state.togglePixelPerfect
	);
	const showNotice = useEditorStore((state) => state.showNotice);
	const toolbarWidth = useUiSettingsStore((state) => state.toolbarWidth);
	const setToolbarWidth = useUiSettingsStore((state) => state.setToolbarWidth);
	const resetAllUiSettings = useUiSettingsStore(
		(state) => state.resetAllUiSettings
	);

	return (
		<div className="space-y-4">
			<div className="divide-y divide-[var(--pe-border-subtle)] rounded-xl border border-[var(--pe-border)] bg-[var(--pe-bg-panel-subtle)]">
				<div className="px-3.5 py-3">
					<Switch
						checked={showGrid}
						description="Show pixel boundaries and 8×8 major grid lines when zoomed in"
						label="Show Pixel Grid"
						onChange={toggleGrid}
					/>
				</div>
				<div className="px-3.5 py-3">
					<Switch
						checked={pixelPerfect}
						description="Automatically clean L-shaped corners on 1px pencil & eraser strokes"
						label="Pixel-Perfect Strokes"
						onChange={togglePixelPerfect}
					/>
				</div>
			</div>

			<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--pe-border)] bg-[var(--pe-bg-panel-subtle)] px-3.5 py-3">
				<div>
					<p className="text-xs font-medium text-[var(--pe-text)]">
						Toolbar Width
					</p>
					<p className="mt-0.5 text-[11px] text-[var(--pe-text-muted)]">
						Currently {toolbarWidth}px wide (drag toolbar edge or reset)
					</p>
				</div>
				<TextButton
					disabled={toolbarWidth === DEFAULT_TOOLBAR_WIDTH}
					onClick={() => {
						setToolbarWidth(DEFAULT_TOOLBAR_WIDTH);
					}}
				>
					Reset ({DEFAULT_TOOLBAR_WIDTH}px)
				</TextButton>
			</div>

			<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--pe-border)] bg-[var(--pe-bg-panel-subtle)] px-3.5 py-3">
				<div>
					<p className="text-xs font-medium text-[var(--pe-text)]">
						Reset Workspace Preferences
					</p>
					<p className="mt-0.5 text-[11px] text-[var(--pe-text-muted)]">
						Restore default theme, panel visibility, and tool ordering
					</p>
				</div>
				<TextButton
					variant="danger"
					onClick={() => {
						resetAllUiSettings();
						showNotice("Workspace settings reset");
					}}
				>
					Reset Workspace Settings
				</TextButton>
			</div>
		</div>
	);
};

export const SettingsDialog = ({
	onClose,
}: {
	onClose: () => void;
}): FunctionComponent => {
	const [activeTab, setActiveTab] = useState<SettingsTabId>("appearance");
	const baseId = useId();
	const tabRefs = useRef<Partial<Record<SettingsTabId, HTMLButtonElement | null>>>({});
	const panelRefs = useRef<Partial<Record<SettingsTabId, HTMLDivElement | null>>>({});

	useEffect(() => {
		const cleanups: Array<() => void> = [];
		for (const tab of TABS) {
			const panelElement = panelRefs.current[tab.id];
			if (!panelElement) continue;
			const onBeforeMatch = (): void => {
				setActiveTab(tab.id);
			};
			panelElement.addEventListener("beforematch", onBeforeMatch);
			cleanups.push(() => {
				panelElement.removeEventListener("beforematch", onBeforeMatch);
			});
		}
		return (): void => {
			for (const cleanup of cleanups) {
				cleanup();
			}
		};
	}, []);

	const selectAndFocusTab = (tabId: SettingsTabId): void => {
		setActiveTab(tabId);
		const button = tabRefs.current[tabId];
		if (button) {
			button.focus();
			if (typeof button.scrollIntoView === "function") {
				button.scrollIntoView({
					block: "nearest",
					inline: "nearest",
				});
			}
		}
	};

	const handleTabListKeyDown = (
		event: ReactKeyboardEvent<HTMLDivElement>
	): void => {
		if (SUPPORTS_FOCUSGROUP) return;
		const currentIndex = TABS.findIndex((tab) => tab.id === activeTab);
		if (currentIndex < 0) return;

		let nextIndex: number | null = null;
		if (event.key === "ArrowRight") {
			nextIndex = (currentIndex + 1) % TABS.length;
		} else if (event.key === "ArrowLeft") {
			nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
		} else if (event.key === "Home") {
			nextIndex = 0;
		} else if (event.key === "End") {
			nextIndex = TABS.length - 1;
		}

		if (nextIndex !== null) {
			const nextTab = TABS[nextIndex];
			if (nextTab) {
				event.preventDefault();
				selectAndFocusTab(nextTab.id);
			}
		}
	};

	const focusGroupTablistAttributes = {
		focusgroup: "tablist nomemory",
	} as Record<string, string>;

	return (
		<Modal
			size="xl"
			subtitle="Personalize your theme, workspace panels, and toolbar"
			title="Studio Settings"
			footer={
				<div className="flex w-full items-center justify-between gap-3">
					<span className="text-[11px] text-[var(--pe-text-muted)]">
						Changes are saved automatically
					</span>
					<TextButton variant="primary" onClick={onClose}>
						Done
					</TextButton>
				</div>
			}
			onClose={onClose}
		>
			<div
				aria-label="Settings sections"
				className="pe-tablist mb-4"
				role="tablist"
				{...focusGroupTablistAttributes}
				onKeyDown={handleTabListKeyDown}
			>
				{TABS.map(({ id, label, Icon }) => {
					const isSelected = activeTab === id;
					const tabId = `${baseId}-tab-${id}`;
					const focusStartAttributes = isSelected
						? ({ focusgroupstart: "" } as Record<string, string>)
						: {};
					return (
						<button
							key={id}
							ref={(element) => {
								tabRefs.current[id] = element;
							}}
							aria-selected={isSelected}
							className="pe-tab"
							id={tabId}
							role="tab"
							tabIndex={SUPPORTS_FOCUSGROUP ? undefined : isSelected ? 0 : -1}
							type="button"
							{...focusStartAttributes}
							onClick={() => {
								setActiveTab(id);
							}}
							onFocus={() => {
								setActiveTab(id);
							}}
						>
							<Icon className="h-4 w-4 shrink-0" />
							<span>{label}</span>
						</button>
					);
				})}
			</div>

			<div className="pe-tab-panels">
				{TABS.map(({ id }) => {
					const isSelected = activeTab === id;
					const tabId = `${baseId}-tab-${id}`;
					return (
						<div
							key={id}
							ref={(element) => {
								panelRefs.current[id] = element;
							}}
							aria-labelledby={tabId}
							className="pe-tab-panel"
							role="tabpanel"
							hidden={
								isSelected ? undefined : ("until-found" as unknown as boolean)
							}
						>
							<div>
								{id === "appearance" && <AppearanceTab />}
								{id === "panels" && <PanelsTab />}
								{id === "toolbar" && <ToolbarTab />}
								{id === "editor" && <EditorTab />}
							</div>
						</div>
					);
				})}
			</div>
		</Modal>
	);
};
