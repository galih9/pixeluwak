import { beforeEach, describe, expect, it } from "vitest";
import { TOOLS } from "../constants";
import {
	applyThemeToDocument,
	COLOR_SCHEME_FOUC_STORAGE_KEY,
	DEFAULT_TOOLBAR_WIDTH,
	getOrderedTools,
	getVisibleOrderedTools,
	loadPersistedUiSettings,
	MAX_TOOLBAR_WIDTH,
	MIN_TOOLBAR_WIDTH,
	THEME_FOUC_STORAGE_KEY,
	UI_SETTINGS_STORAGE_KEY,
	useUiSettingsStore,
	WORKSPACE_PRESETS,
} from "./uiSettingsStore";

describe("uiSettingsStore", () => {
	beforeEach(() => {
		window.localStorage.clear();
		document.head.innerHTML = '<meta name="color-scheme" content="light dark" />';
		document.documentElement.removeAttribute("data-theme");
		useUiSettingsStore.getState().resetAllUiSettings();
	});

	it("starts with studio defaults and tilemap collapsed from sidebar", () => {
		const state = useUiSettingsStore.getState();
		expect(state.theme).toBe("system");
		expect(state.showToolbar).toBe(true);
		expect(state.toolbarWidth).toBe(DEFAULT_TOOLBAR_WIDTH);
		expect(state.toolSortMode).toBe("category");
		expect(state.panels).toEqual(WORKSPACE_PRESETS.studio);
		expect(state.panels.tilemap).toBe(false);
		expect(
			TOOLS.every((info) => state.enabledTools[info.id] === true)
		).toBe(true);
	});

	it("applies explicit themes to document and clears FOUC storage on system", () => {
		const store = useUiSettingsStore.getState();
		store.setTheme("espresso");

		const meta = document.querySelector<HTMLMetaElement>(
			'meta[name="color-scheme"]'
		);
		expect(document.documentElement.dataset["theme"]).toBe("espresso");
		expect(meta?.content).toBe("dark");
		expect(window.localStorage.getItem(THEME_FOUC_STORAGE_KEY)).toBe("espresso");
		expect(window.localStorage.getItem(COLOR_SCHEME_FOUC_STORAGE_KEY)).toBe(
			"dark"
		);

		store.setTheme("matcha");
		expect(document.documentElement.dataset["theme"]).toBe("matcha");
		expect(meta?.content).toBe("light");

		store.setTheme("nes");
		expect(document.documentElement.dataset["theme"]).toBe("nes");
		expect(meta?.content).toBe("dark");

		store.setTheme("gameboy");
		expect(document.documentElement.dataset["theme"]).toBe("gameboy");
		expect(meta?.content).toBe("light");

		store.setTheme("wii");
		expect(document.documentElement.dataset["theme"]).toBe("wii");
		expect(meta?.content).toBe("light");

		store.setTheme("system");
		expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
		expect(meta?.content).toBe("light dark");
		expect(window.localStorage.getItem(THEME_FOUC_STORAGE_KEY)).toBeNull();
		expect(
			window.localStorage.getItem(COLOR_SCHEME_FOUC_STORAGE_KEY)
		).toBeNull();
	});

	it("creates meta[name=color-scheme] if missing when applying theme", () => {
		document.head.innerHTML = "";
		applyThemeToDocument("midnight");
		const meta = document.querySelector<HTMLMetaElement>(
			'meta[name="color-scheme"]'
		);
		expect(meta?.content).toBe("dark");
		expect(document.documentElement.dataset["theme"]).toBe("midnight");
	});

	it("toggles individual panels and applies workspace presets", () => {
		const store = useUiSettingsStore.getState();
		store.setPanelVisible("tilemap", true);
		expect(useUiSettingsStore.getState().panels.tilemap).toBe(true);

		store.togglePanel("preview");
		expect(useUiSettingsStore.getState().panels.preview).toBe(false);

		store.applyWorkspacePreset("illustration");
		expect(useUiSettingsStore.getState().panels).toEqual(
			WORKSPACE_PRESETS.illustration
		);
		expect(useUiSettingsStore.getState().panels.frames).toBe(false);
		expect(useUiSettingsStore.getState().panels.layers).toBe(true);

		store.applyWorkspacePreset("zen");
		expect(useUiSettingsStore.getState().panels).toEqual(WORKSPACE_PRESETS.zen);
	});

	it("clamps toolbar width and guards against disabling the last remaining tool", () => {
		const store = useUiSettingsStore.getState();
		store.setToolbarWidth(10);
		expect(useUiSettingsStore.getState().toolbarWidth).toBe(MIN_TOOLBAR_WIDTH);
		store.setToolbarWidth(999);
		expect(useUiSettingsStore.getState().toolbarWidth).toBe(MAX_TOOLBAR_WIDTH);

		store.setShowToolbar(false);
		expect(useUiSettingsStore.getState().showToolbar).toBe(false);

		// Disable all tools except pencil
		for (const info of TOOLS) {
			if (info.id !== "pencil") {
				store.setToolEnabled(info.id, false);
			}
		}
		expect(useUiSettingsStore.getState().enabledTools.pencil).toBe(true);

		// Refuses disabling the last enabled tool
		store.setToolEnabled("pencil", false);
		expect(useUiSettingsStore.getState().enabledTools.pencil).toBe(true);

		const visible = getVisibleOrderedTools(
			"category",
			useUiSettingsStore.getState().toolOrder,
			useUiSettingsStore.getState().enabledTools,
			{}
		);
		expect(visible.map((item) => item.id)).toEqual(["pencil"]);
	});

	it("sorts tools automatically by category, alphabetical, and most-used", () => {
		const store = useUiSettingsStore.getState();
		const categoryOrder = getOrderedTools("category", store.toolOrder, {});
		expect(categoryOrder.map((info) => info.id)).toEqual(
			TOOLS.map((info) => info.id)
		);

		const alphaOrder = getOrderedTools("alphabetical", store.toolOrder, {});
		expect(alphaOrder[0]?.id).toBe("blur");
		expect(alphaOrder[alphaOrder.length - 1]?.id).toBe("text");

		store.recordToolUse("eraser");
		store.recordToolUse("eraser");
		store.recordToolUse("fill");
		const usageState = useUiSettingsStore.getState();
		const mostUsedOrder = getOrderedTools(
			"most-used",
			usageState.toolOrder,
			usageState.toolUsage
		);
		expect(mostUsedOrder[0]?.id).toBe("eraser");
		expect(mostUsedOrder[1]?.id).toBe("fill");
		expect(mostUsedOrder[2]?.id).toBe("pencil");

		store.resetToolUsage();
		expect(useUiSettingsStore.getState().toolUsage).toEqual({});
	});

	it("switches to manual sorting when reordering tools and resets cleanly", () => {
		const store = useUiSettingsStore.getState();
		store.setToolSortMode("alphabetical");

		// Moving the first item ("blur" in alphabetical order) down by 1 snapshots alphabetical order as manual
		store.moveToolByDelta("blur", 1);
		const afterMove = useUiSettingsStore.getState();
		expect(afterMove.toolSortMode).toBe("manual");
		expect(afterMove.toolOrder[1]).toBe("blur");

		store.moveTool(0, 2);
		expect(useUiSettingsStore.getState().toolSortMode).toBe("manual");

		store.resetToolOrder();
		expect(useUiSettingsStore.getState().toolSortMode).toBe("category");
		expect(useUiSettingsStore.getState().toolOrder).toEqual(
			TOOLS.map((info) => info.id)
		);
	});

	it("persists to localStorage and handles corrupt JSON gracefully", () => {
		const store = useUiSettingsStore.getState();
		store.setTheme("wii");
		store.enableEssentialTools();

		const reloaded = loadPersistedUiSettings();
		expect(reloaded.theme).toBe("wii");
		expect(reloaded.enabledTools.pencil).toBe(true);
		expect(reloaded.enabledTools.blur).toBe(false);

		store.setTheme("nes");
		expect(loadPersistedUiSettings().theme).toBe("nes");

		store.setTheme("gameboy");
		expect(loadPersistedUiSettings().theme).toBe("gameboy");

		window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, "{not-valid-json");
		const fallback = loadPersistedUiSettings();
		expect(fallback.theme).toBe("system");
		expect(fallback.panels).toEqual(WORKSPACE_PRESETS.studio);
	});
});
