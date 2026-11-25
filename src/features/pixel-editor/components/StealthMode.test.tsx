import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FunctionComponent } from "../../../common/types";
import type { DocumentPictureInPictureApi } from "../lib/stealthWindow";
import { PixelEditor } from "../PixelEditor";
import { useEditorStore } from "../store/editorStore";
import { useUiSettingsStore } from "../store/uiSettingsStore";

vi.mock("./PixelCanvas", () => ({
	PixelCanvas: ({
		fitOnMount = false,
	}: {
		fitOnMount?: boolean;
	} = {}): FunctionComponent => (
		<div
			data-fit-on-mount={fitOnMount ? "true" : "false"}
			data-testid="pixel-canvas-mock"
		/>
	),
}));

type MockPopupWindowHandle = {
	popupWindow: Window;
	popupDocument: Document;
	dispatchPopupEvent: (type: string, eventInit?: KeyboardEventInit) => void;
};

function createMockPopupWindow(title = ""): MockPopupWindowHandle {
	const popupDocument = document.implementation.createHTMLDocument(title);
	const listenersByType = new Map<string, Set<EventListener>>();
	let isClosed = false;

	const focusMock = vi.fn();
	const closeMock = vi.fn(() => {
		if (isClosed) return;
		isClosed = true;
		const event = new Event("pagehide");
		const listeners = listenersByType.get("pagehide");
		if (listeners) {
			for (const listener of Array.from(listeners)) {
				listener(event);
			}
		}
	});

	const popupWindow = {
		document: popupDocument,
		get closed(): boolean {
			return isClosed;
		},
		Event: window.Event,
		MouseEvent: window.MouseEvent,
		KeyboardEvent: window.KeyboardEvent,
		PointerEvent: window.PointerEvent,
		CustomEvent: window.CustomEvent,
		getComputedStyle: window.getComputedStyle.bind(window),
		focus: focusMock,
		close: closeMock,
		addEventListener: (type: string, listener: EventListenerOrEventListenerObject): void => {
			if (typeof listener !== "function") return;
			let listeners = listenersByType.get(type);
			if (!listeners) {
				listeners = new Set();
				listenersByType.set(type, listeners);
			}
			listeners.add(listener);
		},
		removeEventListener: (
			type: string,
			listener: EventListenerOrEventListenerObject
		): void => {
			if (typeof listener !== "function") return;
			listenersByType.get(type)?.delete(listener);
		},
		dispatchEvent: (event: Event): boolean => {
			const listeners = listenersByType.get(event.type);
			if (listeners) {
				for (const listener of Array.from(listeners)) {
					listener(event);
				}
			}
			return true;
		},
	} as unknown as Window;

	Object.defineProperty(popupDocument, "defaultView", {
		value: popupWindow,
		configurable: true,
	});

	const dispatchPopupEvent = (
		type: string,
		eventInit?: KeyboardEventInit
	): void => {
		const event = eventInit
			? new KeyboardEvent(type, eventInit)
			: new Event(type);
		const listeners = listenersByType.get(type);
		if (listeners) {
			for (const listener of Array.from(listeners)) {
				listener(event);
			}
		}
	};

	return { popupWindow, popupDocument, dispatchPopupEvent };
}

type WindowWithPip = Window & {
	documentPictureInPicture?: DocumentPictureInPictureApi;
};

describe("Stealth Mode", () => {
	const originalOpen = window.open;
	const originalFocus = window.focus;
	const originalPip = (window as WindowWithPip).documentPictureInPicture;

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
		if (!HTMLElement.prototype.togglePopover) {
			HTMLElement.prototype.togglePopover = function togglePopover(): boolean {
				return true;
			};
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
		if (typeof ResizeObserver === "undefined") {
			globalThis.ResizeObserver = class ResizeObserver {
				public observe(): void {}
				public unobserve(): void {}
				public disconnect(): void {}
			};
		}
	});

	beforeEach(() => {
		window.localStorage.clear();
		document.head.innerHTML =
			'<meta name="color-scheme" content="light dark" /><style>.pe-stealth-root { color: red; }</style>';
		document.documentElement.removeAttribute("data-theme");
		useUiSettingsStore.getState().resetAllUiSettings();
		useEditorStore.getState().newCanvas(32, 32);
		useEditorStore.getState().openDialog(null);
		useEditorStore.getState().setTool("pencil");
		window.focus = vi.fn();
	});

	afterEach(() => {
		window.open = originalOpen;
		window.focus = originalFocus;
		if (originalPip === undefined) {
			delete (window as WindowWithPip).documentPictureInPicture;
		} else {
			(window as WindowWithPip).documentPictureInPicture = originalPip;
		}
	});

	it("opens Document Picture-in-Picture mini window, copies styles, syncs theme, and mounts StealthWindowView", async () => {
		const mockPopup = createMockPopupWindow();
		const requestWindow = vi.fn().mockResolvedValue(mockPopup.popupWindow);
		(window as WindowWithPip).documentPictureInPicture = {
			requestWindow,
			window: null,
		};

		useUiSettingsStore.getState().setTheme("espresso");
		render(<PixelEditor />);

		const stealthButton = screen.getByRole("button", { name: "Stealth mode" });
		await act(async () => {
			fireEvent.click(stealthButton);
			await Promise.resolve();
		});

		expect(requestWindow).toHaveBeenCalledWith({ width: 320, height: 300 });
		expect(screen.getByText("Stealth Mode Active")).toBeTruthy();
		expect(
			screen.getByText("Always-on-top Picture-in-Picture window")
		).toBeTruthy();

		// Main document no longer renders PixelCanvas while stealth mode is active
		expect(screen.queryByTestId("pixel-canvas-mock")).toBeNull();

		// Popup document receives theme, styles, and portaled mini-editor UI
		expect(mockPopup.popupDocument.documentElement.dataset["theme"]).toBe(
			"espresso"
		);
		expect(
			mockPopup.popupDocument.head.querySelector("style")?.textContent
		).toContain(".pe-stealth-root");

		const popupRoot = mockPopup.popupDocument.getElementById(
			"pixeluwak-stealth-root"
		);
		expect(popupRoot).toBeTruthy();
		if (!popupRoot) return;

		const canvasMock = within(popupRoot).getByTestId("pixel-canvas-mock");
		expect(canvasMock.getAttribute("data-fit-on-mount")).toBe("true");
		expect(
			within(popupRoot).getByRole("complementary", { name: "Quick palette" })
		).toBeTruthy();
		expect(
			within(popupRoot).getByRole("toolbar", { name: "Stealth drawing tools" })
		).toBeTruthy();
	});

	it("supports quick palette clicks, tool switching, undo/redo, and cross-window shortcuts inside the stealth window", async () => {
		const mockPopup = createMockPopupWindow();
		(window as WindowWithPip).documentPictureInPicture = {
			requestWindow: vi.fn().mockResolvedValue(mockPopup.popupWindow),
			window: null,
		};

		render(<PixelEditor />);

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Stealth mode" }));
			await Promise.resolve();
		});

		const popupRoot = mockPopup.popupDocument.getElementById(
			"pixeluwak-stealth-root"
		);
		expect(popupRoot).toBeTruthy();
		if (!popupRoot) return;

		// Left-click and right-click on Quick Palette swatches
		const paletteRegion = within(popupRoot).getByRole("complementary", {
			name: "Quick palette",
		});
		const swatches = within(paletteRegion).getAllByRole("button", {
			name: /^Quick palette color /i,
		});
		expect(swatches.length).toBeGreaterThan(2);

		const targetPrimary = swatches[8];
		const targetSecondary = swatches[11];
		expect(targetPrimary).toBeTruthy();
		expect(targetSecondary).toBeTruthy();

		if (targetPrimary) {
			fireEvent.click(targetPrimary);
			expect(useEditorStore.getState().primaryColor).toBe("#ff004d");
		}
		if (targetSecondary) {
			fireEvent.contextMenu(targetSecondary);
			expect(useEditorStore.getState().secondaryColor).toBe("#00e436");
		}

		// Tool button click inside stealth window
		fireEvent.click(
			within(popupRoot).getByRole("button", { name: "Fill bucket (G)" })
		);
		expect(useEditorStore.getState().tool).toBe("fill");

		// Cross-window keyboard shortcut ("e" -> eraser, "x" -> swap colors)
		act(() => {
			mockPopup.dispatchPopupEvent("keydown", { key: "e" });
		});
		expect(useEditorStore.getState().tool).toBe("eraser");

		act(() => {
			mockPopup.dispatchPopupEvent("keydown", { key: "x" });
		});
		expect(useEditorStore.getState().primaryColor).toBe("#00e436");
		expect(useEditorStore.getState().secondaryColor).toBe("#ff004d");

		// Commit a pixel edit, then undo/redo via stealth header buttons
		const undoBefore = useEditorStore.getState().undoStack.length;
		const redoBefore = useEditorStore.getState().redoStack.length;
		act(() => {
			const nextPixels = useEditorStore.getState().pixels.slice();
			nextPixels[0] = 0xff_ff_00_ff;
			useEditorStore.getState().commitPixels(nextPixels);
		});
		expect(useEditorStore.getState().undoStack.length).toBe(undoBefore + 1);
		expect(useEditorStore.getState().pixels[0]).toBe(0xff_ff_00_ff);

		fireEvent.click(
			within(popupRoot).getByRole("button", { name: "Undo (Ctrl+Z)" })
		);
		expect(useEditorStore.getState().undoStack.length).toBe(undoBefore);
		expect(useEditorStore.getState().redoStack.length).toBe(redoBefore + 1);
		expect(useEditorStore.getState().pixels[0]).toBe(0);

		fireEvent.click(
			within(popupRoot).getByRole("button", { name: "Redo (Ctrl+Y)" })
		);
		expect(useEditorStore.getState().undoStack.length).toBe(undoBefore + 1);
		expect(useEditorStore.getState().pixels[0]).toBe(0xff_ff_00_ff);
	});

	it("syncs theme changes live to the active stealth window", async () => {
		const mockPopup = createMockPopupWindow();
		(window as WindowWithPip).documentPictureInPicture = {
			requestWindow: vi.fn().mockResolvedValue(mockPopup.popupWindow),
			window: null,
		};

		render(<PixelEditor />);

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Stealth mode" }));
			await Promise.resolve();
		});

		act(() => {
			useUiSettingsStore.getState().setTheme("gameboy");
		});
		expect(mockPopup.popupDocument.documentElement.dataset["theme"]).toBe(
			"gameboy"
		);
	});

	it("falls back to a resizable window.open popup when Document Picture-in-Picture is unavailable and notifies if blocked", async () => {
		delete (window as WindowWithPip).documentPictureInPicture;
		const mockPopup = createMockPopupWindow();
		const openSpy = vi.fn().mockReturnValue(mockPopup.popupWindow);
		window.open = openSpy;

		render(<PixelEditor />);

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Stealth mode" }));
			await Promise.resolve();
		});

		expect(openSpy).toHaveBeenCalledWith(
			"",
			"pixeluwak-stealth-window",
			expect.stringContaining("resizable=yes")
		);
		expect(
			screen.getByText("Floating resizable pop-up window")
		).toBeTruthy();

		// Exit via Return to studio, then verify blocked popup shows notice
		fireEvent.click(screen.getByRole("button", { name: "Return to studio" }));
		expect(screen.queryByText("Stealth Mode Active")).toBeNull();

		openSpy.mockReturnValue(null);
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Stealth mode" }));
			await Promise.resolve();
		});
		expect(useEditorStore.getState().notice?.message).toMatch(/Pop-up blocked/i);
	});

	it("restores main studio PixelCanvas when returning from stealth mode or when popup closes", async () => {
		const mockPopup = createMockPopupWindow();
		(window as WindowWithPip).documentPictureInPicture = {
			requestWindow: vi.fn().mockResolvedValue(mockPopup.popupWindow),
			window: null,
		};

		render(<PixelEditor />);

		// Open stealth mode
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Stealth mode" }));
			await Promise.resolve();
		});
		expect(screen.getByText("Stealth Mode Active")).toBeTruthy();

		// Simulate user closing the floating popup window directly (pagehide)
		act(() => {
			mockPopup.dispatchPopupEvent("pagehide");
		});
		expect(screen.queryByText("Stealth Mode Active")).toBeNull();
		const restoredCanvas = screen.getByTestId("pixel-canvas-mock");
		expect(restoredCanvas).toBeTruthy();
		expect(restoredCanvas.getAttribute("data-fit-on-mount")).toBe("true");
	});
});
