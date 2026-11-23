import type {
	GradientOptions,
	Layer,
	PerspectiveGuideSettings,
	PixelBuffer,
	Point,
	RulerGridSettings,
	SelectionMask,
	SprayOptions,
} from "../types";
import {
	hexToRgb,
	packedAlpha,
	rgbaToPacked,
} from "./color";
import {
	type Bounds,
	createMask,
	ditherPatternSample,
	maskBounds,
	type PaintTarget,
	plot,
	regionMask,
	stamp,
	symmetricPoints,
} from "./raster";

/* -------------------------------------------------------------------------- */
/*                                    Spray                                   */
/* -------------------------------------------------------------------------- */

export function stampSpray(
	target: PaintTarget,
	centerX: number,
	centerY: number,
	color: number,
	options: SprayOptions,
	randomFunction: () => number = Math.random
): void {
	const radius = Math.max(1, options.radius);
	const density = Math.max(1, Math.min(100, options.density));
	const dotSize = Math.max(1, Math.min(4, Math.round(options.dotSize)));
	const dotCount = Math.max(
		1,
		Math.min(200, Math.round((Math.PI * radius * radius * density) / 350))
	);

	for (let index = 0; index < dotCount; index++) {
		const angle = randomFunction() * Math.PI * 2;
		const radial =
			options.distribution === "gaussian"
				? ((randomFunction() + randomFunction() + randomFunction()) / 3) *
					radius
				: Math.sqrt(randomFunction()) * radius;
		const px = centerX + Math.round(Math.cos(angle) * radial);
		const py = centerY + Math.round(Math.sin(angle) * radial);
		if (dotSize <= 1) {
			plot(target, px, py, color);
		} else {
			stamp(target, px, py, dotSize, "square", color);
		}
	}
}

/* -------------------------------------------------------------------------- */
/*                                  Gradient                                  */
/* -------------------------------------------------------------------------- */

function hashNoise(x: number, y: number): number {
	let hash = (Math.imul(x + 374761393, 668265263) ^ Math.imul(y + 1274126177, 2246822519)) >>> 0;
	hash = Math.imul(hash ^ (hash >>> 13), 1274126177) >>> 0;
	return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
}

function interpolatePacked(
	startRgb: [number, number, number],
	endRgb: [number, number, number],
	ratio: number
): number {
	const red = Math.round(startRgb[0] + (endRgb[0] - startRgb[0]) * ratio);
	const green = Math.round(startRgb[1] + (endRgb[1] - startRgb[1]) * ratio);
	const blue = Math.round(startRgb[2] + (endRgb[2] - startRgb[2]) * ratio);
	return rgbaToPacked(red, green, blue, 255);
}

export function fillGradient(
	target: PaintTarget,
	basePixels: PixelBuffer,
	start: Point,
	end: Point,
	primaryHex: string,
	secondaryHex: string,
	options: GradientOptions,
	regionSeed?: Point
): boolean {
	const { width, height } = target;
	let areaMask: SelectionMask | null = target.mask;

	if (
		options.regionOnly &&
		regionSeed &&
		regionSeed.x >= 0 &&
		regionSeed.y >= 0 &&
		regionSeed.x < width &&
		regionSeed.y < height
	) {
		const seeds = symmetricPoints(
			{
				width,
				height,
				mask: target.mask,
				symmetryX: target.symmetryX,
				symmetryY: target.symmetryY,
				symmetryXPos: target.symmetryXPos,
				symmetryYPos: target.symmetryYPos,
			},
			regionSeed.x,
			regionSeed.y
		);
		const combined = createMask(width, height);
		for (const seed of seeds) {
			const region = regionMask(
				basePixels,
				width,
				height,
				seed.x,
				seed.y,
				options.contiguous,
				target.mask
			);
			for (let index = 0; index < region.length; index++) {
				if (region[index] === 1) combined[index] = 1;
			}
		}
		areaMask = combined;
	}

	let effectiveStart = start;
	let effectiveEnd = end;
	if (start.x === end.x && start.y === end.y) {
		const bounds: Bounds =
			(areaMask ? maskBounds(areaMask, width, height) : null) ?? {
				x: 0,
				y: 0,
				width,
				height,
			};
		if (options.type === "linear") {
			const midX = bounds.x + Math.floor(bounds.width / 2);
			effectiveStart = { x: midX, y: bounds.y };
			effectiveEnd = {
				x: midX,
				y: Math.max(bounds.y + 1, bounds.y + bounds.height - 1),
			};
		} else {
			const centerX = bounds.x + Math.floor(bounds.width / 2);
			const centerY = bounds.y + Math.floor(bounds.height / 2);
			effectiveStart = { x: centerX, y: centerY };
			effectiveEnd = {
				x: Math.max(centerX + 1, bounds.x + bounds.width - 1),
				y: Math.max(centerY + 1, bounds.y + bounds.height - 1),
			};
		}
	}

	const startColor = options.reverse ? secondaryHex : primaryHex;
	const endColor = options.reverse ? primaryHex : secondaryHex;
	const startRgb = hexToRgb(startColor);
	const endRgb = hexToRgb(endColor);
	const startPacked = rgbaToPacked(startRgb[0], startRgb[1], startRgb[2], 255);
	const endPacked = rgbaToPacked(endRgb[0], endRgb[1], endRgb[2], 255);

	const dx = effectiveEnd.x - effectiveStart.x;
	const dy = effectiveEnd.y - effectiveStart.y;
	const lengthSquared = dx * dx + dy * dy;
	const radius = Math.max(1, Math.hypot(dx, dy));
	const diamondRadius = Math.max(1, Math.abs(dx) + Math.abs(dy));

	let changed = false;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const index = y * width + x;
			if (areaMask && areaMask[index] !== 1) continue;

			let ratio = 0;
			if (options.type === "linear") {
				if (lengthSquared > 0) {
					ratio =
						((x - effectiveStart.x) * dx + (y - effectiveStart.y) * dy) /
						lengthSquared;
				}
			} else if (options.type === "radial") {
				ratio = Math.hypot(x - effectiveStart.x, y - effectiveStart.y) / radius;
			} else {
				ratio =
					(Math.abs(x - effectiveStart.x) + Math.abs(y - effectiveStart.y)) /
					diamondRadius;
			}
			const clamped = Math.max(0, Math.min(1, ratio));

			let nextColor: number;
			if (options.dither === "smooth") {
				const stepped =
					options.steps >= 2
						? Math.round(clamped * (options.steps - 1)) / (options.steps - 1)
						: clamped;
				nextColor = interpolatePacked(startRgb, endRgb, stepped);
			} else {
				const bandCount = options.steps >= 2 ? options.steps - 1 : 1;
				const scaled = clamped * bandCount;
				const lowBand = Math.min(bandCount - 1, Math.floor(scaled));
				const localRatio = scaled - lowBand;
				let pickHigh: boolean;
				if (options.dither === "noise") {
					pickHigh = hashNoise(x, y) < localRatio;
				} else if (options.dither === "checker") {
					pickHigh = localRatio >= 0.5 ? true : localRatio > 0 && ((x + y) & 1) === 0;
				} else {
					pickHigh = ditherPatternSample(
						x,
						y,
						options.dither,
						localRatio * 100
					);
				}
				const selectedBand = lowBand + (pickHigh ? 1 : 0);
				if (bandCount === 1) {
					nextColor = selectedBand === 0 ? startPacked : endPacked;
				} else {
					nextColor = interpolatePacked(
						startRgb,
						endRgb,
						selectedBand / bandCount
					);
				}
			}

			if (target.data[index] !== nextColor) {
				target.data[index] = nextColor;
				changed = true;
			}
		}
	}
	return changed;
}

/* -------------------------------------------------------------------------- */
/*                                 Ruler Grid                                 */
/* -------------------------------------------------------------------------- */

export function gridCellBounds(
	pixel: Point,
	grid: Pick<RulerGridSettings, "cellWidth" | "cellHeight" | "offsetX" | "offsetY">,
	canvasWidth: number,
	canvasHeight: number
): Bounds {
	const cellW = Math.max(1, Math.round(grid.cellWidth));
	const cellH = Math.max(1, Math.round(grid.cellHeight));
	const colIndex = Math.floor((pixel.x - grid.offsetX) / cellW);
	const rowIndex = Math.floor((pixel.y - grid.offsetY) / cellH);
	const rawX = colIndex * cellW + grid.offsetX;
	const rawY = rowIndex * cellH + grid.offsetY;
	const left = Math.max(0, rawX);
	const top = Math.max(0, rawY);
	const right = Math.min(canvasWidth, rawX + cellW);
	const bottom = Math.min(canvasHeight, rawY + cellH);
	return {
		x: left,
		y: top,
		width: Math.max(0, right - left),
		height: Math.max(0, bottom - top),
	};
}

export function snapPointToGrid(
	pixel: Point,
	grid: Pick<RulerGridSettings, "cellWidth" | "cellHeight" | "offsetX" | "offsetY">,
	canvasWidth: number,
	canvasHeight: number
): Point {
	const cellW = Math.max(1, Math.round(grid.cellWidth));
	const cellH = Math.max(1, Math.round(grid.cellHeight));
	const snappedX =
		Math.floor((pixel.x - grid.offsetX) / cellW) * cellW + grid.offsetX;
	const snappedY =
		Math.floor((pixel.y - grid.offsetY) / cellH) * cellH + grid.offsetY;
	return {
		x: Math.max(0, Math.min(canvasWidth - 1, snappedX)),
		y: Math.max(0, Math.min(canvasHeight - 1, snappedY)),
	};
}

export function intersectMaskWithRect(
	selection: SelectionMask | null,
	bounds: Bounds,
	width: number,
	height: number
): SelectionMask {
	const result = createMask(width, height);
	const left = Math.max(0, bounds.x);
	const top = Math.max(0, bounds.y);
	const right = Math.min(width, bounds.x + bounds.width);
	const bottom = Math.min(height, bounds.y + bounds.height);
	for (let y = top; y < bottom; y++) {
		for (let x = left; x < right; x++) {
			const index = y * width + x;
			if (!selection || selection[index] === 1) {
				result[index] = 1;
			}
		}
	}
	return result;
}

/* -------------------------------------------------------------------------- */
/*                                Layer Picker                                */
/* -------------------------------------------------------------------------- */

export function pickLayerAtPoint(
	layers: Array<Layer>,
	activeLayerIndex: number,
	activePixels: PixelBuffer,
	width: number,
	height: number,
	documentPoint: Point,
	pixelPoint: Point
): { layerIndex: number; layer: Layer } | null {
	const insideCanvas =
		pixelPoint.x >= 0 &&
		pixelPoint.y >= 0 &&
		pixelPoint.x < width &&
		pixelPoint.y < height;
	const pixelIndex = pixelPoint.y * width + pixelPoint.x;

	for (let index = layers.length - 1; index >= 0; index--) {
		const layer = layers[index];
		if (!layer || !layer.visible || layer.opacity <= 0) continue;
		if (layer.kind === "reference" && layer.reference) {
			const reference = layer.reference;
			if (
				documentPoint.x >= reference.x &&
				documentPoint.x <= reference.x + reference.width &&
				documentPoint.y >= reference.y &&
				documentPoint.y <= reference.y + reference.height
			) {
				return { layerIndex: index, layer };
			}
			continue;
		}
		if (!insideCanvas) continue;
		const buffer = index === activeLayerIndex ? activePixels : layer.pixels;
		const value = buffer[pixelIndex] ?? 0;
		if (packedAlpha(value) > 0) {
			return { layerIndex: index, layer };
		}
	}
	return null;
}

/* -------------------------------------------------------------------------- */
/*                             Perspective Guides                             */
/* -------------------------------------------------------------------------- */

export type ResolvedPerspectivePoints = {
	horizonY: number;
	point1: Point;
	point2: Point;
	point3: Point;
	center: Point;
	radius: number;
};

export function resolvePerspectivePoints(
	settings: PerspectiveGuideSettings,
	width: number,
	height: number
): ResolvedPerspectivePoints {
	const horizonY = settings.horizonY ?? Math.round(height * 0.45 * 10) / 10;
	const defaultPoint1: Point =
		settings.mode === "1-point"
			? { x: width / 2, y: horizonY }
			: { x: -Math.round(width * 0.25), y: horizonY };
	const point1 = settings.point1
		? {
				x: settings.point1.x,
				y: settings.mode === "1-point" ? settings.point1.y : horizonY,
			}
		: defaultPoint1;
	const point2 = settings.point2
		? { x: settings.point2.x, y: horizonY }
		: { x: Math.round(width * 1.25), y: horizonY };
	const defaultThirdY =
		settings.thirdPointDirection === "top"
			? -Math.round(height * 0.8)
			: Math.round(height * 1.8);
	const point3 = settings.point3 ?? { x: width / 2, y: defaultThirdY };
	const center = settings.point1 ?? { x: width / 2, y: height / 2 };
	const radius = Math.max(4, settings.fisheyeRadius);
	return {
		horizonY: settings.mode === "1-point" ? point1.y : horizonY,
		point1,
		point2,
		point3,
		center,
		radius,
	};
}

export function computeFisheyeArcs(
	center: Point,
	radius: number,
	lineCount: number,
	curvature: number
): Array<Array<number>> {
	const curves: Array<Array<number>> = [];
	const pairs = Math.max(2, Math.round(lineCount / 2));
	const curveStrength = Math.max(0.05, Math.min(1, curvature / 100));
	const segments = 28;

	// Horizontal-ish meridians (connecting West pole to East pole)
	for (let step = 1; step <= pairs; step++) {
		const fraction = (step / (pairs + 1)) * curveStrength;
		for (const sign of [-1, 1]) {
			const sag = sign * fraction * radius;
			const points: Array<number> = [];
			for (let segment = 0; segment <= segments; segment++) {
				const t = (segment / segments) * 2 - 1; // -1 to 1
				const px = center.x + t * radius;
				const py = center.y + sag * (1 - t * t);
				points.push(px, py);
			}
			curves.push(points);
		}
	}

	// Vertical-ish meridians (connecting North pole to South pole)
	for (let step = 1; step <= pairs; step++) {
		const fraction = (step / (pairs + 1)) * curveStrength;
		for (const sign of [-1, 1]) {
			const sag = sign * fraction * radius;
			const points: Array<number> = [];
			for (let segment = 0; segment <= segments; segment++) {
				const t = (segment / segments) * 2 - 1;
				const py = center.y + t * radius;
				const px = center.x + sag * (1 - t * t);
				points.push(px, py);
			}
			curves.push(points);
		}
	}

	return curves;
}
