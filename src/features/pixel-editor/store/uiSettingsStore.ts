import { create } from "zustand";
import { ESSENTIAL_TOOLS, TOOLS, type ToolInfo } from "../constants";
import type {
	PanelId,
	ThemeId,
	Tool,
	ToolSortMode,
	WorkspacePresetId,
} from "../types";

export const UI_SETTINGS_STORAGE_KEY = "pixel-editor:ui-settings:v1";
export const THEME_FOUC_STORAGE_KEY = "pixel-editor:theme";
export const COLOR_SCHEME_FOUC_STORAGE_KEY = "pixel-editor:color-scheme";

export const MIN_TOOLBAR_WIDTH = 52;
export const MAX_TOOLBAR_WIDTH = 220;
export const DEFAULT_TOOLBAR_WIDTH = 56;

export type ThemeDefinition = {
	id: ThemeId;
	name: string;
	subtitle: string;
	group: "standard" | "studio";
	scheme: "system" | "light" | "dark";
	swatches: {
		desk: string;
		chrome: string;
		panel: string;
		elevated: string;
		accent: string;
		text: string;
	};
};

export const THEME_DEFINITIONS: Array<ThemeDefinition> = [
	{
		id: "system",
		name: "System",
		subtitle: "Follows your OS light or dark appearance automatically",
		group: "standard",
		scheme: "system",
		swatches: {
			desk: "#27272a",
			chrome: "#18181b",
			panel: "#f4f4f5",
			elevated: "#e4e4e7",
			accent: "#3b82f6",
			text: "#18181b",
		},
	},
	{
		id: "light",
		name: "Studio Light",
		subtitle: "Warm alabaster drafting paper with crisp cobalt ink",
		group: "standard",
		scheme: "light",
		swatches: {
			desk: "#e8e3da",
			chrome: "#f4f0e8",
			panel: "#fcfaf6",
			elevated: "#ede8de",
			accent: "#3658d6",
			text: "#22201c",
		},
	},
	{
		id: "dark",
		name: "Studio Dark",
		subtitle: "Neutral obsidian slate tuned for long pixel sessions",
		group: "standard",
		scheme: "dark",
		swatches: {
			desk: "#14161b",
			chrome: "#111318",
			panel: "#1b1e25",
			elevated: "#262a34",
			accent: "#4c82fb",
			text: "#eef1f7",
		},
	},
	{
		id: "espresso",
		name: "Espresso Latte",
		subtitle: "Roasted espresso warmth with steamed caramel highlights",
		group: "studio",
		scheme: "dark",
		swatches: {
			desk: "#1a1512",
			chrome: "#14100d",
			panel: "#241d18",
			elevated: "#332922",
			accent: "#e59348",
			text: "#f5ece3",
		},
	},
	{
		id: "matcha",
		name: "Matcha Paper",
		subtitle: "Soft sage sketchbook paper with botanical forest ink",
		group: "studio",
		scheme: "light",
		swatches: {
			desk: "#dde4cf",
			chrome: "#e8eedc",
			panel: "#f6f8f1",
			elevated: "#e4ebd8",
			accent: "#3b7a47",
			text: "#1f2d21",
		},
	},
	{
		id: "gameboy",
		name: "Pocket Retro",
		subtitle: "Nostalgic handheld olive LCD shell & pixel ink",
		group: "studio",
		scheme: "light",
		swatches: {
			desk: "#c4cba8",
			chrome: "#cfd5b6",
			panel: "#e7ebd6",
			elevated: "#d7ddc0",
			accent: "#2f5220",
			text: "#1b2c12",
		},
	},
	{
		id: "midnight",
		name: "Midnight Synth",
		subtitle: "Twilight plum studio glow with pixel sakura accents",
		group: "studio",
		scheme: "dark",
		swatches: {
			desk: "#13111c",
			chrome: "#0e0c16",
			panel: "#1b1727",
			elevated: "#28223a",
			accent: "#e86ca8",
			text: "#f5eefb",
		},
	},
];

export const WORKSPACE_PRESETS: Record<
	WorkspacePresetId,
	Record<PanelId, boolean>
> = {
	studio: {
		colorPicker: true,
		palette: true,
		preview: true,
		layers: true,
		frames: true,
		tilemap: false,
		toolOptions: true,
		statusBar: true,
	},
	illustration: {
		colorPicker: true,
		palette: true,
		preview: true,
		layers: true,
		frames: false,
		tilemap: false,
		toolOptions: true,
		statusBar: true,
	},
	animation: {
		colorPicker: true,
		palette: true,
		preview: true,
		layers: true,
		frames: true,
		tilemap: false,
		toolOptions: true,
		statusBar: true,
	},
	zen: {
		colorPicker: false,
		palette: false,
		preview: false,
		layers: false,
		frames: false,
		tilemap: false,
		toolOptions: false,
		statusBar: false,
	},
};

export type PersistedUiSettings = {
	theme: ThemeId;
	panels: Record<PanelId, boolean>;
	showToolbar: boolean;
	toolbarWidth: number;
	toolSortMode: ToolSortMode;
	toolOrder: Array<Tool>;
	enabledTools: Record<Tool, boolean>;
	toolUsage: Partial<Record<Tool, number>>;
};

const ALL_TOOL_IDS: Array<Tool> = TOOLS.map((info) => info.id);
const VALID_THEME_IDS = new Set<ThemeId>(
	THEME_DEFINITIONS.map((definition) => definition.id)
);
const VALID_SORT_MODES = new Set<ToolSortMode>([
	"category",
	"alphabetical",
	"most-used",
	"manual",
]);
const VALID_TOOL_IDS = new Set<Tool>(ALL_TOOL_IDS);
const TOOL_INFO_BY_ID = new Map<Tool, ToolInfo>(
	TOOLS.map((info) => [info.id, info])
);
const DEFAULT_TOOL_INDEX = new Map<Tool, number>(
	TOOLS.map((info, index) => [info.id, index])
);

function buildDefaultEnabledTools(): Record<Tool, boolean> {
	const record = {} as Record<Tool, boolean>;
	for (const toolId of ALL_TOOL_IDS) {
		record[toolId] = true;
	}
	return record;
}

export const DEFAULT_UI_SETTINGS: PersistedUiSettings = {
	theme: "system",
	panels: { ...WORKSPACE_PRESETS.studio },
	showToolbar: true,
	toolbarWidth: DEFAULT_TOOLBAR_WIDTH,
	toolSortMode: "category",
	toolOrder: [...ALL_TOOL_IDS],
	enabledTools: buildDefaultEnabledTools(),
	toolUsage: {},
};

export const clampToolbarWidth = (value: number): number => {
	if (!Number.isFinite(value)) return DEFAULT_TOOLBAR_WIDTH;
	return Math.min(
		MAX_TOOLBAR_WIDTH,
		Math.max(MIN_TOOLBAR_WIDTH, Math.round(value))
	);
};

export function themeColorScheme(theme: ThemeId): "light dark" | "light" | "dark" {
	if (theme === "system") return "light dark";
	const found = THEME_DEFINITIONS.find((definition) => definition.id === theme);
	if (!found || found.scheme === "system") return "light dark";
	return found.scheme;
}

export function applyThemeToDocument(theme: ThemeId): void {
	if (typeof document === "undefined") return;
	const root = document.documentElement;
	if (theme === "system") {
		root.removeAttribute("data-theme");
	} else {
		root.dataset["theme"] = theme;
	}

	const scheme = themeColorScheme(theme);
	let meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
	if (!meta && document.head) {
		meta = document.createElement("meta");
		meta.name = "color-scheme";
		document.head.append(meta);
	}
	if (meta) {
		meta.content = scheme;
	}

	try {
		if (theme === "system") {
			window.localStorage.removeItem(COLOR_SCHEME_FOUC_STORAGE_KEY);
			window.localStorage.removeItem(THEME_FOUC_STORAGE_KEY);
		} else {
			window.localStorage.setItem(COLOR_SCHEME_FOUC_STORAGE_KEY, scheme);
			window.localStorage.setItem(THEME_FOUC_STORAGE_KEY, theme);
		}
	} catch {
		// Private browsing or disabled storage is non-fatal.
	}
}

export function getOrderedTools(
	sortMode: ToolSortMode,
	toolOrder: Array<Tool>,
	toolUsage: Partial<Record<Tool, number>>
): Array<ToolInfo> {
	if (sortMode === "category") {
		return [...TOOLS];
	}
	if (sortMode === "alphabetical") {
		return [...TOOLS].sort((a, b) => a.label.localeCompare(b.label));
	}
	if (sortMode === "most-used") {
		return [...TOOLS].sort((a, b) => {
			const diff = (toolUsage[b.id] ?? 0) - (toolUsage[a.id] ?? 0);
			if (diff !== 0) return diff;
			return (
				(DEFAULT_TOOL_INDEX.get(a.id) ?? 0) -
				(DEFAULT_TOOL_INDEX.get(b.id) ?? 0)
			);
		});
	}

	const ordered: Array<ToolInfo> = [];
	const seen = new Set<Tool>();
	for (const toolId of toolOrder) {
		if (seen.has(toolId)) continue;
		const info = TOOL_INFO_BY_ID.get(toolId);
		if (info) {
			ordered.push(info);
			seen.add(toolId);
		}
	}
	for (const info of TOOLS) {
		if (!seen.has(info.id)) {
			ordered.push(info);
		}
	}
	return ordered;
}

export function getVisibleOrderedTools(
	sortMode: ToolSortMode,
	toolOrder: Array<Tool>,
	enabledTools: Record<Tool, boolean>,
	toolUsage: Partial<Record<Tool, number>>
): Array<ToolInfo> {
	const visible = getOrderedTools(sortMode, toolOrder, toolUsage).filter(
		(info) => enabledTools[info.id] !== false
	);
	if (visible.length > 0) return visible;
	const firstTool = TOOLS[0];
	return firstTool ? [firstTool] : [];
}

function sanitizeToolOrder(rawOrder: unknown): Array<Tool> {
	if (!Array.isArray(rawOrder)) return [...ALL_TOOL_IDS];
	const next: Array<Tool> = [];
	const seen = new Set<Tool>();
	for (const entry of rawOrder) {
		if (
			typeof entry === "string" &&
			VALID_TOOL_IDS.has(entry as Tool) &&
			!seen.has(entry as Tool)
		) {
			next.push(entry as Tool);
			seen.add(entry as Tool);
		}
	}
	for (const toolId of ALL_TOOL_IDS) {
		if (!seen.has(toolId)) next.push(toolId);
	}
	return next;
}

function sanitizeEnabledTools(rawEnabled: unknown): Record<Tool, boolean> {
	const defaults = buildDefaultEnabledTools();
	if (!rawEnabled || typeof rawEnabled !== "object") return defaults;
	const source = rawEnabled as Record<string, unknown>;
	let enabledCount = 0;
	for (const toolId of ALL_TOOL_IDS) {
		const flag = source[toolId] !== false;
		defaults[toolId] = flag;
		if (flag) enabledCount++;
	}
	if (enabledCount === 0 && ALL_TOOL_IDS[0]) {
		defaults[ALL_TOOL_IDS[0]] = true;
	}
	return defaults;
}

function sanitizePanels(rawPanels: unknown): Record<PanelId, boolean> {
	const defaults: Record<PanelId, boolean> = { ...WORKSPACE_PRESETS.studio };
	if (!rawPanels || typeof rawPanels !== "object") return defaults;
	const source = rawPanels as Record<string, unknown>;
	(Object.keys(defaults) as Array<PanelId>).forEach((panelId) => {
		if (typeof source[panelId] === "boolean") {
			defaults[panelId] = source[panelId];
		}
	});
	return defaults;
}

function sanitizeToolUsage(rawUsage: unknown): Partial<Record<Tool, number>> {
	if (!rawUsage || typeof rawUsage !== "object") return {};
	const source = rawUsage as Record<string, unknown>;
	const result: Partial<Record<Tool, number>> = {};
	for (const toolId of ALL_TOOL_IDS) {
		const count = source[toolId];
		if (typeof count === "number" && Number.isFinite(count) && count > 0) {
			result[toolId] = Math.floor(count);
		}
	}
	return result;
}

export function loadPersistedUiSettings(): PersistedUiSettings {
	try {
		const raw = window.localStorage.getItem(UI_SETTINGS_STORAGE_KEY);
		if (!raw) {
			return {
				...DEFAULT_UI_SETTINGS,
				panels: { ...DEFAULT_UI_SETTINGS.panels },
				toolOrder: [...DEFAULT_UI_SETTINGS.toolOrder],
				enabledTools: { ...DEFAULT_UI_SETTINGS.enabledTools },
				toolUsage: {},
			};
		}
		const parsed = JSON.parse(raw) as Partial<PersistedUiSettings>;
		const theme: ThemeId =
			typeof parsed.theme === "string" && VALID_THEME_IDS.has(parsed.theme)
				? parsed.theme
				: "system";
		const toolSortMode: ToolSortMode =
			typeof parsed.toolSortMode === "string" &&
			VALID_SORT_MODES.has(parsed.toolSortMode)
				? parsed.toolSortMode
				: "category";

		return {
			theme,
			panels: sanitizePanels(parsed.panels),
			showToolbar:
				typeof parsed.showToolbar === "boolean" ? parsed.showToolbar : true,
			toolbarWidth:
				typeof parsed.toolbarWidth === "number"
					? clampToolbarWidth(parsed.toolbarWidth)
					: DEFAULT_TOOLBAR_WIDTH,
			toolSortMode,
			toolOrder: sanitizeToolOrder(parsed.toolOrder),
			enabledTools: sanitizeEnabledTools(parsed.enabledTools),
			toolUsage: sanitizeToolUsage(parsed.toolUsage),
		};
	} catch {
		return {
			...DEFAULT_UI_SETTINGS,
			panels: { ...DEFAULT_UI_SETTINGS.panels },
			toolOrder: [...DEFAULT_UI_SETTINGS.toolOrder],
			enabledTools: { ...DEFAULT_UI_SETTINGS.enabledTools },
			toolUsage: {},
		};
	}
}

function persistSettings(state: PersistedUiSettings): void {
	const snapshot: PersistedUiSettings = {
		theme: state.theme,
		panels: state.panels,
		showToolbar: state.showToolbar,
		toolbarWidth: state.toolbarWidth,
		toolSortMode: state.toolSortMode,
		toolOrder: state.toolOrder,
		enabledTools: state.enabledTools,
		toolUsage: state.toolUsage,
	};
	try {
		window.localStorage.setItem(
			UI_SETTINGS_STORAGE_KEY,
			JSON.stringify(snapshot)
		);
	} catch {
		// Ignore quota/private-mode storage errors.
	}
}

export type UiSettingsState = PersistedUiSettings & {
	setTheme: (theme: ThemeId) => void;
	setPanelVisible: (panel: PanelId, visible: boolean) => void;
	togglePanel: (panel: PanelId) => void;
	applyWorkspacePreset: (preset: WorkspacePresetId) => void;
	setShowToolbar: (show: boolean) => void;
	setToolbarWidth: (width: number) => void;
	setToolSortMode: (mode: ToolSortMode) => void;
	setToolEnabled: (tool: Tool, enabled: boolean) => void;
	enableAllTools: () => void;
	enableEssentialTools: () => void;
	moveTool: (fromIndex: number, toIndex: number) => void;
	moveToolByDelta: (tool: Tool, delta: -1 | 1) => void;
	resetToolOrder: () => void;
	recordToolUse: (tool: Tool) => void;
	resetToolUsage: () => void;
	resetAllUiSettings: () => void;
	hydrateFromStorage: () => void;
};

const initial = loadPersistedUiSettings();

export const useUiSettingsStore = create<UiSettingsState>()((set, get) => ({
	...initial,

	setTheme: (theme): void => {
		set((state) => {
			const next = { ...state, theme };
			persistSettings(next);
			return { theme };
		});
		applyThemeToDocument(theme);
	},

	setPanelVisible: (panel, visible): void => {
		set((state) => {
			if (state.panels[panel] === visible) return state;
			const panels = { ...state.panels, [panel]: visible };
			persistSettings({ ...state, panels });
			return { panels };
		});
	},

	togglePanel: (panel): void => {
		const current = get().panels[panel];
		get().setPanelVisible(panel, !current);
	},

	applyWorkspacePreset: (preset): void => {
		const panels = { ...WORKSPACE_PRESETS[preset] };
		const showToolbar = preset !== "zen" ? true : get().showToolbar;
		set((state) => {
			persistSettings({ ...state, panels, showToolbar });
			return { panels, showToolbar };
		});
	},

	setShowToolbar: (showToolbar): void => {
		set((state) => {
			if (state.showToolbar === showToolbar) return state;
			persistSettings({ ...state, showToolbar });
			return { showToolbar };
		});
	},

	setToolbarWidth: (width): void => {
		const toolbarWidth = clampToolbarWidth(width);
		set((state) => {
			if (state.toolbarWidth === toolbarWidth) return state;
			persistSettings({ ...state, toolbarWidth });
			return { toolbarWidth };
		});
	},

	setToolSortMode: (toolSortMode): void => {
		set((state) => {
			if (state.toolSortMode === toolSortMode) return state;
			persistSettings({ ...state, toolSortMode });
			return { toolSortMode };
		});
	},

	setToolEnabled: (tool, enabled): void => {
		set((state) => {
			if (!enabled) {
				const enabledCount = ALL_TOOL_IDS.filter(
					(candidate) => state.enabledTools[candidate] !== false
				).length;
				if (enabledCount <= 1 && state.enabledTools[tool] !== false) {
					return state;
				}
			}
			const enabledTools = { ...state.enabledTools, [tool]: enabled };
			persistSettings({ ...state, enabledTools });
			return { enabledTools };
		});
	},

	enableAllTools: (): void => {
		const enabledTools = buildDefaultEnabledTools();
		set((state) => {
			persistSettings({ ...state, enabledTools });
			return { enabledTools };
		});
	},

	enableEssentialTools: (): void => {
		const enabledTools = {} as Record<Tool, boolean>;
		for (const toolId of ALL_TOOL_IDS) {
			enabledTools[toolId] = ESSENTIAL_TOOLS.has(toolId);
		}
		set((state) => {
			persistSettings({ ...state, enabledTools });
			return { enabledTools };
		});
	},

	moveTool: (fromIndex, toIndex): void => {
		set((state) => {
			const currentOrder = getOrderedTools(
				state.toolSortMode,
				state.toolOrder,
				state.toolUsage
			).map((info) => info.id);
			if (
				fromIndex < 0 ||
				toIndex < 0 ||
				fromIndex >= currentOrder.length ||
				toIndex >= currentOrder.length ||
				fromIndex === toIndex
			) {
				return state;
			}
			const nextOrder = [...currentOrder];
			const [moved] = nextOrder.splice(fromIndex, 1);
			if (!moved) return state;
			nextOrder.splice(toIndex, 0, moved);
			persistSettings({
				...state,
				toolOrder: nextOrder,
				toolSortMode: "manual",
			});
			return { toolOrder: nextOrder, toolSortMode: "manual" as ToolSortMode };
		});
	},

	moveToolByDelta: (tool, delta): void => {
		const state = get();
		const currentOrder = getOrderedTools(
			state.toolSortMode,
			state.toolOrder,
			state.toolUsage
		);
		const fromIndex = currentOrder.findIndex((info) => info.id === tool);
		if (fromIndex < 0) return;
		const toIndex = fromIndex + delta;
		if (toIndex < 0 || toIndex >= currentOrder.length) return;
		state.moveTool(fromIndex, toIndex);
	},

	resetToolOrder: (): void => {
		const toolOrder = [...ALL_TOOL_IDS];
		set((state) => {
			persistSettings({ ...state, toolOrder, toolSortMode: "category" });
			return { toolOrder, toolSortMode: "category" as ToolSortMode };
		});
	},

	recordToolUse: (tool): void => {
		set((state) => {
			const toolUsage = {
				...state.toolUsage,
				[tool]: (state.toolUsage[tool] ?? 0) + 1,
			};
			persistSettings({ ...state, toolUsage });
			return { toolUsage };
		});
	},

	resetToolUsage: (): void => {
		set((state) => {
			const toolUsage: Partial<Record<Tool, number>> = {};
			persistSettings({ ...state, toolUsage });
			return { toolUsage };
		});
	},

	resetAllUiSettings: (): void => {
		const next: PersistedUiSettings = {
			theme: "system",
			panels: { ...WORKSPACE_PRESETS.studio },
			showToolbar: true,
			toolbarWidth: DEFAULT_TOOLBAR_WIDTH,
			toolSortMode: "category",
			toolOrder: [...ALL_TOOL_IDS],
			enabledTools: buildDefaultEnabledTools(),
			toolUsage: {},
		};
		persistSettings(next);
		set(next);
		applyThemeToDocument("system");
	},

	hydrateFromStorage: (): void => {
		const loaded = loadPersistedUiSettings();
		set(loaded);
		applyThemeToDocument(loaded.theme);
	},
}));
