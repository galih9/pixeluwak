import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hexToPacked } from "../lib/color";
import { useEditorStore } from "../store/editorStore";
import { ResizeCanvasDialog } from "./ResizeCanvasDialog";
import { StatusBar } from "./StatusBar";
import { TopBar } from "./TopBar";

describe("ResizeCanvasDialog & Resize entry points", () => {
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
	});

	beforeEach(() => {
		useEditorStore.getState().newCanvas(32, 32);
		useEditorStore.getState().openDialog(null);
	});

	it("opens resize dialog from TopBar Canvas menu and StatusBar canvas size button", () => {
		const { container } = render(
			<>
				<TopBar />
				<StatusBar />
			</>
		);

		const canvasTrigger = screen.getByRole("button", { name: "Canvas" });
		const popoverId = canvasTrigger.getAttribute("popovertarget");
		expect(popoverId).toBeTruthy();
		const canvasPopover = container.querySelector(
			`#${CSS.escape(popoverId ?? "")}`
		);
		const resizeMenuItem = Array.from(
			canvasPopover?.querySelectorAll("button") ?? []
		).find((button) => /Resize Canvas/i.test(button.textContent ?? ""));
		expect(resizeMenuItem).toBeTruthy();
		if (resizeMenuItem) fireEvent.click(resizeMenuItem);
		expect(useEditorStore.getState().dialog).toBe("resize");

		useEditorStore.getState().openDialog(null);
		fireEvent.click(screen.getByRole("button", { name: /Canvas 32×32/i }));
		expect(useEditorStore.getState().dialog).toBe("resize");
	});

	it("resizes a 512x512 canvas to 128x128 via preset and preserves resampled pixels", () => {
		useEditorStore.getState().newCanvas(512, 512);
		const red = hexToPacked("#ff004d");
		const painted = useEditorStore.getState().pixels.slice();
		for (let y = 0; y < 8; y++) {
			for (let x = 0; x < 8; x++) {
				painted[y * 512 + x] = red;
			}
		}
		useEditorStore.getState().commitPixels(painted);

		render(<ResizeCanvasDialog onClose={() => {}} />);

		fireEvent.click(screen.getByRole("button", { name: "128×128" }));
		fireEvent.click(
			screen.getByRole("button", { name: /Resize to 128×128/i })
		);

		const state = useEditorStore.getState();
		expect(state.width).toBe(128);
		expect(state.height).toBe(128);
		expect(state.pixels[0]).toBe(red);
		expect(state.pixels[1 * 128 + 1]).toBe(red);
		expect(state.pixels[2 * 128 + 2]).toBe(0);
	});

	it("resizes a 512x512 canvas to 128x128 using the 1/4x quick scale factor", () => {
		useEditorStore.getState().newCanvas(512, 512);
		render(<ResizeCanvasDialog onClose={() => {}} />);

		fireEvent.click(screen.getByRole("button", { name: "¼×" }));
		fireEvent.click(
			screen.getByRole("button", { name: /Resize to 128×128/i })
		);

		expect(useEditorStore.getState().width).toBe(128);
		expect(useEditorStore.getState().height).toBe(128);
	});

	it("supports custom non-square dimensions when aspect lock is disabled", () => {
		useEditorStore.getState().newCanvas(256, 256);
		render(<ResizeCanvasDialog onClose={() => {}} />);

		const lockButton = screen.getByRole("button", {
			name: "Lock aspect ratio",
		});
		expect(lockButton.getAttribute("aria-pressed")).toBe("true");
		fireEvent.click(lockButton);
		expect(lockButton.getAttribute("aria-pressed")).toBe("false");

		const widthField = screen.getByLabelText("W");
		const heightField = screen.getByLabelText("H");
		fireEvent.change(widthField, { target: { value: "128" } });
		fireEvent.change(heightField, { target: { value: "64" } });
		fireEvent.click(screen.getByRole("button", { name: /Resize to 128×64/i }));

		expect(useEditorStore.getState().width).toBe(128);
		expect(useEditorStore.getState().height).toBe(64);
	});

	it("crops and pads with 9-point anchor selection in Crop / Pad bounds mode", () => {
		useEditorStore.getState().newCanvas(2, 2);
		const blue = hexToPacked("#29adff");
		const painted = useEditorStore.getState().pixels.slice();
		painted[0] = blue;
		useEditorStore.getState().commitPixels(painted);

		render(<ResizeCanvasDialog onClose={() => {}} />);

		fireEvent.click(
			screen.getByRole("button", { name: /Crop \/ Pad bounds/i })
		);
		fireEvent.click(
			screen.getByRole("button", { name: "Anchor bottom-right" })
		);

		fireEvent.click(screen.getByRole("button", { name: "Lock aspect ratio" }));
		fireEvent.change(screen.getByLabelText("W"), { target: { value: "4" } });
		fireEvent.change(screen.getByLabelText("H"), { target: { value: "4" } });
		fireEvent.click(screen.getByRole("button", { name: /Resize to 4×4/i }));

		const state = useEditorStore.getState();
		expect(state.width).toBe(4);
		expect(state.height).toBe(4);
		expect(state.pixels[2 * 4 + 2]).toBe(blue);
		expect(state.pixels[0]).toBe(0);
	});
});
