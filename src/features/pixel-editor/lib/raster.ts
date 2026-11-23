import type {
	BrushShape,
	Clip,
	CustomBrush,
	DitherPattern,
	PixelBuffer,
	Point,
	ResampleAlgorithm,
	ResizeAnchor,
	SelectionMask,
	SelectionMode,
} from "../types";
import { colorDistanceSquared, packedAlpha, TRANSPARENT } from "./color";

/* -------------------------------------------------------------------------- */
/*                                  Buffers                                   */
/* -------------------------------------------------------------------------- */

export function createPixels(width: number, height: number): PixelBuffer {
	return new Uint32Array(width * height);
}

export function createMask(width: number, height: number): SelectionMask {
	return new Uint8Array(width * height);
}

export function fullMask(width: number, height: number): SelectionMask {
	return new Uint8Array(width * height).fill(1);
}

/* -------------------------------------------------------------------------- */
/*                                  Painting                                  */
/* -------------------------------------------------------------------------- */

export type PaintTarget = {
	data: PixelBuffer;
	width: number;
	height: number;
	/** When set, only pixels inside the mask can be changed. */
	mask: SelectionMask | null;
	symmetryX: boolean;
	symmetryY: boolean;
	symmetryXPos?: number | null;
	symmetryYPos?: number | null;
	symmetryDiagonal?: boolean;
};

/** Coordinates touched by a single pixel write, including symmetry mirrors. */
export function symmetricPoints(
	target: Pick<
		PaintTarget,
		| "width"
		| "height"
		| "mask"
		| "symmetryX"
		| "symmetryY"
		| "symmetryXPos"
		| "symmetryYPos"
		| "symmetryDiagonal"
	>,
	x: number,
	y: number
): Array<Point> {
	const points: Array<Point> = [];
	const seen = new Set<number>();
	const add = (px: number, py: number): void => {
		if (px < 0 || py < 0 || px >= target.width || py >= target.height) return;
		const index = py * target.width + px;
		if (target.mask && target.mask[index] !== 1) return;
		if (seen.has(index)) return;
		seen.add(index);
		points.push({ x: px, y: py });
	};
	const axisX = target.symmetryXPos ?? target.width / 2;
	const axisY = target.symmetryYPos ?? target.height / 2;
	const mirrorX = Math.round(2 * axisX - 1 - x);
	const mirrorY = Math.round(2 * axisY - 1 - y);

	const addMirrors = (px: number, py: number): void => {
		const mx = Math.round(2 * axisX - 1 - px);
		const my = Math.round(2 * axisY - 1 - py);
		add(px, py);
		if (target.symmetryX) add(mx, py);
		if (target.symmetryY) add(px, my);
		if (target.symmetryX && target.symmetryY) add(mx, my);
	};

	addMirrors(x, y);
	if (target.symmetryDiagonal) {
		const dx = x - axisX + 0.5;
		const dy = y - axisY + 0.5;
		// 90-degree / diagonal swap around the symmetry origin.
		const swappedX = Math.round(axisX + dy - 0.5);
		const swappedY = Math.round(axisY + dx - 0.5);
		addMirrors(swappedX, swappedY);
		if (mirrorX !== x || mirrorY !== y) {
			add(swappedX, swappedY);
		}
	}
	return points;
}

/** Indices touched by a single pixel write, including symmetry mirrors. */
function symmetricIndices(
	target: PaintTarget,
	x: number,
	y: number
): Array<number> {
	return symmetricPoints(target, x, y).map(
		(point) => point.y * target.width + point.x
	);
}

export function plot(
	target: PaintTarget,
	x: number,
	y: number,
	color: number
): void {
	for (const index of symmetricIndices(target, x, y)) {
		target.data[index] = color;
	}
}

/** Put back the original pixel (used by pixel-perfect strokes). */
export function restorePixel(
	target: PaintTarget,
	base: PixelBuffer,
	x: number,
	y: number
): void {
	for (const index of symmetricIndices(target, x, y)) {
		target.data[index] = base[index] ?? TRANSPARENT;
	}
}

export function createDefaultCustomBrush(): CustomBrush {
	const size = 5;
	const mask = new Uint8Array(size * size);
	const pattern = [
		"..#..",
		".###.",
		"#####",
		".###.",
		"..#..",
	];
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			mask[y * size + x] = pattern[y]?.[x] === "#" ? 1 : 0;
		}
	}
	return { width: size, height: size, mask };
}

const brushCache = new Map<string, Array<Point>>();

export function brushOffsets(
	size: number,
	shape: BrushShape,
	customBrush?: CustomBrush | null
): Array<Point> {
	if (shape === "custom" && customBrush) {
		const offsets: Array<Point> = [];
		const startX = -Math.floor((customBrush.width - 1) / 2);
		const startY = -Math.floor((customBrush.height - 1) / 2);
		for (let dy = 0; dy < customBrush.height; dy++) {
			for (let dx = 0; dx < customBrush.width; dx++) {
				if (customBrush.mask[dy * customBrush.width + dx] === 1) {
					offsets.push({ x: startX + dx, y: startY + dy });
				}
			}
		}
		return offsets.length > 0 ? offsets : [{ x: 0, y: 0 }];
	}
	const key = `${size}:${shape}`;
	const cached = brushCache.get(key);
	if (cached) return cached;
	const offsets: Array<Point> = [];
	const start = -Math.floor((size - 1) / 2);
	const center = (size - 1) / 2;
	const radiusSquared = (size / 2) ** 2 - 0.5;
	const halfStroke = Math.max(0.55, size / 7);
	for (let dy = 0; dy < size; dy++) {
		for (let dx = 0; dx < size; dx++) {
			if (shape === "circle" && size > 2) {
				const distance = (dx - center) ** 2 + (dy - center) ** 2;
				if (distance > radiusSquared) continue;
			} else if (shape === "diamond" && size > 2) {
				const manhattan = Math.abs(dx - center) + Math.abs(dy - center);
				if (manhattan > size / 2) continue;
			} else if (shape === "slash" && size > 1) {
				if (Math.abs(dx + dy - (size - 1)) > halfStroke) continue;
			} else if (shape === "backslash" && size > 1) {
				if (Math.abs(dx - dy) > halfStroke) continue;
			} else if (shape === "cross" && size > 2) {
				const onVertical = Math.abs(dx - center) <= halfStroke;
				const onHorizontal = Math.abs(dy - center) <= halfStroke;
				if (!onVertical && !onHorizontal) continue;
			}
			offsets.push({ x: start + dx, y: start + dy });
		}
	}
	brushCache.set(key, offsets);
	return offsets;
}

/** Top-left corner of the brush footprint for a pixel position. */
export function brushOrigin(position: number, size: number): number {
	return position - Math.floor((size - 1) / 2);
}

export function stamp(
	target: PaintTarget,
	x: number,
	y: number,
	size: number,
	shape: BrushShape,
	color: number,
	customBrush?: CustomBrush | null
): void {
	if (size <= 1 && shape !== "custom") {
		plot(target, x, y, color);
		return;
	}
	for (const offset of brushOffsets(size, shape, customBrush)) {
		plot(target, x + offset.x, y + offset.y, color);
	}
}

/* -------------------------------------------------------------------------- */
/*                                 Dithering                                  */
/* -------------------------------------------------------------------------- */

const BAYER_2X2 = [0, 2, 3, 1];
const BAYER_4X4 = [
	0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5,
];

function wrapModulo(value: number, divisor: number): number {
	return ((value % divisor) + divisor) % divisor;
}

/**
 * Evaluates a world-space dithering pattern at `(x, y)`.
 * `density` is 0–100 (default 50).
 */
export function ditherPatternSample(
	x: number,
	y: number,
	pattern: DitherPattern,
	density: number
): boolean {
	const norm = Math.max(0, Math.min(100, density)) / 100;
	if (norm <= 0) return false;
	if (norm >= 1) return true;
	const mx2 = x & 1;
	const my2 = y & 1;
	const mx4 = x & 3;
	const my4 = y & 3;
	switch (pattern) {
		case "checker":
			return ((x + y) & 1) === 0;
		case "bayer2": {
			const threshold = (BAYER_2X2[(my2 << 1) | mx2] ?? 0) + 0.5;
			return threshold <= norm * 4;
		}
		case "bayer4": {
			const threshold = (BAYER_4X4[(my4 << 2) | mx4] ?? 0) + 0.5;
			return threshold <= norm * 16;
		}
		case "diagonal": {
			const band = wrapModulo(x + y, 4);
			return band + 0.5 <= norm * 4;
		}
		case "horizontal": {
			return my4 + 0.5 <= norm * 4;
		}
		case "vertical": {
			return mx4 + 0.5 <= norm * 4;
		}
		case "dots": {
			return mx2 === 0 && my2 === 0;
		}
	}
}

export function stampDither(
	target: PaintTarget,
	x: number,
	y: number,
	size: number,
	shape: BrushShape,
	primaryColor: number,
	secondaryColor: number | null,
	pattern: DitherPattern,
	density: number,
	customBrush?: CustomBrush | null
): void {
	const offsets =
		size <= 1 && shape !== "custom"
			? [{ x: 0, y: 0 }]
			: brushOffsets(size, shape, customBrush);
	for (const offset of offsets) {
		const pts = symmetricPoints(target, x + offset.x, y + offset.y);
		for (const pt of pts) {
			const active = ditherPatternSample(pt.x, pt.y, pattern, density);
			if (active) {
				target.data[pt.y * target.width + pt.x] = primaryColor;
			} else if (secondaryColor !== null) {
				target.data[pt.y * target.width + pt.x] = secondaryColor;
			}
		}
	}
}

/* -------------------------------------------------------------------------- */
/*                             Magic Color Replace                            */
/* -------------------------------------------------------------------------- */

/**
 * Replaces `targetColor` with `replacementColor` across `data` (or within
 * `selection` when non-null). `tolerance` 0 = exact match, 1–100 = RGB fuzzy.
 */
export function replaceColorInBuffer(
	data: PixelBuffer,
	targetColor: number,
	replacementColor: number,
	selection: SelectionMask | null,
	tolerance = 0
): { pixels: PixelBuffer; count: number } {
	const targetAlpha = packedAlpha(targetColor);
	const clampedTolerance = Math.max(0, Math.min(100, tolerance));
	// Max Euclidean RGB distance is sqrt(255^2 * 3) ≈ 441.67
	const maxDistanceSquared = ((clampedTolerance / 100) * 442) ** 2;

	let count = 0;
	let result: PixelBuffer | null = null;
	for (let index = 0; index < data.length; index++) {
		if (selection && selection[index] !== 1) continue;
		const current = data[index] ?? TRANSPARENT;
		let matches = false;
		if (clampedTolerance === 0) {
			matches = current === targetColor;
		} else if (targetAlpha === 0) {
			matches = packedAlpha(current) === 0;
		} else if (packedAlpha(current) > 0) {
			matches =
				colorDistanceSquared(current, targetColor) <= maxDistanceSquared;
		}
		if (!matches || current === replacementColor) continue;
		if (!result) result = data.slice();
		result[index] = replacementColor;
		count += 1;
	}
	return { pixels: result ?? data, count };
}

/* -------------------------------------------------------------------------- */
/*                                   Shapes                                   */
/* -------------------------------------------------------------------------- */

/** Bresenham line, inclusive of both ends. */
export function linePoints(
	x0: number,
	y0: number,
	x1: number,
	y1: number
): Array<Point> {
	const points: Array<Point> = [];
	let x = x0;
	let y = y0;
	const dx = Math.abs(x1 - x0);
	const dy = -Math.abs(y1 - y0);
	const stepX = x0 < x1 ? 1 : -1;
	const stepY = y0 < y1 ? 1 : -1;
	let error = dx + dy;
	for (;;) {
		points.push({ x, y });
		if (x === x1 && y === y1) break;
		const doubled = 2 * error;
		if (doubled >= dy) {
			error += dy;
			x += stepX;
		}
		if (doubled <= dx) {
			error += dx;
			y += stepY;
		}
	}
	return points;
}

export type ShapePoints = { outline: Array<Point>; fill: Array<Point> };

function spansFromOutline(outline: Array<Point>): Array<Point> {
	const rows = new Map<number, { min: number; max: number }>();
	for (const point of outline) {
		const row = rows.get(point.y);
		if (row) {
			row.min = Math.min(row.min, point.x);
			row.max = Math.max(row.max, point.x);
		} else {
			rows.set(point.y, { min: point.x, max: point.x });
		}
	}
	const fill: Array<Point> = [];
	for (const [y, row] of rows) {
		for (let x = row.min; x <= row.max; x++) fill.push({ x, y });
	}
	return fill;
}

export function rectanglePoints(
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	filled: boolean
): ShapePoints {
	const left = Math.min(x0, x1);
	const right = Math.max(x0, x1);
	const top = Math.min(y0, y1);
	const bottom = Math.max(y0, y1);
	const outline: Array<Point> = [];
	for (let x = left; x <= right; x++) {
		outline.push({ x, y: top });
		if (bottom !== top) outline.push({ x, y: bottom });
	}
	for (let y = top + 1; y < bottom; y++) {
		outline.push({ x: left, y });
		if (right !== left) outline.push({ x: right, y });
	}
	const fill: Array<Point> = [];
	if (filled) {
		for (let y = top; y <= bottom; y++) {
			for (let x = left; x <= right; x++) fill.push({ x, y });
		}
	}
	return { outline, fill };
}

/**
 * Ellipse that fits exactly inside the box (x0,y0)-(x1,y1).
 * Based on Alois Zingl's "plotEllipseRect" algorithm.
 */
export function ellipsePoints(
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	filled: boolean
): ShapePoints {
	const outline: Array<Point> = [];
	const add = (x: number, y: number): void => {
		outline.push({ x, y });
	};
	let left = x0;
	let right = x1;
	let top = y0;
	let bottom = y1;
	let a = Math.abs(right - left);
	const b = Math.abs(bottom - top);
	let b1 = b & 1;
	let dx = 4 * (1 - a) * b * b;
	let dy = 4 * (b1 + 1) * a * a;
	let error = dx + dy + b1 * a * a;

	if (left > right) {
		left = right;
		right += a;
	}
	if (top > bottom) top = bottom;
	top += (b + 1) >> 1;
	bottom = top - b1;
	a *= 8 * a;
	b1 = 8 * b * b;

	do {
		add(right, top);
		add(left, top);
		add(left, bottom);
		add(right, bottom);
		const doubled = 2 * error;
		if (doubled <= dy) {
			top++;
			bottom--;
			dy += a;
			error += dy;
		}
		if (doubled >= dx || 2 * error > dy) {
			left++;
			right--;
			dx += b1;
			error += dx;
		}
	} while (left <= right);

	// Finish the tips of very flat ellipses.
	while (top - bottom <= b) {
		add(left - 1, top);
		add(right + 1, top);
		top++;
		add(left - 1, bottom);
		add(right + 1, bottom);
		bottom--;
	}

	// Remove duplicates.
	const seen = new Set<string>();
	const unique = outline.filter((point) => {
		const key = `${point.x},${point.y}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
	return { outline: unique, fill: filled ? spansFromOutline(unique) : [] };
}

/** Snap a line end to 0°, 45° or 90° from the start. */
export function constrainLine(start: Point, end: Point): Point {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const absX = Math.abs(dx);
	const absY = Math.abs(dy);
	if (absX > absY * 2) return { x: end.x, y: start.y };
	if (absY > absX * 2) return { x: start.x, y: end.y };
	const length = Math.max(absX, absY);
	return {
		x: start.x + Math.sign(dx) * length,
		y: start.y + Math.sign(dy) * length,
	};
}

/** Make the box from start to end a square (for shift + rectangle/ellipse). */
export function constrainSquare(start: Point, end: Point): Point {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const length = Math.max(Math.abs(dx), Math.abs(dy));
	return {
		x: start.x + (dx < 0 ? -length : length),
		y: start.y + (dy < 0 ? -length : length),
	};
}

/* -------------------------------------------------------------------------- */
/*                                    Fill                                    */
/* -------------------------------------------------------------------------- */

/** Collects the region of same-colored pixels starting at (x, y). */
export function regionMask(
	data: PixelBuffer,
	width: number,
	height: number,
	x: number,
	y: number,
	contiguous: boolean,
	limit: SelectionMask | null
): SelectionMask {
	const mask = createMask(width, height);
	if (x < 0 || y < 0 || x >= width || y >= height) return mask;
	const startIndex = y * width + x;
	const targetColor = data[startIndex];
	const allowed = (index: number): boolean =>
		data[index] === targetColor && (!limit || limit[index] === 1);

	if (!contiguous) {
		for (let index = 0; index < data.length; index++) {
			if (allowed(index)) mask[index] = 1;
		}
		return mask;
	}

	const stack: Array<number> = [startIndex];
	while (stack.length > 0) {
		const index = stack.pop() ?? 0;
		if (mask[index] === 1 || !allowed(index)) continue;
		mask[index] = 1;
		const px = index % width;
		if (px > 0) stack.push(index - 1);
		if (px < width - 1) stack.push(index + 1);
		if (index >= width) stack.push(index - width);
		if (index < data.length - width) stack.push(index + width);
	}
	return mask;
}

export function floodFill(
	data: PixelBuffer,
	width: number,
	height: number,
	x: number,
	y: number,
	color: number,
	contiguous: boolean,
	limit: SelectionMask | null,
	symmetry?: Pick<
		PaintTarget,
		| "symmetryX"
		| "symmetryY"
		| "symmetryXPos"
		| "symmetryYPos"
		| "symmetryDiagonal"
	>
): boolean {
	if (x < 0 || y < 0 || x >= width || y >= height) return false;
	const seeds = symmetry
		? symmetricPoints({ width, height, mask: limit, ...symmetry }, x, y)
		: [{ x, y }];
	let changed = false;
	for (const seed of seeds) {
		if (data[seed.y * width + seed.x] === color) continue;
		const region = regionMask(
			data,
			width,
			height,
			seed.x,
			seed.y,
			contiguous,
			limit
		);
		for (let index = 0; index < region.length; index++) {
			if (region[index] === 1) {
				data[index] = color;
				changed = true;
			}
		}
	}
	return changed;
}

/* -------------------------------------------------------------------------- */
/*                                 Selection                                  */
/* -------------------------------------------------------------------------- */

export function rectMask(
	width: number,
	height: number,
	x0: number,
	y0: number,
	x1: number,
	y1: number
): SelectionMask {
	const mask = createMask(width, height);
	const left = Math.max(0, Math.min(x0, x1));
	const right = Math.min(width - 1, Math.max(x0, x1));
	const top = Math.max(0, Math.min(y0, y1));
	const bottom = Math.min(height - 1, Math.max(y0, y1));
	for (let y = top; y <= bottom; y++) {
		mask.fill(1, y * width + left, y * width + right + 1);
	}
	return mask;
}

/** Even-odd polygon fill, a pixel is selected when its center is inside. */
export function polygonMask(
	width: number,
	height: number,
	points: Array<Point>
): SelectionMask {
	const mask = createMask(width, height);
	const count = points.length;
	if (count < 3) return mask;
	for (let y = 0; y < height; y++) {
		const centerY = y + 0.5;
		const crossings: Array<number> = [];
		for (let index = 0; index < count; index++) {
			const a = points[index];
			const b = points[(index + 1) % count];
			if (!a || !b) continue;
			if (
				(a.y <= centerY && b.y > centerY) ||
				(b.y <= centerY && a.y > centerY)
			) {
				crossings.push(a.x + ((centerY - a.y) * (b.x - a.x)) / (b.y - a.y));
			}
		}
		crossings.sort((first, second) => first - second);
		for (let index = 0; index + 1 < crossings.length; index += 2) {
			const left = crossings[index] ?? 0;
			const right = crossings[index + 1] ?? 0;
			const startX = Math.max(0, Math.ceil(left - 0.5));
			const endX = Math.min(width, Math.ceil(right - 0.5));
			if (endX > startX) mask.fill(1, y * width + startX, y * width + endX);
		}
	}
	return mask;
}

export function maskIsEmpty(mask: SelectionMask): boolean {
	return !mask.includes(1);
}

export function combineMasks(
	current: SelectionMask | null,
	next: SelectionMask,
	mode: SelectionMode
): SelectionMask | null {
	let result: SelectionMask;
	if (mode === "replace" || !current) {
		if (mode === "subtract") return current;
		result = next;
	} else {
		result = current.slice();
		for (let index = 0; index < result.length; index++) {
			if (next[index] !== 1) continue;
			result[index] = mode === "add" ? 1 : 0;
		}
	}
	return maskIsEmpty(result) ? null : result;
}

export function invertMask(
	mask: SelectionMask | null,
	size: number
): SelectionMask | null {
	const result = new Uint8Array(size);
	for (let index = 0; index < size; index++) {
		result[index] = mask?.[index] === 1 ? 0 : 1;
	}
	return maskIsEmpty(result) ? null : result;
}

export type Bounds = { x: number; y: number; width: number; height: number };

export function maskBounds(
	mask: SelectionMask,
	width: number,
	height: number
): Bounds | null {
	let left = width;
	let top = height;
	let right = -1;
	let bottom = -1;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (mask[y * width + x] !== 1) continue;
			if (x < left) left = x;
			if (x > right) right = x;
			if (y < top) top = y;
			if (y > bottom) bottom = y;
		}
	}
	if (right < 0) return null;
	return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** Captures a custom brush mask and colors from non-transparent pixels inside `selection`. */
export function captureBrushFromSelection(
	pixels: PixelBuffer,
	selection: SelectionMask | null,
	width: number,
	height: number,
	maxSize = 16
): CustomBrush | null {
	const area = selection ?? fullMask(width, height);
	const bounds = maskBounds(area, width, height);
	if (!bounds) return null;
	const bw = Math.min(maxSize, bounds.width);
	const bh = Math.min(maxSize, bounds.height);
	const mask = new Uint8Array(bw * bh);
	const colors = new Uint32Array(bw * bh);
	let hasAny = false;
	let hasColors = false;
	for (let y = 0; y < bh; y++) {
		for (let x = 0; x < bw; x++) {
			const index = (bounds.y + y) * width + (bounds.x + x);
			const packed = pixels[index] ?? TRANSPARENT;
			if (area[index] === 1 && packedAlpha(packed) > 0) {
				const targetIndex = y * bw + x;
				mask[targetIndex] = 1;
				colors[targetIndex] = packed;
				hasAny = true;
				hasColors = true;
			}
		}
	}
	if (!hasAny) {
		// Fall back to the selection shape itself if the pixels inside were empty.
		for (let y = 0; y < bh; y++) {
			for (let x = 0; x < bw; x++) {
				const index = (bounds.y + y) * width + (bounds.x + x);
				if (area[index] === 1) {
					mask[y * bw + x] = 1;
					hasAny = true;
				}
			}
		}
	}
	return hasAny
		? {
				width: bw,
				height: bh,
				mask,
				...(hasColors ? { colors } : {}),
			}
		: null;
}

export function shiftMask(
	mask: SelectionMask,
	width: number,
	height: number,
	dx: number,
	dy: number
): SelectionMask {
	const result = createMask(width, height);
	for (let y = 0; y < height; y++) {
		const targetY = y + dy;
		if (targetY < 0 || targetY >= height) continue;
		for (let x = 0; x < width; x++) {
			const targetX = x + dx;
			if (targetX < 0 || targetX >= width) continue;
			if (mask[y * width + x] === 1) result[targetY * width + targetX] = 1;
		}
	}
	return result;
}

/**
 * Outline of a selection as flat line segments [x1, y1, x2, y2, ...] in
 * pixel-edge coordinates. Collinear neighbours are merged.
 */
export function selectionEdges(
	mask: SelectionMask,
	width: number,
	height: number
): Array<number> {
	const segments: Array<number> = [];
	const isSelected = (x: number, y: number): boolean =>
		x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;

	for (let y = 0; y <= height; y++) {
		let runStart = -1;
		for (let x = 0; x <= width; x++) {
			const edge = x < width && isSelected(x, y - 1) !== isSelected(x, y);
			if (edge && runStart < 0) runStart = x;
			if (!edge && runStart >= 0) {
				segments.push(runStart, y, x, y);
				runStart = -1;
			}
		}
	}
	for (let x = 0; x <= width; x++) {
		let runStart = -1;
		for (let y = 0; y <= height; y++) {
			const edge = y < height && isSelected(x - 1, y) !== isSelected(x, y);
			if (edge && runStart < 0) runStart = y;
			if (!edge && runStart >= 0) {
				segments.push(x, runStart, x, y);
				runStart = -1;
			}
		}
	}
	return segments;
}

/* -------------------------------------------------------------------------- */
/*                           Moving / clipboard / etc                         */
/* -------------------------------------------------------------------------- */

export function liftPixels(
	data: PixelBuffer,
	mask: SelectionMask
): { base: PixelBuffer; lifted: PixelBuffer } {
	const base = data.slice();
	const lifted = new Uint32Array(data.length);
	for (let index = 0; index < data.length; index++) {
		if (mask[index] !== 1) continue;
		lifted[index] = data[index] ?? TRANSPARENT;
		base[index] = TRANSPARENT;
	}
	return { base, lifted };
}

export function compositeFloating(
	base: PixelBuffer,
	lifted: PixelBuffer,
	mask: SelectionMask,
	width: number,
	height: number,
	offsetX: number,
	offsetY: number
): PixelBuffer {
	const result = base.slice();
	for (let y = 0; y < height; y++) {
		const targetY = y + offsetY;
		if (targetY < 0 || targetY >= height) continue;
		for (let x = 0; x < width; x++) {
			const index = y * width + x;
			if (mask[index] !== 1) continue;
			const value = lifted[index] ?? TRANSPARENT;
			if (value === TRANSPARENT) continue;
			const targetX = x + offsetX;
			if (targetX < 0 || targetX >= width) continue;
			result[targetY * width + targetX] = value;
		}
	}
	return result;
}

export function eraseMasked(
	data: PixelBuffer,
	mask: SelectionMask
): PixelBuffer {
	const result = data.slice();
	for (let index = 0; index < result.length; index++) {
		if (mask[index] === 1) result[index] = TRANSPARENT;
	}
	return result;
}

export function flipPixels(
	data: PixelBuffer,
	mask: SelectionMask | null,
	width: number,
	height: number,
	axis: "horizontal" | "vertical"
): { pixels: PixelBuffer; mask: SelectionMask | null } {
	const area = mask ?? fullMask(width, height);
	const bounds = maskBounds(area, width, height);
	if (!bounds) return { pixels: data, mask };
	const pixels = data.slice();
	const nextMask = createMask(width, height);
	for (let index = 0; index < area.length; index++) {
		if (area[index] === 1) pixels[index] = TRANSPARENT;
	}
	for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
		for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
			const index = y * width + x;
			if (area[index] !== 1) continue;
			const targetX =
				axis === "horizontal"
					? bounds.x + bounds.width - 1 - (x - bounds.x)
					: x;
			const targetY =
				axis === "vertical" ? bounds.y + bounds.height - 1 - (y - bounds.y) : y;
			const targetIndex = targetY * width + targetX;
			pixels[targetIndex] = data[index] ?? TRANSPARENT;
			nextMask[targetIndex] = 1;
		}
	}
	return { pixels, mask: mask ? nextMask : null };
}

export function resizeAnchorOffset(
	oldWidth: number,
	oldHeight: number,
	newWidth: number,
	newHeight: number,
	anchor: ResizeAnchor
): { offsetX: number; offsetY: number } {
	let offsetX = Math.floor((newWidth - oldWidth) / 2);
	if (
		anchor === "top-left" ||
		anchor === "left" ||
		anchor === "bottom-left"
	) {
		offsetX = 0;
	} else if (
		anchor === "top-right" ||
		anchor === "right" ||
		anchor === "bottom-right"
	) {
		offsetX = newWidth - oldWidth;
	}

	let offsetY = Math.floor((newHeight - oldHeight) / 2);
	if (anchor === "top-left" || anchor === "top" || anchor === "top-right") {
		offsetY = 0;
	} else if (
		anchor === "bottom-left" ||
		anchor === "bottom" ||
		anchor === "bottom-right"
	) {
		offsetY = newHeight - oldHeight;
	}

	return { offsetX, offsetY };
}

export function resizePixels(
	data: PixelBuffer,
	oldWidth: number,
	oldHeight: number,
	newWidth: number,
	newHeight: number,
	anchor: ResizeAnchor
): PixelBuffer {
	const result = createPixels(newWidth, newHeight);
	const { offsetX, offsetY } = resizeAnchorOffset(
		oldWidth,
		oldHeight,
		newWidth,
		newHeight,
		anchor
	);
	for (let y = 0; y < oldHeight; y++) {
		const targetY = y + offsetY;
		if (targetY < 0 || targetY >= newHeight) continue;
		for (let x = 0; x < oldWidth; x++) {
			const targetX = x + offsetX;
			if (targetX < 0 || targetX >= newWidth) continue;
			result[targetY * newWidth + targetX] = data[y * oldWidth + x] ?? 0;
		}
	}
	return result;
}

type AxisSample = { index: number; weight: number };

function buildAxisWeights(
	oldSize: number,
	newSize: number
): Array<Array<AxisSample>> {
	const weights: Array<Array<AxisSample>> = [];
	if (oldSize >= newSize) {
		for (let target = 0; target < newSize; target++) {
			const rangeStart = (target * oldSize) / newSize;
			const rangeEnd = ((target + 1) * oldSize) / newSize;
			const span = rangeEnd - rangeStart;
			const first = Math.floor(rangeStart);
			const last = Math.min(oldSize - 1, Math.ceil(rangeEnd) - 1);
			const entries: Array<AxisSample> = [];
			for (let index = first; index <= last; index++) {
				const overlap =
					Math.min(rangeEnd, index + 1) - Math.max(rangeStart, index);
				if (overlap > 0) {
					entries.push({ index, weight: overlap / span });
				}
			}
			weights.push(entries);
		}
		return weights;
	}

	for (let target = 0; target < newSize; target++) {
		const sample = ((target + 0.5) * oldSize) / newSize - 0.5;
		const left = Math.max(0, Math.min(oldSize - 1, Math.floor(sample)));
		const right = Math.min(oldSize - 1, left + 1);
		const fraction = Math.max(0, Math.min(1, sample - left));
		if (left === right || fraction === 0) {
			weights.push([{ index: left, weight: 1 }]);
		} else {
			weights.push([
				{ index: left, weight: 1 - fraction },
				{ index: right, weight: fraction },
			]);
		}
	}
	return weights;
}

/**
 * Resamples a pixel buffer from `oldWidth × oldHeight` to `newWidth × newHeight`.
 * - `"nearest"`: crisp pixel-art point sampling
 * - `"majority"`: block mode picking the most frequent color per cell
 * - `"smooth"`: premultiplied-alpha separable area/bilinear filter
 */
export function resamplePixels(
	data: PixelBuffer,
	oldWidth: number,
	oldHeight: number,
	newWidth: number,
	newHeight: number,
	algorithm: ResampleAlgorithm = "nearest"
): PixelBuffer {
	if (oldWidth === newWidth && oldHeight === newHeight) {
		return data.slice();
	}
	const result = createPixels(newWidth, newHeight);
	if (oldWidth <= 0 || oldHeight <= 0 || newWidth <= 0 || newHeight <= 0) {
		return result;
	}

	if (algorithm === "nearest") {
		for (let y = 0; y < newHeight; y++) {
			const sourceY = Math.min(
				oldHeight - 1,
				Math.floor(((y + 0.5) * oldHeight) / newHeight)
			);
			const sourceRow = sourceY * oldWidth;
			const targetRow = y * newWidth;
			for (let x = 0; x < newWidth; x++) {
				const sourceX = Math.min(
					oldWidth - 1,
					Math.floor(((x + 0.5) * oldWidth) / newWidth)
				);
				result[targetRow + x] = data[sourceRow + sourceX] ?? TRANSPARENT;
			}
		}
		return result;
	}

	if (algorithm === "majority") {
		const counts = new Map<number, number>();
		for (let y = 0; y < newHeight; y++) {
			const startY = Math.floor((y * oldHeight) / newHeight);
			const endY = Math.min(
				oldHeight,
				Math.max(startY + 1, Math.floor(((y + 1) * oldHeight) / newHeight))
			);
			const centerY = Math.min(
				oldHeight - 1,
				Math.floor(((y + 0.5) * oldHeight) / newHeight)
			);
			const targetRow = y * newWidth;
			for (let x = 0; x < newWidth; x++) {
				const startX = Math.floor((x * oldWidth) / newWidth);
				const endX = Math.min(
					oldWidth,
					Math.max(startX + 1, Math.floor(((x + 1) * oldWidth) / newWidth))
				);
				if (endX - startX === 1 && endY - startY === 1) {
					result[targetRow + x] =
						data[startY * oldWidth + startX] ?? TRANSPARENT;
					continue;
				}
				counts.clear();
				for (let sourceY = startY; sourceY < endY; sourceY++) {
					const sourceRow = sourceY * oldWidth;
					for (let sourceX = startX; sourceX < endX; sourceX++) {
						const color = data[sourceRow + sourceX] ?? TRANSPARENT;
						counts.set(color, (counts.get(color) ?? 0) + 1);
					}
				}
				const centerX = Math.min(
					oldWidth - 1,
					Math.floor(((x + 0.5) * oldWidth) / newWidth)
				);
				const centerColor = data[centerY * oldWidth + centerX] ?? TRANSPARENT;
				let bestColor = centerColor;
				let bestCount = -1;
				for (const [color, count] of counts) {
					if (count > bestCount) {
						bestColor = color;
						bestCount = count;
					} else if (count === bestCount) {
						const currentIsCenter = color === centerColor;
						const bestIsCenter = bestColor === centerColor;
						if (currentIsCenter && !bestIsCenter) {
							bestColor = color;
						} else if (
							!bestIsCenter &&
							packedAlpha(color) > 0 &&
							packedAlpha(bestColor) === 0
						) {
							bestColor = color;
						}
					}
				}
				result[targetRow + x] = bestColor;
			}
		}
		return result;
	}

	const weightsX = buildAxisWeights(oldWidth, newWidth);
	const weightsY = buildAxisWeights(oldHeight, newHeight);
	const sourceBytes = new Uint8Array(
		data.buffer,
		data.byteOffset,
		data.byteLength
	);
	const horizontal = new Float32Array(newWidth * oldHeight * 4);

	for (let y = 0; y < oldHeight; y++) {
		const sourceRow = y * oldWidth;
		const temporaryRow = y * newWidth;
		for (let x = 0; x < newWidth; x++) {
			const entries = weightsX[x] ?? [];
			let redSum = 0;
			let greenSum = 0;
			let blueSum = 0;
			let alphaSum = 0;
			for (const entry of entries) {
				const byteOffset = (sourceRow + entry.index) * 4;
				const alpha = (sourceBytes[byteOffset + 3] ?? 0) / 255;
				const weightedAlpha = alpha * entry.weight;
				redSum += (sourceBytes[byteOffset] ?? 0) * weightedAlpha;
				greenSum += (sourceBytes[byteOffset + 1] ?? 0) * weightedAlpha;
				blueSum += (sourceBytes[byteOffset + 2] ?? 0) * weightedAlpha;
				alphaSum += weightedAlpha;
			}
			const temporaryOffset = (temporaryRow + x) * 4;
			horizontal[temporaryOffset] = redSum;
			horizontal[temporaryOffset + 1] = greenSum;
			horizontal[temporaryOffset + 2] = blueSum;
			horizontal[temporaryOffset + 3] = alphaSum;
		}
	}

	const outputBytes = new Uint8ClampedArray(result.buffer);
	for (let y = 0; y < newHeight; y++) {
		const entries = weightsY[y] ?? [];
		const targetRow = y * newWidth;
		for (let x = 0; x < newWidth; x++) {
			let redSum = 0;
			let greenSum = 0;
			let blueSum = 0;
			let alphaSum = 0;
			for (const entry of entries) {
				const temporaryOffset = (entry.index * newWidth + x) * 4;
				const weight = entry.weight;
				redSum += (horizontal[temporaryOffset] ?? 0) * weight;
				greenSum += (horizontal[temporaryOffset + 1] ?? 0) * weight;
				blueSum += (horizontal[temporaryOffset + 2] ?? 0) * weight;
				alphaSum += (horizontal[temporaryOffset + 3] ?? 0) * weight;
			}
			const outputOffset = (targetRow + x) * 4;
			if (alphaSum <= 1e-6) {
				outputBytes[outputOffset] = 0;
				outputBytes[outputOffset + 1] = 0;
				outputBytes[outputOffset + 2] = 0;
				outputBytes[outputOffset + 3] = 0;
			} else {
				outputBytes[outputOffset] = Math.round(redSum / alphaSum);
				outputBytes[outputOffset + 1] = Math.round(greenSum / alphaSum);
				outputBytes[outputOffset + 2] = Math.round(blueSum / alphaSum);
				outputBytes[outputOffset + 3] = Math.round(alphaSum * 255);
			}
		}
	}

	return result;
}

export function extractClip(
	data: PixelBuffer,
	mask: SelectionMask,
	width: number,
	height: number
): Clip | null {
	const bounds = maskBounds(mask, width, height);
	if (!bounds) return null;
	const pixels = createPixels(bounds.width, bounds.height);
	const clipMask = createMask(bounds.width, bounds.height);
	for (let y = 0; y < bounds.height; y++) {
		for (let x = 0; x < bounds.width; x++) {
			const source = (bounds.y + y) * width + bounds.x + x;
			if (mask[source] !== 1) continue;
			pixels[y * bounds.width + x] = data[source] ?? TRANSPARENT;
			clipMask[y * bounds.width + x] = 1;
		}
	}
	return { ...bounds, pixels, mask: clipMask };
}

/** Places a clip inside a document of the given size. */
export function placeClip(
	clip: Clip,
	width: number,
	height: number
): { lifted: PixelBuffer; mask: SelectionMask } {
	const lifted = createPixels(width, height);
	const mask = createMask(width, height);
	const originX = Math.max(0, Math.min(clip.x, width - clip.width));
	const originY = Math.max(0, Math.min(clip.y, height - clip.height));
	for (let y = 0; y < clip.height; y++) {
		const targetY = originY + y;
		if (targetY >= height) break;
		for (let x = 0; x < clip.width; x++) {
			const targetX = originX + x;
			if (targetX >= width) break;
			const source = y * clip.width + x;
			if (clip.mask[source] !== 1) continue;
			lifted[targetY * width + targetX] = clip.pixels[source] ?? TRANSPARENT;
			mask[targetY * width + targetX] = 1;
		}
	}
	return { lifted, mask };
}

/* -------------------------------------------------------------------------- */
/*                                  Encoding                                  */
/* -------------------------------------------------------------------------- */

export function encodePixels(data: PixelBuffer): string {
	const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	let binary = "";
	const chunk = 0x80_00;
	for (let index = 0; index < bytes.length; index += chunk) {
		binary += String.fromCharCode.apply(
			null,
			Array.from(bytes.subarray(index, index + chunk))
		);
	}
	return btoa(binary);
}

export function decodePixels(
	encoded: string,
	pixelCount: number
): PixelBuffer | null {
	try {
		const binary = atob(encoded);
		if (binary.length !== pixelCount * 4) return null;
		const bytes = new Uint8Array(pixelCount * 4);
		for (let index = 0; index < binary.length; index++) {
			bytes[index] = binary.charCodeAt(index);
		}
		return new Uint32Array(bytes.buffer);
	} catch {
		return null;
	}
}

export function uniqueOpaqueColors(
	data: PixelBuffer,
	limit: number
): Array<number> {
	const colors = new Set<number>();
	for (const value of data) {
		if (value === TRANSPARENT) continue;
		colors.add(value);
		if (colors.size >= limit) break;
	}
	return [...colors];
}
