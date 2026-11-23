import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FunctionComponent } from "../../../common/types";
import {
	COMPACT_MEDIA_QUERY,
	NARROW_MEDIA_QUERY,
	PORTRAIT_DOCK_MEDIA_QUERY,
} from "../hooks/useViewportLayout";
import { computePinchView, snapPinchZoom } from "../lib/touchZoom";
import { PixelEditor } from "../PixelEditor";
import { useEditorStore } from "../store/editorStore";
import { useUiSettingsStore } from "../store/uiSettingsStore";

vi.mock("./PixelCanvas", () => ({
	PixelCanvas: (): FunctionComponent => (
		<div data-testid="pixel-canvas-mock" />
	),
}));

type MediaMatches = Record<string, boolean>;

function installMatchMediaMock(initialMatches: MediaMatches): {
	setMatches: (next: MediaMatches) => void;
} {
	let current: MediaMatches = { ...initialMatches };
	const listenersByQuery = new Map<string, Set<() => void>>();

	window.matchMedia = vi.fn().mockImplementation((query: string) => {
		let listeners = listenersByQuery.get(query);
		if (!listeners) {
			listeners = new Set();
			listenersByQuery.set(query, listeners);
		}
		return {
			get matches(): boolean {
				return Boolean(current[query]);
			},
			media: query,
			onchange: null,
			addEventListener: (_event: string, listener: () => void): void => {
				listeners?.add(listener);
			},
			removeEventListener: (_event: string, listener: () => void): void => {
				listeners?.delete(listener);
			},
			addListener: (listener: () => void): void => {
				listeners?.add(listener);
			},
			removeListener: (listener: () => void): void => {
				listeners?.delete(listener);
			},
			dispatchEvent: vi.fn(),
		};
	});

	return {
		setMatches: (next: MediaMatches): void => {
			current = { ...next };
			for (const listeners of listenersByQuery.values()) {
				for (const listener of listeners) {
					listener();
				}
			}
		},
	};
}

describe("Responsive & Portrait Layout", () => {
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
		useUiSettingsStore.getState().resetAllUiSettings();
		useEditorStore.getState().newCanvas(32, 32);
		useEditorStore.getState().openDialog(null);
	});

	it("preserves full desktop studio layout when viewport is wide landscape", () => {
		installMatchMediaMock({
			[COMPACT_MEDIA_QUERY]: false,
			[PORTRAIT_DOCK_MEDIA_QUERY]: false,
			[NARROW_MEDIA_QUERY]: false,
		});

		render(<PixelEditor />);

		expect(screen.getByRole("button", { name: "File" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Canvas" })).toBeTruthy();
		expect(
			screen.getByRole("toolbar", { name: "Drawing tools" }).getAttribute(
				"aria-orientation"
			)
		).toBe("vertical");
		expect(
			screen.getByRole("separator", { name: "Resize toolbar" })
		).toBeTruthy();
		expect(
			screen.queryByRole("navigation", { name: "Studio panels and timeline" })
		).toBeNull();
		expect(screen.getByLabelText("Hex color")).toBeTruthy();
		expect(screen.getByRole("button", { name: /^Color$/i })).toBeTruthy();
		expect(screen.getByRole("button", { name: /Presets/i })).toBeTruthy();
		expect(screen.getByRole("button", { name: /^Preview$/i })).toBeTruthy();
		expect(screen.getByText(/Autosaved locally/i)).toBeTruthy();
	}, 15_000);

	it("renders portrait phone layout with Menu popover, horizontal bottom toolbar, HUD, dock bar, and swipeable drawer", () => {
		installMatchMediaMock({
			[COMPACT_MEDIA_QUERY]: true,
			[PORTRAIT_DOCK_MEDIA_QUERY]: true,
			[NARROW_MEDIA_QUERY]: true,
		});

		render(<PixelEditor />);

		// Narrow TopBar collapses File/Canvas into unified Menu
		expect(screen.getByRole("button", { name: "Menu" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "File" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Canvas" })).toBeNull();

		// Horizontal bottom toolbar without resize handle
		expect(
			screen.getByRole("toolbar", { name: "Drawing tools" }).getAttribute(
				"aria-orientation"
			)
		).toBe("horizontal");
		expect(
			screen.queryByRole("separator", { name: "Resize toolbar" })
		).toBeNull();

		// Floating Canvas HUD renders canvas dimensions and fit-to-screen zoom control
		expect(screen.getByRole("button", { name: "32×32" })).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Fit to screen (0)" })
		).toBeTruthy();

		// Portrait bottom dock has Color, Layers, Preview, and Frames pills
		const dock = screen.getByRole("navigation", {
			name: "Studio panels and timeline",
		});
		expect(within(dock).getByRole("button", { name: /Color/i })).toBeTruthy();
		expect(within(dock).getByRole("button", { name: /Layers/i })).toBeTruthy();
		expect(within(dock).getByRole("button", { name: /Preview/i })).toBeTruthy();
		const framesButton = within(dock).getByRole("button", { name: /Frames/i });
		expect(framesButton.getAttribute("aria-expanded")).toBe("false");

		// Open Color tab in StudioPanelsDrawer
		fireEvent.click(within(dock).getByRole("button", { name: /Color/i }));
		const drawer = screen.getByRole("dialog", { name: "Studio panels" });
		expect(drawer.hasAttribute("open")).toBe(true);
		expect(within(drawer).getByLabelText("Hex color")).toBeTruthy();
		expect(
			within(drawer).getByRole("button", { name: /Presets/i })
		).toBeTruthy();

		// Switch to Layers tab inside drawer
		fireEvent.click(within(drawer).getByRole("tab", { name: "Layers" }));
		expect(
			within(drawer).getByRole("button", { name: "New pixel layer (Shift+N)" })
		).toBeTruthy();

		// Switch to Preview tab inside drawer
		fireEvent.click(within(drawer).getByRole("tab", { name: "Preview" }));
		expect(within(drawer).getByText(/32×32px/i)).toBeTruthy();

		// Close drawer
		fireEvent.click(
			within(drawer).getByRole("button", { name: "Close studio panels" })
		);
		expect(drawer.hasAttribute("open")).toBe(false);

		// Toggle Timeline open and closed from PortraitBottomBar
		expect(screen.queryByRole("button", { name: "Hide timeline" })).toBeNull();
		fireEvent.click(framesButton);
		expect(framesButton.getAttribute("aria-expanded")).toBe("true");
		expect(
			screen.getByRole("button", { name: "Hide timeline" })
		).toBeTruthy();

		fireEvent.click(framesButton);
		expect(framesButton.getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByRole("button", { name: "Hide timeline" })).toBeNull();
	}, 15_000);

	it("renders portrait tablet layout with full TopBar menus and horizontal bottom dock", () => {
		installMatchMediaMock({
			[COMPACT_MEDIA_QUERY]: true,
			[PORTRAIT_DOCK_MEDIA_QUERY]: true,
			[NARROW_MEDIA_QUERY]: false,
		});

		render(<PixelEditor />);

		expect(screen.getByRole("button", { name: "File" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Canvas" })).toBeTruthy();
		expect(
			screen.getByRole("toolbar", { name: "Drawing tools" }).getAttribute(
				"aria-orientation"
			)
		).toBe("horizontal");
		expect(
			screen.getByRole("navigation", { name: "Studio panels and timeline" })
		).toBeTruthy();
	});

	it("renders landscape phone layout with vertical left toolbar, TopBar drawer toggle, and collapsed timeline bar", () => {
		installMatchMediaMock({
			[COMPACT_MEDIA_QUERY]: true,
			[PORTRAIT_DOCK_MEDIA_QUERY]: false,
			[NARROW_MEDIA_QUERY]: false,
		});

		render(<PixelEditor />);

		expect(
			screen.getByRole("toolbar", { name: "Drawing tools" }).getAttribute(
				"aria-orientation"
			)
		).toBe("vertical");
		expect(
			screen.queryByRole("navigation", { name: "Studio panels and timeline" })
		).toBeNull();
		expect(screen.getByRole("button", { name: "Show timeline" })).toBeTruthy();

		const panelsButton = screen.getByRole("button", { name: "Studio panels" });
		expect(panelsButton.getAttribute("aria-expanded")).toBe("false");
		fireEvent.click(panelsButton);
		expect(panelsButton.getAttribute("aria-expanded")).toBe("true");
		expect(
			screen.getByRole("dialog", { name: "Studio panels" }).hasAttribute("open")
		).toBe(true);
	});

	it("closes the drawer cleanly when transitioning from portrait back to desktop", () => {
		const controller = installMatchMediaMock({
			[COMPACT_MEDIA_QUERY]: true,
			[PORTRAIT_DOCK_MEDIA_QUERY]: true,
			[NARROW_MEDIA_QUERY]: true,
		});

		render(<PixelEditor />);

		const dock = screen.getByRole("navigation", {
			name: "Studio panels and timeline",
		});
		fireEvent.click(within(dock).getByRole("button", { name: /Color/i }));
		expect(
			screen.getByRole("dialog", { name: "Studio panels" }).hasAttribute("open")
		).toBe(true);

		act(() => {
			controller.setMatches({
				[COMPACT_MEDIA_QUERY]: false,
				[PORTRAIT_DOCK_MEDIA_QUERY]: false,
				[NARROW_MEDIA_QUERY]: false,
			});
		});

		expect(
			screen.queryByRole("dialog", { name: "Studio panels" })
		).toBeNull();
		expect(
			screen.getByRole("toolbar", { name: "Drawing tools" }).getAttribute(
				"aria-orientation"
			)
		).toBe("vertical");
		expect(screen.getByLabelText("Hex color")).toBeTruthy();
	});

	it("re-fits canvas when viewport changes orientation and preserves zoom on minor resizes", () => {
		const store = useEditorStore.getState();
		store.newCanvas(32, 32);

		// First viewport mount (landscape desktop)
		store.setViewport(1000, 700);
		const initialState = useEditorStore.getState();
		const initialZoom = initialState.zoom;
		const initialPanX = initialState.panX;
		expect(initialZoom).toBeGreaterThan(1);

		// Minor resize in same orientation preserves zoom and shifts pan by half-delta
		store.setViewport(900, 700);
		const afterMinorResize = useEditorStore.getState();
		expect(afterMinorResize.zoom).toBe(initialZoom);
		expect(afterMinorResize.panX).toBe(initialPanX - 50);

		// Orientation change to narrow portrait phone triggers re-fit
		store.setViewport(360, 560);
		const afterPortrait = useEditorStore.getState();
		expect(afterPortrait.zoom).toBeLessThan(initialZoom);
		expect(32 * afterPortrait.zoom).toBeLessThanOrEqual(360);
	});

	it("snaps pinch zoom to crisp ZOOM_LEVELS and anchors focal midpoint", () => {
		expect(snapPinchZoom(4)).toBe(4);
		expect(snapPinchZoom(7.4)).toBe(8);
		expect(snapPinchZoom(0.3)).toBe(0.5);

		const pinch = {
			startDistance: 100,
			startZoom: 4,
			anchorDocumentX: 16,
			anchorDocumentY: 16,
		};
		const zoomed = computePinchView(pinch, 200, 180, 220);
		expect(zoomed.zoom).toBe(8);
		expect(zoomed.panX).toBe(180 - 16 * 8);
		expect(zoomed.panY).toBe(220 - 16 * 8);
	});
});
