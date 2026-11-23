import Konva from "konva";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	Group,
	Image as KonvaImage,
	Layer,
	Line,
	Rect,
	Shape,
	Stage,
} from "react-konva";
import type { FunctionComponent } from "../../../common/types";
import { MAJOR_GRID_STEP, PAINT_TOOLS } from "../constants";
import {
	hexToPacked,
	packedAlpha,
	packedToHex,
	TRANSPARENT,
} from "../lib/color";
import { onionSkinPixels } from "../lib/animation";
import { stampCustomBrush } from "../lib/brushPresets";
import { createBlurSampler } from "../lib/filters";
import { publishFrame } from "../lib/liveView";
import {
	brushOffsets,
	constrainLine,
	constrainSquare,
	ellipsePoints,
	floodFill,
	linePoints,
	plot,
	polygonMask,
	rectanglePoints,
	rectMask,
	regionMask,
	restorePixel,
	selectionEdges,
	stamp,
	stampDither,
	symmetricPoints,
	type PaintTarget,
} from "../lib/raster";
import { compositeLayers } from "../lib/layers";
import { renderText } from "../lib/text";
import {
	computeFisheyeArcs,
	fillGradient,
	gridCellBounds,
	intersectMaskWithRect,
	pickLayerAtPoint,
	resolvePerspectivePoints,
	snapPointToGrid,
	stampSpray,
} from "../lib/tools";
import { computePinchView, type PinchState } from "../lib/touchZoom";
import {
	compositeView,
	type EditorState,
	useEditorStore,
	visiblePixels,
	withTextPreview,
} from "../store/editorStore";
import type {
	BrushShape,
	CustomBrush,
	CustomBrushOptions,
	DitherPattern,
	GradientOptions,
	PixelBuffer,
	Point,
	SelectionMode,
	SprayOptions,
} from "../types";

type ShapeTool = "line" | "rectangle" | "ellipse";

type Interaction =
	| {
			kind: "paint";
			color: number;
			base: PixelBuffer;
			target: PaintTarget;
			last: Point;
			stroke: Array<Point>;
			size: number;
			shape: BrushShape;
			customBrush: CustomBrush;
			pixelPerfect: boolean;
	  }
	| {
			kind: "custom-brush";
			color: number;
			target: PaintTarget;
			last: Point;
			lastStamped: Point;
			brush: CustomBrush;
			options: CustomBrushOptions;
	  }
	| {
			kind: "spray";
			color: number;
			target: PaintTarget;
			current: Point;
			options: SprayOptions;
			timerId: number;
	  }
	| {
			kind: "gradient";
			base: PixelBuffer;
			target: PaintTarget;
			start: Point;
			seed: Point;
			primaryHex: string;
			secondaryHex: string;
			options: GradientOptions;
	  }
	| {
			kind: "perspective-handle";
			handle: "point1" | "point2" | "point3" | "horizon";
	  }
	| {
			kind: "dither";
			primaryColor: number;
			secondaryColor: number | null;
			target: PaintTarget;
			last: Point;
			size: number;
			shape: BrushShape;
			customBrush: CustomBrush;
			pattern: DitherPattern;
			density: number;
	  }
	| {
			kind: "shape";
			tool: ShapeTool;
			color: number;
			base: PixelBuffer;
			target: PaintTarget;
			start: Point;
			size: number;
			shape: BrushShape;
			customBrush: CustomBrush;
			filled: boolean;
	  }
	| {
			kind: "select-rect";
			start: Point;
			end: Point;
			mode: SelectionMode;
			moved: boolean;
	  }
	| { kind: "lasso"; points: Array<Point>; mode: SelectionMode }
	| { kind: "move"; start: Point; originX: number; originY: number }
	| {
			kind: "ref-move";
			layerIndex: number;
			start: Point;
			originX: number;
			originY: number;
	  }
	| {
			kind: "pan";
			clientX: number;
			clientY: number;
			panX: number;
			panY: number;
	  }
	| { kind: "pick"; primary: boolean }
	| {
			kind: "blur";
			target: PaintTarget;
			touched: Uint8Array;
			sample: (x: number, y: number) => number;
			last: Point;
			size: number;
			shape: BrushShape;
			customBrush: CustomBrush;
	  }
	| {
			kind: "contour";
			color: number;
			base: PixelBuffer;
			target: PaintTarget;
			path: Array<Point>;
			last: Point;
			size: number;
			shape: BrushShape;
			customBrush: CustomBrush;
	  }
	| { kind: "text-move"; start: Point; originX: number; originY: number };

type Preview =
	| { kind: "rect"; x: number; y: number; width: number; height: number }
	| { kind: "lasso"; points: Array<number> }
	| { kind: "gradient"; start: Point; end: Point }
	| null;

const getState = (): EditorState => useEditorStore.getState();

function selectionMode(event: PointerEvent): SelectionMode {
	if (event.altKey || event.ctrlKey || event.metaKey) return "subtract";
	if (event.shiftKey) return "add";
	return "replace";
}

function clampPoint(point: Point, width: number, height: number): Point {
	return {
		x: Math.max(0, Math.min(width - 1, point.x)),
		y: Math.max(0, Math.min(height - 1, point.y)),
	};
}

function checkerCell(zoom: number): number {
	if (zoom >= 16) return 0.5;
	if (zoom >= 8) return 1;
	return Math.ceil(8 / zoom);
}

function paintPoint(
	interaction: Extract<Interaction, { kind: "paint" }>,
	point: Point
): void {
	const { target, color, stroke } = interaction;
	if (
		!interaction.pixelPerfect ||
		interaction.size > 1 ||
		interaction.shape === "custom"
	) {
		stamp(
			target,
			point.x,
			point.y,
			interaction.size,
			interaction.shape,
			color,
			interaction.customBrush
		);
		return;
	}
	// Pixel-perfect: drop the corner pixel of every "L" shape in the stroke.
	const previous = stroke[stroke.length - 1];
	if (previous?.x === point.x && previous.y === point.y) return;
	stroke.push(point);
	plot(target, point.x, point.y, color);
	const count = stroke.length;
	if (count < 3) return;
	const a = stroke[count - 3];
	const b = stroke[count - 2];
	const c = stroke[count - 1];
	if (!a || !b || !c) return;
	const diagonal = Math.abs(a.x - c.x) === 1 && Math.abs(a.y - c.y) === 1;
	const corner = (b.x === a.x || b.y === a.y) && (b.x === c.x || b.y === c.y);
	if (diagonal && corner) {
		restorePixel(target, interaction.base, b.x, b.y);
		stroke.splice(count - 2, 1);
	}
}

function drawShape(
	interaction: Extract<Interaction, { kind: "shape" }>,
	rawEnd: Point,
	constrain: boolean
): void {
	const { start, target } = interaction;
	target.data.set(interaction.base);
	let end = rawEnd;
	if (constrain) {
		end =
			interaction.tool === "line"
				? constrainLine(start, rawEnd)
				: constrainSquare(start, rawEnd);
	}
	let outline: Array<Point>;
	let fill: Array<Point> = [];
	if (interaction.tool === "line") {
		outline = linePoints(start.x, start.y, end.x, end.y);
	} else {
		const points =
			interaction.tool === "rectangle"
				? rectanglePoints(start.x, start.y, end.x, end.y, interaction.filled)
				: ellipsePoints(start.x, start.y, end.x, end.y, interaction.filled);
		outline = points.outline;
		fill = points.fill;
	}
	for (const point of fill) plot(target, point.x, point.y, interaction.color);
	for (const point of outline) {
		stamp(
			target,
			point.x,
			point.y,
			interaction.size,
			interaction.shape,
			interaction.color,
			interaction.customBrush
		);
	}
}

function blurAt(
	interaction: Extract<Interaction, { kind: "blur" }>,
	point: Point
): void {
	const { target, touched } = interaction;
	const offsets = brushOffsets(
		interaction.size,
		interaction.shape,
		interaction.customBrush
	);
	for (const center of symmetricPoints(target, point.x, point.y)) {
		for (const offset of offsets) {
			const x = center.x + offset.x;
			const y = center.y + offset.y;
			if (x < 0 || y < 0 || x >= target.width || y >= target.height) continue;
			const index = y * target.width + x;
			if (touched[index] === 1) continue;
			if (target.mask && target.mask[index] !== 1) continue;
			// Each pixel is blurred once per stroke, from the original pixels,
			// so a stroke is predictable: drag again to blur more.
			touched[index] = 1;
			target.data[index] = interaction.sample(x, y);
		}
	}
}

function drawContour(
	interaction: Extract<Interaction, { kind: "contour" }>
): void {
	const { target, path, color } = interaction;
	target.data.set(interaction.base);
	if (path.length >= 3) {
		const area = polygonMask(
			target.width,
			target.height,
			path.map((point) => ({ x: point.x + 0.5, y: point.y + 0.5 }))
		);
		for (let index = 0; index < area.length; index++) {
			if (area[index] !== 1) continue;
			plot(
				target,
				index % target.width,
				Math.floor(index / target.width),
				color
			);
		}
	}
	for (const point of path) {
		stamp(
			target,
			point.x,
			point.y,
			interaction.size,
			interaction.shape,
			color,
			interaction.customBrush
		);
	}
}

function offsetSetEdges(offsets: Array<Point>): Array<number> {
	const cells = new Set(offsets.map((offset) => `${offset.x},${offset.y}`));
	const edges: Array<number> = [];
	for (const offset of offsets) {
		const { x, y } = offset;
		if (!cells.has(`${x},${y - 1}`)) edges.push(x, y, x + 1, y);
		if (!cells.has(`${x + 1},${y}`)) edges.push(x + 1, y, x + 1, y + 1);
		if (!cells.has(`${x},${y + 1}`)) edges.push(x, y + 1, x + 1, y + 1);
		if (!cells.has(`${x - 1},${y}`)) edges.push(x, y, x, y + 1);
	}
	return edges;
}

/** Size of the text box being placed (a caret-sized box when empty). */
function textBox(state: Pick<EditorState, "textValue" | "textStyle">): {
	width: number;
	height: number;
} {
	const bitmap = renderText(state.textValue || " ", state.textStyle);
	return { width: Math.max(1, bitmap.width), height: bitmap.height };
}

type RenderSlice =
	| { kind: "pixels"; key: string; startIndex: number; endIndex: number }
	| { kind: "reference"; key: string; layerId: number };

function buildRenderSlices(layers: EditorState["layers"]): Array<RenderSlice> {
	const slices: Array<RenderSlice> = [];
	let runStart: number | null = null;
	layers.forEach((layer, index) => {
		if (layer.kind === "reference") {
			if (!layer.visible || !layer.reference) return;
			if (runStart !== null) {
				slices.push({
					kind: "pixels",
					key: `pixels-${slices.length}`,
					startIndex: runStart,
					endIndex: index - 1,
				});
				runStart = null;
			}
			slices.push({
				kind: "reference",
				key: `ref-${layer.id}`,
				layerId: layer.id,
			});
		} else if (runStart === null) {
			runStart = index;
		}
	});
	if (runStart !== null) {
		slices.push({
			kind: "pixels",
			key: `pixels-${slices.length}`,
			startIndex: runStart,
			endIndex: layers.length - 1,
		});
	}
	return slices;
}

function paintBufferToCanvas(
	canvas: HTMLCanvasElement,
	data: PixelBuffer,
	width: number,
	height: number
): void {
	if (canvas.width !== width || canvas.height !== height) {
		canvas.width = width;
		canvas.height = height;
	}
	const context = canvas.getContext("2d");
	if (!context) return;
	context.putImageData(
		new ImageData(
			new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
			width,
			height
		),
		0,
		0
	);
}

export const PixelCanvas = (): FunctionComponent => {
	const containerRef = useRef<HTMLDivElement>(null);
	const stageRef = useRef<Konva.Stage>(null);
	const imageLayerRef = useRef<Konva.Layer>(null);
	const overlayLayerRef = useRef<Konva.Layer>(null);
	const sliceCanvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
	const [sliceCanvases, setSliceCanvases] = useState<
		Readonly<Record<string, HTMLCanvasElement>>
	>({});
	const loadingReferenceSourcesRef = useRef<Set<string>>(new Set());
	const [referenceImages, setReferenceImages] = useState<
		Readonly<Record<string, HTMLImageElement>>
	>({});
	const antsOffsetRef = useRef(0);
	const [bufferCanvas] = useState(() => document.createElement("canvas"));
	const [onionCanvas] = useState(() => document.createElement("canvas"));
	const [showOnion, setShowOnion] = useState(false);
	const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
	const [hover, setHover] = useState<Point | null>(null);
	const [preview, setPreview] = useState<Preview>(null);
	const [spaceHeld, setSpaceHeld] = useState(false);
	const [isPanning, setIsPanning] = useState(false);
	const [hoveringVpHandle, setHoveringVpHandle] = useState(false);

	const width = useEditorStore((state) => state.width);
	const height = useEditorStore((state) => state.height);
	const zoom = useEditorStore((state) => state.zoom);
	const panX = useEditorStore((state) => state.panX);
	const panY = useEditorStore((state) => state.panY);
	const showGrid = useEditorStore((state) => state.showGrid);
	const tool = useEditorStore((state) => state.tool);
	const brushSize = useEditorStore((state) => state.brushSize);
	const brushShape = useEditorStore((state) => state.brushShape);
	const customBrush = useEditorStore((state) => state.customBrush);
	const layers = useEditorStore((state) => state.layers);
	const selection = useEditorStore((state) => state.selection);
	const floating = useEditorStore((state) => state.floating);
	const symmetryX = useEditorStore((state) => state.symmetryX);
	const symmetryY = useEditorStore((state) => state.symmetryY);
	const symmetryXPos = useEditorStore((state) => state.symmetryXPos);
	const symmetryYPos = useEditorStore((state) => state.symmetryYPos);
	const rulerGrid = useEditorStore((state) => state.rulerGrid);
	const perspectiveGuide = useEditorStore((state) => state.perspectiveGuide);
	const tiledPreview = useEditorStore((state) => state.tiledPreview);
	const sprayOptions = useEditorStore((state) => state.sprayOptions);
	const textDraft = useEditorStore((state) => state.textDraft);
	const textValue = useEditorStore((state) => state.textValue);
	const textStyle = useEditorStore((state) => state.textStyle);

	const renderSlices = useMemo(() => buildRenderSlices(layers), [layers]);

	// Preload reference layer images whenever reference sources change.
	useEffect(() => {
		for (const layer of layers) {
			if (layer.kind !== "reference" || !layer.reference?.src) continue;
			const source = layer.reference.src;
			if (loadingReferenceSourcesRef.current.has(source)) continue;
			loadingReferenceSourcesRef.current.add(source);
			const image = new Image();
			image.onload = (): void => {
				setReferenceImages((previous) => ({ ...previous, [source]: image }));
			};
			image.src = source;
		}
	}, [layers]);

	/* --------------------------- pixel rendering -------------------------- */

	useEffect(() => {
		const draw = (state: EditorState, activePixels: PixelBuffer): void => {
			const composited = compositeView(state, activePixels);
			paintBufferToCanvas(bufferCanvas, composited, state.width, state.height);
			publishFrame(bufferCanvas);

			const slices = buildRenderSlices(state.layers);
			const pixelSlices = slices.filter(
				(slice): slice is Extract<RenderSlice, { kind: "pixels" }> =>
					slice.kind === "pixels"
			);
			if (pixelSlices.length > 1) {
				let addedSliceCanvas = false;
				for (const slice of pixelSlices) {
					let canvas = sliceCanvasesRef.current.get(slice.key);
					if (!canvas) {
						canvas = document.createElement("canvas");
						sliceCanvasesRef.current.set(slice.key, canvas);
						addedSliceCanvas = true;
					}
					const subset = state.layers
						.slice(slice.startIndex, slice.endIndex + 1)
						.map((layer, offset) =>
							slice.startIndex + offset === state.activeLayer
								? { ...layer, pixels: activePixels }
								: layer
						);
					paintBufferToCanvas(
						canvas,
						compositeLayers(subset, state.width * state.height),
						state.width,
						state.height
					);
				}
				if (addedSliceCanvas) {
					setSliceCanvases(Object.fromEntries(sliceCanvasesRef.current));
				}
			}
			stageRef.current?.batchDraw();
		};
		const drawState = (state: EditorState): void => {
			const active = withTextPreview(state, visiblePixels(state));
			draw(state, active);
		};
		drawState(getState());
		// Strokes in progress call `draw` directly through this event.
		const onLiveDraw = (event: Event): void => {
			const detail = (event as CustomEvent<PixelBuffer>).detail;
			draw(getState(), detail);
		};
		const container = containerRef.current;
		container?.addEventListener("pixel-live-draw", onLiveDraw);
		const unsubscribe = useEditorStore.subscribe((state, previous) => {
			const textChanged =
				state.textDraft !== previous.textDraft ||
				(state.textDraft !== null &&
					(state.textValue !== previous.textValue ||
						state.textStyle !== previous.textStyle ||
						state.primaryColor !== previous.primaryColor ||
						state.selection !== previous.selection));
			if (
				state.pixels !== previous.pixels ||
				state.floating !== previous.floating ||
				state.layers !== previous.layers ||
				state.activeLayer !== previous.activeLayer ||
				state.width !== previous.width ||
				state.height !== previous.height ||
				textChanged
			) {
				drawState(state);
			}
		});
		return (): void => {
			unsubscribe();
			container?.removeEventListener("pixel-live-draw", onLiveDraw);
		};
	}, [bufferCanvas]);

	/* ------------------------------ onion skin ---------------------------- */

	useEffect(() => {
		const render = (state: EditorState): void => {
			const pixels =
				state.onionSkin && !state.playing
					? onionSkinPixels(
							state.layers,
							state.frames,
							state.currentFrame,
							state.onionBefore,
							state.onionAfter,
							state.width * state.height
						)
					: null;
			setShowOnion(pixels !== null);
			if (!pixels) return;
			paintBufferToCanvas(onionCanvas, pixels, state.width, state.height);
			imageLayerRef.current?.batchDraw();
		};
		render(getState());
		return useEditorStore.subscribe((state, previous) => {
			if (
				state.onionSkin !== previous.onionSkin ||
				state.onionBefore !== previous.onionBefore ||
				state.onionAfter !== previous.onionAfter ||
				state.playing !== previous.playing ||
				state.currentFrame !== previous.currentFrame ||
				state.width !== previous.width ||
				state.height !== previous.height ||
				// Other frames only change through frame / layer operations.
				(state.onionSkin &&
					(state.frames !== previous.frames ||
						state.layers !== previous.layers))
			) {
				render(state);
			}
		});
	}, [onionCanvas]);

	/* ------------------------------ viewport ------------------------------ */

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const observer = new ResizeObserver(([entry]) => {
			if (!entry) return;
			const w = Math.floor(entry.contentRect.width);
			const h = Math.floor(entry.contentRect.height);
			setStageSize({ width: w, height: h });
			getState().setViewport(w, h);
		});
		observer.observe(container);
		return (): void => {
			observer.disconnect();
		};
	}, []);

	/* ------------------------------ marching ants ------------------------- */

	const edges = useMemo(
		() => (selection ? selectionEdges(selection, width, height) : []),
		[selection, width, height]
	);

	useEffect(() => {
		const layer = overlayLayerRef.current;
		if (edges.length === 0 || !layer) return;
		let lastTick = 0;
		const animation = new Konva.Animation((frame) => {
			if (!frame || frame.time - lastTick < 90) return false;
			lastTick = frame.time;
			antsOffsetRef.current = (antsOffsetRef.current + 1) % 8;
			return true;
		}, layer);
		animation.start();
		return (): void => {
			animation.stop();
		};
	}, [edges]);

	/* ------------------------------ keyboard ------------------------------ */

	useEffect(() => {
		const isTyping = (event: KeyboardEvent): boolean =>
			event.target instanceof HTMLElement &&
			(event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA");
		const onKeyDown = (event: KeyboardEvent): void => {
			if (event.code === "Space" && !isTyping(event)) {
				event.preventDefault();
				setSpaceHeld(true);
			}
		};
		const onKeyUp = (event: KeyboardEvent): void => {
			if (event.code === "Space") setSpaceHeld(false);
		};
		const onBlur = (): void => {
			setSpaceHeld(false);
		};
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", onKeyUp);
		window.addEventListener("blur", onBlur);
		return (): void => {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("keyup", onKeyUp);
			window.removeEventListener("blur", onBlur);
		};
	}, []);

	/* ------------------------------- pointer ------------------------------ */

	const spaceHeldRef = useRef(false);
	useEffect(() => {
		spaceHeldRef.current = spaceHeld;
	}, [spaceHeld]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		let interaction: Interaction | null = null;
		let lastPaintPoint: Point | null = null;
		let wheelAccumulator = 0;
		const activeTouches = new Map<number, { clientX: number; clientY: number }>();
		let pinchState: PinchState | null = null;
		let suppressTouchUntilAllUp = false;
		let lastTouchSyncCommitAt = 0;

		const liveDraw = (data: PixelBuffer): void => {
			container.dispatchEvent(
				new CustomEvent("pixel-live-draw", { detail: data })
			);
		};

		const cancelActiveInteraction = (): void => {
			const current = interaction;
			interaction = null;
			if (current) {
				if (current.kind === "spray") {
					window.clearInterval(current.timerId);
				}
				setPreview(null);
				const state = getState();
				liveDraw(withTextPreview(state, visiblePixels(state)));
				setIsPanning(false);
			}
			if (performance.now() - lastTouchSyncCommitAt < 120) {
				getState().undo();
				lastTouchSyncCommitAt = 0;
			}
		};

		const startPinch = (): void => {
			const entries = Array.from(activeTouches.values());
			const first = entries[0];
			const second = entries[1];
			if (!first || !second) return;
			const state = getState();
			const bounds = container.getBoundingClientRect();
			const midpointLocalX =
				(first.clientX + second.clientX) / 2 - bounds.left;
			const midpointLocalY =
				(first.clientY + second.clientY) / 2 - bounds.top;
			const startDistance = Math.hypot(
				second.clientX - first.clientX,
				second.clientY - first.clientY
			);
			pinchState = {
				startDistance,
				startZoom: state.zoom,
				anchorDocumentX: (midpointLocalX - state.panX) / state.zoom,
				anchorDocumentY: (midpointLocalY - state.panY) / state.zoom,
			};
			setHover(null);
			state.setCursor(null);
			setIsPanning(true);
		};

		const toDocument = (event: { clientX: number; clientY: number }): Point => {
			const bounds = container.getBoundingClientRect();
			const { zoom: z, panX: x, panY: y } = getState();
			return {
				x: (event.clientX - bounds.left - x) / z,
				y: (event.clientY - bounds.top - y) / z,
			};
		};

		const toPixel = (point: Point): Point => ({
			x: Math.floor(point.x),
			y: Math.floor(point.y),
		});

		const pick = (pixel: Point, primary: boolean): void => {
			const state = getState();
			if (
				pixel.x < 0 ||
				pixel.y < 0 ||
				pixel.x >= state.width ||
				pixel.y >= state.height
			)
				return;
			// Samples what you see (all visible layers), like most editors.
			const value =
				compositeView(state)[pixel.y * state.width + pixel.x] ?? TRANSPARENT;
			if (packedAlpha(value) === 0) return;
			const hex = packedToHex(value);
			if (primary) state.setPrimaryColor(hex);
			else state.setSecondaryColor(hex);
		};

		const makeTarget = (
			state: EditorState,
			seedPixel?: Point
		): PaintTarget => {
			let mask = state.selection;
			if (state.rulerGrid.enabled && state.rulerGrid.limitToCell && seedPixel) {
				const cellBounds = gridCellBounds(
					seedPixel,
					state.rulerGrid,
					state.width,
					state.height
				);
				mask = intersectMaskWithRect(
					state.selection,
					cellBounds,
					state.width,
					state.height
				);
			}
			return {
				data: state.pixels.slice(),
				width: state.width,
				height: state.height,
				mask,
				symmetryX: state.symmetryX,
				symmetryY: state.symmetryY,
				symmetryXPos: state.symmetryXPos,
				symmetryYPos: state.symmetryYPos,
			};
		};

		const snapPixelIfEnabled = (state: EditorState, rawPixel: Point): Point =>
			state.rulerGrid.enabled && state.rulerGrid.snapToGrid
				? snapPointToGrid(rawPixel, state.rulerGrid, state.width, state.height)
				: rawPixel;

		const hitPerspectiveHandle = (
			state: EditorState,
			documentPoint: Point,
			isTouch = false
		): "point1" | "point2" | "point3" | "horizon" | null => {
			const guide = state.perspectiveGuide;
			if (!guide.enabled || guide.lockHandles) return null;
			const resolved = resolvePerspectivePoints(
				guide,
				state.width,
				state.height
			);
			const threshold = (isTouch ? 22 : 10) / Math.max(1, state.zoom);
			const check = (target: Point): boolean =>
				Math.hypot(documentPoint.x - target.x, documentPoint.y - target.y) <=
				threshold;

			if (guide.mode === "fisheye") {
				return check(resolved.center) ? "point1" : null;
			}
			if (check(resolved.point1)) return "point1";
			if (guide.mode !== "1-point" && check(resolved.point2)) return "point2";
			if (guide.mode === "3-point" && check(resolved.point3)) return "point3";
			return null;
		};

		const onPointerDown = (event: PointerEvent): void => {
			if (event.pointerType === "touch") {
				activeTouches.set(event.pointerId, {
					clientX: event.clientX,
					clientY: event.clientY,
				});
				if (activeTouches.size >= 2) {
					event.preventDefault();
					cancelActiveInteraction();
					suppressTouchUntilAllUp = true;
					if (!pinchState && activeTouches.size === 2) {
						startPinch();
					}
					return;
				}
				if (suppressTouchUntilAllUp) {
					return;
				}
			}
			if (interaction) return;
			const startState = getState();
			const point = toDocument(event);
			const rawPixel = toPixel(point);
			const pixel = snapPixelIfEnabled(startState, rawPixel);

			const wantsPan =
				event.button === 1 ||
				spaceHeldRef.current ||
				startState.tool === "hand";
			if (wantsPan) {
				event.preventDefault();
				container.setPointerCapture(event.pointerId);
				interaction = {
					kind: "pan",
					clientX: event.clientX,
					clientY: event.clientY,
					panX: startState.panX,
					panY: startState.panY,
				};
				setIsPanning(true);
				return;
			}
			if (event.button !== 0 && event.button !== 2) return;

			if (event.button === 0) {
				const handle = hitPerspectiveHandle(
					startState,
					point,
					event.pointerType === "touch"
				);
				if (handle) {
					event.preventDefault();
					container.setPointerCapture(event.pointerId);
					interaction = { kind: "perspective-handle", handle };
					return;
				}
			}

			// Drawing on a playing animation would land on a random frame.
			if (startState.playing) startState.setPlaying(false);
			container.setPointerCapture(event.pointerId);
			const primary = event.button === 0;
			let activeTool = startState.tool;
			if (event.altKey && PAINT_TOOLS.has(activeTool))
				activeTool = "eyedropper";

			if (activeTool !== "move") startState.anchorFloating();
			const state = getState();
			const activeLayerObject = state.layers[state.activeLayer];
			const colorHex = primary ? state.primaryColor : state.secondaryColor;
			const drawsPixels =
				PAINT_TOOLS.has(activeTool) ||
				activeTool === "fill" ||
				activeTool === "gradient";
			const mutatesActiveLayer =
				drawsPixels ||
				activeTool === "text" ||
				(activeTool === "replace" && state.replaceScope === "layer");

			if (activeLayerObject?.kind === "reference") {
				if (activeTool === "move" && activeLayerObject.reference) {
					if (activeLayerObject.locked) {
						state.showNotice("Reference layer is locked");
						return;
					}
					interaction = {
						kind: "ref-move",
						layerIndex: state.activeLayer,
						start: point,
						originX: activeLayerObject.reference.x,
						originY: activeLayerObject.reference.y,
					};
					return;
				}
				if (mutatesActiveLayer) {
					state.showNotice(
						"Reference layer cannot be painted · select a pixel layer or use Move"
					);
					return;
				}
			}

			if (activeLayerObject?.locked && mutatesActiveLayer) {
				state.showNotice("Layer is locked · unlock it in the timeline to edit");
				return;
			}

			const inside =
				rawPixel.x >= 0 &&
				rawPixel.y >= 0 &&
				rawPixel.x < state.width &&
				rawPixel.y < state.height;
			if (
				drawsPixels &&
				inside &&
				state.selection &&
				state.selection[rawPixel.y * state.width + rawPixel.x] !== 1
			) {
				state.showNotice(
					"Drawing is limited to the selection · press Esc to deselect"
				);
			} else if (
				(drawsPixels || activeTool === "text") &&
				activeLayerObject?.visible === false
			) {
				state.showNotice("This layer is hidden · show it to see your changes");
			}
			const color =
				activeTool === "eraser" ? TRANSPARENT : hexToPacked(colorHex);

			switch (activeTool) {
				case "pencil":
				case "eraser": {
					const target = makeTarget(state, rawPixel);
					const paint: Extract<Interaction, { kind: "paint" }> = {
						kind: "paint",
						color,
						base: state.pixels,
						target,
						last: pixel,
						stroke: [],
						size: state.brushSize,
						shape: state.brushShape,
						customBrush: state.customBrush,
						pixelPerfect: state.pixelPerfect,
					};
					if (event.shiftKey && lastPaintPoint) {
						for (const linePoint of linePoints(
							lastPaintPoint.x,
							lastPaintPoint.y,
							pixel.x,
							pixel.y
						)) {
							paintPoint(paint, linePoint);
						}
					} else {
						paintPoint(paint, pixel);
					}
					interaction = paint;
					liveDraw(target.data);
					break;
				}
				case "custom-brush": {
					const target = makeTarget(state, rawPixel);
					const customInteraction: Extract<
						Interaction,
						{ kind: "custom-brush" }
					> = {
						kind: "custom-brush",
						color,
						target,
						last: pixel,
						lastStamped: pixel,
						brush: state.customBrush,
						options: state.customBrushOptions,
					};
					if (event.shiftKey && lastPaintPoint) {
						let lastDone = lastPaintPoint;
						for (const linePoint of linePoints(
							lastPaintPoint.x,
							lastPaintPoint.y,
							pixel.x,
							pixel.y
						)) {
							if (
								Math.hypot(linePoint.x - lastDone.x, linePoint.y - lastDone.y) >=
								customInteraction.options.spacing
							) {
								stampCustomBrush(
									target,
									linePoint.x,
									linePoint.y,
									customInteraction.brush,
									color,
									customInteraction.options
								);
								lastDone = linePoint;
							}
						}
						customInteraction.lastStamped = lastDone;
					} else {
						stampCustomBrush(
							target,
							pixel.x,
							pixel.y,
							customInteraction.brush,
							color,
							customInteraction.options
						);
					}
					interaction = customInteraction;
					liveDraw(target.data);
					break;
				}
				case "spray": {
					const target = makeTarget(state, rawPixel);
					const sprayOptions = state.sprayOptions;
					stampSpray(target, pixel.x, pixel.y, color, sprayOptions);
					const sprayInteraction: Extract<Interaction, { kind: "spray" }> = {
						kind: "spray",
						color,
						target,
						current: pixel,
						options: sprayOptions,
						timerId: 0,
					};
					sprayInteraction.timerId = window.setInterval(() => {
						stampSpray(
							sprayInteraction.target,
							sprayInteraction.current.x,
							sprayInteraction.current.y,
							sprayInteraction.color,
							sprayInteraction.options
						);
						liveDraw(sprayInteraction.target.data);
					}, sprayOptions.rate);
					interaction = sprayInteraction;
					liveDraw(target.data);
					break;
				}
				case "dither": {
					const target = makeTarget(state, rawPixel);
					const primaryPacked = hexToPacked(
						primary ? state.primaryColor : state.secondaryColor
					);
					const secondaryPacked = state.ditherTwoColor
						? hexToPacked(primary ? state.secondaryColor : state.primaryColor)
						: null;
					const ditherInteraction: Extract<Interaction, { kind: "dither" }> = {
						kind: "dither",
						primaryColor: primaryPacked,
						secondaryColor: secondaryPacked,
						target,
						last: pixel,
						size: state.brushSize,
						shape: state.brushShape,
						customBrush: state.customBrush,
						pattern: state.ditherPattern,
						density: state.ditherDensity,
					};
					if (event.shiftKey && lastPaintPoint) {
						for (const linePoint of linePoints(
							lastPaintPoint.x,
							lastPaintPoint.y,
							pixel.x,
							pixel.y
						)) {
							stampDither(
								target,
								linePoint.x,
								linePoint.y,
								ditherInteraction.size,
								ditherInteraction.shape,
								primaryPacked,
								secondaryPacked,
								ditherInteraction.pattern,
								ditherInteraction.density,
								ditherInteraction.customBrush
							);
						}
					} else {
						stampDither(
							target,
							pixel.x,
							pixel.y,
							ditherInteraction.size,
							ditherInteraction.shape,
							primaryPacked,
							secondaryPacked,
							ditherInteraction.pattern,
							ditherInteraction.density,
							ditherInteraction.customBrush
						);
					}
					interaction = ditherInteraction;
					liveDraw(target.data);
					break;
				}
				case "line":
				case "rectangle":
				case "ellipse": {
					const shapeInteraction: Extract<Interaction, { kind: "shape" }> = {
						kind: "shape",
						tool: activeTool,
						color,
						base: state.pixels,
						target: makeTarget(state, rawPixel),
						start: pixel,
						size: state.brushSize,
						shape: state.brushShape,
						customBrush: state.customBrush,
						filled: state.shapeFilled,
					};
					drawShape(shapeInteraction, pixel, event.shiftKey);
					interaction = shapeInteraction;
					liveDraw(shapeInteraction.target.data);
					break;
				}
				case "fill": {
					const target = makeTarget(state, rawPixel);
					const data = target.data;
					const changed = floodFill(
						data,
						state.width,
						state.height,
						rawPixel.x,
						rawPixel.y,
						color,
						state.fillContiguous,
						target.mask,
						{
							symmetryX: state.symmetryX,
							symmetryY: state.symmetryY,
							symmetryXPos: state.symmetryXPos,
							symmetryYPos: state.symmetryYPos,
						}
					);
					if (changed) {
						state.commitPixels(data);
						if (event.pointerType === "touch") {
							lastTouchSyncCommitAt = performance.now();
						}
					}
					break;
				}
				case "gradient": {
					const target = makeTarget(state, rawPixel);
					const primaryHex = primary
						? state.primaryColor
						: state.secondaryColor;
					const secondaryHex = primary
						? state.secondaryColor
						: state.primaryColor;
					const gradientInteraction: Extract<
						Interaction,
						{ kind: "gradient" }
					> = {
						kind: "gradient",
						base: state.pixels,
						target,
						start: pixel,
						seed: rawPixel,
						primaryHex,
						secondaryHex,
						options: state.gradientOptions,
					};
					fillGradient(
						gradientInteraction.target,
						gradientInteraction.base,
						pixel,
						pixel,
						primaryHex,
						secondaryHex,
						gradientInteraction.options,
						rawPixel
					);
					interaction = gradientInteraction;
					setPreview({ kind: "gradient", start: pixel, end: pixel });
					liveDraw(gradientInteraction.target.data);
					break;
				}
				case "replace": {
					if (!inside) break;
					const offset = rawPixel.y * state.width + rawPixel.x;
					let sampled = state.pixels[offset] ?? TRANSPARENT;
					if (packedAlpha(sampled) === 0 && state.replaceScope !== "layer") {
						sampled = compositeView(state)[offset] ?? TRANSPARENT;
					}
					if (packedAlpha(sampled) === 0) {
						state.showNotice("Click a colored pixel to choose the color to replace");
						break;
					}
					const pickedHex = packedToHex(sampled);
					if (event.altKey) {
						state.setReplaceFromColor(pickedHex);
						break;
					}
					state.replaceColor(
						pickedHex,
						primary ? state.primaryColor : state.secondaryColor
					);
					if (event.pointerType === "touch") {
						lastTouchSyncCommitAt = performance.now();
					}
					break;
				}
				case "eyedropper": {
					pick(rawPixel, primary);
					interaction = { kind: "pick", primary };
					break;
				}
				case "layer-picker": {
					const hit = pickLayerAtPoint(
						state.layers,
						state.activeLayer,
						visiblePixels(state),
						state.width,
						state.height,
						point,
						rawPixel
					);
					if (hit) {
						state.setActiveLayer(hit.layerIndex);
						state.showNotice(`Switched to layer "${hit.layer.name}"`);
					} else {
						state.showNotice("No visible layer pixel at cursor");
					}
					break;
				}
				case "wand": {
					if (!inside) {
						if (selectionMode(event) === "replace") state.deselect();
						break;
					}
					const mask = regionMask(
						visiblePixels(state),
						state.width,
						state.height,
						rawPixel.x,
						rawPixel.y,
						state.fillContiguous,
						null
					);
					state.setSelection(mask, selectionMode(event));
					break;
				}
				case "select-rect": {
					const start = clampPoint(pixel, state.width, state.height);
					interaction = {
						kind: "select-rect",
						start,
						end: start,
						mode: selectionMode(event),
						moved: false,
					};
					setPreview({
						kind: "rect",
						x: start.x,
						y: start.y,
						width: 1,
						height: 1,
					});
					break;
				}
				case "lasso": {
					interaction = {
						kind: "lasso",
						points: [point],
						mode: selectionMode(event),
					};
					setPreview({ kind: "lasso", points: [point.x, point.y] });
					break;
				}
				case "move": {
					if (!state.floating) state.liftSelection();
					const { floating: lifted } = getState();
					interaction = {
						kind: "move",
						start: point,
						originX: lifted?.offsetX ?? 0,
						originY: lifted?.offsetY ?? 0,
					};
					break;
				}
				case "blur": {
					const blur: Extract<Interaction, { kind: "blur" }> = {
						kind: "blur",
						target: makeTarget(state, rawPixel),
						touched: new Uint8Array(state.width * state.height),
						sample: createBlurSampler(state.pixels, state.width, state.height, {
							radius: state.blurRadius,
							strength: state.blurStrength,
							preserveAlpha: state.blurPreserveAlpha,
							palette: state.blurSnapPalette
								? state.palette.map((hex) => hexToPacked(hex))
								: null,
						}),
						last: pixel,
						size: state.brushSize,
						shape: state.brushShape,
						customBrush: state.customBrush,
					};
					blurAt(blur, pixel);
					interaction = blur;
					liveDraw(blur.target.data);
					break;
				}
				case "contour": {
					const contour: Extract<Interaction, { kind: "contour" }> = {
						kind: "contour",
						color,
						base: state.pixels,
						target: makeTarget(state, rawPixel),
						path: [pixel],
						last: pixel,
						size: state.brushSize,
						shape: state.brushShape,
						customBrush: state.customBrush,
					};
					drawContour(contour);
					interaction = contour;
					liveDraw(contour.target.data);
					break;
				}
				case "text": {
					// Keep focus in the text box in the options bar.
					event.preventDefault();
					const draft = state.textDraft;
					if (draft) {
						const box = textBox(state);
						const insideBox =
							pixel.x >= draft.x - 1 &&
							pixel.y >= draft.y - 1 &&
							pixel.x <= draft.x + box.width &&
							pixel.y <= draft.y + box.height;
						if (insideBox) {
							interaction = {
								kind: "text-move",
								start: point,
								originX: draft.x,
								originY: draft.y,
							};
							break;
						}
						state.commitText();
					}
					getState().placeText(pixel);
					interaction = {
						kind: "text-move",
						start: point,
						originX: pixel.x,
						originY: pixel.y,
					};
					break;
				}
				case "hand": {
					break;
				}
			}
		};

		const onPointerMove = (event: PointerEvent): void => {
			if (event.pointerType === "touch" && activeTouches.has(event.pointerId)) {
				activeTouches.set(event.pointerId, {
					clientX: event.clientX,
					clientY: event.clientY,
				});
				if (pinchState && activeTouches.size >= 2) {
					event.preventDefault();
					const entries = Array.from(activeTouches.values());
					const first = entries[0];
					const second = entries[1];
					if (first && second) {
						const bounds = container.getBoundingClientRect();
						const midpointLocalX =
							(first.clientX + second.clientX) / 2 - bounds.left;
						const midpointLocalY =
							(first.clientY + second.clientY) / 2 - bounds.top;
						const distance = Math.hypot(
							second.clientX - first.clientX,
							second.clientY - first.clientY
						);
						const view = computePinchView(
							pinchState,
							distance,
							midpointLocalX,
							midpointLocalY
						);
						getState().setView(view.zoom, view.panX, view.panY);
					}
					return;
				}
				if (suppressTouchUntilAllUp) {
					return;
				}
			}
			const point = toDocument(event);
			const rawPixel = toPixel(point);
			const state = getState();
			const pixel = snapPixelIfEnabled(state, rawPixel);
			const inside =
				rawPixel.x >= 0 &&
				rawPixel.y >= 0 &&
				rawPixel.x < state.width &&
				rawPixel.y < state.height;
			state.setCursor(inside ? rawPixel : null);
			setHover((current) => {
				if (!inside) return null;
				return current?.x === pixel.x && current.y === pixel.y
					? current
					: pixel;
			});
			if (!interaction) {
				const overHandle = hitPerspectiveHandle(state, point) !== null;
				setHoveringVpHandle((current) =>
					current === overHandle ? current : overHandle
				);
				return;
			}

			switch (interaction.kind) {
				case "perspective-handle": {
					const guide = state.perspectiveGuide;
					if (interaction.handle === "point1") {
						if (guide.mode === "1-point" || guide.mode === "fisheye") {
							state.setPerspectiveGuide({
								point1: {
									x: Math.round(point.x * 2) / 2,
									y: Math.round(point.y * 2) / 2,
								},
								...(guide.mode === "1-point"
									? { horizonY: Math.round(point.y * 2) / 2 }
									: {}),
							});
						} else {
							const nextY = Math.round(point.y * 2) / 2;
							state.setPerspectiveGuide({
								horizonY: nextY,
								point1: { x: Math.round(point.x * 2) / 2, y: nextY },
							});
						}
					} else if (interaction.handle === "point2") {
						const nextY = Math.round(point.y * 2) / 2;
						state.setPerspectiveGuide({
							horizonY: nextY,
							point2: { x: Math.round(point.x * 2) / 2, y: nextY },
						});
					} else if (interaction.handle === "point3") {
						state.setPerspectiveGuide({
							point3: {
								x: Math.round(point.x * 2) / 2,
								y: Math.round(point.y * 2) / 2,
							},
						});
					}
					break;
				}
				case "paint": {
					const { last } = interaction;
					if (last.x === pixel.x && last.y === pixel.y) return;
					const points = linePoints(last.x, last.y, pixel.x, pixel.y).slice(1);
					for (const linePoint of points) paintPoint(interaction, linePoint);
					interaction.last = pixel;
					liveDraw(interaction.target.data);
					break;
				}
				case "custom-brush": {
					const { last } = interaction;
					if (last.x === pixel.x && last.y === pixel.y) return;
					const points = linePoints(last.x, last.y, pixel.x, pixel.y).slice(1);
					let stampedAny = false;
					for (const linePoint of points) {
						if (
							Math.hypot(
								linePoint.x - interaction.lastStamped.x,
								linePoint.y - interaction.lastStamped.y
							) >= interaction.options.spacing
						) {
							stampCustomBrush(
								interaction.target,
								linePoint.x,
								linePoint.y,
								interaction.brush,
								interaction.color,
								interaction.options
							);
							interaction.lastStamped = linePoint;
							stampedAny = true;
						}
					}
					interaction.last = pixel;
					if (stampedAny) liveDraw(interaction.target.data);
					break;
				}
				case "spray": {
					interaction.current = pixel;
					break;
				}
				case "gradient": {
					const endPoint = event.shiftKey
						? constrainLine(interaction.start, pixel)
						: pixel;
					interaction.target.data.set(interaction.base);
					fillGradient(
						interaction.target,
						interaction.base,
						interaction.start,
						endPoint,
						interaction.primaryHex,
						interaction.secondaryHex,
						interaction.options,
						interaction.seed
					);
					setPreview({
						kind: "gradient",
						start: interaction.start,
						end: endPoint,
					});
					liveDraw(interaction.target.data);
					break;
				}
				case "dither": {
					const { last } = interaction;
					if (last.x === pixel.x && last.y === pixel.y) return;
					const points = linePoints(last.x, last.y, pixel.x, pixel.y).slice(1);
					for (const linePoint of points) {
						stampDither(
							interaction.target,
							linePoint.x,
							linePoint.y,
							interaction.size,
							interaction.shape,
							interaction.primaryColor,
							interaction.secondaryColor,
							interaction.pattern,
							interaction.density,
							interaction.customBrush
						);
					}
					interaction.last = pixel;
					liveDraw(interaction.target.data);
					break;
				}
				case "shape": {
					drawShape(interaction, pixel, event.shiftKey);
					liveDraw(interaction.target.data);
					break;
				}
				case "pick": {
					pick(rawPixel, interaction.primary);
					break;
				}
				case "blur": {
					const { last } = interaction;
					if (last.x === pixel.x && last.y === pixel.y) return;
					for (const linePoint of linePoints(
						last.x,
						last.y,
						pixel.x,
						pixel.y
					)) {
						blurAt(interaction, linePoint);
					}
					interaction.last = pixel;
					liveDraw(interaction.target.data);
					break;
				}
				case "contour": {
					const { last } = interaction;
					if (last.x === pixel.x && last.y === pixel.y) return;
					interaction.path.push(
						...linePoints(last.x, last.y, pixel.x, pixel.y).slice(1)
					);
					interaction.last = pixel;
					drawContour(interaction);
					liveDraw(interaction.target.data);
					break;
				}
				case "text-move": {
					state.placeText({
						x: interaction.originX + Math.round(point.x - interaction.start.x),
						y: interaction.originY + Math.round(point.y - interaction.start.y),
					});
					break;
				}
				case "select-rect": {
					let end = clampPoint(pixel, state.width, state.height);
					if (event.shiftKey && interaction.mode !== "add") {
						end = clampPoint(
							constrainSquare(interaction.start, end),
							state.width,
							state.height
						);
					}
					if (end.x !== interaction.start.x || end.y !== interaction.start.y)
						interaction.moved = true;
					interaction.end = end;
					const { start } = interaction;
					setPreview({
						kind: "rect",
						x: Math.min(start.x, end.x),
						y: Math.min(start.y, end.y),
						width: Math.abs(end.x - start.x) + 1,
						height: Math.abs(end.y - start.y) + 1,
					});
					break;
				}
				case "lasso": {
					const previous = interaction.points[interaction.points.length - 1];
					if (
						previous &&
						Math.hypot(previous.x - point.x, previous.y - point.y) < 0.25
					)
						return;
					interaction.points.push(point);
					setPreview({
						kind: "lasso",
						points: interaction.points.flatMap((p) => [p.x, p.y]),
					});
					break;
				}
				case "move": {
					state.setFloatingOffset(
						interaction.originX + Math.round(point.x - interaction.start.x),
						interaction.originY + Math.round(point.y - interaction.start.y)
					);
					break;
				}
				case "ref-move": {
					state.updateReferenceLayer(interaction.layerIndex, {
						x: interaction.originX + (point.x - interaction.start.x),
						y: interaction.originY + (point.y - interaction.start.y),
					});
					break;
				}
				case "pan": {
					state.setPan(
						interaction.panX + event.clientX - interaction.clientX,
						interaction.panY + event.clientY - interaction.clientY
					);
					break;
				}
			}
		};

		const finish = (event: PointerEvent): void => {
			if (event.pointerType === "touch") {
				activeTouches.delete(event.pointerId);
				if (pinchState && activeTouches.size < 2) {
					pinchState = null;
					setIsPanning(false);
				}
				if (activeTouches.size === 0) {
					suppressTouchUntilAllUp = false;
					setHover(null);
					getState().setCursor(null);
				}
			}
			if (container.hasPointerCapture(event.pointerId)) {
				container.releasePointerCapture(event.pointerId);
			}
			const current = interaction;
			interaction = null;
			if (!current) return;
			const state = getState();
			switch (current.kind) {
				case "paint":
				case "dither": {
					lastPaintPoint = current.last;
					state.commitPixels(current.target.data);
					break;
				}
				case "custom-brush": {
					lastPaintPoint = current.last;
					state.commitPixels(current.target.data);
					break;
				}
				case "spray": {
					window.clearInterval(current.timerId);
					state.commitPixels(current.target.data);
					break;
				}
				case "gradient": {
					setPreview(null);
					state.commitPixels(current.target.data);
					break;
				}
				case "shape": {
					state.commitPixels(current.target.data);
					break;
				}
				case "blur":
				case "contour": {
					state.commitPixels(current.target.data);
					break;
				}
				case "select-rect": {
					setPreview(null);
					if (!current.moved) {
						if (current.mode === "replace") state.deselect();
						break;
					}
					const { start, end } = current;
					state.setSelection(
						rectMask(state.width, state.height, start.x, start.y, end.x, end.y),
						current.mode
					);
					break;
				}
				case "lasso": {
					setPreview(null);
					if (current.points.length < 3) {
						if (current.mode === "replace") state.deselect();
						break;
					}
					const mask = polygonMask(state.width, state.height, current.points);
					state.setSelection(mask, current.mode);
					break;
				}
				case "pan": {
					setIsPanning(false);
					break;
				}
				case "perspective-handle":
				case "move":
				case "ref-move":
				case "pick":
				case "text-move": {
					break;
				}
			}
		};

		const onPointerLeave = (): void => {
			if (!interaction) {
				setHover(null);
				getState().setCursor(null);
			}
		};

		const onWheel = (event: WheelEvent): void => {
			event.preventDefault();
			const state = getState();
			if (event.shiftKey) {
				state.setPan(state.panX - event.deltaY, state.panY);
				return;
			}
			wheelAccumulator += event.deltaY;
			if (Math.abs(wheelAccumulator) < 40) return;
			const bounds = container.getBoundingClientRect();
			state.zoomStep(
				wheelAccumulator < 0 ? 1 : -1,
				event.clientX - bounds.left,
				event.clientY - bounds.top
			);
			wheelAccumulator = 0;
		};

		const onContextMenu = (event: Event): void => {
			event.preventDefault();
		};

		container.addEventListener("pointerdown", onPointerDown);
		container.addEventListener("pointermove", onPointerMove);
		container.addEventListener("pointerup", finish);
		container.addEventListener("pointercancel", finish);
		container.addEventListener("pointerleave", onPointerLeave);
		container.addEventListener("wheel", onWheel, { passive: false });
		container.addEventListener("contextmenu", onContextMenu);
		return (): void => {
			if (interaction?.kind === "spray") {
				window.clearInterval(interaction.timerId);
			}
			container.removeEventListener("pointerdown", onPointerDown);
			container.removeEventListener("pointermove", onPointerMove);
			container.removeEventListener("pointerup", finish);
			container.removeEventListener("pointercancel", finish);
			container.removeEventListener("pointerleave", onPointerLeave);
			container.removeEventListener("wheel", onWheel);
			container.removeEventListener("contextmenu", onContextMenu);
		};
	}, []);

	/* ------------------------------- render ------------------------------- */

	const pixelSliceCount = renderSlices.filter(
		(slice) => slice.kind === "pixels"
	).length;
	const showFootprint =
		hover !== null &&
		tool !== "hand" &&
		tool !== "move" &&
		tool !== "text" &&
		tool !== "spray" &&
		tool !== "layer-picker" &&
		!spaceHeld;
	const footprintOffsets = useMemo(() => {
		if (tool === "custom-brush") {
			return brushOffsets(1, "custom", customBrush);
		}
		if (PAINT_TOOLS.has(tool)) {
			return brushOffsets(brushSize, brushShape, customBrush);
		}
		return [{ x: 0, y: 0 }];
	}, [tool, brushSize, brushShape, customBrush]);
	const footprintEdges = useMemo(
		() => offsetSetEdges(footprintOffsets),
		[footprintOffsets]
	);
	const footprintCenters = useMemo(() => {
		if (!showFootprint || !hover) return [];
		if (!PAINT_TOOLS.has(tool) && tool !== "fill") return [hover];
		return symmetricPoints(
			{
				width,
				height,
				mask: null,
				symmetryX,
				symmetryY,
				symmetryXPos,
				symmetryYPos,
			},
			hover.x,
			hover.y
		);
	}, [
		showFootprint,
		hover,
		tool,
		width,
		height,
		symmetryX,
		symmetryY,
		symmetryXPos,
		symmetryYPos,
	]);
	const axisX = symmetryXPos ?? width / 2;
	const axisY = symmetryYPos ?? height / 2;

	const resolvedPerspective = useMemo(
		() =>
			perspectiveGuide.enabled
				? resolvePerspectivePoints(perspectiveGuide, width, height)
				: null,
		[perspectiveGuide, width, height]
	);
	const fisheyeArcs = useMemo(() => {
		if (!resolvedPerspective || perspectiveGuide.mode !== "fisheye") return [];
		return computeFisheyeArcs(
			resolvedPerspective.center,
			resolvedPerspective.radius,
			perspectiveGuide.lineCount,
			perspectiveGuide.fisheyeCurvature
		);
	}, [resolvedPerspective, perspectiveGuide]);

	const box = useMemo(
		() =>
			textDraft ? textBox({ textValue, textStyle }) : { width: 0, height: 0 },
		[textDraft, textValue, textStyle]
	);
	const cell = checkerCell(zoom);

	let cursor = "crosshair";
	if (isPanning) cursor = "grabbing";
	else if (hoveringVpHandle) cursor = "grab";
	else if (spaceHeld || tool === "hand") cursor = "grab";
	else if (tool === "move") cursor = "move";
	else if (tool === "text") cursor = "text";
	else if (tool === "layer-picker") cursor = "pointer";

	return (
		<div
			ref={containerRef}
			className="absolute inset-0 overflow-hidden touch-none"
			style={{ cursor }}
		>
			<Stage
				ref={stageRef}
				height={stageSize.height}
				listening={false}
				width={stageSize.width}
			>
				<Layer
					ref={imageLayerRef}
					imageSmoothingEnabled={false}
					listening={false}
				>
					<Group scaleX={zoom} scaleY={zoom} x={panX} y={panY}>
						<Shape
							perfectDrawEnabled={false}
							sceneFunc={(context) => {
								context.setAttr("fillStyle", "#a1a1aa");
								context.fillRect(0, 0, width, height);
								context.setAttr("fillStyle", "#d4d4d8");
								const visibleLeft = Math.max(0, -panX / zoom);
								const visibleTop = Math.max(0, -panY / zoom);
								const visibleRight = Math.min(
									width,
									(stageSize.width - panX) / zoom
								);
								const visibleBottom = Math.min(
									height,
									(stageSize.height - panY) / zoom
								);
								const startRow = Math.floor(visibleTop / cell);
								const endRow = Math.ceil(visibleBottom / cell);
								const startColumn = Math.floor(visibleLeft / cell);
								const endColumn = Math.ceil(visibleRight / cell);
								for (let row = startRow; row < endRow; row++) {
									const y = row * cell;
									const cellHeight = Math.min(cell, height - y);
									if (cellHeight <= 0) continue;
									for (let column = startColumn; column < endColumn; column++) {
										if ((row + column) % 2 !== 0) continue;
										const x = column * cell;
										const cellWidth = Math.min(cell, width - x);
										if (cellWidth <= 0) continue;
										context.fillRect(x, y, cellWidth, cellHeight);
									}
								}
							}}
						/>
						{showOnion && (
							<KonvaImage height={height} image={onionCanvas} width={width} />
						)}
					</Group>
				</Layer>
				{tiledPreview.enabled && (
					<Layer imageSmoothingEnabled={false} listening={false}>
						<Group scaleX={zoom} scaleY={zoom} x={panX} y={panY}>
							<Shape
								perfectDrawEnabled={false}
								sceneFunc={(context) => {
									const documentLeft = -panX / zoom;
									const documentTop = -panY / zoom;
									const documentRight = (stageSize.width - panX) / zoom;
									const documentBottom = (stageSize.height - panY) / zoom;
									const minTileX =
										tiledPreview.axis === "vertical"
											? 0
											: Math.max(-4, Math.floor(documentLeft / width));
									const maxTileX =
										tiledPreview.axis === "vertical"
											? 0
											: Math.min(4, Math.floor(documentRight / width));
									const minTileY =
										tiledPreview.axis === "horizontal"
											? 0
											: Math.max(-4, Math.floor(documentTop / height));
									const maxTileY =
										tiledPreview.axis === "horizontal"
											? 0
											: Math.min(4, Math.floor(documentBottom / height));

									context.save();
									context.setAttr("globalAlpha", tiledPreview.opacity / 100);
									for (let ty = minTileY; ty <= maxTileY; ty++) {
										for (let tx = minTileX; tx <= maxTileX; tx++) {
											if (tx === 0 && ty === 0) continue;
											const ox = tx * width;
											const oy = ty * height;
											context.setAttr("fillStyle", "rgba(161,161,170,0.35)");
											context.fillRect(ox, oy, width, height);
											context.drawImage(bufferCanvas, ox, oy, width, height);
											context.setAttr("lineWidth", 1 / zoom);
											context.setAttr("strokeStyle", "rgba(148,163,184,0.35)");
											context.strokeRect(ox, oy, width, height);
										}
									}
									context.restore();
								}}
							/>
						</Group>
					</Layer>
				)}
				{renderSlices.map((slice) => {
					if (slice.kind === "pixels") {
						const canvas =
							pixelSliceCount <= 1 ? bufferCanvas : sliceCanvases[slice.key];
						if (!canvas) return null;
						return (
							<Layer
								key={slice.key}
								imageSmoothingEnabled={false}
								listening={false}
							>
								<Group scaleX={zoom} scaleY={zoom} x={panX} y={panY}>
									<KonvaImage height={height} image={canvas} width={width} />
								</Group>
							</Layer>
						);
					}
					const layer = layers.find((candidate) => candidate.id === slice.layerId);
					const reference = layer?.reference;
					const image = reference ? referenceImages[reference.src] : undefined;
					if (
						!layer ||
						!reference ||
						!image ||
						!image.complete ||
						image.naturalWidth === 0
					) {
						return null;
					}
					return (
						<Layer
							key={slice.key}
							imageSmoothingEnabled={reference.smooth}
							listening={false}
						>
							<Group scaleX={zoom} scaleY={zoom} x={panX} y={panY}>
								<KonvaImage
									height={reference.height}
									image={image}
									opacity={layer.opacity / 100}
									width={reference.width}
									x={reference.x}
									y={reference.y}
								/>
							</Group>
						</Layer>
					);
				})}
				<Layer ref={overlayLayerRef} listening={false}>
					<Group scaleX={zoom} scaleY={zoom} x={panX} y={panY}>
						{showGrid && zoom >= 2 && (
							<Shape
								perfectDrawEnabled={false}
								sceneFunc={(context) => {
									const half = 0.5 / zoom;
									const drawLines = (step: number, color: string): void => {
										context.beginPath();
										for (let x = step; x < width; x += step) {
											context.moveTo(x + half, 0);
											context.lineTo(x + half, height);
										}
										for (let y = step; y < height; y += step) {
											context.moveTo(0, y + half);
											context.lineTo(width, y + half);
										}
										context.setAttr("lineWidth", 1 / zoom);
										context.setAttr("strokeStyle", color);
										context.stroke();
									};
									// Per-pixel lines only when pixels are big enough to see them.
									if (zoom >= 6) drawLines(1, "rgba(113,113,122,0.45)");
									if (width > MAJOR_GRID_STEP || height > MAJOR_GRID_STEP) {
										drawLines(MAJOR_GRID_STEP, "rgba(96,165,250,0.5)");
									}
								}}
							/>
						)}
						<Rect
							height={height}
							stroke={tiledPreview.enabled ? "#38bdf8" : "#52525b"}
							strokeScaleEnabled={false}
							strokeWidth={tiledPreview.enabled ? 2 : 1}
							width={width}
						/>
						{rulerGrid.enabled && (
							<Shape
								perfectDrawEnabled={false}
								sceneFunc={(context) => {
									const cellW = Math.max(1, rulerGrid.cellWidth);
									const cellH = Math.max(1, rulerGrid.cellHeight);
									const offX = ((rulerGrid.offsetX % cellW) + cellW) % cellW;
									const offY = ((rulerGrid.offsetY % cellH) + cellH) % cellH;
									const half = 0.5 / zoom;
									context.save();
									context.setAttr("globalAlpha", rulerGrid.opacity / 100);
									context.beginPath();
									for (let x = offX; x <= width; x += cellW) {
										context.moveTo(x + half, 0);
										context.lineTo(x + half, height);
									}
									for (let y = offY; y <= height; y += cellH) {
										context.moveTo(0, y + half);
										context.lineTo(width, y + half);
									}
									context.setAttr("lineWidth", 1 / zoom);
									context.setAttr("strokeStyle", rulerGrid.color);
									context.stroke();

									if (rulerGrid.showRuler) {
										const tickLength = 4 / zoom;
										const fontSize = Math.max(0.4, 9 / zoom);
										context.beginPath();
										context.moveTo(0, -1 / zoom);
										context.lineTo(width, -1 / zoom);
										context.moveTo(-1 / zoom, 0);
										context.lineTo(-1 / zoom, height);
										for (let x = offX; x <= width; x += cellW) {
											context.moveTo(x + half, -tickLength);
											context.lineTo(x + half, 0);
										}
										for (let y = offY; y <= height; y += cellH) {
											context.moveTo(-tickLength, y + half);
											context.lineTo(0, y + half);
										}
										context.stroke();
										if (zoom >= 6) {
											context.setAttr("fillStyle", rulerGrid.color);
											context.setAttr(
												"font",
												`${fontSize}px ui-monospace, monospace`
											);
											for (let x = offX; x <= width; x += cellW) {
												context.fillText(
													String(x),
													x + 1 / zoom,
													-tickLength - 2 / zoom
												);
											}
											for (let y = offY; y <= height; y += cellH) {
												context.fillText(
													String(y),
													-tickLength - 12 / zoom,
													y + fontSize * 0.8
												);
											}
										}
									}

									if (rulerGrid.limitToCell && hover) {
										const activeCell = gridCellBounds(
											hover,
											rulerGrid,
											width,
											height
										);
										context.setAttr("lineWidth", 2 / zoom);
										context.setAttr("strokeStyle", "#fbbf24");
										context.strokeRect(
											activeCell.x,
											activeCell.y,
											activeCell.width,
											activeCell.height
										);
									}
									context.restore();
								}}
							/>
						)}
						{perspectiveGuide.enabled && resolvedPerspective && (
							<Shape
								perfectDrawEnabled={false}
								sceneFunc={(context) => {
									const documentLeft = -panX / zoom;
									const documentTop = -panY / zoom;
									const documentRight = (stageSize.width - panX) / zoom;
									const documentBottom = (stageSize.height - panY) / zoom;
									const span =
										Math.max(
											width,
											height,
											documentRight - documentLeft,
											documentBottom - documentTop,
											64
										) * 2;
									const rays = Math.max(4, perspectiveGuide.lineCount);

									const drawRaysFrom = (
										origin: Point,
										strokeColor: string
									): void => {
										context.beginPath();
										for (let index = 0; index < rays; index++) {
											const angle = (index / rays) * Math.PI * 2;
											context.moveTo(origin.x, origin.y);
											context.lineTo(
												origin.x + Math.cos(angle) * span,
												origin.y + Math.sin(angle) * span
											);
										}
										context.setAttr("lineWidth", 1 / zoom);
										context.setAttr("strokeStyle", strokeColor);
										context.stroke();
									};

									const drawHandle = (
										point: Point,
										label: string,
										color: string
									): void => {
										const radius = 5 / zoom;
										context.beginPath();
										context.arc(point.x, point.y, radius, 0, Math.PI * 2);
										context.setAttr("fillStyle", color);
										context.fill();
										context.setAttr("lineWidth", 1.5 / zoom);
										context.setAttr("strokeStyle", "#ffffff");
										context.stroke();
										context.setAttr("fillStyle", "#ffffff");
										context.setAttr("font", `bold ${10 / zoom}px sans-serif`);
										context.fillText(label, point.x + 7 / zoom, point.y - 5 / zoom);
									};

									context.save();
									context.setAttr("globalAlpha", perspectiveGuide.opacity / 100);

									if (perspectiveGuide.mode === "fisheye") {
										const { center, radius } = resolvedPerspective;
										context.beginPath();
										context.arc(center.x, center.y, radius, 0, Math.PI * 2);
										context.moveTo(center.x - radius, center.y);
										context.lineTo(center.x + radius, center.y);
										context.moveTo(center.x, center.y - radius);
										context.lineTo(center.x, center.y + radius);
										for (const arc of fisheyeArcs) {
											for (let index = 0; index < arc.length; index += 2) {
												const px = arc[index] ?? 0;
												const py = arc[index + 1] ?? 0;
												if (index === 0) context.moveTo(px, py);
												else context.lineTo(px, py);
											}
										}
										context.setAttr("lineWidth", 1 / zoom);
										context.setAttr("strokeStyle", "#38bdf8");
										context.stroke();
										drawHandle(center, "FE", "#38bdf8");
									} else {
										// Horizon line
										context.beginPath();
										context.moveTo(
											documentLeft - span,
											resolvedPerspective.horizonY
										);
										context.lineTo(
											documentRight + span,
											resolvedPerspective.horizonY
										);
										context.setAttr("lineWidth", 1.5 / zoom);
										context.setLineDash([6 / zoom, 4 / zoom]);
										context.setAttr("strokeStyle", "#f59e0b");
										context.stroke();
										context.setLineDash([]);

										drawRaysFrom(resolvedPerspective.point1, "#38bdf8");
										drawHandle(resolvedPerspective.point1, "VP1", "#38bdf8");

										if (
											perspectiveGuide.mode === "2-point" ||
											perspectiveGuide.mode === "3-point"
										) {
											drawRaysFrom(resolvedPerspective.point2, "#a855f7");
											drawHandle(resolvedPerspective.point2, "VP2", "#a855f7");
										}
										if (perspectiveGuide.mode === "3-point") {
											drawRaysFrom(resolvedPerspective.point3, "#22c55e");
											drawHandle(resolvedPerspective.point3, "VP3", "#22c55e");
										}
									}
									context.restore();
								}}
							/>
						)}
						{symmetryX && (
							<Line
								dash={[4, 4]}
								points={[axisX, 0, axisX, height]}
								stroke="#f472b6"
								strokeScaleEnabled={false}
								strokeWidth={1}
							/>
						)}
						{symmetryY && (
							<Line
								dash={[4, 4]}
								points={[0, axisY, width, axisY]}
								stroke="#f472b6"
								strokeScaleEnabled={false}
								strokeWidth={1}
							/>
						)}
						{edges.length > 0 && (
							<Group x={floating?.offsetX ?? 0} y={floating?.offsetY ?? 0}>
								<Shape
									perfectDrawEnabled={false}
									sceneFunc={(context) => {
										const half = 0.5 / zoom;
										context.beginPath();
										for (let index = 0; index < edges.length; index += 4) {
											context.moveTo(
												(edges[index] ?? 0) + half,
												(edges[index + 1] ?? 0) + half
											);
											context.lineTo(
												(edges[index + 2] ?? 0) + half,
												(edges[index + 3] ?? 0) + half
											);
										}
										context.setAttr("lineWidth", 1 / zoom);
										context.setLineDash([]);
										context.setAttr("strokeStyle", "#ffffff");
										context.stroke();
										context.setLineDash([4 / zoom, 4 / zoom]);
										context.setAttr(
											"lineDashOffset",
											-antsOffsetRef.current / zoom
										);
										context.setAttr("strokeStyle", "#000000");
										context.stroke();
										context.setLineDash([]);
									}}
								/>
							</Group>
						)}
						{preview?.kind === "rect" && (
							<Rect
								dash={[4, 4]}
								height={preview.height}
								stroke="#ffffff"
								strokeScaleEnabled={false}
								strokeWidth={1}
								width={preview.width}
								x={preview.x}
								y={preview.y}
							/>
						)}
						{preview?.kind === "lasso" && (
							<Line
								closed
								dash={[4, 4]}
								points={preview.points}
								stroke="#ffffff"
								strokeScaleEnabled={false}
								strokeWidth={1}
							/>
						)}
						{preview?.kind === "gradient" && (
							<Line
								dash={[4, 4]}
								stroke="#38bdf8"
								strokeScaleEnabled={false}
								strokeWidth={1.5}
								points={[
									preview.start.x + 0.5,
									preview.start.y + 0.5,
									preview.end.x + 0.5,
									preview.end.y + 0.5,
								]}
							/>
						)}
						{hover !== null && tool === "spray" && !spaceHeld && (
							<Shape
								perfectDrawEnabled={false}
								sceneFunc={(context) => {
									context.save();
									context.beginPath();
									context.arc(
										hover.x + 0.5,
										hover.y + 0.5,
										sprayOptions.radius,
										0,
										Math.PI * 2
									);
									context.setAttr("lineWidth", 1 / zoom);
									context.setLineDash([3 / zoom, 3 / zoom]);
									context.setAttr("strokeStyle", "#ffffff");
									context.stroke();
									context.restore();
								}}
							/>
						)}
						{textDraft && (
							<>
								<Rect
									height={box.height + 2}
									stroke="#000000"
									strokeScaleEnabled={false}
									strokeWidth={1}
									width={box.width + 2}
									x={textDraft.x - 1}
									y={textDraft.y - 1}
								/>
								<Rect
									dash={[3, 3]}
									height={box.height + 2}
									stroke="#38bdf8"
									strokeScaleEnabled={false}
									strokeWidth={1}
									width={box.width + 2}
									x={textDraft.x - 1}
									y={textDraft.y - 1}
								/>
							</>
						)}
						{footprintCenters.length > 0 && footprintEdges.length > 0 && (
							<Shape
								perfectDrawEnabled={false}
								sceneFunc={(context) => {
									footprintCenters.forEach((center, centerIndex) => {
										context.save();
										context.setAttr("globalAlpha", centerIndex === 0 ? 1 : 0.6);
										context.beginPath();
										for (let index = 0; index < footprintEdges.length; index += 4) {
											context.moveTo(
												center.x + (footprintEdges[index] ?? 0),
												center.y + (footprintEdges[index + 1] ?? 0)
											);
											context.lineTo(
												center.x + (footprintEdges[index + 2] ?? 0),
												center.y + (footprintEdges[index + 3] ?? 0)
											);
										}
										context.setAttr("lineWidth", 1 / zoom);
										context.setLineDash([]);
										context.setAttr("strokeStyle", "#000000");
										context.stroke();
										context.setLineDash([3 / zoom, 3 / zoom]);
										context.setAttr(
											"strokeStyle",
											centerIndex === 0 ? "#ffffff" : "#f472b6"
										);
										context.stroke();
										context.restore();
									});
								}}
							/>
						)}
					</Group>
				</Layer>
			</Stage>
		</div>
	);
};
