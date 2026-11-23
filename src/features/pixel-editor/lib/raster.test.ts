import { describe, expect, it } from "vitest";
import type { Point } from "../types";
import { rgbaToPacked, TRANSPARENT } from "./color";
import {
	brushOffsets,
	captureBrushFromSelection,
	compositeFloating,
	createPixels,
	ditherPatternSample,
	ellipsePoints,
	floodFill,
	linePoints,
	liftPixels,
	polygonMask,
	rectMask,
	replaceColorInBuffer,
	resamplePixels,
	resizePixels,
	selectionEdges,
	stampDither,
	symmetricPoints,
	type PaintTarget,
} from "./raster";

function render(points: Array<Point>, width: number, height: number): string {
	const rows = Array.from({ length: height }, () =>
		Array.from({ length: width }, () => ".")
	);
	for (const point of points) {
		const row = rows[point.y];
		if (row && point.x >= 0 && point.x < width) row[point.x] = "#";
	}
	return rows.map((row) => row.join("")).join("\n");
}

describe("raster", () => {
	it("draws a line including both ends", () => {
		const points = linePoints(0, 0, 4, 2);
		expect(points[0]).toEqual({ x: 0, y: 0 });
		expect(points[points.length - 1]).toEqual({ x: 4, y: 2 });
		expect(points).toHaveLength(5);
	});

	it("draws an ellipse that stays inside its box", () => {
		for (const [w, h] of [
			[1, 1],
			[2, 2],
			[5, 3],
			[8, 8],
			[7, 12],
			[16, 2],
		] as const) {
			const { outline, fill } = ellipsePoints(0, 0, w - 1, h - 1, true);
			for (const point of [...outline, ...fill]) {
				expect(point.x).toBeGreaterThanOrEqual(0);
				expect(point.y).toBeGreaterThanOrEqual(0);
				expect(point.x).toBeLessThan(w);
				expect(point.y).toBeLessThan(h);
			}
			// touches every edge of the box
			expect(Math.min(...outline.map((p) => p.x))).toBe(0);
			expect(Math.max(...outline.map((p) => p.x))).toBe(w - 1);
			expect(Math.min(...outline.map((p) => p.y))).toBe(0);
			expect(Math.max(...outline.map((p) => p.y))).toBe(h - 1);
		}
		const drawn = render(ellipsePoints(0, 0, 7, 7, false).outline, 8, 8);
		expect(drawn).toBe(
			[
				"..####..",
				".#....#.",
				"#......#",
				"#......#",
				"#......#",
				"#......#",
				".#....#.",
				"..####..",
			].join("\n")
		);
	});

	it("fills a lasso polygon by pixel centers", () => {
		const mask = polygonMask(4, 4, [
			{ x: 1, y: 1 },
			{ x: 3, y: 1 },
			{ x: 3, y: 3 },
			{ x: 1, y: 3 },
		]);
		expect([...mask]).toEqual([0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0]);
	});

	it("flood fills only the contiguous region", () => {
		const data = createPixels(3, 3);
		data[4] = 5; // a wall in the middle
		data[1] = 5;
		data[3] = 5;
		expect(floodFill(data, 3, 3, 0, 0, 9, true, null)).toBe(true);
		expect(data[0]).toBe(9);
		expect(data[2]).toBe(0);
	});

	it("moves lifted pixels", () => {
		const data = createPixels(4, 1);
		data[0] = 7;
		const mask = rectMask(4, 1, 0, 0, 0, 0);
		const { base, lifted } = liftPixels(data, mask);
		const moved = compositeFloating(base, lifted, mask, 4, 1, 2, 0);
		expect([...moved]).toEqual([0, 0, 7, 0]);
	});

	it("builds merged selection edges", () => {
		const mask = rectMask(4, 4, 0, 0, 1, 1);
		// a 2x2 square = 4 merged segments
		expect(selectionEdges(mask, 4, 4)).toHaveLength(16);
	});

	it("supports primitive brush shapes and custom masks", () => {
		expect(brushOffsets(3, "cross")).toHaveLength(5);
		expect(brushOffsets(3, "slash")).toHaveLength(3);
		expect(brushOffsets(3, "backslash")).toHaveLength(3);
		expect(brushOffsets(3, "diamond")).toHaveLength(5);
		const custom = {
			width: 3,
			height: 3,
			mask: new Uint8Array([1, 0, 1, 0, 1, 0, 1, 0, 1]),
		};
		expect(brushOffsets(1, "custom", custom)).toHaveLength(5);

		const pixels = createPixels(4, 4);
		pixels[0] = 0xff_11_22_33;
		pixels[5] = 0xff_11_22_33;
		const captured = captureBrushFromSelection(
			pixels,
			rectMask(4, 4, 0, 0, 1, 1),
			4,
			4
		);
		expect(captured?.width).toBe(2);
		expect(Array.from(captured?.mask ?? [])).toEqual([1, 0, 0, 1]);
	});

	it("dithers in world space and supports 2-color mode", () => {
		expect(ditherPatternSample(0, 0, "checker", 50)).toBe(true);
		expect(ditherPatternSample(1, 0, "checker", 50)).toBe(false);
		const target: PaintTarget = {
			data: createPixels(4, 4),
			width: 4,
			height: 4,
			mask: null,
			symmetryX: false,
			symmetryY: false,
		};
		stampDither(target, 1, 1, 4, "square", 11, 22, "checker", 50);
		expect(target.data[0]).toBe(11);
		expect(target.data[1]).toBe(22);
		expect(target.data[4]).toBe(22);
		expect(target.data[5]).toBe(11);
	});

	it("replaces colors inside selection or entire buffer with tolerance", () => {
		const data = createPixels(4, 1);
		data[0] = 0xff_00_00_ff;
		data[1] = 0xff_05_05_f8;
		data[2] = 0xff_00_00_ff;
		const mask = rectMask(4, 1, 0, 0, 1, 0);
		const exact = replaceColorInBuffer(
			data,
			0xff_00_00_ff,
			0xff_ff_ff_ff,
			mask,
			0
		);
		expect(exact.count).toBe(1);
		expect(exact.pixels[0]).toBe(0xff_ff_ff_ff);
		expect(exact.pixels[2]).toBe(0xff_00_00_ff);

		const fuzzy = replaceColorInBuffer(
			data,
			0xff_00_00_ff,
			0xff_aa_bb_cc,
			null,
			10
		);
		expect(fuzzy.count).toBe(3);
	});

	it("mirrors across custom symmetry axes, diagonal mode, and flood fill", () => {
		const points = symmetricPoints(
			{
				width: 8,
				height: 8,
				mask: null,
				symmetryX: true,
				symmetryY: true,
				symmetryXPos: 4,
				symmetryYPos: 4,
				symmetryDiagonal: true,
			},
			1,
			2
		);
		expect(points.length).toBeGreaterThanOrEqual(4);
		expect(points).toContainEqual({ x: 6, y: 2 });
		expect(points).toContainEqual({ x: 1, y: 5 });

		const data = createPixels(4, 4);
		data[1] = 5;
		data[4] = 5;
		data[5] = 5;
		floodFill(data, 4, 4, 0, 0, 9, true, null, {
			symmetryX: true,
			symmetryY: false,
		});
		expect(data[0]).toBe(9);
		expect(data[3]).toBe(9);
	});

	it("resizes pixels using 9-point anchors", () => {
		const data = createPixels(2, 2);
		data[0] = 11;
		data[3] = 22;

		const bottomRight = resizePixels(data, 2, 2, 4, 4, "bottom-right");
		expect(bottomRight[2 * 4 + 2]).toBe(11);
		expect(bottomRight[3 * 4 + 3]).toBe(22);

		const top = resizePixels(data, 2, 2, 4, 4, "top");
		expect(top[1]).toBe(11);
		expect(top[1 * 4 + 2]).toBe(22);

		const bottom = resizePixels(data, 2, 2, 4, 4, "bottom");
		expect(bottom[2 * 4 + 1]).toBe(11);
		expect(bottom[3 * 4 + 2]).toBe(22);

		const left = resizePixels(data, 2, 2, 4, 4, "left");
		expect(left[1 * 4]).toBe(11);
		expect(left[2 * 4 + 1]).toBe(22);

		const right = resizePixels(data, 2, 2, 4, 4, "right");
		expect(right[1 * 4 + 2]).toBe(11);
		expect(right[2 * 4 + 3]).toBe(22);

		const center = resizePixels(data, 2, 2, 4, 4, "center");
		expect(center[1 * 4 + 1]).toBe(11);
		expect(center[2 * 4 + 2]).toBe(22);
	});

	it("resamples 512x512 blocks down to 128x128 with nearest and majority", () => {
		const source = createPixels(512, 512);
		const red = rgbaToPacked(255, 0, 0, 255);
		const blue = rgbaToPacked(0, 0, 255, 255);
		const green = rgbaToPacked(0, 255, 0, 255);
		const gold = rgbaToPacked(255, 200, 0, 255);

		// Paint distinct 4x4 blocks that map 1:1 to pixels in 128x128.
		for (let y = 0; y < 4; y++) {
			for (let x = 0; x < 4; x++) {
				source[y * 512 + x] = red;
				source[y * 512 + (508 + x)] = blue;
				source[(508 + y) * 512 + x] = green;
				source[(508 + y) * 512 + (508 + x)] = gold;
			}
		}

		const nearest = resamplePixels(source, 512, 512, 128, 128, "nearest");
		expect(nearest).toHaveLength(128 * 128);
		expect(nearest[0]).toBe(red);
		expect(nearest[127]).toBe(blue);
		expect(nearest[127 * 128]).toBe(green);
		expect(nearest[127 * 128 + 127]).toBe(gold);

		const majority = resamplePixels(source, 512, 512, 128, 128, "majority");
		expect(majority[0]).toBe(red);
		expect(majority[127]).toBe(blue);
		expect(majority[127 * 128]).toBe(green);
		expect(majority[127 * 128 + 127]).toBe(gold);
	});

	it("picks the dominant palette color per block in majority mode", () => {
		const source = createPixels(4, 4);
		const teal = rgbaToPacked(0, 180, 180, 255);
		const black = rgbaToPacked(0, 0, 0, 255);
		source.fill(teal);
		// Inject 3 stray pixels inside the 4x4 block; teal (13) must win cleanly.
		source[0] = black;
		source[5] = black;
		source[10] = black;

		const downscaled = resamplePixels(source, 4, 4, 1, 1, "majority");
		expect(downscaled[0]).toBe(teal);
	});

	it("uses premultiplied alpha in smooth mode without black fringe and handles upscaling and non-square sizes", () => {
		const red = rgbaToPacked(255, 0, 0, 255);
		const source = createPixels(2, 2);
		source[0] = red;
		source[1] = red;
		source[2] = TRANSPARENT;
		source[3] = TRANSPARENT;

		const smooth = resamplePixels(source, 2, 2, 1, 1, "smooth");
		const bytes = new Uint8Array(smooth.buffer);
		expect(bytes[0]).toBe(255);
		expect(bytes[1]).toBe(0);
		expect(bytes[2]).toBe(0);
		expect(bytes[3]).toBeGreaterThanOrEqual(127);
		expect(bytes[3]).toBeLessThanOrEqual(128);

		const opaque = createPixels(2, 2);
		opaque[0] = rgbaToPacked(200, 100, 0, 255);
		opaque[1] = rgbaToPacked(100, 200, 0, 255);
		opaque[2] = rgbaToPacked(200, 100, 0, 255);
		opaque[3] = rgbaToPacked(100, 200, 0, 255);
		const average = resamplePixels(opaque, 2, 2, 1, 1, "smooth");
		const averageBytes = new Uint8Array(average.buffer);
		expect(averageBytes[0]).toBe(150);
		expect(averageBytes[1]).toBe(150);
		expect(averageBytes[2]).toBe(0);
		expect(averageBytes[3]).toBe(255);

		const upscaled = resamplePixels(source, 2, 2, 4, 4, "nearest");
		expect(upscaled).toHaveLength(16);
		expect(upscaled[0]).toBe(red);
		expect(upscaled[3]).toBe(red);
		expect(upscaled[12]).toBe(TRANSPARENT);

		const nonSquare = resamplePixels(createPixels(16, 8), 16, 8, 6, 12, "smooth");
		expect(nonSquare).toHaveLength(6 * 12);
	});
});
