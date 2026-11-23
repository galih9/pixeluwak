import { describe, expect, it } from "vitest";
import {
	BUILTIN_CUSTOM_BRUSHES,
	stampCustomBrush,
	transformCustomBrush,
} from "./brushPresets";
import { hexToPacked, TRANSPARENT } from "./color";
import { createLayer } from "./layers";
import { createPixels, type PaintTarget, rectMask } from "./raster";
import {
	computeFisheyeArcs,
	fillGradient,
	gridCellBounds,
	intersectMaskWithRect,
	pickLayerAtPoint,
	resolvePerspectivePoints,
	snapPointToGrid,
	stampSpray,
} from "./tools";
import { DEFAULT_PERSPECTIVE_GUIDE } from "../constants";

describe("pixel-editor new tools & guides", () => {
	it("sprays dots within radius and respects selection mask and symmetry", () => {
		const target: PaintTarget = {
			data: createPixels(16, 16),
			width: 16,
			height: 16,
			mask: rectMask(16, 16, 4, 4, 11, 11),
			symmetryX: true,
			symmetryY: false,
		};
		const color = hexToPacked("#ff004d");
		stampSpray(
			target,
			6,
			6,
			color,
			{ radius: 3, density: 80, dotSize: 1, rate: 40, distribution: "uniform" },
			() => 0.4
		);

		let count = 0;
		for (let y = 0; y < 16; y++) {
			for (let x = 0; x < 16; x++) {
				if (target.data[y * 16 + x] === color) {
					count++;
					expect(x).toBeGreaterThanOrEqual(4);
					expect(x).toBeLessThanOrEqual(11);
					expect(y).toBeGreaterThanOrEqual(4);
					expect(y).toBeLessThanOrEqual(11);
				}
			}
		}
		expect(count).toBeGreaterThan(0);
	});

	it("stamps multi-color and tinted custom brush patterns and transforms them", () => {
		const leaves = BUILTIN_CUSTOM_BRUSHES.find((item) => item.id === "leaves");
		expect(leaves).toBeDefined();
		if (!leaves) return;

		const target: PaintTarget = {
			data: createPixels(16, 16),
			width: 16,
			height: 16,
			mask: null,
			symmetryX: false,
			symmetryY: false,
		};
		const tint = hexToPacked("#ff004d");
		stampCustomBrush(target, 8, 8, leaves, tint, {
			spacing: 4,
			scatter: 0,
			randomFlipX: false,
			randomFlipY: false,
			randomRotate: false,
			colorMode: "original",
		});

		const paintedColors = new Set(
			Array.from(target.data).filter((value) => value !== TRANSPARENT)
		);
		expect(paintedColors.size).toBeGreaterThan(1);
		expect(paintedColors.has(tint)).toBe(false);

		const tintTarget: PaintTarget = {
			data: createPixels(16, 16),
			width: 16,
			height: 16,
			mask: null,
			symmetryX: false,
			symmetryY: false,
		};
		stampCustomBrush(tintTarget, 8, 8, leaves, tint, {
			spacing: 4,
			scatter: 0,
			randomFlipX: false,
			randomFlipY: false,
			randomRotate: false,
			colorMode: "tint",
		});
		const tintedColors = new Set(
			Array.from(tintTarget.data).filter((value) => value !== TRANSPARENT)
		);
		expect([...tintedColors]).toEqual([tint]);

		const rotated = transformCustomBrush(leaves, true, false, 1);
		expect(rotated.width).toBe(leaves.height);
		expect(rotated.height).toBe(leaves.width);
	});

	it("fills linear, radial, and dithered gradients inside region or selection", () => {
		const base = createPixels(8, 8);
		const wallColor = hexToPacked("#000000");
		for (let y = 0; y < 8; y++) {
			base[y * 8 + 4] = wallColor;
		}
		const target: PaintTarget = {
			data: base.slice(),
			width: 8,
			height: 8,
			mask: null,
			symmetryX: false,
			symmetryY: false,
		};
		const changed = fillGradient(
			target,
			base,
			{ x: 0, y: 0 },
			{ x: 3, y: 0 },
			"#ff0000",
			"#0000ff",
			{
				type: "linear",
				dither: "bayer4",
				steps: 0,
				regionOnly: true,
				contiguous: true,
				reverse: false,
			},
			{ x: 0, y: 0 }
		);
		expect(changed).toBe(true);
		expect(target.data[0]).toBe(hexToPacked("#ff0000"));
		// Wall and region on right of wall remain untouched
		expect(target.data[4]).toBe(wallColor);
		expect(target.data[5]).toBe(TRANSPARENT);

		// Radial smooth gradient with reverse
		const radialTarget: PaintTarget = {
			data: createPixels(6, 6),
			width: 6,
			height: 6,
			mask: null,
			symmetryX: false,
			symmetryY: false,
		};
		fillGradient(
			radialTarget,
			createPixels(6, 6),
			{ x: 2, y: 2 },
			{ x: 5, y: 2 },
			"#000000",
			"#ffffff",
			{
				type: "radial",
				dither: "smooth",
				steps: 3,
				regionOnly: false,
				contiguous: true,
				reverse: true,
			}
		);
		expect(radialTarget.data[2 * 6 + 2]).toBe(hexToPacked("#ffffff"));
	});

	it("computes grid cell bounds, snapping, and cell-clipped masks", () => {
		const grid = { cellWidth: 8, cellHeight: 8, offsetX: 2, offsetY: 2 };
		expect(
			gridCellBounds({ x: 11, y: 12 }, grid, 32, 32)
		).toEqual({ x: 10, y: 10, width: 8, height: 8 });
		expect(snapPointToGrid({ x: 15, y: 17 }, grid, 32, 32)).toEqual({
			x: 10,
			y: 10,
		});

		const mask = intersectMaskWithRect(
			null,
			{ x: 8, y: 8, width: 8, height: 8 },
			16,
			16
		);
		expect(mask[8 * 16 + 8]).toBe(1);
		expect(mask[7 * 16 + 8]).toBe(0);
	});

	it("picks the topmost visible opaque layer under the cursor", () => {
		const bottom = createLayer(8, 8, "Background");
		bottom.pixels[2 * 8 + 2] = hexToPacked("#112233");

		const middle = createLayer(8, 8, "Character");
		middle.pixels[2 * 8 + 2] = hexToPacked("#ff004d");

		const topHidden = createLayer(8, 8, "Hidden Overlay");
		topHidden.visible = false;
		topHidden.pixels[2 * 8 + 2] = hexToPacked("#00e436");

		const activeLive = createPixels(8, 8);
		activeLive[2 * 8 + 2] = hexToPacked("#ffec27");

		const hit = pickLayerAtPoint(
			[bottom, middle, topHidden],
			1,
			activeLive,
			8,
			8,
			{ x: 2.5, y: 2.5 },
			{ x: 2, y: 2 }
		);
		expect(hit?.layerIndex).toBe(1);
		expect(hit?.layer.name).toBe("Character");
	});

	it("resolves perspective vanishing points and generates fisheye arcs", () => {
		const twoPoint = resolvePerspectivePoints(
			{ ...DEFAULT_PERSPECTIVE_GUIDE, mode: "2-point" },
			32,
			32
		);
		expect(twoPoint.point1.y).toBe(twoPoint.horizonY);
		expect(twoPoint.point2.y).toBe(twoPoint.horizonY);
		expect(twoPoint.point1.x).toBeLessThan(0);
		expect(twoPoint.point2.x).toBeGreaterThan(32);

		const arcs = computeFisheyeArcs({ x: 16, y: 16 }, 16, 8, 60);
		expect(arcs.length).toBe(16);
		expect(arcs[0]?.length).toBeGreaterThan(4);
	});
});
