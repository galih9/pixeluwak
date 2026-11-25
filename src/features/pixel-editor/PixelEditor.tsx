import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { FunctionComponent } from "../../common/types";
import { CanvasHud } from "./components/CanvasHud";
import { ColorPickerPanel } from "./components/ColorPanel";
import { Dialogs } from "./components/Dialogs";
import { LayersPanel } from "./components/LayersPanel";
import { PalettePanel } from "./components/PalettePanel";
import { PixelCanvas } from "./components/PixelCanvas";
import { PortraitBottomBar } from "./components/PortraitBottomBar";
import { PreviewPanel } from "./components/PreviewPanel";
import { StatusBar } from "./components/StatusBar";
import {
	StealthActivePlaceholder,
	StealthWindowView,
} from "./components/StealthWindowView";
import {
	type StudioDrawerTab,
	StudioPanelsDrawer,
} from "./components/StudioPanelsDrawer";
import { TilemapPanel } from "./components/TilemapPreview";
import { Timeline } from "./components/Timeline";
import { Toolbar } from "./components/Toolbar";
import { ToolOptions } from "./components/ToolOptions";
import { TopBar } from "./components/TopBar";
import { usePixelEditorApi } from "./hooks/usePixelEditorApi";
import { useShortcuts } from "./hooks/useShortcuts";
import { useStealthWindow } from "./hooks/useStealthWindow";
import {
	COMPACT_MEDIA_QUERY,
	useViewportLayout,
} from "./hooks/useViewportLayout";
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
	usePixelEditorApi();

	const theme = useUiSettingsStore((state) => state.theme);
	const panels = useUiSettingsStore((state) => state.panels);
	const showToolbar = useUiSettingsStore((state) => state.showToolbar);
	const projectName = useEditorStore((state) => state.name);

	const stealth = useStealthWindow({
		theme,
		title: projectName.trim() ? `${projectName.trim()} — Mini` : "Mini Canvas",
	});
	useShortcuts(stealth.stealthWindow);

	const { isCompact, isPortraitDock, isNarrow } = useViewportLayout();
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [drawerTab, setDrawerTab] = useState<StudioDrawerTab>("color");
	const [compactTimelineOpen, setCompactTimelineOpen] = useState(false);
	const [fitOnReturn, setFitOnReturn] = useState(false);

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
		if (
			typeof window === "undefined" ||
			typeof window.matchMedia !== "function"
		) {
			return undefined;
		}
		const media = window.matchMedia(COMPACT_MEDIA_QUERY);
		const onChange = (): void => {
			if (!media.matches) {
				setDrawerOpen(false);
				setCompactTimelineOpen(false);
			}
		};
		media.addEventListener("change", onChange);
		return (): void => {
			media.removeEventListener("change", onChange);
		};
	}, []);

	useEffect(() => {
		return useEditorStore.subscribe((state, previousState) => {
			if (state.tool !== previousState.tool) {
				useUiSettingsStore.getState().recordToolUse(state.tool);
			}
		});
	}, []);

	const showDockedLayers = isCompact
		? panels.layers
		: panels.layers && !panels.frames;

	const availableDrawerTabs = useMemo<Array<StudioDrawerTab>>(() => {
		const tabs: Array<StudioDrawerTab> = [];
		if (panels.colorPicker || panels.palette) tabs.push("color");
		if (showDockedLayers) tabs.push("layers");
		if (panels.preview || panels.tilemap) tabs.push("preview");
		return tabs;
	}, [
		panels.colorPicker,
		panels.palette,
		panels.preview,
		panels.tilemap,
		showDockedLayers,
	]);

	const hasStudioPanels = availableDrawerTabs.length > 0;
	const hasRightSidebar = !isCompact && hasStudioPanels;
	const effectiveDrawerOpen = isCompact && drawerOpen && hasStudioPanels;
	const resolvedDrawerTab = availableDrawerTabs.includes(drawerTab)
		? drawerTab
		: (availableDrawerTabs[0] ?? "color");
	const previewLabel = !panels.preview && panels.tilemap ? "Tilemap" : "Preview";
	const showPortraitDockBar =
		isPortraitDock && (hasStudioPanels || panels.frames);

	const openDrawerToTab = (tab: StudioDrawerTab): void => {
		if (effectiveDrawerOpen && resolvedDrawerTab === tab) {
			setDrawerOpen(false);
		} else {
			setDrawerTab(tab);
			setDrawerOpen(true);
		}
	};

	const toggleStudioDrawer = (): void => {
		if (!hasStudioPanels) return;
		if (effectiveDrawerOpen) {
			setDrawerOpen(false);
		} else {
			setDrawerTab(resolvedDrawerTab);
			setDrawerOpen(true);
		}
	};

	const handleToggleStealth = (): void => {
		if (stealth.isActive) {
			stealth.closeStealth();
			return;
		}
		void stealth.openStealth().then((opened) => {
			if (opened) {
				setFitOnReturn(true);
			} else {
				useEditorStore
					.getState()
					.showNotice("Pop-up blocked · allow pop-ups to use Stealth Mode");
			}
		});
	};

	return (
		<div className="pixel-editor-root flex h-dvh w-full select-none flex-col overflow-hidden bg-(--pe-bg-desk) text-(--pe-text)">
			<TopBar
				hasStudioPanels={hasStudioPanels}
				isCompact={isCompact}
				isNarrow={isNarrow}
				isPortraitDock={isPortraitDock}
				stealthActive={stealth.isActive}
				studioDrawerOpen={effectiveDrawerOpen}
				onToggleStealth={handleToggleStealth}
				onToggleStudioDrawer={toggleStudioDrawer}
			/>
			{panels.toolOptions && <ToolOptions />}
			<div className="flex min-h-0 flex-1">
				{showToolbar && !isPortraitDock && <Toolbar />}
				<main className="canvas-backdrop relative min-w-0 flex-1">
					{stealth.isActive ? (
						<StealthActivePlaceholder
							mode={stealth.mode}
							onClose={stealth.closeStealth}
							onFocus={stealth.focusStealth}
						/>
					) : (
						<>
							<PixelCanvas fitOnMount={fitOnReturn} />
							{isCompact && <CanvasHud showStatusInfo={panels.statusBar} />}
						</>
					)}
				</main>
				{hasRightSidebar && (
					<aside className="pe-studio-panel-container editor-scrollbar w-69 shrink-0 space-y-2.5 overflow-y-auto border-l border-(--pe-border) bg-(--pe-bg-chrome) p-2.5">
						{panels.colorPicker && <ColorPickerPanel />}
						{panels.palette && <PalettePanel />}
						{showDockedLayers && <LayersPanel />}
						{panels.preview && <PreviewPanel />}
						{panels.tilemap && <TilemapPanel />}
					</aside>
				)}
			</div>
			{panels.frames && (
				<Timeline
					collapsed={isCompact ? !compactTimelineOpen : undefined}
					compact={isCompact}
					hideHeaderWhenCollapsed={isPortraitDock}
					narrow={isNarrow}
					onCollapsedChange={
						isCompact
							? (nextCollapsed): void => {
									setCompactTimelineOpen(!nextCollapsed);
								}
							: undefined
					}
				/>
			)}
			{isPortraitDock && showToolbar && (
				<Toolbar
					bottomSafeArea={!showPortraitDockBar}
					orientation="horizontal"
				/>
			)}
			{showPortraitDockBar && (
				<PortraitBottomBar
					activeTab={resolvedDrawerTab}
					availableTabs={availableDrawerTabs}
					drawerOpen={effectiveDrawerOpen}
					previewLabel={previewLabel}
					showFrames={panels.frames}
					timelineOpen={compactTimelineOpen}
					onOpenDrawerTab={openDrawerToTab}
					onToggleTimeline={() => {
						setCompactTimelineOpen((previous) => !previous);
					}}
				/>
			)}
			{!isCompact && panels.statusBar && <StatusBar />}
			{isCompact && hasStudioPanels && (
				<StudioPanelsDrawer
					activeTab={resolvedDrawerTab}
					availableTabs={availableDrawerTabs}
					open={effectiveDrawerOpen}
					panels={panels}
					onSelectTab={setDrawerTab}
					onClose={() => {
						setDrawerOpen(false);
					}}
				/>
			)}
			<Dialogs />
			{stealth.isActive &&
				stealth.container &&
				createPortal(
					<StealthWindowView onClose={stealth.closeStealth} />,
					stealth.container
				)}
		</div>
	);
};
