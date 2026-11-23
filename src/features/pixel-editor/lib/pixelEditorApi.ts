import { sequenceFor } from "./animation";
import {
	hexToPacked,
	normalizeHex,
	packedAlpha,
	packedToHex,
	rgbaToPacked,
	TRANSPARENT,
} from "./color";
import {
	exportGif as exportGifFile,
	exportSpriteSheet as exportSpriteSheetFile,
	renderSpriteSheet,
} from "./files";
import { encodeGif } from "./gif";
import {
	DEFAULT_SPRITE_SHEET_OPTIONS,
	type SpriteSheetMetadata,
} from "./spritesheet";
import {
	ellipsePoints,
	floodFill,
	linePoints,
	plot,
	rectanglePoints,
	rectMask,
	stamp,
} from "./raster";
import {
	compositeView,
	type EditorState,
	flattenedPixels,
	framePixels,
	useEditorStore,
} from "../store/editorStore";
import type {
	BrushShape,
	ColorInput,
	DrawCircleOptions,
	DrawLineOptions,
	DrawRectOptions,
	ExportImageOptions,
	FloodFillOptions,
	FrameInfo,
	FrameTag,
	LayerInfo,
	PaintTargetMeta,
	PixelBuffer,
	PixelEditorApi,
	PixelInfo,
	ResampleAlgorithm,
	ResizeAnchor,
	ResizeCanvasOptions,
	SpriteSheetOptions,
	Tool,
} from "../types";

const scratchBytes = new Uint8ClampedArray(4);
const scratchWord = new Uint32Array(scratchBytes.buffer);

const COMMON_NAMED_COLORS: Record<string, string> = {
	black: "#000000",
	white: "#ffffff",
	red: "#ff0000",
	green: "#00ff00",
	blue: "#0000ff",
	yellow: "#ffff00",
	cyan: "#00ffff",
	magenta: "#ff00ff",
	gray: "#808080",
	grey: "#808080",
	orange: "#ffa500",
	purple: "#800080",
	pink: "#ffc0cb",
	brown: "#8b4513",
};

/**
 * Parses any color input into a 32-bit packed color integer.
 * Accepts hex strings, rgb/rgba strings, named colors, objects ({r,g,b,a}), or packed uint32.
 */
export function parseColorInput(input: ColorInput): number {
	if (typeof input === "number") {
		return input >>> 0;
	}
	if (typeof input === "object" && input !== null) {
		const red = "red" in input ? input.red : "r" in input ? input.r : 0;
		const green = "green" in input ? input.green : "g" in input ? input.g : 0;
		const blue = "blue" in input ? input.blue : "b" in input ? input.b : 0;
		const rawAlpha =
			"alpha" in input ? input.alpha : "a" in input ? input.a : 255;
		let alpha = 255;
		if (rawAlpha !== undefined) {
			alpha =
				rawAlpha <= 1 && rawAlpha > 0
					? Math.round(rawAlpha * 255)
					: Math.max(0, Math.min(255, Math.round(rawAlpha)));
		}
		return rgbaToPacked(red, green, blue, alpha);
	}
	if (typeof input === "string") {
		const trimmed = input.trim().toLowerCase();
		if (trimmed === "" || trimmed === "transparent" || trimmed === "none") {
			return TRANSPARENT;
		}
		const namedHex = COMMON_NAMED_COLORS[trimmed];
		if (namedHex) {
			return hexToPacked(namedHex);
		}
		const rgbaMatch =
			/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(
				trimmed
			);
		if (rgbaMatch) {
			const red = Number.parseInt(rgbaMatch[1] ?? "0", 10);
			const green = Number.parseInt(rgbaMatch[2] ?? "0", 10);
			const blue = Number.parseInt(rgbaMatch[3] ?? "0", 10);
			const rawAlpha = rgbaMatch[4];
			let alpha = 255;
			if (rawAlpha !== undefined) {
				const numericAlpha = Number.parseFloat(rawAlpha);
				alpha =
					numericAlpha <= 1 && numericAlpha > 0
						? Math.round(numericAlpha * 255)
						: Math.max(0, Math.min(255, Math.round(numericAlpha)));
			}
			return rgbaToPacked(red, green, blue, alpha);
		}
		return hexToPacked(trimmed);
	}
	return TRANSPARENT;
}

/** Converts any supported color format into a `#rrggbb` hex string. */
export function colorToHex(input: ColorInput): string {
	const packed = parseColorInput(input);
	return packedToHex(packed);
}

/** Unpacks a 32-bit packed color into component channels and formatting strings. */
export function unpackColor(packed: number): PixelInfo {
	scratchWord[0] = packed;
	const red = scratchBytes[0] ?? 0;
	const green = scratchBytes[1] ?? 0;
	const blue = scratchBytes[2] ?? 0;
	const alpha = scratchBytes[3] ?? 0;
	const hex = packedToHex(packed);
	const rgbaString = `rgba(${red}, ${green}, ${blue}, ${(alpha / 255).toFixed(2)})`;
	return {
		red,
		green,
		blue,
		alpha,
		hex,
		rgbaString,
		isTransparent: alpha === 0,
		packed,
	};
}

/** Renders pixel buffer data to an offscreen HTML canvas element. */
export function pixelsToCanvas(
	pixels: PixelBuffer,
	width: number,
	height: number,
	scale = 1
): HTMLCanvasElement {
	const source = document.createElement("canvas");
	source.width = width;
	source.height = height;
	const sourceContext = source.getContext("2d");
	sourceContext?.putImageData(
		new ImageData(new Uint8ClampedArray(pixels.buffer.slice(0)), width, height),
		0,
		0
	);
	if (scale === 1) return source;
	const output = document.createElement("canvas");
	output.width = width * scale;
	output.height = height * scale;
	const outputContext = output.getContext("2d");
	if (outputContext) {
		outputContext.imageSmoothingEnabled = false;
		outputContext.drawImage(source, 0, 0, output.width, output.height);
	}
	return output;
}

/**
 * Executes a mutation function against a cloned active-layer pixel buffer and commits
 * it with full history undo/redo support.
 */
export function mutatePixels(
	mutator: (
		pixels: PixelBuffer,
		meta: { width: number; height: number; target: PaintTargetMeta }
	) => boolean | void
): boolean {
	const state = useEditorStore.getState();
	if (state.floating) {
		state.anchorFloating();
	}
	if (state.textDraft !== null) {
		state.cancelText();
	}

	const currentState = useEditorStore.getState();
	const { width, height } = currentState;
	const cloned = new Uint32Array(currentState.pixels);
	const target: PaintTargetMeta = {
		data: cloned,
		width,
		height,
		mask: currentState.selection,
		symmetryX: false,
		symmetryY: false,
	};

	const result = mutator(cloned, { width, height, target });
	if (result === false) {
		return false;
	}
	currentState.commitPixels(cloned);
	return true;
}

/* -------------------------------------------------------------------------- */
/*                                Pixel Readers                               */
/* -------------------------------------------------------------------------- */

export function getDimensions(): { width: number; height: number } {
	const state = useEditorStore.getState();
	return { width: state.width, height: state.height };
}

export function getPixel(
	x: number,
	y: number,
	options?: { layerIndex?: number; composite?: boolean }
): PixelInfo | null {
	const state = useEditorStore.getState();
	if (x < 0 || y < 0 || x >= state.width || y >= state.height) {
		return null;
	}
	let buffer: PixelBuffer;
	if (options?.composite) {
		buffer = compositeView(state);
	} else if (
		options?.layerIndex !== undefined &&
		options.layerIndex >= 0 &&
		options.layerIndex < state.layers.length
	) {
		const targetLayer = state.layers[options.layerIndex];
		buffer =
			options.layerIndex === state.activeLayer
				? state.pixels
				: (targetLayer?.pixels ?? state.pixels);
	} else {
		buffer = state.pixels;
	}
	const packed = buffer[y * state.width + x] ?? 0;
	return unpackColor(packed);
}

export function getPixelHex(
	x: number,
	y: number,
	options?: { layerIndex?: number; composite?: boolean }
): string | null {
	const pixel = getPixel(x, y, options);
	return pixel ? pixel.hex : null;
}

export function getPixels(options?: {
	layerIndex?: number;
	composite?: boolean;
}): PixelBuffer {
	const state = useEditorStore.getState();
	if (options?.composite) {
		return compositeView(state);
	}
	if (
		options?.layerIndex !== undefined &&
		options.layerIndex >= 0 &&
		options.layerIndex < state.layers.length
	) {
		const targetLayer = state.layers[options.layerIndex];
		return options.layerIndex === state.activeLayer
			? state.pixels
			: (targetLayer?.pixels ?? state.pixels);
	}
	return state.pixels;
}

export function getGrid(options?: {
	layerIndex?: number;
	composite?: boolean;
}): Array<Array<string | null>> {
	const state = useEditorStore.getState();
	const grid: Array<Array<string | null>> = [];
	const buffer = getPixels(options);
	for (let y = 0; y < state.height; y++) {
		const row: Array<string | null> = [];
		for (let x = 0; x < state.width; x++) {
			const packed = buffer[y * state.width + x] ?? 0;
			if (packedAlpha(packed) === 0) {
				row.push(null);
			} else {
				row.push(packedToHex(packed));
			}
		}
		grid.push(row);
	}
	return grid;
}

export function getAsciiArt(options?: {
	composite?: boolean;
	transparentChar?: string;
	opaqueChar?: string;
}): string {
	const state = useEditorStore.getState();
	const transparentCharacter = options?.transparentChar ?? ".";
	const opaqueCharacter = options?.opaqueChar ?? "#";
	const buffer = options?.composite ? compositeView(state) : state.pixels;
	const lines: Array<string> = [];
	for (let y = 0; y < state.height; y++) {
		let line = "";
		for (let x = 0; x < state.width; x++) {
			const packed = buffer[y * state.width + x] ?? 0;
			line +=
				packedAlpha(packed) === 0 ? transparentCharacter : opaqueCharacter;
		}
		lines.push(line);
	}
	return lines.join("\n");
}

export function toDataURL(options?: ExportImageOptions): string {
	const state = useEditorStore.getState();
	const scale = options?.scale ?? 1;
	const pixels =
		options?.composite === false ? state.pixels : flattenedPixels(state);
	const canvas = pixelsToCanvas(pixels, state.width, state.height, scale);
	return canvas.toDataURL("image/png");
}

/* -------------------------------------------------------------------------- */
/*                               Pixel Mutators                               */
/* -------------------------------------------------------------------------- */

export function setPixel(x: number, y: number, color: ColorInput): boolean {
	const packed = parseColorInput(color);
	return mutatePixels((pixels, { width, height }) => {
		if (x < 0 || y < 0 || x >= width || y >= height) return false;
		pixels[y * width + x] = packed;
		return true;
	});
}

export function setPixels(
	pixelList: Array<{ x: number; y: number; color: ColorInput }>
): number {
	let count = 0;
	mutatePixels((pixels, { width, height }) => {
		for (const item of pixelList) {
			if (item.x >= 0 && item.y >= 0 && item.x < width && item.y < height) {
				pixels[item.y * width + item.x] = parseColorInput(item.color);
				count++;
			}
		}
		return true;
	});
	return count;
}

export function drawLine(
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	color: ColorInput,
	options?: DrawLineOptions
): number {
	const packed = parseColorInput(color);
	const size = options?.size ?? 1;
	const shape: BrushShape = options?.shape ?? "square";
	let count = 0;
	mutatePixels((_, { target }) => {
		const points = linePoints(x0, y0, x1, y1);
		for (const point of points) {
			stamp(target, point.x, point.y, size, shape, packed);
			count++;
		}
		return true;
	});
	return count;
}

export function drawRect(
	x: number,
	y: number,
	width: number,
	height: number,
	color: ColorInput,
	options?: DrawRectOptions
): number {
	const packed = parseColorInput(color);
	const filled = options?.filled ?? false;
	const size = options?.size ?? 1;
	let count = 0;
	mutatePixels((_, { target }) => {
		const points = rectanglePoints(
			x,
			y,
			x + Math.max(0, width - 1),
			y + Math.max(0, height - 1),
			filled
		);
		for (const point of points.fill) {
			plot(target, point.x, point.y, packed);
			count++;
		}
		for (const point of points.outline) {
			stamp(target, point.x, point.y, size, "square", packed);
			count++;
		}
		return true;
	});
	return count;
}

export function drawCircle(
	centerX: number,
	centerY: number,
	radius: number,
	color: ColorInput,
	options?: DrawCircleOptions
): number {
	const packed = parseColorInput(color);
	const filled = options?.filled ?? false;
	let count = 0;
	mutatePixels((_, { target }) => {
		const points = ellipsePoints(
			centerX - radius,
			centerY - radius,
			centerX + radius,
			centerY + radius,
			filled
		);
		for (const point of points.fill) {
			plot(target, point.x, point.y, packed);
			count++;
		}
		for (const point of points.outline) {
			plot(target, point.x, point.y, packed);
			count++;
		}
		return true;
	});
	return count;
}

export function floodFillCanvas(
	x: number,
	y: number,
	color: ColorInput,
	options?: FloodFillOptions
): boolean {
	const packed = parseColorInput(color);
	const contiguous = options?.contiguous ?? true;
	let changed = false;
	mutatePixels((pixels, { width, height, target }) => {
		changed = floodFill(
			pixels,
			width,
			height,
			x,
			y,
			packed,
			contiguous,
			target.mask
		);
		return changed;
	});
	return changed;
}

export function clearCanvas(color?: ColorInput): void {
	const packed = color !== undefined ? parseColorInput(color) : TRANSPARENT;
	mutatePixels((pixels) => {
		pixels.fill(packed);
		return true;
	});
}

export function loadGrid(
	grid: Array<Array<ColorInput | null | undefined>>,
	originX = 0,
	originY = 0
): number {
	let count = 0;
	mutatePixels((pixels, { width, height }) => {
		for (let rowIndex = 0; rowIndex < grid.length; rowIndex++) {
			const row = grid[rowIndex];
			if (!row) continue;
			const y = originY + rowIndex;
			if (y < 0 || y >= height) continue;
			for (let columnIndex = 0; columnIndex < row.length; columnIndex++) {
				const x = originX + columnIndex;
				if (x < 0 || x >= width) continue;
				const cellColor = row[columnIndex];
				if (cellColor !== null && cellColor !== undefined) {
					pixels[y * width + x] = parseColorInput(cellColor);
					count++;
				}
			}
		}
		return true;
	});
	return count;
}

export function loadAsciiArt(
	art: string,
	paletteMap: Record<string, ColorInput | null | undefined>,
	originX = 0,
	originY = 0
): number {
	const rawLines = art.split("\n");
	while (rawLines.length > 0 && rawLines[0]?.trim() === "") rawLines.shift();
	while (rawLines.length > 0 && rawLines[rawLines.length - 1]?.trim() === "") {
		rawLines.pop();
	}

	let minIndent = Number.POSITIVE_INFINITY;
	for (const line of rawLines) {
		if (line.trim().length === 0) continue;
		const indentMatch = /^[ \t]*/.exec(line);
		const indentLength = indentMatch ? indentMatch[0].length : 0;
		if (indentLength < minIndent) {
			minIndent = indentLength;
		}
	}

	const lines = rawLines.map((line) =>
		minIndent < Number.POSITIVE_INFINITY ? line.slice(minIndent) : line
	);

	let count = 0;
	mutatePixels((pixels, { width, height }) => {
		for (let rowIndex = 0; rowIndex < lines.length; rowIndex++) {
			const line = lines[rowIndex];
			if (line === undefined) continue;
			const y = originY + rowIndex;
			if (y < 0 || y >= height) continue;
			for (let columnIndex = 0; columnIndex < line.length; columnIndex++) {
				const x = originX + columnIndex;
				if (x < 0 || x >= width) continue;
				const character = line[columnIndex];
				if (character === undefined) continue;
				const mappedColor = paletteMap[character];
				if (mappedColor !== null && mappedColor !== undefined) {
					pixels[y * width + x] = parseColorInput(mappedColor);
					count++;
				}
			}
		}
		return true;
	});
	return count;
}

export function loadPixels(data: PixelBuffer | ArrayLike<number>): void {
	mutatePixels((pixels) => {
		pixels.set(data);
		return true;
	});
}

/* -------------------------------------------------------------------------- */
/*                                App Controls                                */
/* -------------------------------------------------------------------------- */

export function newCanvas(width: number, height: number): void {
	useEditorStore.getState().newCanvas(width, height);
}

export function resizeCanvas(
	width: number,
	height: number,
	options: ResizeAnchor | ResizeCanvasOptions = "center"
): void {
	useEditorStore.getState().resizeCanvas(width, height, options);
}

export function scaleCanvas(
	width: number,
	height: number,
	algorithm: ResampleAlgorithm = "nearest"
): void {
	useEditorStore
		.getState()
		.resizeCanvas(width, height, { mode: "scale", algorithm });
}

export function undo(): void {
	useEditorStore.getState().undo();
}

export function redo(): void {
	useEditorStore.getState().redo();
}

export function canUndo(): boolean {
	return useEditorStore.getState().undoStack.length > 0;
}

export function canRedo(): boolean {
	return useEditorStore.getState().redoStack.length > 0;
}

export function getLayers(): Array<LayerInfo> {
	const state = useEditorStore.getState();
	return state.layers.map((layer, index) => ({
		id: layer.id,
		name: layer.name,
		kind: layer.kind ?? "pixel",
		visible: layer.visible,
		locked: layer.locked ?? false,
		opacity: layer.opacity,
		isActive: index === state.activeLayer,
	}));
}

export function getActiveLayerIndex(): number {
	return useEditorStore.getState().activeLayer;
}

export function setActiveLayer(index: number): void {
	useEditorStore.getState().setActiveLayer(index);
}

export function addLayer(): void {
	useEditorStore.getState().addLayer();
}

export function deleteLayer(): void {
	useEditorStore.getState().deleteLayer();
}

export function getFrames(): Array<FrameInfo> {
	const state = useEditorStore.getState();
	return state.frames.map((frame, index) => ({
		id: frame.id,
		duration: frame.duration,
		isCurrent: index === state.currentFrame,
	}));
}

export function getCurrentFrameIndex(): number {
	return useEditorStore.getState().currentFrame;
}

export function setCurrentFrame(index: number): void {
	useEditorStore.getState().setCurrentFrame(index);
}

export function addFrame(): void {
	useEditorStore.getState().addFrame();
}

export function duplicateFrame(): void {
	useEditorStore.getState().duplicateFrame();
}

export function deleteFrame(): void {
	useEditorStore.getState().deleteFrame();
}

export function moveFrame(from: number, to: number): void {
	useEditorStore.getState().moveFrame(from, to);
}

export function setFrameDuration(index: number, duration: number): void {
	useEditorStore.getState().setFrameDuration(index, duration);
}

export function setFramesDuration(
	from: number,
	to: number,
	duration: number
): void {
	useEditorStore.getState().setFramesDuration(from, to, duration);
}

export function nextFrame(): void {
	const state = useEditorStore.getState();
	if (state.frames.length <= 1) return;
	const next = (state.currentFrame + 1) % state.frames.length;
	state.setCurrentFrame(next);
}

export function previousFrame(): void {
	const state = useEditorStore.getState();
	if (state.frames.length <= 1) return;
	const previous =
		(state.currentFrame - 1 + state.frames.length) % state.frames.length;
	state.setCurrentFrame(previous);
}

export function play(): void {
	useEditorStore.getState().setPlaying(true);
}

export function pause(): void {
	useEditorStore.getState().setPlaying(false);
}

export function togglePlaying(): void {
	useEditorStore.getState().togglePlaying();
}

export function isPlaying(): boolean {
	return useEditorStore.getState().playing;
}

export function setPlayTag(id: number | null): void {
	useEditorStore.getState().setPlayTag(id);
}

export function getPlayTag(): number | null {
	return useEditorStore.getState().playTag;
}

export function getTags(): Array<FrameTag> {
	return useEditorStore.getState().tags;
}

export function addTag(
	from: number,
	to: number,
	options?: Partial<Omit<FrameTag, "id">>
): FrameTag | null {
	const state = useEditorStore.getState();
	const previousIds = new Set(state.tags.map((tag) => tag.id));
	state.addTag(from, to);
	const updatedState = useEditorStore.getState();
	const created = updatedState.tags.find((tag) => !previousIds.has(tag.id));
	if (created && options) {
		updatedState.updateTag(created.id, options);
		return (
			useEditorStore.getState().tags.find((tag) => tag.id === created.id) ??
			created
		);
	}
	return created ?? null;
}

export function updateTag(
	id: number,
	patch: Partial<Omit<FrameTag, "id">>
): void {
	useEditorStore.getState().updateTag(id, patch);
}

export function deleteTag(id: number): void {
	useEditorStore.getState().deleteTag(id);
}

export function toggleOnionSkin(): void {
	useEditorStore.getState().toggleOnionSkin();
}

export function isOnionSkinEnabled(): boolean {
	return useEditorStore.getState().onionSkin;
}

export function setOnionRange(before: number, after: number): void {
	useEditorStore.getState().setOnionRange(before, after);
}

export function getOnionRange(): { before: number; after: number } {
	const state = useEditorStore.getState();
	return { before: state.onionBefore, after: state.onionAfter };
}

export function getFramePixels(frameIndex: number): PixelBuffer {
	const state = useEditorStore.getState();
	return framePixels(state, frameIndex);
}

export function getFrameGrid(frameIndex: number): Array<Array<string | null>> {
	const state = useEditorStore.getState();
	const buffer = framePixels(state, frameIndex);
	const grid: Array<Array<string | null>> = [];
	for (let y = 0; y < state.height; y++) {
		const row: Array<string | null> = [];
		for (let x = 0; x < state.width; x++) {
			const packed = buffer[y * state.width + x] ?? 0;
			if (packedAlpha(packed) === 0) {
				row.push(null);
			} else {
				row.push(packedToHex(packed));
			}
		}
		grid.push(row);
	}
	return grid;
}

export function toGifDataURL(options?: {
	scale?: number;
	tagId?: number | null;
}): string {
	const state = useEditorStore.getState();
	const tag =
		options?.tagId !== undefined && options.tagId !== null
			? (state.tags.find((candidate) => candidate.id === options.tagId) ?? null)
			: null;
	const sequence = sequenceFor(tag, state.frames.length);
	const cache = new Map<number, PixelBuffer>();
	const frames = sequence.map((index) => {
		let pixels = cache.get(index);
		if (!pixels) {
			pixels = framePixels(state, index);
			cache.set(index, pixels);
		}
		return { pixels, duration: state.frames[index]?.duration ?? 100 };
	});
	const { bytes } = encodeGif({
		width: state.width,
		height: state.height,
		frames,
		scale: options?.scale ?? 1,
	});
	let binary = "";
	for (let index = 0; index < bytes.length; index++) {
		binary += String.fromCharCode(bytes[index] ?? 0);
	}
	return `data:image/gif;base64,${btoa(binary)}`;
}

export function exportGifDownload(options?: {
	scale?: number;
	tagId?: number | null;
	fileName?: string;
}): void {
	exportGifFile(options?.scale ?? 1, options?.tagId ?? null, options?.fileName);
}

/**
 * Lays every frame out on one sheet (see `SpriteSheetOptions`) and returns its
 * pixels plus a description of where each frame is. Null if it is too large.
 */
export function getSpriteSheet(options?: Partial<SpriteSheetOptions>): {
	width: number;
	height: number;
	pixels: PixelBuffer;
	metadata: SpriteSheetMetadata;
} | null {
	const sheet = renderSpriteSheet({
		...DEFAULT_SPRITE_SHEET_OPTIONS,
		...options,
	});
	if (!sheet) return null;
	return {
		width: sheet.width,
		height: sheet.height,
		pixels: sheet.pixels,
		metadata: sheet.metadata,
	};
}

export function exportSpriteSheetDownload(
	options?: Partial<SpriteSheetOptions> & {
		fileName?: string;
		withJson?: boolean;
	}
): boolean {
	const { fileName, withJson, ...rest } = options ?? {};
	return exportSpriteSheetFile(
		{ ...DEFAULT_SPRITE_SHEET_OPTIONS, ...rest },
		fileName,
		withJson ?? false
	);
}

export function getTool(): Tool {
	return useEditorStore.getState().tool;
}

export function setTool(tool: Tool): void {
	useEditorStore.getState().setTool(tool);
}

export function getColors(): {
	primaryColor: string;
	secondaryColor: string;
	palette: Array<string>;
} {
	const state = useEditorStore.getState();
	return {
		primaryColor: state.primaryColor,
		secondaryColor: state.secondaryColor,
		palette: state.palette,
	};
}

export function setPrimaryColor(color: ColorInput): void {
	const hex = colorToHex(color);
	useEditorStore.getState().setPrimaryColor(normalizeHex(hex));
}

export function setSecondaryColor(color: ColorInput): void {
	const hex = colorToHex(color);
	useEditorStore.getState().setSecondaryColor(normalizeHex(hex));
}

export function setPalette(palette: Array<string>): void {
	useEditorStore.getState().setPalette(palette);
}

export function selectAll(): void {
	useEditorStore.getState().selectAll();
}

export function deselect(): void {
	useEditorStore.getState().deselect();
}

export function setSelectionRect(
	x: number,
	y: number,
	width: number,
	height: number
): void {
	const state = useEditorStore.getState();
	const mask = rectMask(
		state.width,
		state.height,
		x,
		y,
		x + Math.max(0, width - 1),
		y + Math.max(0, height - 1)
	);
	state.setSelection(mask);
}

export function deleteSelection(): void {
	useEditorStore.getState().deleteSelection();
}

export function fitView(): void {
	useEditorStore.getState().fitView();
}

export function showNotice(message: string): void {
	useEditorStore.getState().showNotice(message);
}

export function getState(): EditorState {
	return useEditorStore.getState();
}

export function subscribe(
	listener: (state: EditorState, previous: EditorState) => void
): () => void {
	return useEditorStore.subscribe(listener);
}

declare global {
	interface Window {
		pixelEditor?: PixelEditorApi<EditorState>;
	}
}

/** Complete pixelEditorApi object instance */
export const pixelEditorApi: PixelEditorApi<EditorState> = {
	getDimensions,
	getSize: getDimensions,
	getPixel,
	getPixelHex,
	getPixels,
	getGrid,
	getAsciiArt,
	toDataURL,

	setPixel,
	setPixels,
	drawLine,
	drawRect,
	drawCircle,
	floodFill: floodFillCanvas,
	clear: clearCanvas,
	loadGrid,
	loadAsciiArt,
	loadPixels,
	mutatePixels,

	newCanvas,
	resizeCanvas,
	scaleCanvas,
	undo,
	redo,
	canUndo,
	canRedo,

	getLayers,
	getActiveLayerIndex,
	setActiveLayer,
	addLayer,
	deleteLayer,
	getFrames,
	getCurrentFrameIndex,
	setCurrentFrame,
	addFrame,
	duplicateFrame,
	deleteFrame,
	moveFrame,
	setFrameDuration,
	setFramesDuration,
	nextFrame,
	previousFrame,
	prevFrame: previousFrame,

	play,
	pause,
	togglePlaying,
	isPlaying,
	setPlayTag,
	getPlayTag,
	getTags,
	addTag,
	updateTag,
	deleteTag,

	toggleOnionSkin,
	isOnionSkinEnabled,
	setOnionRange,
	getOnionRange,

	getFramePixels,
	getFrameGrid,
	toGifDataURL,
	exportGif: exportGifDownload,
	getSpriteSheet,
	exportSpriteSheet: exportSpriteSheetDownload,

	getTool,
	setTool,
	getColors,
	setPrimaryColor,
	setSecondaryColor,
	setPalette,

	selectAll,
	deselect,
	setSelectionRect,
	deleteSelection,

	fitView,
	showNotice,

	getState,
	subscribe,
};
