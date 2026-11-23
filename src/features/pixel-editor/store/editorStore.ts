import { create } from "zustand";
import {
	DEFAULT_CANVAS_SIZE,
	DEFAULT_COLOR_RAMP,
	DEFAULT_CUSTOM_BRUSH_OPTIONS,
	DEFAULT_GRADIENT_OPTIONS,
	DEFAULT_PALETTE,
	DEFAULT_PERSPECTIVE_GUIDE,
	DEFAULT_RULER_GRID,
	DEFAULT_SPRAY_OPTIONS,
	DEFAULT_TILED_PREVIEW,
	MAX_BRUSH_SIZE,
	MAX_CANVAS_SIZE,
	MAX_FRAMES,
	MAX_HISTORY,
	MAX_LAYERS,
	MIN_CANVAS_SIZE,
	ZOOM_LEVELS,
} from "../constants";
import { BUILTIN_CUSTOM_BRUSHES, cloneCustomBrush } from "../lib/brushPresets";
import {
	celsOf,
	clampDuration,
	clampTags,
	compositeFrame,
	createFrame,
	createTag,
	isEmptyCel,
	layersForFrame,
	mapCels,
	moveItem,
	tagsAfterDelete,
	tagsAfterInsert,
	withoutCel,
} from "../lib/animation";
import { hexToPacked, normalizeHex, stepColorShade } from "../lib/color";
import {
	blurPixels,
	computeOutline,
	countOpaque,
	type OutlineOptions,
	overlayPixels,
} from "../lib/filters";
import {
	compositeLayers,
	createLayer,
	createReferenceLayer,
	nextLayerName,
} from "../lib/layers";
import { type DocumentData, loadAutosave } from "../lib/persistence";
import { renderText } from "../lib/text";
import {
	captureBrushFromSelection,
	combineMasks,
	compositeFloating,
	createDefaultCustomBrush,
	createPixels,
	eraseMasked,
	extractClip,
	flipPixels,
	fullMask,
	invertMask,
	liftPixels,
	type PaintTarget,
	plot,
	maskIsEmpty,
	placeClip,
	replaceColorInBuffer,
	resamplePixels,
	resizeAnchorOffset,
	resizePixels,
	shiftMask,
} from "../lib/raster";
import type {
	BrushShape,
	Clip,
	ColorRampOptions,
	CustomBrush,
	CustomBrushOptions,
	DialogKind,
	DitherPattern,
	Floating,
	Frame,
	FrameTag,
	GradientOptions,
	Layer,
	Notice,
	PerspectiveGuideSettings,
	PixelBuffer,
	Point,
	ReferenceImageData,
	ReplaceScope,
	ResampleAlgorithm,
	ResizeAnchor,
	ResizeCanvasOptions,
	ResizeMode,
	RulerGridSettings,
	SelectionMask,
	SelectionMode,
	Snapshot,
	SprayOptions,
	TextStyle,
	TiledPreviewSettings,
	Tool,
} from "../types";

type DocumentState = {
	name: string;
	width: number;
	height: number;
	/** Pixels of the active layer (the live copy, see `Layer`). */
	pixels: PixelBuffer;
	/** Bottom → top. Shared by every frame; pixels are the current frame's. */
	layers: Array<Layer>;
	activeLayer: number;
	/** Animation frames (see `Frame`: the current one's cels can be stale). */
	frames: Array<Frame>;
	currentFrame: number;
	tags: Array<FrameTag>;
	selection: SelectionMask | null;
	floating: Floating | null;
	undoStack: Array<Snapshot>;
	redoStack: Array<Snapshot>;
	clipboard: Clip | null;
	celClipboard: PixelBuffer | null;
};

type ToolState = {
	tool: Tool;
	primaryColor: string;
	secondaryColor: string;
	palette: Array<string>;
	brushSize: number;
	brushShape: BrushShape;
	customBrush: CustomBrush;
	customBrushPresets: Array<CustomBrush>;
	activeCustomBrushId: string;
	customBrushOptions: CustomBrushOptions;
	sprayOptions: SprayOptions;
	gradientOptions: GradientOptions;
	rulerGrid: RulerGridSettings;
	perspectiveGuide: PerspectiveGuideSettings;
	tiledPreview: TiledPreviewSettings;
	pixelPerfect: boolean;
	shapeFilled: boolean;
	fillContiguous: boolean;
	ditherPattern: DitherPattern;
	ditherDensity: number;
	ditherTwoColor: boolean;
	replaceFromColor: string | null;
	replaceTolerance: number;
	replaceScope: ReplaceScope;
	symmetryX: boolean;
	symmetryY: boolean;
	symmetryXPos: number | null;
	symmetryYPos: number | null;
	symmetryDiagonal: boolean;
	colorRampOptions: ColorRampOptions;
	blurStrength: number;
	blurRadius: number;
	blurPreserveAlpha: boolean;
	blurSnapPalette: boolean;
	textStyle: TextStyle;
	textValue: string;
	/** Top-left of the text being placed, null when not placing text. */
	textDraft: Point | null;
};

type ViewState = {
	zoom: number;
	panX: number;
	panY: number;
	viewportWidth: number;
	viewportHeight: number;
	showGrid: boolean;
	cursor: Point | null;
	dialog: DialogKind | null;
	notice: Notice | null;
	/** Animation playback on the main canvas. */
	playing: boolean;
	/** Tag id to loop while playing, null = every frame. */
	playTag: number | null;
	onionSkin: boolean;
	/** How many frames before / after the current one the onion skin shows. */
	onionBefore: number;
	onionAfter: number;
};

type Actions = {
	// document
	commitPixels: (pixels: PixelBuffer, selection?: SelectionMask | null) => void;
	newCanvas: (width: number, height: number) => void;
	resizeCanvas: (
		width: number,
		height: number,
		options?: ResizeAnchor | ResizeCanvasOptions
	) => void;
	loadDocument: (
		document: Partial<DocumentData> &
			Pick<DocumentData, "width" | "height"> & { pixels?: PixelBuffer }
	) => void;
	setName: (name: string) => void;
	undo: () => void;
	redo: () => void;
	flip: (axis: "horizontal" | "vertical") => void;
	// layers
	setActiveLayer: (index: number) => void;
	addLayer: () => void;
	addReferenceLayer: (reference: ReferenceImageData, name?: string) => void;
	updateReferenceLayer: (
		index: number,
		patch: Partial<ReferenceImageData>
	) => void;
	fitReferenceLayer: (index: number) => void;
	duplicateLayer: () => void;
	deleteLayer: () => void;
	moveLayer: (direction: 1 | -1) => void;
	moveLayerTo: (fromIndex: number, toIndex: number) => void;
	mergeDown: () => void;
	flattenImage: () => void;
	renameLayer: (index: number, name: string) => void;
	setLayerVisible: (index: number, visible: boolean) => void;
	toggleLayerLock: (index: number) => void;
	soloLayer: (index: number) => void;
	setLayerOpacity: (index: number, opacity: number) => void;
	// frames & cels
	setCurrentFrame: (index: number) => void;
	/** Selects a layer and a frame at once (a timeline cel). */
	selectCel: (layerIndex: number, frameIndex: number) => void;
	addFrame: () => void;
	duplicateFrame: () => void;
	deleteFrame: () => void;
	moveFrame: (from: number, to: number) => void;
	setFrameDuration: (index: number, duration: number) => void;
	setFramesDuration: (from: number, to: number, duration: number) => void;
	clearCel: (layerIndex: number, frameIndex: number) => void;
	duplicateCel: (layerIndex: number, frameIndex: number) => void;
	copyCel: (layerIndex: number, frameIndex: number) => void;
	pasteCel: (layerIndex: number, frameIndex: number) => void;
	linkCels: (layerIndex: number, fromFrame: number, toFrame: number) => void;
	unlinkCel: (layerIndex: number, frameIndex: number) => void;
	// tags
	addTag: (from: number, to: number) => void;
	updateTag: (id: number, patch: Partial<Omit<FrameTag, "id">>) => void;
	deleteTag: (id: number) => void;
	// playback & onion skin
	setPlaying: (playing: boolean) => void;
	togglePlaying: () => void;
	setPlayTag: (id: number | null) => void;
	toggleOnionSkin: () => void;
	setOnionRange: (before: number, after: number) => void;
	// filters
	blurLayer: () => void;
	applyOutline: (options: OutlineOptions, toNewLayer: boolean) => void;
	// text
	placeText: (point: Point) => void;
	setTextValue: (value: string) => void;
	setTextStyle: (style: Partial<TextStyle>) => void;
	commitText: () => void;
	cancelText: () => void;
	// selection
	setSelection: (mask: SelectionMask | null, mode?: SelectionMode) => void;
	selectAll: () => void;
	deselect: () => void;
	invertSelection: () => void;
	deleteSelection: () => void;
	liftSelection: () => void;
	setFloatingOffset: (offsetX: number, offsetY: number) => void;
	nudge: (dx: number, dy: number) => void;
	anchorFloating: () => void;
	copy: () => void;
	cut: () => void;
	paste: () => void;
	// tools
	setTool: (tool: Tool) => void;
	setPrimaryColor: (color: string) => void;
	setSecondaryColor: (color: string) => void;
	swapColors: () => void;
	setBrushSize: (size: number) => void;
	setBrushShape: (shape: BrushShape) => void;
	setCustomBrush: (brush: CustomBrush) => void;
	selectCustomBrushPreset: (id: string) => void;
	saveCustomBrushPreset: (name: string, brush: CustomBrush) => void;
	deleteCustomBrushPreset: (id: string) => void;
	setCustomBrushOptions: (patch: Partial<CustomBrushOptions>) => void;
	setSprayOptions: (patch: Partial<SprayOptions>) => void;
	setGradientOptions: (patch: Partial<GradientOptions>) => void;
	toggleRulerGrid: () => void;
	setRulerGrid: (patch: Partial<RulerGridSettings>) => void;
	resetRulerGrid: () => void;
	togglePerspectiveGuide: () => void;
	setPerspectiveGuide: (patch: Partial<PerspectiveGuideSettings>) => void;
	resetPerspectiveGuide: () => void;
	toggleTiledPreview: () => void;
	setTiledPreview: (patch: Partial<TiledPreviewSettings>) => void;
	captureCustomBrush: () => boolean;
	togglePixelPerfect: () => void;
	toggleShapeFilled: () => void;
	toggleFillContiguous: () => void;
	setDitherPattern: (pattern: DitherPattern) => void;
	setDitherDensity: (density: number) => void;
	toggleDitherTwoColor: () => void;
	setReplaceFromColor: (color: string | null) => void;
	setReplaceTolerance: (tolerance: number) => void;
	setReplaceScope: (scope: ReplaceScope) => void;
	replaceColor: (
		fromColor: string,
		toColor: string,
		tolerance?: number,
		scope?: ReplaceScope
	) => number;
	toggleSymmetryX: () => void;
	toggleSymmetryY: () => void;
	setSymmetryXPos: (pos: number | null) => void;
	setSymmetryYPos: (pos: number | null) => void;
	toggleSymmetryDiagonal: () => void;
	resetSymmetryAxes: () => void;
	setColorRampOptions: (patch: Partial<ColorRampOptions>) => void;
	stepPrimaryShade: (direction: "shadow" | "highlight") => void;
	setBlurStrength: (value: number) => void;
	setBlurRadius: (value: number) => void;
	toggleBlurPreserveAlpha: () => void;
	toggleBlurSnapPalette: () => void;
	addPaletteColor: (color: string) => void;
	removePaletteColor: (index: number) => void;
	setPalette: (palette: Array<string>) => void;
	// view
	setViewport: (width: number, height: number) => void;
	fitView: () => void;
	zoomTo: (zoom: number, anchorX?: number, anchorY?: number) => void;
	zoomStep: (direction: 1 | -1, anchorX?: number, anchorY?: number) => void;
	setPan: (panX: number, panY: number) => void;
	toggleGrid: () => void;
	setCursor: (cursor: Point | null) => void;
	openDialog: (dialog: DialogKind | null) => void;
	showNotice: (message: string) => void;
	clearNotice: () => void;
};

export type EditorState = DocumentState & ToolState & ViewState & Actions;

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

const clampSize = (value: number): number =>
	Math.max(MIN_CANVAS_SIZE, Math.min(MAX_CANVAS_SIZE, Math.round(value) || 1));

function snapshotOf(state: EditorState): Snapshot {
	// Pixel buffers are never mutated in place once they are in the store, so
	// a snapshot can keep references instead of copies.
	return {
		width: state.width,
		height: state.height,
		pixels: state.pixels,
		selection: state.selection,
		layers: state.layers,
		activeLayer: state.activeLayer,
		frames: state.frames,
		currentFrame: state.currentFrame,
		tags: state.tags,
	};
}

/** Every layer with its current pixels (the active one comes from `pixels`). */
export function syncedLayers(
	state: Pick<EditorState, "layers" | "activeLayer" | "pixels">
): Array<Layer> {
	return state.layers.map((layer, index) =>
		index === state.activeLayer && layer.pixels !== state.pixels
			? { ...layer, pixels: state.pixels }
			: layer
	);
}

/** Every frame with its current cels (the current one comes from `layers`). */
export function syncedFrames(
	state: Pick<
		EditorState,
		"layers" | "activeLayer" | "pixels" | "frames" | "currentFrame"
	>
): Array<Frame> {
	const cels = celsOf(syncedLayers(state));
	return state.frames.map((frame, index) =>
		index === state.currentFrame ? { ...frame, cels } : frame
	);
}

/** Frame durations are tweaks like layer opacity: history keeps the live ones. */
function restoreFrames(
	snapshot: Array<Frame>,
	current: Array<Frame>
): Array<Frame> {
	return snapshot.map((frame) => {
		const live = current.find((candidate) => candidate.id === frame.id);
		return live && live.duration !== frame.duration
			? { ...frame, duration: live.duration }
			: frame;
	});
}

/**
 * Restoring history should bring back pixels and layer structure, but not
 * undo plain visibility/opacity/name tweaks (those don't create history).
 */
function restoreLayers(
	snapshot: Array<Layer>,
	current: Array<Layer>
): Array<Layer> {
	return snapshot.map((layer) => {
		const live = current.find((candidate) => candidate.id === layer.id);
		return live
			? {
					...layer,
					name: live.name,
					visible: live.visible,
					opacity: live.opacity,
					locked: live.locked,
				}
			: layer;
	});
}

/** State patch that makes `layers` the document, `active` the active layer. */
function layersPatch(
	layers: Array<Layer>,
	active: number
): Pick<EditorState, "layers" | "activeLayer" | "pixels"> {
	const activeLayer = Math.max(0, Math.min(layers.length - 1, active));
	return {
		layers,
		activeLayer,
		pixels: layers[activeLayer]?.pixels ?? new Uint32Array(0),
	};
}

/**
 * State patch that makes `frames` the animation and shows frame `index`, with
 * `layers` (their names/visibility/opacity) loaded with that frame's cels.
 */
function framesPatch(
	layers: Array<Layer>,
	frames: Array<Frame>,
	index: number,
	active: number,
	width: number,
	height: number
): Pick<
	EditorState,
	"frames" | "currentFrame" | "layers" | "activeLayer" | "pixels"
> {
	const currentFrame = Math.max(0, Math.min(frames.length - 1, index));
	return {
		frames,
		currentFrame,
		...layersPatch(
			layersForFrame(layers, frames[currentFrame], width, height),
			active
		),
	};
}

function textTarget(state: EditorState, data: PixelBuffer): PaintTarget {
	return {
		data,
		width: state.width,
		height: state.height,
		mask: state.selection,
		symmetryX: false,
		symmetryY: false,
	};
}

/** Draws the text being placed onto a copy of `pixels`. */
export function withTextPreview(
	state: EditorState,
	pixels: PixelBuffer
): PixelBuffer {
	if (!state.textDraft || state.textValue === "") return pixels;
	const bitmap = renderText(state.textValue, state.textStyle);
	const target = textTarget(state, pixels.slice());
	const color = hexToPacked(state.primaryColor);
	const { x: originX, y: originY } = state.textDraft;
	for (let y = 0; y < bitmap.height; y++) {
		for (let x = 0; x < bitmap.width; x++) {
			if (bitmap.mask[y * bitmap.width + x] === 1) {
				plot(target, originX + x, originY + y, color);
			}
		}
	}
	return target.data;
}

function withHistory(
	state: EditorState
): Pick<EditorState, "undoStack" | "redoStack"> {
	return {
		undoStack: [
			...state.undoStack.slice(-(MAX_HISTORY - 1)),
			snapshotOf(state),
		],
		redoStack: [],
	};
}

/** The document as it looks once the floating selection is dropped in place. */
function resolveFloating(
	state: EditorState
): Pick<EditorState, "pixels" | "selection" | "floating" | "undoStack"> {
	const { floating } = state;
	if (!floating) {
		return {
			pixels: state.pixels,
			selection: state.selection,
			floating: null,
			undoStack: state.undoStack,
		};
	}
	const { lifted, mask, offsetX, offsetY } = floating;
	// A lift that never moved changes nothing, so forget its history entry.
	if (floating.source === "lift" && offsetX === 0 && offsetY === 0) {
		const previous = state.undoStack[state.undoStack.length - 1];
		return {
			pixels: previous?.pixels ?? state.pixels,
			selection: floating.temporary ? null : mask,
			floating: null,
			undoStack: state.undoStack.slice(0, -1),
		};
	}
	const pixels = compositeFloating(
		state.pixels,
		lifted,
		mask,
		state.width,
		state.height,
		offsetX,
		offsetY
	);
	const moved = shiftMask(mask, state.width, state.height, offsetX, offsetY);
	return {
		pixels,
		selection: floating.temporary || maskIsEmpty(moved) ? null : moved,
		floating: null,
		undoStack: state.undoStack,
	};
}

function fitZoom(
	width: number,
	height: number,
	viewportWidth: number,
	viewportHeight: number
): { zoom: number; panX: number; panY: number } {
	const available = Math.min(
		(viewportWidth * 0.85) / width,
		(viewportHeight * 0.85) / height
	);
	let zoom = ZOOM_LEVELS[0] ?? 1;
	for (const level of ZOOM_LEVELS) {
		if (level <= available) zoom = level;
	}
	return {
		zoom,
		panX: Math.round((viewportWidth - width * zoom) / 2),
		panY: Math.round((viewportHeight - height * zoom) / 2),
	};
}

const saved = loadAutosave();
let noticeId = 0;
let nextLinkGroupId = 1;
if (saved?.frames) {
	for (const frame of saved.frames) {
		if (!frame.linked) continue;
		for (const groupId of Object.values(frame.linked)) {
			if (typeof groupId === "number" && groupId >= nextLinkGroupId) {
				nextLinkGroupId = groupId + 1;
			}
		}
	}
}

const initialLayers = saved?.layers ?? [
	createLayer(DEFAULT_CANVAS_SIZE, DEFAULT_CANVAS_SIZE, "Layer 1"),
];
const initialActive = Math.min(
	saved?.activeLayer ?? initialLayers.length - 1,
	initialLayers.length - 1
);
const initialFrames = saved?.frames.length
	? saved.frames
	: [createFrame(celsOf(initialLayers))];
const initialFrame = Math.max(
	0,
	Math.min(saved?.currentFrame ?? 0, initialFrames.length - 1)
);

/* -------------------------------------------------------------------------- */
/*                                    Store                                   */
/* -------------------------------------------------------------------------- */

export const useEditorStore = create<EditorState>()((set, get) => ({
	name: saved?.name ?? "untitled",
	width: saved?.width ?? DEFAULT_CANVAS_SIZE,
	height: saved?.height ?? DEFAULT_CANVAS_SIZE,
	...framesPatch(
		initialLayers,
		initialFrames,
		initialFrame,
		initialActive,
		saved?.width ?? DEFAULT_CANVAS_SIZE,
		saved?.height ?? DEFAULT_CANVAS_SIZE
	),
	tags: saved?.tags ?? [],
	selection: null,
	floating: null,
	undoStack: [],
	redoStack: [],
	clipboard: null,
	celClipboard: null,

	tool: "pencil",
	primaryColor: saved?.primaryColor ?? "#000000",
	secondaryColor: saved?.secondaryColor ?? "#fff1e8",
	palette: saved?.palette ?? DEFAULT_PALETTE,
	brushSize: 1,
	brushShape: "square",
	customBrush: cloneCustomBrush(
		BUILTIN_CUSTOM_BRUSHES[0] ?? createDefaultCustomBrush()
	),
	customBrushPresets: BUILTIN_CUSTOM_BRUSHES.map(cloneCustomBrush),
	activeCustomBrushId: BUILTIN_CUSTOM_BRUSHES[0]?.id ?? "custom",
	customBrushOptions: DEFAULT_CUSTOM_BRUSH_OPTIONS,
	sprayOptions: DEFAULT_SPRAY_OPTIONS,
	gradientOptions: DEFAULT_GRADIENT_OPTIONS,
	rulerGrid: DEFAULT_RULER_GRID,
	perspectiveGuide: DEFAULT_PERSPECTIVE_GUIDE,
	tiledPreview: DEFAULT_TILED_PREVIEW,
	pixelPerfect: false,
	shapeFilled: false,
	fillContiguous: true,
	ditherPattern: "bayer4",
	ditherDensity: 50,
	ditherTwoColor: false,
	replaceFromColor: null,
	replaceTolerance: 0,
	replaceScope: "layer",
	symmetryX: false,
	symmetryY: false,
	symmetryXPos: null,
	symmetryYPos: null,
	symmetryDiagonal: false,
	colorRampOptions: DEFAULT_COLOR_RAMP,
	blurStrength: 60,
	blurRadius: 1,
	blurPreserveAlpha: true,
	blurSnapPalette: false,
	textStyle: {
		font: "pixel-5x7",
		scale: 1,
		size: 12,
		bold: false,
		spacing: 1,
	},
	textValue: "",
	textDraft: null,

	zoom: 16,
	panX: 0,
	panY: 0,
	viewportWidth: 0,
	viewportHeight: 0,
	showGrid: true,
	cursor: null,
	dialog: null,
	notice: null,
	playing: false,
	playTag: null,
	onionSkin: false,
	onionBefore: 1,
	onionAfter: 1,

	/* ------------------------------- document ------------------------------ */

	commitPixels: (pixels, selection): void => {
		set((state) => {
			const activeLayerId = state.layers[state.activeLayer]?.id;
			const linkGroup =
				activeLayerId !== undefined
					? state.frames[state.currentFrame]?.linked?.[activeLayerId]
					: undefined;
			const frames =
				linkGroup && activeLayerId !== undefined
					? state.frames.map((frame, index) =>
							index !== state.currentFrame &&
							frame.linked?.[activeLayerId] === linkGroup
								? { ...frame, cels: { ...frame.cels, [activeLayerId]: pixels } }
								: frame
						)
					: state.frames;
			return {
				...withHistory(state),
				pixels,
				frames,
				...(selection === undefined ? {} : { selection }),
			};
		});
	},

	newCanvas: (width, height): void => {
		get().anchorFloating();
		const w = clampSize(width);
		const h = clampSize(height);
		const layer = createLayer(w, h, "Layer 1");
		set((state) => ({
			...withHistory(state),
			name: "untitled",
			width: w,
			height: h,
			...framesPatch([layer], [createFrame(celsOf([layer]))], 0, 0, w, h),
			tags: [],
			playing: false,
			playTag: null,
			selection: null,
			textDraft: null,
		}));
		get().fitView();
	},

	resizeCanvas: (width, height, options): void => {
		get().anchorFloating();
		const targetWidth = clampSize(width);
		const targetHeight = clampSize(height);
		const mode: ResizeMode =
			typeof options === "string" ? "crop" : (options?.mode ?? "crop");
		const anchor: ResizeAnchor =
			typeof options === "string" ? options : (options?.anchor ?? "center");
		const algorithm: ResampleAlgorithm =
			typeof options === "string"
				? "nearest"
				: (options?.algorithm ?? "nearest");
		const current = get();
		if (current.width === targetWidth && current.height === targetHeight) {
			return;
		}
		set((state) => {
			if (state.width === targetWidth && state.height === targetHeight) {
				return state;
			}
			const bufferCache = new Map<PixelBuffer, PixelBuffer>();
			const transformBuffer = (pixels: PixelBuffer): PixelBuffer => {
				const cached = bufferCache.get(pixels);
				if (cached) return cached;
				const next =
					mode === "scale"
						? resamplePixels(
								pixels,
								state.width,
								state.height,
								targetWidth,
								targetHeight,
								algorithm
							)
						: resizePixels(
								pixels,
								state.width,
								state.height,
								targetWidth,
								targetHeight,
								anchor
							);
				bufferCache.set(pixels, next);
				return next;
			};

			// Every frame gets resized, not only the one on screen.
			const nextFrames = syncedFrames(state).map((frame) => ({
				...frame,
				cels: mapCels(frame.cels, transformBuffer),
			}));

			const { offsetX, offsetY } = resizeAnchorOffset(
				state.width,
				state.height,
				targetWidth,
				targetHeight,
				anchor
			);
			const scaleX = targetWidth / state.width;
			const scaleY = targetHeight / state.height;
			const nextLayers = state.layers.map((layer) => {
				if (layer.kind !== "reference" || !layer.reference) return layer;
				const { reference } = layer;
				return {
					...layer,
					reference:
						mode === "scale"
							? {
									...reference,
									x: reference.x * scaleX,
									y: reference.y * scaleY,
									width: reference.width * scaleX,
									height: reference.height * scaleY,
								}
							: {
									...reference,
									x: reference.x + offsetX,
									y: reference.y + offsetY,
								},
				};
			});

			const clampAxis = (value: number, limit: number): number =>
				Math.max(0, Math.min(limit, value));
			const symmetryXPos =
				state.symmetryXPos === null
					? null
					: clampAxis(
							mode === "scale"
								? state.symmetryXPos * scaleX
								: state.symmetryXPos + offsetX,
							targetWidth
						);
			const symmetryYPos =
				state.symmetryYPos === null
					? null
					: clampAxis(
							mode === "scale"
								? state.symmetryYPos * scaleY
								: state.symmetryYPos + offsetY,
							targetHeight
						);

			return {
				...withHistory(state),
				width: targetWidth,
				height: targetHeight,
				...framesPatch(
					nextLayers,
					nextFrames,
					state.currentFrame,
					state.activeLayer,
					targetWidth,
					targetHeight
				),
				symmetryXPos,
				symmetryYPos,
				selection: null,
				textDraft: null,
			};
		});
		get().fitView();
		get().showNotice(
			`Resized canvas to ${targetWidth}×${targetHeight} (${
				mode === "scale" ? algorithm : `crop · ${anchor}`
			})`
		);
	},

	loadDocument: (document): void => {
		get().anchorFloating();
		const layers = document.layers ?? [
			createLayer(document.width, document.height, "Layer 1", document.pixels),
		];
		const frames = document.frames?.length
			? document.frames
			: [createFrame(celsOf(layers))];
		for (const frame of frames) {
			if (!frame.linked) continue;
			for (const groupId of Object.values(frame.linked)) {
				if (groupId !== undefined && groupId >= nextLinkGroupId) {
					nextLinkGroupId = groupId + 1;
				}
			}
		}
		set((state) => ({
			...withHistory(state),
			name: document.name ?? state.name,
			width: document.width,
			height: document.height,
			...framesPatch(
				layers,
				frames,
				document.currentFrame ?? 0,
				document.activeLayer ?? layers.length - 1,
				document.width,
				document.height
			),
			tags: clampTags(document.tags ?? [], frames.length),
			playing: false,
			playTag: null,
			selection: null,
			textDraft: null,
			palette: document.palette ?? state.palette,
			primaryColor: document.primaryColor ?? state.primaryColor,
			secondaryColor: document.secondaryColor ?? state.secondaryColor,
		}));
		get().fitView();
	},

	setName: (name): void => {
		set({ name });
	},

	undo: (): void => {
		if (get().textDraft) {
			get().cancelText();
			return;
		}
		get().anchorFloating();
		const state = get();
		const previous = state.undoStack[state.undoStack.length - 1];
		if (!previous) return;
		const resized =
			previous.width !== state.width || previous.height !== state.height;
		set({
			undoStack: state.undoStack.slice(0, -1),
			redoStack: [...state.redoStack, snapshotOf(state)],
			...previous,
			layers: restoreLayers(previous.layers, state.layers),
			frames: restoreFrames(previous.frames, state.frames),
			textDraft: null,
		});
		if (resized) get().fitView();
	},

	redo: (): void => {
		get().anchorFloating();
		const state = get();
		const next = state.redoStack[state.redoStack.length - 1];
		if (!next) return;
		const resized = next.width !== state.width || next.height !== state.height;
		set({
			redoStack: state.redoStack.slice(0, -1),
			undoStack: [...state.undoStack, snapshotOf(state)],
			...next,
			layers: restoreLayers(next.layers, state.layers),
			frames: restoreFrames(next.frames, state.frames),
			textDraft: null,
		});
		if (resized) get().fitView();
	},

	flip: (axis): void => {
		get().anchorFloating();
		const state = get();
		const active = state.layers[state.activeLayer];
		if (!state.selection && state.layers.length > 1) {
			// No selection: flip the whole image, every pixel layer.
			const layers = syncedLayers(state).map((layer) =>
				layer.kind === "reference"
					? layer
					: {
							...layer,
							pixels: flipPixels(
								layer.pixels,
								null,
								state.width,
								state.height,
								axis
							).pixels,
						}
			);
			set({ ...withHistory(state), ...layersPatch(layers, state.activeLayer) });
			return;
		}
		if (active?.kind === "reference") return;
		const result = flipPixels(
			state.pixels,
			state.selection,
			state.width,
			state.height,
			axis
		);
		state.commitPixels(result.pixels, result.mask);
	},

	/* -------------------------------- layers ------------------------------- */

	setActiveLayer: (index): void => {
		const state = get();
		if (index === state.activeLayer || !state.layers[index]) return;
		state.commitText();
		get().anchorFloating();
		const current = get();
		set(layersPatch(syncedLayers(current), index));
	},

	addLayer: (): void => {
		get().commitText();
		get().anchorFloating();
		const state = get();
		if (state.layers.length >= MAX_LAYERS) {
			state.showNotice(`You can have up to ${MAX_LAYERS} layers`);
			return;
		}
		const layers = syncedLayers(state);
		const layer = createLayer(state.width, state.height, nextLayerName(layers));
		const position = state.activeLayer + 1;
		layers.splice(position, 0, layer);
		set({ ...withHistory(state), ...layersPatch(layers, position) });
	},

	addReferenceLayer: (reference, name): void => {
		get().commitText();
		get().anchorFloating();
		const state = get();
		if (state.layers.length >= MAX_LAYERS) {
			state.showNotice(`You can have up to ${MAX_LAYERS} layers`);
			return;
		}
		const layers = syncedLayers(state);
		const layerName = name?.trim() || nextLayerName(layers, "Reference");
		const layer = createReferenceLayer(
			state.width,
			state.height,
			layerName,
			reference
		);
		// Put reference layers at the bottom by default so you draw over them.
		layers.unshift(layer);
		set({ ...withHistory(state), ...layersPatch(layers, 0) });
	},

	updateReferenceLayer: (index, patch): void => {
		set((state) => ({
			layers: state.layers.map((layer, position) =>
				position === index && layer.kind === "reference" && layer.reference
					? { ...layer, reference: { ...layer.reference, ...patch } }
					: layer
			),
		}));
	},

	fitReferenceLayer: (index): void => {
		const state = get();
		const layer = state.layers[index];
		if (!layer || layer.kind !== "reference" || !layer.reference) return;
		const { naturalWidth, naturalHeight } = layer.reference;
		const scale = Math.min(
			state.width / naturalWidth,
			state.height / naturalHeight
		);
		const fitW = naturalWidth * scale;
		const fitH = naturalHeight * scale;
		state.updateReferenceLayer(index, {
			x: (state.width - fitW) / 2,
			y: (state.height - fitH) / 2,
			width: fitW,
			height: fitH,
		});
	},

	duplicateLayer: (): void => {
		get().commitText();
		get().anchorFloating();
		const state = get();
		if (state.layers.length >= MAX_LAYERS) {
			state.showNotice(`You can have up to ${MAX_LAYERS} layers`);
			return;
		}
		const layers = syncedLayers(state);
		const source = layers[state.activeLayer];
		if (!source) return;
		const copy =
			source.kind === "reference" && source.reference
				? createReferenceLayer(
						state.width,
						state.height,
						`${source.name} copy`,
						{ ...source.reference },
						source.opacity
					)
				: createLayer(
						state.width,
						state.height,
						`${source.name} copy`,
						source.pixels.slice()
					);
		copy.visible = source.visible;
		copy.opacity = source.opacity;
		copy.locked = source.locked;
		const position = state.activeLayer + 1;
		layers.splice(position, 0, copy);
		// The copy gets the source layer's pixels in every frame.
		const frames =
			source.kind === "reference"
				? syncedFrames(state)
				: syncedFrames(state).map((frame) => {
						const cel = frame.cels[source.id];
						return cel
							? { ...frame, cels: { ...frame.cels, [copy.id]: cel } }
							: frame;
					});
		set({ ...withHistory(state), frames, ...layersPatch(layers, position) });
	},

	deleteLayer: (): void => {
		get().cancelText();
		get().anchorFloating();
		const state = get();
		if (state.layers.length <= 1) {
			state.showNotice("A drawing needs at least one layer");
			return;
		}
		const removed = state.layers[state.activeLayer];
		const layers = syncedLayers(state).filter(
			(_, index) => index !== state.activeLayer
		);
		const frames = removed
			? state.frames.map((frame) => {
					const nextLinked = frame.linked ? { ...frame.linked } : undefined;
					if (nextLinked) delete nextLinked[removed.id];
					return {
						...frame,
						cels: withoutCel(frame.cels, removed.id),
						...(nextLinked ? { linked: nextLinked } : {}),
					};
				})
			: state.frames;
		set({
			...withHistory(state),
			frames,
			...layersPatch(layers, state.activeLayer - 1),
			selection: null,
		});
	},

	moveLayer: (direction): void => {
		const state = get();
		state.moveLayerTo(state.activeLayer, state.activeLayer + direction);
	},

	moveLayerTo: (fromIndex, toIndex): void => {
		get().commitText();
		get().anchorFloating();
		const state = get();
		if (
			fromIndex < 0 ||
			fromIndex >= state.layers.length ||
			toIndex < 0 ||
			toIndex >= state.layers.length ||
			fromIndex === toIndex
		) {
			return;
		}
		const layers = syncedLayers(state);
		const [moved] = layers.splice(fromIndex, 1);
		if (!moved) return;
		layers.splice(toIndex, 0, moved);
		const nextActive =
			state.activeLayer === fromIndex
				? toIndex
				: state.activeLayer > fromIndex && state.activeLayer <= toIndex
					? state.activeLayer - 1
					: state.activeLayer < fromIndex && state.activeLayer >= toIndex
						? state.activeLayer + 1
						: state.activeLayer;
		set({ ...withHistory(state), ...layersPatch(layers, nextActive) });
	},

	mergeDown: (): void => {
		get().commitText();
		get().anchorFloating();
		const state = get();
		const index = state.activeLayer;
		if (index === 0) {
			state.showNotice("There is no layer below to merge into");
			return;
		}
		const layers = syncedLayers(state);
		const top = layers[index];
		const bottom = layers[index - 1];
		if (!top || !bottom) return;
		if (top.kind === "reference" || bottom.kind === "reference") {
			state.showNotice("Reference layers cannot be merged with pixel layers");
			return;
		}
		// Hidden layers merge as if visible: the user asked for it explicitly.
		// The top layer's opacity gets baked in; the bottom keeps its own.
		// Merging happens in every frame.
		const pixelCount = state.width * state.height;
		const frames = syncedFrames(state).map((frame) => {
			const topCel = frame.cels[top.id];
			const cels = withoutCel(frame.cels, top.id);
			if (!topCel) return { ...frame, cels };
			cels[bottom.id] = compositeFrame(
				[
					{ id: bottom.id, visible: true, opacity: 100 },
					{ id: top.id, visible: true, opacity: top.opacity },
				],
				frame,
				pixelCount
			);
			return { ...frame, cels };
		});
		layers.splice(index - 1, 2, bottom);
		set({
			...withHistory(state),
			...framesPatch(
				layers,
				frames,
				state.currentFrame,
				index - 1,
				state.width,
				state.height
			),
		});
	},

	flattenImage: (): void => {
		get().commitText();
		get().anchorFloating();
		const state = get();
		const pixelLayers = state.layers.filter(
			(layer) => layer.kind !== "reference"
		);
		if (pixelLayers.length <= 1) return;
		const refLayers = state.layers.filter(
			(layer) => layer.kind === "reference"
		);
		const layer = createLayer(state.width, state.height, "Layer 1");
		const pixelCount = state.width * state.height;
		const frames = syncedFrames(state).map((frame) => ({
			...frame,
			cels: { [layer.id]: compositeFrame(state.layers, frame, pixelCount) },
		}));
		const nextLayers = [...refLayers, layer];
		set({
			...withHistory(state),
			...framesPatch(
				nextLayers,
				frames,
				state.currentFrame,
				nextLayers.length - 1,
				state.width,
				state.height
			),
		});
	},

	renameLayer: (index, name): void => {
		const trimmed = name.trim();
		set((state) => ({
			layers: state.layers.map((layer, position) =>
				position === index && trimmed ? { ...layer, name: trimmed } : layer
			),
		}));
	},

	setLayerVisible: (index, visible): void => {
		set((state) => ({
			layers: state.layers.map((layer, position) =>
				position === index ? { ...layer, visible } : layer
			),
		}));
	},

	toggleLayerLock: (index): void => {
		set((state) => ({
			layers: state.layers.map((layer, position) =>
				position === index ? { ...layer, locked: !layer.locked } : layer
			),
		}));
	},

	soloLayer: (index): void => {
		set((state) => {
			const alreadySolo = state.layers.every(
				(layer, position) => layer.visible === (position === index)
			);
			return {
				layers: state.layers.map((layer, position) => ({
					...layer,
					visible: alreadySolo ? true : position === index,
				})),
			};
		});
	},

	setLayerOpacity: (index, opacity): void => {
		const value = Math.max(0, Math.min(100, Math.round(opacity)));
		set((state) => ({
			layers: state.layers.map((layer, position) =>
				position === index ? { ...layer, opacity: value } : layer
			),
		}));
	},

	/* -------------------------------- frames ------------------------------- */

	setCurrentFrame: (index): void => {
		const state = get();
		if (index === state.currentFrame || !state.frames[index]) return;
		state.commitText();
		get().anchorFloating();
		const current = get();
		set(
			framesPatch(
				current.layers,
				syncedFrames(current),
				index,
				current.activeLayer,
				current.width,
				current.height
			)
		);
	},

	selectCel: (layerIndex, frameIndex): void => {
		get().setCurrentFrame(frameIndex);
		get().setActiveLayer(layerIndex);
	},

	addFrame: (): void => {
		get().commitText();
		get().anchorFloating();
		const state = get();
		if (state.frames.length >= MAX_FRAMES) {
			state.showNotice(`You can have up to ${MAX_FRAMES} frames`);
			return;
		}
		const frames = syncedFrames(state);
		const position = state.currentFrame + 1;
		const duration = frames[state.currentFrame]?.duration;
		frames.splice(position, 0, createFrame({}, duration));
		set({
			...withHistory(state),
			...framesPatch(
				state.layers,
				frames,
				position,
				state.activeLayer,
				state.width,
				state.height
			),
			tags: tagsAfterInsert(state.tags, position),
		});
	},

	duplicateFrame: (): void => {
		get().commitText();
		get().anchorFloating();
		const state = get();
		if (state.frames.length >= MAX_FRAMES) {
			state.showNotice(`You can have up to ${MAX_FRAMES} frames`);
			return;
		}
		const frames = syncedFrames(state);
		const source = frames[state.currentFrame];
		if (!source) return;
		const position = state.currentFrame + 1;
		// Pixel buffers are immutable, so the copy can share them.
		frames.splice(
			position,
			0,
			createFrame({ ...source.cels }, source.duration)
		);
		set({
			...withHistory(state),
			...framesPatch(
				state.layers,
				frames,
				position,
				state.activeLayer,
				state.width,
				state.height
			),
			tags: tagsAfterInsert(state.tags, position),
		});
	},

	deleteFrame: (): void => {
		get().cancelText();
		get().anchorFloating();
		const state = get();
		if (state.frames.length <= 1) {
			state.showNotice("An animation needs at least one frame");
			return;
		}
		const frames = syncedFrames(state).filter(
			(_, index) => index !== state.currentFrame
		);
		const tags = tagsAfterDelete(state.tags, state.currentFrame);
		set({
			...withHistory(state),
			...framesPatch(
				state.layers,
				frames,
				Math.max(0, state.currentFrame - 1),
				state.activeLayer,
				state.width,
				state.height
			),
			tags,
			playing: frames.length > 1 && state.playing,
			playTag: tags.some((tag) => tag.id === state.playTag)
				? state.playTag
				: null,
		});
	},

	moveFrame: (from, to): void => {
		get().commitText();
		get().anchorFloating();
		const state = get();
		const target = Math.max(0, Math.min(state.frames.length - 1, to));
		if (from === target || !state.frames[from]) return;
		const frames = moveItem(syncedFrames(state), from, target);
		set({
			...withHistory(state),
			...framesPatch(
				state.layers,
				frames,
				target,
				state.activeLayer,
				state.width,
				state.height
			),
		});
	},

	setFrameDuration: (index, duration): void => {
		get().setFramesDuration(index, index, duration);
	},

	setFramesDuration: (from, to, duration): void => {
		const value = clampDuration(duration);
		set((state) => ({
			frames: state.frames.map((frame, index) =>
				index >= from && index <= to && frame.duration !== value
					? { ...frame, duration: value }
					: frame
			),
		}));
	},

	clearCel: (layerIndex, frameIndex): void => {
		get().anchorFloating();
		const state = get();
		const layer = state.layers[layerIndex];
		const targetFrame = state.frames[frameIndex];
		if (!layer || !targetFrame || layer.kind === "reference") return;
		const empty = createPixels(state.width, state.height);
		const linkGroup = targetFrame.linked?.[layer.id];
		const frames = syncedFrames(state).map((frame, framePosition) => {
			if (
				framePosition === frameIndex ||
				(linkGroup && frame.linked?.[layer.id] === linkGroup)
			) {
				return { ...frame, cels: withoutCel(frame.cels, layer.id) };
			}
			return frame;
		});
		set({
			...withHistory(state),
			...framesPatch(
				state.layers,
				frames,
				state.currentFrame,
				state.activeLayer,
				state.width,
				state.height
			),
			...(frameIndex === state.currentFrame && layerIndex === state.activeLayer
				? { pixels: empty }
				: {}),
		});
	},

	duplicateCel: (layerIndex, frameIndex): void => {
		get().anchorFloating();
		const state = get();
		const layer = state.layers[layerIndex];
		if (!layer || layer.kind === "reference") return;
		const frames = syncedFrames(state);
		const source = frames[frameIndex]?.cels[layer.id];
		const nextIndex = frameIndex + 1;
		if (nextIndex >= frames.length) {
			state.showNotice("No next frame to duplicate cel into");
			return;
		}
		const updated = frames.map((frame, framePosition) => {
			if (framePosition !== nextIndex) return frame;
			const cels = source
				? { ...frame.cels, [layer.id]: source.slice() }
				: withoutCel(frame.cels, layer.id);
			return { ...frame, cels };
		});
		set({
			...withHistory(state),
			...framesPatch(
				state.layers,
				updated,
				nextIndex,
				layerIndex,
				state.width,
				state.height
			),
		});
	},

	copyCel: (layerIndex, frameIndex): void => {
		const state = get();
		const layer = state.layers[layerIndex];
		if (!layer || layer.kind === "reference") return;
		const frames = syncedFrames(state);
		const source = frames[frameIndex]?.cels[layer.id];
		set({
			celClipboard: source
				? source.slice()
				: createPixels(state.width, state.height),
		});
		state.showNotice("Copied cel");
	},

	pasteCel: (layerIndex, frameIndex): void => {
		get().anchorFloating();
		const state = get();
		if (!state.celClipboard) {
			state.showNotice("Copy a cel first");
			return;
		}
		const layer = state.layers[layerIndex];
		if (!layer || layer.kind === "reference") return;
		const expected = state.width * state.height;
		const pasted =
			state.celClipboard.length === expected
				? state.celClipboard.slice()
				: resizePixels(
						state.celClipboard,
						state.width,
						state.height,
						state.width,
						state.height,
						"top-left"
					);
		const targetFrame = state.frames[frameIndex];
		const linkGroup = targetFrame?.linked?.[layer.id];
		const frames = syncedFrames(state).map((frame, framePosition) =>
			framePosition === frameIndex ||
			(linkGroup && frame.linked?.[layer.id] === linkGroup)
				? { ...frame, cels: { ...frame.cels, [layer.id]: pasted } }
				: frame
		);
		set({
			...withHistory(state),
			...framesPatch(
				state.layers,
				frames,
				frameIndex,
				layerIndex,
				state.width,
				state.height
			),
		});
	},

	linkCels: (layerIndex, fromFrame, toFrame): void => {
		get().anchorFloating();
		const state = get();
		const layer = state.layers[layerIndex];
		if (!layer || layer.kind === "reference") return;
		const from = Math.max(0, Math.min(fromFrame, toFrame));
		const to = Math.min(state.frames.length - 1, Math.max(fromFrame, toFrame));
		if (to <= from) {
			state.showNotice("Shift+click 2 or more frames to link cels");
			return;
		}
		const frames = syncedFrames(state);
		// Pick the first non-empty cel in the range (preferring the active frame if inside).
		const currentCandidate =
			state.currentFrame >= from && state.currentFrame <= to
				? frames[state.currentFrame]?.cels[layer.id]
				: undefined;
		let shared: PixelBuffer | undefined =
			currentCandidate && !isEmptyCel(currentCandidate)
				? currentCandidate
				: undefined;
		if (!shared) {
			for (let framePosition = from; framePosition <= to; framePosition++) {
				const candidate = frames[framePosition]?.cels[layer.id];
				if (candidate && !isEmptyCel(candidate)) {
					shared = candidate;
					break;
				}
			}
		}
		const buffer = shared ?? createPixels(state.width, state.height);
		const groupId = nextLinkGroupId;
		nextLinkGroupId += 1;
		const updated = frames.map((frame, framePosition) => {
			if (framePosition < from || framePosition > to) return frame;
			return {
				...frame,
				cels: { ...frame.cels, [layer.id]: buffer },
				linked: { ...frame.linked, [layer.id]: groupId },
			};
		});
		set({
			...withHistory(state),
			...framesPatch(
				state.layers,
				updated,
				state.currentFrame,
				state.activeLayer,
				state.width,
				state.height
			),
		});
		state.showNotice(`Linked frames ${from + 1}–${to + 1} on ${layer.name}`);
	},

	unlinkCel: (layerIndex, frameIndex): void => {
		const state = get();
		const layer = state.layers[layerIndex];
		if (!layer) return;
		const frame = state.frames[frameIndex];
		if (!frame?.linked?.[layer.id]) return;
		const frames = syncedFrames(state).map((candidate, framePosition) => {
			if (framePosition !== frameIndex) return candidate;
			const nextLinked = { ...candidate.linked };
			delete nextLinked[layer.id];
			const existing = candidate.cels[layer.id];
			return {
				...candidate,
				cels: existing
					? { ...candidate.cels, [layer.id]: existing.slice() }
					: candidate.cels,
				linked: nextLinked,
			};
		});
		set({
			...withHistory(state),
			...framesPatch(
				state.layers,
				frames,
				state.currentFrame,
				state.activeLayer,
				state.width,
				state.height
			),
		});
	},

	/* --------------------------------- tags -------------------------------- */

	addTag: (from, to): void => {
		const state = get();
		const last = state.frames.length - 1;
		const tag = createTag(
			Math.max(0, Math.min(last, from)),
			Math.max(0, Math.min(last, to)),
			state.tags
		);
		set({ ...withHistory(state), tags: [...state.tags, tag] });
	},

	updateTag: (id, patch): void => {
		const state = get();
		const last = state.frames.length - 1;
		const tags = state.tags.map((tag) => {
			if (tag.id !== id) return tag;
			const next = { ...tag, ...patch };
			const from = Math.max(0, Math.min(last, Math.round(next.from)));
			const to = Math.max(0, Math.min(last, Math.round(next.to)));
			return {
				...next,
				name: next.name.trim() || tag.name,
				from: Math.min(from, to),
				to: Math.max(from, to),
			};
		});
		set({ ...withHistory(state), tags });
	},

	deleteTag: (id): void => {
		const state = get();
		set({
			...withHistory(state),
			tags: state.tags.filter((tag) => tag.id !== id),
			playTag: state.playTag === id ? null : state.playTag,
		});
	},

	/* ------------------------- playback & onion skin ----------------------- */

	setPlaying: (playing): void => {
		const state = get();
		if (playing === state.playing) return;
		if (playing && state.frames.length < 2) return;
		if (playing) {
			state.commitText();
			get().anchorFloating();
		}
		set({ playing });
	},

	togglePlaying: (): void => {
		get().setPlaying(!get().playing);
	},

	setPlayTag: (playTag): void => {
		set({ playTag });
	},

	toggleOnionSkin: (): void => {
		set((state) => ({ onionSkin: !state.onionSkin }));
	},

	setOnionRange: (before, after): void => {
		const clamp = (value: number): number =>
			Math.max(0, Math.min(5, Math.round(value) || 0));
		set({ onionBefore: clamp(before), onionAfter: clamp(after) });
	},

	/* ------------------------------- filters ------------------------------- */

	blurLayer: (): void => {
		get().anchorFloating();
		const state = get();
		const result = blurPixels(
			state.pixels,
			state.width,
			state.height,
			state.selection,
			{
				radius: state.blurRadius,
				strength: state.blurStrength,
				preserveAlpha: state.blurPreserveAlpha,
				palette: state.blurSnapPalette
					? state.palette.map((hex) => hexToPacked(hex))
					: null,
			}
		);
		state.commitPixels(result);
	},

	applyOutline: (options, toNewLayer): void => {
		get().commitText();
		get().anchorFloating();
		const state = get();
		const outline = computeOutline(
			state.pixels,
			state.width,
			state.height,
			state.selection,
			options
		);
		if (countOpaque(outline) === 0) {
			state.showNotice("Nothing to outline on this layer");
			return;
		}
		if (!toNewLayer || state.layers.length >= MAX_LAYERS) {
			state.commitPixels(overlayPixels(state.pixels, outline));
			return;
		}
		const layers = syncedLayers(state);
		const active = layers[state.activeLayer];
		const layer = createLayer(
			state.width,
			state.height,
			`${active?.name ?? "Layer"} outline`,
			outline
		);
		// Outside outlines sit under the art, inside outlines on top of it.
		const position =
			options.placement === "outside"
				? state.activeLayer
				: state.activeLayer + 1;
		layers.splice(position, 0, layer);
		// Stay on the art layer so you can keep drawing.
		const artIndex =
			position <= state.activeLayer ? state.activeLayer + 1 : state.activeLayer;
		set({ ...withHistory(state), ...layersPatch(layers, artIndex) });
	},

	/* --------------------------------- text -------------------------------- */

	placeText: (point): void => {
		set({ textDraft: { x: point.x, y: point.y } });
	},

	setTextValue: (textValue): void => {
		set({ textValue });
	},

	setTextStyle: (style): void => {
		set((state) => ({ textStyle: { ...state.textStyle, ...style } }));
	},

	commitText: (): void => {
		const state = get();
		if (!state.textDraft) return;
		if (state.textValue === "") {
			set({ textDraft: null });
			return;
		}
		const pixels = withTextPreview(state, state.pixels);
		set({ ...withHistory(state), pixels, textDraft: null, textValue: "" });
	},

	cancelText: (): void => {
		if (get().textDraft) set({ textDraft: null });
	},

	/* ------------------------------ selection ------------------------------ */

	setSelection: (mask, mode = "replace"): void => {
		get().anchorFloating();
		set((state) => ({
			selection: mask ? combineMasks(state.selection, mask, mode) : null,
		}));
	},

	selectAll: (): void => {
		const { width, height } = get();
		get().setSelection(fullMask(width, height));
	},

	deselect: (): void => {
		get().setSelection(null);
	},

	invertSelection: (): void => {
		get().anchorFloating();
		set((state) => ({
			selection: invertMask(state.selection, state.width * state.height),
		}));
	},

	deleteSelection: (): void => {
		const state = get();
		if (state.floating) {
			// The pixels underneath are already cleared, just drop the floating part.
			set({ floating: null, selection: null });
			return;
		}
		if (!state.selection) return;
		state.commitPixels(eraseMasked(state.pixels, state.selection));
	},

	liftSelection: (): void => {
		const state = get();
		if (state.floating) return;
		const temporary = state.selection === null;
		const mask = state.selection ?? fullMask(state.width, state.height);
		const { base, lifted } = liftPixels(state.pixels, mask);
		set({
			...withHistory(state),
			pixels: base,
			selection: mask,
			floating: {
				lifted,
				mask,
				offsetX: 0,
				offsetY: 0,
				source: "lift",
				temporary,
			},
		});
	},

	setFloatingOffset: (offsetX, offsetY): void => {
		const { floating } = get();
		if (!floating) return;
		if (floating.offsetX === offsetX && floating.offsetY === offsetY) return;
		set({ floating: { ...floating, offsetX, offsetY } });
	},

	nudge: (dx, dy): void => {
		const state = get();
		if (!state.floating) {
			if (!state.selection) return;
			state.liftSelection();
		}
		const { floating } = get();
		if (!floating) return;
		get().setFloatingOffset(floating.offsetX + dx, floating.offsetY + dy);
	},

	anchorFloating: (): void => {
		const state = get();
		if (!state.floating) return;
		set(resolveFloating(state));
	},

	copy: (): void => {
		get().anchorFloating();
		const state = get();
		if (!state.selection) {
			state.showNotice("Select something to copy first");
			return;
		}
		const clip = extractClip(
			state.pixels,
			state.selection,
			state.width,
			state.height
		);
		set({ clipboard: clip });
	},

	cut: (): void => {
		get().copy();
		get().deleteSelection();
	},

	paste: (): void => {
		get().anchorFloating();
		const state = get();
		if (!state.clipboard) return;
		const { lifted, mask } = placeClip(
			state.clipboard,
			state.width,
			state.height
		);
		if (maskIsEmpty(mask)) return;
		set({
			...withHistory(state),
			selection: mask,
			floating: {
				lifted,
				mask,
				offsetX: 0,
				offsetY: 0,
				source: "paste",
				temporary: false,
			},
			tool: "move",
		});
	},

	/* -------------------------------- tools -------------------------------- */

	setTool: (tool): void => {
		if (tool !== "move") get().anchorFloating();
		if (tool !== "text") get().commitText();
		set({ tool });
	},

	setPrimaryColor: (color): void => {
		set({ primaryColor: normalizeHex(color) });
	},

	setSecondaryColor: (color): void => {
		set({ secondaryColor: normalizeHex(color) });
	},

	swapColors: (): void => {
		set((state) => ({
			primaryColor: state.secondaryColor,
			secondaryColor: state.primaryColor,
		}));
	},

	setBrushSize: (size): void => {
		set({ brushSize: Math.max(1, Math.min(MAX_BRUSH_SIZE, Math.round(size))) });
	},

	setBrushShape: (brushShape): void => {
		set({ brushShape });
	},

	setCustomBrush: (customBrush): void => {
		set({
			customBrush: cloneCustomBrush(customBrush),
			activeCustomBrushId: customBrush.id ?? "custom",
			brushShape: "custom",
		});
	},

	selectCustomBrushPreset: (id): void => {
		const preset = get().customBrushPresets.find((item) => item.id === id);
		if (!preset) return;
		set({
			customBrush: cloneCustomBrush(preset),
			activeCustomBrushId: id,
			brushShape: "custom",
		});
	},

	saveCustomBrushPreset: (name, brush): void => {
		const trimmed = name.trim() || "Custom Pattern";
		const id = `user-${Date.now()}`;
		const savedPreset: CustomBrush = {
			...cloneCustomBrush(brush),
			id,
			name: trimmed,
		};
		set((state) => ({
			customBrushPresets: [...state.customBrushPresets, savedPreset],
			customBrush: cloneCustomBrush(savedPreset),
			activeCustomBrushId: id,
			brushShape: "custom",
		}));
	},

	deleteCustomBrushPreset: (id): void => {
		if (!id.startsWith("user-")) return;
		set((state) => {
			const remaining = state.customBrushPresets.filter(
				(item) => item.id !== id
			);
			const nextActive =
				state.activeCustomBrushId === id
					? (remaining[0] ?? createDefaultCustomBrush())
					: state.customBrush;
			const nextActiveId =
				state.activeCustomBrushId === id
					? (remaining[0]?.id ?? "custom")
					: state.activeCustomBrushId;
			return {
				customBrushPresets: remaining,
				customBrush: cloneCustomBrush(nextActive),
				activeCustomBrushId: nextActiveId,
			};
		});
	},

	setCustomBrushOptions: (patch): void => {
		set((state) => ({
			customBrushOptions: { ...state.customBrushOptions, ...patch },
		}));
	},

	setSprayOptions: (patch): void => {
		set((state) => ({
			sprayOptions: { ...state.sprayOptions, ...patch },
		}));
	},

	setGradientOptions: (patch): void => {
		set((state) => ({
			gradientOptions: { ...state.gradientOptions, ...patch },
		}));
	},

	toggleRulerGrid: (): void => {
		set((state) => ({
			rulerGrid: { ...state.rulerGrid, enabled: !state.rulerGrid.enabled },
		}));
	},

	setRulerGrid: (patch): void => {
		set((state) => ({
			rulerGrid: { ...state.rulerGrid, ...patch },
		}));
	},

	resetRulerGrid: (): void => {
		set((state) => ({
			rulerGrid: {
				...DEFAULT_RULER_GRID,
				enabled: state.rulerGrid.enabled,
			},
		}));
	},

	togglePerspectiveGuide: (): void => {
		set((state) => ({
			perspectiveGuide: {
				...state.perspectiveGuide,
				enabled: !state.perspectiveGuide.enabled,
			},
		}));
	},

	setPerspectiveGuide: (patch): void => {
		set((state) => ({
			perspectiveGuide: { ...state.perspectiveGuide, ...patch },
		}));
	},

	resetPerspectiveGuide: (): void => {
		set((state) => ({
			perspectiveGuide: {
				...DEFAULT_PERSPECTIVE_GUIDE,
				enabled: state.perspectiveGuide.enabled,
				mode: state.perspectiveGuide.mode,
			},
		}));
	},

	toggleTiledPreview: (): void => {
		set((state) => ({
			tiledPreview: {
				...state.tiledPreview,
				enabled: !state.tiledPreview.enabled,
			},
		}));
	},

	setTiledPreview: (patch): void => {
		set((state) => ({
			tiledPreview: { ...state.tiledPreview, ...patch },
		}));
	},

	captureCustomBrush: (): boolean => {
		const state = get();
		const captured = captureBrushFromSelection(
			state.pixels,
			state.selection,
			state.width,
			state.height
		);
		if (!captured) {
			state.showNotice("Select non-empty pixels first to capture a brush");
			return false;
		}
		set({
			customBrush: captured,
			activeCustomBrushId: "custom",
			brushShape: "custom",
		});
		state.showNotice(
			`Captured ${captured.width}×${captured.height} custom brush`
		);
		return true;
	},

	togglePixelPerfect: (): void => {
		set((state) => ({ pixelPerfect: !state.pixelPerfect }));
	},

	toggleShapeFilled: (): void => {
		set((state) => ({ shapeFilled: !state.shapeFilled }));
	},

	toggleFillContiguous: (): void => {
		set((state) => ({ fillContiguous: !state.fillContiguous }));
	},

	setDitherPattern: (ditherPattern): void => {
		set({ ditherPattern });
	},

	setDitherDensity: (density): void => {
		set({ ditherDensity: Math.max(5, Math.min(100, Math.round(density))) });
	},

	toggleDitherTwoColor: (): void => {
		set((state) => ({ ditherTwoColor: !state.ditherTwoColor }));
	},

	setReplaceFromColor: (color): void => {
		set({ replaceFromColor: color ? normalizeHex(color) : null });
	},

	setReplaceTolerance: (tolerance): void => {
		set({ replaceTolerance: Math.max(0, Math.min(100, Math.round(tolerance))) });
	},

	setReplaceScope: (replaceScope): void => {
		set({ replaceScope });
	},

	replaceColor: (fromColor, toColor, tolerance, scope): number => {
		get().anchorFloating();
		const state = get();
		const active = state.layers[state.activeLayer];
		const actualTolerance = tolerance ?? state.replaceTolerance;
		const actualScope = scope ?? state.replaceScope;
		const normalizedFrom = normalizeHex(fromColor);
		const normalizedTo = normalizeHex(toColor);
		const targetPacked = hexToPacked(normalizedFrom);
		const replacementPacked = hexToPacked(normalizedTo);
		if (
			actualScope === "layer" &&
			(!active || active.kind === "reference" || active.locked)
		) {
			state.showNotice("Active layer is locked or a reference layer");
			return 0;
		}
		const mask = state.selection;
		if (actualScope === "layer") {
			const { pixels, count } = replaceColorInBuffer(
				state.pixels,
				targetPacked,
				replacementPacked,
				mask,
				actualTolerance
			);
			set({ replaceFromColor: normalizedFrom });
			if (count === 0) return 0;
			state.commitPixels(pixels);
			state.showNotice(`Replaced ${count} pixel${count === 1 ? "" : "s"}`);
			return count;
		}

		const frames = syncedFrames(state);
		const targetFrames = new Set<number>(
			actualScope === "all-frames"
				? frames.map((_, index) => index)
				: [state.currentFrame]
		);
		// Include any frame sharing a linked cel group with a targeted frame.
		const processedGroups = new Map<string, { pixels: PixelBuffer; count: number }>();
		let total = 0;

		const updatedFrames = frames.map((frame, frameIndex) => {
			const nextCels = Object.assign(
				{} as Record<number, PixelBuffer>,
				frame.cels
			);
			let changed = false;
			for (const layer of state.layers) {
				if (layer.kind === "reference" || layer.locked) continue;
				const linkGroup = frame.linked?.[layer.id];
				const inDirectScope = targetFrames.has(frameIndex);
				const groupKey = linkGroup ? `${layer.id}:${linkGroup}` : null;
				if (!inDirectScope && !(groupKey && processedGroups.has(groupKey))) {
					continue;
				}
				const cached = groupKey ? processedGroups.get(groupKey) : undefined;
				if (cached) {
					nextCels[layer.id] = cached.pixels;
					changed = true;
					continue;
				}
				const source = frame.cels[layer.id];
				if (!source) continue;
				const result = replaceColorInBuffer(
					source,
					targetPacked,
					replacementPacked,
					mask,
					actualTolerance
				);
				if (result.count > 0) {
					total += result.count;
					nextCels[layer.id] = result.pixels;
					changed = true;
					if (groupKey) {
						processedGroups.set(groupKey, result);
					}
				}
			}
			return changed ? { ...frame, cels: nextCels } : frame;
		});

		set({ replaceFromColor: normalizedFrom });
		if (total === 0) return 0;
		set({
			...withHistory(state),
			...framesPatch(
				state.layers,
				updatedFrames,
				state.currentFrame,
				state.activeLayer,
				state.width,
				state.height
			),
		});
		state.showNotice(`Replaced ${total} pixel${total === 1 ? "" : "s"}`);
		return total;
	},

	toggleSymmetryX: (): void => {
		set((state) => ({ symmetryX: !state.symmetryX }));
	},

	toggleSymmetryY: (): void => {
		set((state) => ({ symmetryY: !state.symmetryY }));
	},

	setSymmetryXPos: (position): void => {
		set((state) => ({
			symmetryXPos:
				position === null
					? null
					: Math.max(0.5, Math.min(state.width - 0.5, position)),
		}));
	},

	setSymmetryYPos: (position): void => {
		set((state) => ({
			symmetryYPos:
				position === null
					? null
					: Math.max(0.5, Math.min(state.height - 0.5, position)),
		}));
	},

	toggleSymmetryDiagonal: (): void => {
		set((state) => ({ symmetryDiagonal: !state.symmetryDiagonal }));
	},

	resetSymmetryAxes: (): void => {
		set({ symmetryXPos: null, symmetryYPos: null, symmetryDiagonal: false });
	},

	setColorRampOptions: (patch): void => {
		set((state) => ({
			colorRampOptions: { ...state.colorRampOptions, ...patch },
		}));
	},

	stepPrimaryShade: (direction): void => {
		set((state) => ({
			primaryColor: stepColorShade(
				state.primaryColor,
				direction,
				state.colorRampOptions
			),
		}));
	},

	setBlurStrength: (value): void => {
		set({ blurStrength: Math.max(5, Math.min(100, Math.round(value))) });
	},

	setBlurRadius: (value): void => {
		set({ blurRadius: Math.max(1, Math.min(3, Math.round(value))) });
	},

	toggleBlurPreserveAlpha: (): void => {
		set((state) => ({ blurPreserveAlpha: !state.blurPreserveAlpha }));
	},

	toggleBlurSnapPalette: (): void => {
		set((state) => ({ blurSnapPalette: !state.blurSnapPalette }));
	},

	addPaletteColor: (color): void => {
		const hex = normalizeHex(color);
		set((state) =>
			state.palette.includes(hex) ? {} : { palette: [...state.palette, hex] }
		);
	},

	removePaletteColor: (index): void => {
		set((state) => ({
			palette: state.palette.filter((_, position) => position !== index),
		}));
	},

	setPalette: (palette): void => {
		set({ palette: [...new Set(palette.map(normalizeHex))] });
	},

	/* --------------------------------- view -------------------------------- */

	setViewport: (viewportWidth, viewportHeight): void => {
		const first = get().viewportWidth === 0;
		set({ viewportWidth, viewportHeight });
		if (first) get().fitView();
	},

	fitView: (): void => {
		const state = get();
		if (state.viewportWidth === 0) return;
		set(
			fitZoom(
				state.width,
				state.height,
				state.viewportWidth,
				state.viewportHeight
			)
		);
	},

	zoomTo: (zoom, anchorX, anchorY): void => {
		const state = get();
		const x = anchorX ?? state.viewportWidth / 2;
		const y = anchorY ?? state.viewportHeight / 2;
		const documentX = (x - state.panX) / state.zoom;
		const documentY = (y - state.panY) / state.zoom;
		set({
			zoom,
			panX: Math.round(x - documentX * zoom),
			panY: Math.round(y - documentY * zoom),
		});
	},

	zoomStep: (direction, anchorX, anchorY): void => {
		const { zoom } = get();
		const next =
			direction > 0
				? ZOOM_LEVELS.find((level) => level > zoom)
				: [...ZOOM_LEVELS].reverse().find((level) => level < zoom);
		if (next !== undefined) get().zoomTo(next, anchorX, anchorY);
	},

	setPan: (panX, panY): void => {
		set({ panX: Math.round(panX), panY: Math.round(panY) });
	},

	toggleGrid: (): void => {
		set((state) => ({ showGrid: !state.showGrid }));
	},

	setCursor: (cursor): void => {
		const current = get().cursor;
		if (current?.x === cursor?.x && current?.y === cursor?.y) return;
		set({ cursor });
	},

	openDialog: (dialog): void => {
		set({ dialog });
	},

	showNotice: (message): void => {
		noticeId += 1;
		set({ notice: { id: noticeId, message } });
	},

	clearNotice: (): void => {
		set({ notice: null });
	},
}));

/** Pixels as currently visible, including a floating selection. */
export function visiblePixels(state: EditorState): PixelBuffer {
	const { floating } = state;
	if (!floating) return state.pixels;
	return compositeFloating(
		state.pixels,
		floating.lifted,
		floating.mask,
		state.width,
		state.height,
		floating.offsetX,
		floating.offsetY
	);
}

/**
 * The full image as shown on screen: all visible layers flattened, with
 * `active` (defaults to the active layer incl. floating selection) used for
 * the active layer.
 */
export function compositeView(
	state: EditorState,
	active: PixelBuffer = visiblePixels(state)
): PixelBuffer {
	return compositeLayers(
		state.layers.map((layer, index) =>
			index === state.activeLayer ? { ...layer, pixels: active } : layer
		),
		state.width * state.height
	);
}

/** Visible layers flattened (what gets exported). */
export function flattenedPixels(state: EditorState): PixelBuffer {
	return compositeView(state);
}

/** Every layer with up-to-date pixels, floating selection dropped in. */
export function documentLayers(state: EditorState): Array<Layer> {
	const active = visiblePixels(state);
	return state.layers.map((layer, index) =>
		index === state.activeLayer ? { ...layer, pixels: active } : layer
	);
}

/** Every frame with up-to-date cels, floating selection dropped in. */
export function documentFrames(state: EditorState): Array<Frame> {
	const cels = celsOf(documentLayers(state));
	return state.frames.map((frame, index) =>
		index === state.currentFrame ? { ...frame, cels } : frame
	);
}

/**
 * Frame `index` flattened (visible layers). The current frame includes the
 * floating selection, like the canvas.
 */
export function framePixels(state: EditorState, index: number): PixelBuffer {
	if (index === state.currentFrame) return compositeView(state);
	return compositeFrame(
		state.layers,
		state.frames[index],
		state.width * state.height
	);
}

/** The whole document, ready to save. */
export function documentData(state: EditorState): DocumentData {
	return {
		name: state.name,
		width: state.width,
		height: state.height,
		layers: documentLayers(state),
		activeLayer: state.activeLayer,
		frames: documentFrames(state),
		currentFrame: state.currentFrame,
		tags: state.tags,
		palette: state.palette,
		primaryColor: state.primaryColor,
		secondaryColor: state.secondaryColor,
	};
}
