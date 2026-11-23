import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../store/editorStore";
import { useUiSettingsStore } from "../store/uiSettingsStore";
import { Toolbar } from "./Toolbar";
import { TopBar } from "./TopBar";

describe("Toolbar & symmetry/guide controls", () => {
	beforeAll(() => {
		if (!HTMLElement.prototype.hidePopover) {
			HTMLElement.prototype.hidePopover = function hidePopover(): void {};
		}
		if (!HTMLElement.prototype.togglePopover) {
			HTMLElement.prototype.togglePopover = function togglePopover(): boolean {
				return true;
			};
		}
	});

	beforeEach(() => {
		window.localStorage.clear();
		useUiSettingsStore.getState().resetAllUiSettings();
		const editor = useEditorStore.getState();
		editor.setTool("pencil");
		if (editor.symmetryX) editor.toggleSymmetryX();
		if (editor.symmetryY) editor.toggleSymmetryY();
		editor.resetRulerGrid();
		if (editor.rulerGrid.enabled) editor.toggleRulerGrid();
		editor.resetPerspectiveGuide();
		if (editor.perspectiveGuide.enabled) editor.togglePerspectiveGuide();
		if (editor.tiledPreview.enabled) editor.toggleTiledPreview();
	});

	it("removes Symmetry dropdown from TopBar and toggles Mirror H/V independently in Toolbar", () => {
		render(
			<>
				<TopBar />
				<Toolbar />
			</>
		);

		expect(screen.queryByText("Symmetry")).toBeNull();
		expect(screen.queryByText(/Diagonal/i)).toBeNull();

		const mirrorH = screen.getByRole("button", { name: "Mirror Horizontal" });
		const mirrorV = screen.getByRole("button", { name: "Mirror Vertical" });

		expect(mirrorH.getAttribute("aria-pressed")).toBe("false");
		expect(mirrorV.getAttribute("aria-pressed")).toBe("false");

		fireEvent.click(mirrorH);
		expect(useEditorStore.getState().symmetryX).toBe(true);
		expect(useEditorStore.getState().symmetryY).toBe(false);

		fireEvent.click(mirrorV);
		expect(useEditorStore.getState().symmetryX).toBe(true);
		expect(useEditorStore.getState().symmetryY).toBe(true);
	});

	it("supports parent-child flyouts for Brush (Custom brush) and Bucket (Gradient), plus Spray and Layer picker", () => {
		const { container } = render(<Toolbar />);

		expect(screen.getByRole("button", { name: /Spray \(S\)/i })).toBeTruthy();
		expect(
			screen.getByRole("button", { name: /Layer picker \(Y\)/i })
		).toBeTruthy();

		const brushFlyoutTrigger = screen.getByRole("button", {
			name: "Pencil sub-tools",
		});
		const brushFlyoutId = brushFlyoutTrigger.getAttribute("popovertarget");
		expect(brushFlyoutId).toBeTruthy();
		const brushFlyout = container.querySelector(`#${CSS.escape(brushFlyoutId ?? "")}`);
		expect(brushFlyout).toBeTruthy();
		const customBrushButton = brushFlyout?.querySelectorAll("button")[1];
		expect(customBrushButton).toBeTruthy();
		if (customBrushButton) fireEvent.click(customBrushButton);
		expect(useEditorStore.getState().tool).toBe("custom-brush");

		const bucketFlyoutTrigger = screen.getByRole("button", {
			name: "Fill bucket sub-tools",
		});
		const bucketFlyoutId = bucketFlyoutTrigger.getAttribute("popovertarget");
		expect(bucketFlyoutId).toBeTruthy();
		const bucketFlyout = container.querySelector(`#${CSS.escape(bucketFlyoutId ?? "")}`);
		const gradientButton = bucketFlyout?.querySelectorAll("button")[1];
		expect(gradientButton).toBeTruthy();
		if (gradientButton) fireEvent.click(gradientButton);
		expect(useEditorStore.getState().tool).toBe("gradient");
	});

	it("toggles Grid Ruler, Perspective Guide, and Tiled Preview and exposes corner gear settings", () => {
		const { container } = render(<Toolbar />);

		const gridToggle = screen.getByRole("button", { name: "Grid Ruler Tool" });
		fireEvent.click(gridToggle);
		expect(useEditorStore.getState().rulerGrid.enabled).toBe(true);

		const gridGear = screen.getByRole("button", {
			name: "Grid Ruler settings",
		});
		const gridPopover = container.querySelector(
			`#${CSS.escape(gridGear.getAttribute("popovertarget") ?? "")}`
		);
		expect(gridPopover).toBeTruthy();
		const snapInput = gridPopover?.querySelector('input[type="checkbox"]');
		expect(snapInput).toBeTruthy();
		if (snapInput) fireEvent.click(snapInput);
		expect(useEditorStore.getState().rulerGrid.snapToGrid).toBe(true);

		const limitInput = gridPopover?.querySelectorAll('input[type="checkbox"]')[1];
		expect(limitInput).toBeTruthy();
		if (limitInput) fireEvent.click(limitInput);
		expect(useEditorStore.getState().rulerGrid.limitToCell).toBe(true);

		const perspectiveToggle = screen.getByRole("button", {
			name: "Perspective Guide Tool",
		});
		fireEvent.click(perspectiveToggle);
		expect(useEditorStore.getState().perspectiveGuide.enabled).toBe(true);

		const perspectiveGear = screen.getByRole("button", {
			name: "Perspective Guide settings",
		});
		const perspectivePopover = container.querySelector(
			`#${CSS.escape(perspectiveGear.getAttribute("popovertarget") ?? "")}`
		);
		const fisheyeButton = Array.from(
			perspectivePopover?.querySelectorAll("button") ?? []
		).find((button) => button.textContent === "Fisheye");
		expect(fisheyeButton).toBeTruthy();
		if (fisheyeButton) fireEvent.click(fisheyeButton);
		expect(useEditorStore.getState().perspectiveGuide.mode).toBe("fisheye");

		const threePointButton = Array.from(
			perspectivePopover?.querySelectorAll("button") ?? []
		).find((button) => button.textContent === "3-Point");
		expect(threePointButton).toBeTruthy();
		if (threePointButton) fireEvent.click(threePointButton);
		expect(useEditorStore.getState().perspectiveGuide.mode).toBe("3-point");

		const tiledToggle = screen.getByRole("button", {
			name: "Tiled Preview Tool",
		});
		fireEvent.click(tiledToggle);
		expect(useEditorStore.getState().tiledPreview.enabled).toBe(true);
	});
});
