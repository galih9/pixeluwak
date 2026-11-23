import { fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../store/editorStore";
import { useUiSettingsStore } from "../store/uiSettingsStore";
import { PreviewPanel } from "./PreviewPanel";
import { SettingsDialog } from "./SettingsDialog";
import { TopBar } from "./TopBar";

describe("SettingsDialog & TopBar Settings entry", () => {
	beforeAll(() => {
		if (!HTMLDialogElement.prototype.showModal) {
			HTMLDialogElement.prototype.showModal = function showModal(): void {
				this.setAttribute("open", "");
			};
		}
		if (!HTMLDialogElement.prototype.close) {
			HTMLDialogElement.prototype.close = function close(): void {
				this.removeAttribute("open");
				queueMicrotask(() => {
					this.dispatchEvent(new Event("close"));
				});
			};
		}
		if (!HTMLElement.prototype.hidePopover) {
			HTMLElement.prototype.hidePopover = function hidePopover(): void {};
		}
		if (!window.matchMedia) {
			window.matchMedia = vi.fn().mockImplementation((query: string) => ({
				matches: false,
				media: query,
				onchange: null,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				addListener: vi.fn(),
				removeListener: vi.fn(),
				dispatchEvent: vi.fn(),
			}));
		}
	});

	beforeEach(() => {
		window.localStorage.clear();
		document.head.innerHTML = '<meta name="color-scheme" content="light dark" />';
		document.documentElement.removeAttribute("data-theme");
		useUiSettingsStore.getState().resetAllUiSettings();
		useEditorStore.getState().setTool("pencil");
		useEditorStore.getState().openDialog(null);
	});

	it("opens Settings modal when clicking the TopBar Settings button", () => {
		render(<TopBar />);
		const button = screen.getByRole("button", { name: "Studio Settings" });
		fireEvent.click(button);
		expect(useEditorStore.getState().dialog).toBe("settings");
	});

	it("renders Pixeluwak branding and 3-color 32x32 luwak emblem in TopBar", () => {
		const { container } = render(<TopBar />);
		expect(screen.getByText("Pixeluwak")).toBeTruthy();
		expect(screen.queryByText(/Pixelatte/i)).toBeNull();
		const svg = container.querySelector('svg[viewBox="0 0 32 32"]');
		expect(svg).toBeTruthy();
		const fills = Array.from(svg?.querySelectorAll("rect") ?? [])
			.map((element) => element.getAttribute("fill")?.toLowerCase())
			.filter((fill): fill is string => Boolean(fill));
		const uniqueFills = Array.from(new Set(fills)).sort();
		expect(uniqueFills).toEqual(["#1f1512", "#c87d42", "#f6ead4"]);
	});

	it("renders tabs, supports keyboard tab navigation, and switches themes", () => {
		const onClose = vi.fn();
		render(<SettingsDialog onClose={onClose} />);

		const appearanceTab = screen.getByRole("tab", { name: "Appearance" });
		const panelsTab = screen.getByRole("tab", { name: "Panels" });
		const toolbarTab = screen.getByRole("tab", { name: "Toolbar" });
		const editorTab = screen.getByRole("tab", { name: "Editor" });

		expect(appearanceTab.getAttribute("aria-selected")).toBe("true");
		expect(panelsTab.getAttribute("aria-selected")).toBe("false");

		// Select Kopi Luwak theme
		fireEvent.click(screen.getByRole("button", { name: /Kopi Luwak/i }));
		expect(useUiSettingsStore.getState().theme).toBe("espresso");
		expect(document.documentElement.dataset["theme"]).toBe("espresso");

		// Switch tabs via keyboard ArrowRight & End/Home
		fireEvent.keyDown(appearanceTab, { key: "ArrowRight" });
		expect(panelsTab.getAttribute("aria-selected")).toBe("true");

		fireEvent.keyDown(panelsTab, { key: "End" });
		expect(editorTab.getAttribute("aria-selected")).toBe("true");

		fireEvent.keyDown(editorTab, { key: "Home" });
		expect(appearanceTab.getAttribute("aria-selected")).toBe("true");

		fireEvent.click(toolbarTab);
		expect(toolbarTab.getAttribute("aria-selected")).toBe("true");
	}, 10_000);

	it("displays Console Themes (NES Classic, Game Boy, Wii Home) and switches between them", () => {
		render(<SettingsDialog onClose={vi.fn()} />);
		expect(screen.getByText("Console Themes")).toBeTruthy();

		const nesButton = screen.getByText("NES Classic").closest("button");
		expect(nesButton).toBeTruthy();
		if (nesButton) fireEvent.click(nesButton);
		expect(useUiSettingsStore.getState().theme).toBe("nes");
		expect(document.documentElement.dataset["theme"]).toBe("nes");

		const gameboyButton = screen.getByText("Game Boy").closest("button");
		expect(gameboyButton).toBeTruthy();
		if (gameboyButton) fireEvent.click(gameboyButton);
		expect(useUiSettingsStore.getState().theme).toBe("gameboy");
		expect(document.documentElement.dataset["theme"]).toBe("gameboy");

		const wiiButton = screen.getByText("Wii Home").closest("button");
		expect(wiiButton).toBeTruthy();
		if (wiiButton) fireEvent.click(wiiButton);
		expect(useUiSettingsStore.getState().theme).toBe("wii");
		expect(document.documentElement.dataset["theme"]).toBe("wii");
	});

	it("toggles panels and applies workspace presets from the Panels tab", () => {
		render(<SettingsDialog onClose={vi.fn()} />);
		fireEvent.click(screen.getByRole("tab", { name: "Panels" }));

		const framesSwitch = screen.getByRole<HTMLInputElement>("switch", {
			name: /Frames & Timeline/i,
		});
		expect(framesSwitch.checked).toBe(true);
		fireEvent.click(framesSwitch);
		expect(useUiSettingsStore.getState().panels.frames).toBe(false);

		const tilemapSwitch = screen.getByRole<HTMLInputElement>("switch", {
			name: /Tilemap/i,
		});
		expect(tilemapSwitch.checked).toBe(false);
		fireEvent.click(tilemapSwitch);
		expect(useUiSettingsStore.getState().panels.tilemap).toBe(true);

		fireEvent.click(screen.getByRole("button", { name: /Zen Focus/i }));
		expect(useUiSettingsStore.getState().panels.colorPicker).toBe(false);
		expect(useUiSettingsStore.getState().panels.palette).toBe(false);
		expect(useUiSettingsStore.getState().panels.preview).toBe(false);
		expect(useUiSettingsStore.getState().panels.layers).toBe(false);
	});

	it("toggles tools, switches active tool when disabled, and sorts manually or automatically", () => {
		render(<SettingsDialog onClose={vi.fn()} />);
		fireEvent.click(screen.getByRole("tab", { name: "Toolbar" }));

		// Switch to alphabetical sorting
		fireEvent.click(screen.getByRole("button", { name: "A → Z" }));
		expect(useUiSettingsStore.getState().toolSortMode).toBe("alphabetical");

		// Disabling active tool ("pencil") switches active tool to another enabled tool
		expect(useEditorStore.getState().tool).toBe("pencil");
		const pencilSwitch = screen.getByRole("switch", {
			name: "Show Pencil in toolbar",
		});
		fireEvent.click(pencilSwitch);
		expect(useUiSettingsStore.getState().enabledTools.pencil).toBe(false);
		expect(useEditorStore.getState().tool).not.toBe("pencil");

		// Reorder tool manually using move down button
		fireEvent.click(screen.getByRole("button", { name: "Move Blur brush down" }));
		expect(useUiSettingsStore.getState().toolSortMode).toBe("manual");
		expect(useUiSettingsStore.getState().toolOrder[1]).toBe("blur");

		// Master toolbar switch
		const showToolbarSwitch = screen.getByRole("switch", {
			name: /Show Toolbar/i,
		});
		fireEvent.click(showToolbarSwitch);
		expect(useUiSettingsStore.getState().showToolbar).toBe(false);
	});

	it("stays open under React StrictMode even when dialog.close() queues an async close event", async () => {
		const onClose = vi.fn();
		render(
			<StrictMode>
				<SettingsDialog onClose={onClose} />
			</StrictMode>
		);
		await new Promise((resolve) => {
			setTimeout(resolve, 10);
		});
		expect(onClose).not.toHaveBeenCalled();
		expect(screen.getByRole("heading", { name: "Studio Settings" })).toBeTruthy();
	});

	it("constrains PreviewPanel dimensions to fit sidebar for 512x512 canvases", () => {
		useEditorStore.getState().newCanvas(512, 512);
		const { container } = render(<PreviewPanel />);
		const canvases = container.querySelectorAll("canvas");
		expect(canvases).toHaveLength(1);
		const previewCanvas = canvases[0];
		expect(previewCanvas?.style.width).toBe("176px");
		expect(previewCanvas?.style.height).toBe("176px");
		expect(screen.getByText(/512×512px/i)).toBeTruthy();
		useEditorStore.getState().newCanvas(32, 32);
	});
});
