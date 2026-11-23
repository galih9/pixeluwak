import type {
	CustomBrush,
	CustomBrushOptions,
	PixelBuffer,
} from "../types";
import { hexToPacked, packedAlpha, TRANSPARENT } from "./color";
import { type PaintTarget, plot } from "./raster";

function createPatternBrush(
	id: string,
	name: string,
	rows: Array<string>,
	colorMap?: Record<string, string>
): CustomBrush {
	const height = rows.length;
	const width = rows[0]?.length ?? 1;
	const mask = new Uint8Array(width * height);
	const colors: PixelBuffer | undefined = colorMap
		? new Uint32Array(width * height)
		: undefined;
	const packedPalette: Record<string, number> = {};
	if (colorMap) {
		for (const [symbol, hex] of Object.entries(colorMap)) {
			packedPalette[symbol] = hexToPacked(hex);
		}
	}

	for (let row = 0; row < height; row++) {
		const line = rows[row] ?? "";
		for (let column = 0; column < width; column++) {
			const symbol = line[column] ?? ".";
			if (symbol === ".") continue;
			const index = row * width + column;
			mask[index] = 1;
			if (colors && packedPalette[symbol] !== undefined) {
				colors[index] = packedPalette[symbol] ?? TRANSPARENT;
			}
		}
	}
	return { id, name, width, height, mask, colors };
}

export const BUILTIN_CUSTOM_BRUSHES: Array<CustomBrush> = [
	createPatternBrush(
		"leaves",
		"Leaves",
		[
			"..12...",
			".1232..",
			"1232.12",
			".24.123",
			"...2324",
			"..1232.",
			"...24..",
		],
		{
			"1": "#a7f3d0",
			"2": "#22c55e",
			"3": "#15803d",
			"4": "#14532d",
		}
	),
	createPatternBrush(
		"grass",
		"Grass",
		[
			"1.....1",
			"2..1..2",
			"2.12..3",
			"3.23.23",
			"3233.34",
			".34434.",
			"..444..",
		],
		{
			"1": "#bef264",
			"2": "#4ade80",
			"3": "#16a34a",
			"4": "#166534",
		}
	),
	createPatternBrush(
		"hair",
		"Hair",
		[
			"....12.",
			"...123.",
			"..123..",
			".123.12",
			"123.23.",
			"23.23..",
			"3..3...",
		],
		{
			"1": "#fde68a",
			"2": "#d97706",
			"3": "#78350f",
		}
	),
	createPatternBrush(
		"foliage",
		"Foliage",
		[
			"..121....",
			".12321...",
			"12332.12.",
			".234.1232",
			"..12.2343",
			".1232.34.",
			"123432...",
			".2342....",
			"..34.....",
		],
		{
			"1": "#86efac",
			"2": "#22c55e",
			"3": "#15803d",
			"4": "#14532d",
		}
	),
	createPatternBrush(
		"sparkles",
		"Sparkles",
		[
			"...1...",
			"...2...",
			".1.1.1.",
			"1211121",
			".1.1.1.",
			"...2...",
			"...1...",
		],
		{
			"1": "#fef08a",
			"2": "#facc15",
		}
	),
	createPatternBrush(
		"cobble",
		"Cobble",
		[
			".112...",
			"1223...",
			"233..12",
			"....123",
			".12.233",
			"123....",
			"233....",
		],
		{
			"1": "#e2e8f0",
			"2": "#94a3b8",
			"3": "#475569",
		}
	),
	createPatternBrush("diamond", "Diamond", [
		"..#..",
		".###.",
		"#####",
		".###.",
		"..#..",
	]),
];

export function cloneCustomBrush(brush: CustomBrush): CustomBrush {
	return {
		...(brush.id ? { id: brush.id } : {}),
		...(brush.name ? { name: brush.name } : {}),
		width: brush.width,
		height: brush.height,
		mask: new Uint8Array(brush.mask),
		...(brush.colors ? { colors: new Uint32Array(brush.colors) } : {}),
	};
}

export function transformCustomBrush(
	brush: CustomBrush,
	flipX: boolean,
	flipY: boolean,
	quarterTurns: 0 | 1 | 2 | 3
): CustomBrush {
	const turns = ((quarterTurns % 4) + 4) % 4;
	const rotatedOdd = turns === 1 || turns === 3;
	const nextWidth = rotatedOdd ? brush.height : brush.width;
	const nextHeight = rotatedOdd ? brush.width : brush.height;
	const nextMask = new Uint8Array(nextWidth * nextHeight);
	const nextColors = brush.colors
		? new Uint32Array(nextWidth * nextHeight)
		: undefined;

	for (let row = 0; row < brush.height; row++) {
		for (let column = 0; column < brush.width; column++) {
			const sourceIndex = row * brush.width + column;
			const maskValue = brush.mask[sourceIndex] ?? 0;
			const colorValue = brush.colors?.[sourceIndex] ?? TRANSPARENT;

			const sx = flipX ? brush.width - 1 - column : column;
			const sy = flipY ? brush.height - 1 - row : row;

			let targetX = sx;
			let targetY = sy;
			if (turns === 1) {
				targetX = brush.height - 1 - sy;
				targetY = sx;
			} else if (turns === 2) {
				targetX = brush.width - 1 - sx;
				targetY = brush.height - 1 - sy;
			} else if (turns === 3) {
				targetX = sy;
				targetY = brush.width - 1 - sx;
			}

			const targetIndex = targetY * nextWidth + targetX;
			nextMask[targetIndex] = maskValue;
			if (nextColors) {
				nextColors[targetIndex] = colorValue;
			}
		}
	}

	return {
		...(brush.id ? { id: brush.id } : {}),
		...(brush.name ? { name: brush.name } : {}),
		width: nextWidth,
		height: nextHeight,
		mask: nextMask,
		...(nextColors ? { colors: nextColors } : {}),
	};
}

export function stampCustomBrush(
	target: PaintTarget,
	x: number,
	y: number,
	brush: CustomBrush,
	tintColor: number,
	options: CustomBrushOptions,
	randomFunction: () => number = Math.random
): void {
	const flipX = options.randomFlipX && randomFunction() >= 0.5;
	const flipY = options.randomFlipY && randomFunction() >= 0.5;
	const quarterTurns: 0 | 1 | 2 | 3 = options.randomRotate
		? (Math.floor(randomFunction() * 4) as 0 | 1 | 2 | 3)
		: 0;

	const stampedBrush =
		flipX || flipY || quarterTurns !== 0
			? transformCustomBrush(brush, flipX, flipY, quarterTurns)
			: brush;

	let centerX = x;
	let centerY = y;
	if (options.scatter > 0) {
		const angle = randomFunction() * Math.PI * 2;
		const distance = randomFunction() * options.scatter;
		centerX += Math.round(Math.cos(angle) * distance);
		centerY += Math.round(Math.sin(angle) * distance);
	}

	const startX = centerX - Math.floor((stampedBrush.width - 1) / 2);
	const startY = centerY - Math.floor((stampedBrush.height - 1) / 2);
	const useOriginalColors =
		options.colorMode === "original" && stampedBrush.colors !== undefined;

	for (let row = 0; row < stampedBrush.height; row++) {
		for (let column = 0; column < stampedBrush.width; column++) {
			const index = row * stampedBrush.width + column;
			if (stampedBrush.mask[index] !== 1) continue;
			const pixelColor = useOriginalColors
				? (stampedBrush.colors?.[index] ?? TRANSPARENT)
				: tintColor;
			if (useOriginalColors && packedAlpha(pixelColor) === 0) continue;
			plot(target, startX + column, startY + row, pixelColor);
		}
	}
}
