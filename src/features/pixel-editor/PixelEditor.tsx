import { useEffect } from "react";
import type { FunctionComponent } from "../../common/types";
import { ColorPickerPanel } from "./components/ColorPanel";
import { Dialogs } from "./components/Dialogs";
import { LayersPanel } from "./components/LayersPanel";
import { PalettePanel } from "./components/PalettePanel";
import { PixelCanvas } from "./components/PixelCanvas";
import { PreviewPanel } from "./components/PreviewPanel";
import { StatusBar } from "./components/StatusBar";
import { TilemapPanel } from "./components/TilemapPreview";
import { Timeline } from "./components/Timeline";
import { Toolbar } from "./components/Toolbar";
import { ToolOptions } from "./components/ToolOptions";
import { TopBar } from "./components/TopBar";
import { usePixelEditorApi } from "./hooks/usePixelEditorApi";
import { useShortcuts } from "./hooks/useShortcuts";
import { startAutosave } from "./store/autosave";
import { useEditorStore } from "./store/editorStore";
import {
	applyThemeToDocument,
	COLOR_SCHEME_FOUC_STORAGE_KEY,
	THEME_FOUC_STORAGE_KEY,
	UI_SETTINGS_STORAGE_KEY,
	useUiSettingsStore,
} from "./store/uiSettingsStore";
import "./pixel-editor.css";

export const PixelEditor = (): FunctionComponent => {
	useShortcuts();
	usePixelEditorApi();

	const theme = useUiSettingsStore((state) => state.theme);
	const panels = useUiSettingsStore((state) => state.panels);
	const showToolbar = useUiSettingsStore((state) => state.showToolbar);

	useEffect(() => startAutosave(), []);

	useEffect(() => {
		applyThemeToDocument(theme);
	}, [theme]);

	useEffect(() => {
		const onStorage = (event: StorageEvent): void => {
			if (
				event.key === null ||
				event.key === UI_SETTINGS_STORAGE_KEY ||
				event.key === THEME_FOUC_STORAGE_KEY ||
				event.key === COLOR_SCHEME_FOUC_STORAGE_KEY
			) {
				useUiSettingsStore.getState().hydrateFromStorage();
			}
		};
		window.addEventListener("storage", onStorage);
		return (): void => {
			window.removeEventListener("storage", onStorage);
		};
	}, []);

	useEffect(() => {
		return useEditorStore.subscribe((state, previousState) => {
			if (state.tool !== previousState.tool) {
				useUiSettingsStore.getState().recordToolUse(state.tool);
			}
		});
	}, []);

	const showDockedLayers = panels.layers && !panels.frames;
	const hasRightSidebar =
		panels.colorPicker ||
		panels.palette ||
		showDockedLayers ||
		panels.preview ||
		panels.tilemap;

	return (
		<div className="pixel-editor-root flex h-screen w-screen select-none flex-col overflow-hidden bg-[var(--pe-bg-desk)] text-[var(--pe-text)]">
			<TopBar />
			{panels.toolOptions && <ToolOptions />}
			<div className="flex min-h-0 flex-1">
				{showToolbar && <Toolbar />}
				<main className="canvas-backdrop relative min-w-0 flex-1">
					<PixelCanvas />
				</main>
				{hasRightSidebar && (
					<aside className="editor-scrollbar w-[276px] shrink-0 space-y-2.5 overflow-y-auto border-l border-[var(--pe-border)] bg-[var(--pe-bg-chrome)] p-2.5">
						{panels.colorPicker && <ColorPickerPanel />}
						{panels.palette && <PalettePanel />}
						{showDockedLayers && <LayersPanel />}
						{panels.preview && <PreviewPanel />}
						{panels.tilemap && <TilemapPanel />}
					</aside>
				)}
			</div>
			{panels.frames && <Timeline />}
			{panels.statusBar && <StatusBar />}
			<Dialogs />
		</div>
	);
};
