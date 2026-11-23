import type {
	BrushShape,
	ColorRampOptions,
	CustomBrushOptions,
	DitherPattern,
	GradientOptions,
	PerspectiveGuideSettings,
	RulerGridSettings,
	SprayOptions,
	TiledPreviewSettings,
	Tool,
	ToolCategory,
} from "./types";

export const MAX_CANVAS_SIZE = 128;
export const MIN_CANVAS_SIZE = 1;
export const DEFAULT_CANVAS_SIZE = 32;
export const SIZE_PRESETS: Array<number> = [8, 16, 24, 32, 48, 64, 128];

/** Integer zoom levels keep every art pixel the same size on screen. */
export const ZOOM_LEVELS: Array<number> = [
	1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48, 56, 64, 72, 80,
	96,
];

export const MAX_HISTORY = 100;
export const MAX_BRUSH_SIZE = 16;
/** Stronger grid line every N pixels. */
export const MAJOR_GRID_STEP = 8;
export const EXPORT_SCALES: Array<number> = [1, 2, 4, 8, 16, 32];

/** PICO-8 palette */
export const DEFAULT_PALETTE: Array<string> = [
	"#000000",
	"#1d2b53",
	"#7e2553",
	"#008751",
	"#ab5236",
	"#5f574f",
	"#c2c3c7",
	"#fff1e8",
	"#ff004d",
	"#ffa300",
	"#ffec27",
	"#00e436",
	"#29adff",
	"#83769c",
	"#ff77a8",
	"#ffccaa",
];

export type ToolInfo = {
	id: Tool;
	label: string;
	shortcut: string;
	category: ToolCategory;
	parent?: Tool;
};

export const TOOL_CATEGORY_LABELS: Record<ToolCategory, string> = {
	draw: "Draw",
	color: "Color",
	shapes: "Shapes & Text",
	select: "Select",
	navigate: "Navigate",
};

export const TOOLS: Array<ToolInfo> = [
	{ id: "pencil", label: "Pencil", shortcut: "B", category: "draw" },
	{
		id: "custom-brush",
		label: "Custom brush",
		shortcut: "J",
		category: "draw",
		parent: "pencil",
	},
	{ id: "eraser", label: "Eraser", shortcut: "E", category: "draw" },
	{ id: "spray", label: "Spray", shortcut: "S", category: "draw" },
	{ id: "dither", label: "Dithering brush", shortcut: "P", category: "draw" },
	{
		id: "contour",
		label: "Contour (filled freehand)",
		shortcut: "D",
		category: "draw",
	},
	{ id: "blur", label: "Blur brush", shortcut: "R", category: "draw" },
	{ id: "fill", label: "Fill bucket", shortcut: "G", category: "color" },
	{
		id: "gradient",
		label: "Gradient",
		shortcut: "F",
		category: "color",
		parent: "fill",
	},
	{
		id: "replace",
		label: "Magic color replace",
		shortcut: "C",
		category: "color",
	},
	{ id: "eyedropper", label: "Eyedropper", shortcut: "I", category: "color" },
	{ id: "line", label: "Line", shortcut: "L", category: "shapes" },
	{ id: "rectangle", label: "Rectangle", shortcut: "U", category: "shapes" },
	{ id: "ellipse", label: "Ellipse", shortcut: "O", category: "shapes" },
	{ id: "text", label: "Text", shortcut: "T", category: "shapes" },
	{
		id: "select-rect",
		label: "Rectangle select",
		shortcut: "M",
		category: "select",
	},
	{ id: "lasso", label: "Lasso select", shortcut: "Q", category: "select" },
	{ id: "wand", label: "Magic wand", shortcut: "W", category: "select" },
	{ id: "move", label: "Move", shortcut: "V", category: "navigate" },
	{
		id: "layer-picker",
		label: "Layer picker",
		shortcut: "Y",
		category: "navigate",
	},
	{ id: "hand", label: "Hand (pan)", shortcut: "H", category: "navigate" },
];

export const ESSENTIAL_TOOLS: ReadonlySet<Tool> = new Set<Tool>([
	"pencil",
	"eraser",
	"fill",
	"eyedropper",
	"line",
	"rectangle",
	"select-rect",
	"move",
	"hand",
]);

export const PAINT_TOOLS: ReadonlySet<Tool> = new Set<Tool>([
	"pencil",
	"custom-brush",
	"eraser",
	"spray",
	"dither",
	"line",
	"rectangle",
	"ellipse",
	"contour",
	"blur",
]);

export const BRUSH_SHAPES: Array<{
	id: BrushShape;
	label: string;
	symbol: string;
}> = [
	{ id: "square", label: "Square", symbol: "■" },
	{ id: "circle", label: "Round", symbol: "●" },
	{ id: "diamond", label: "Diamond", symbol: "◆" },
	{ id: "slash", label: "Slash", symbol: "/" },
	{ id: "backslash", label: "Backslash", symbol: "\\" },
	{ id: "cross", label: "Cross", symbol: "+" },
	{ id: "custom", label: "Custom", symbol: "★" },
];

export const DITHER_PATTERNS: Array<{ id: DitherPattern; label: string }> = [
	{ id: "bayer4", label: "Bayer 4×4" },
	{ id: "bayer2", label: "Bayer 2×2" },
	{ id: "checker", label: "Checkerboard" },
	{ id: "diagonal", label: "Diagonal" },
	{ id: "horizontal", label: "Horizontal" },
	{ id: "vertical", label: "Vertical" },
	{ id: "dots", label: "Dots" },
];

export const DEFAULT_COLOR_RAMP: ColorRampOptions = {
	steps: 7,
	mode: "smart",
	shadowHueShift: -25,
	highlightHueShift: 20,
	lightnessSpread: 70,
	saturationBoost: 12,
};

export const MAX_LAYERS = 32;

export const MAX_FRAMES = 256;

export const DEFAULT_CUSTOM_BRUSH_OPTIONS: CustomBrushOptions = {
	spacing: 4,
	scatter: 0,
	randomFlipX: false,
	randomFlipY: false,
	randomRotate: false,
	colorMode: "original",
};

export const DEFAULT_SPRAY_OPTIONS: SprayOptions = {
	radius: 6,
	density: 35,
	dotSize: 1,
	rate: 45,
	distribution: "uniform",
};

export const DEFAULT_GRADIENT_OPTIONS: GradientOptions = {
	type: "linear",
	dither: "bayer4",
	steps: 0,
	regionOnly: true,
	contiguous: true,
	reverse: false,
};

export const DEFAULT_RULER_GRID: RulerGridSettings = {
	enabled: false,
	cellWidth: 8,
	cellHeight: 8,
	offsetX: 0,
	offsetY: 0,
	color: "#38bdf8",
	opacity: 65,
	showRuler: true,
	snapToGrid: false,
	limitToCell: false,
};

export const DEFAULT_PERSPECTIVE_GUIDE: PerspectiveGuideSettings = {
	enabled: false,
	mode: "1-point",
	horizonY: null,
	point1: null,
	point2: null,
	point3: null,
	thirdPointDirection: "bottom",
	lineCount: 12,
	opacity: 70,
	fisheyeRadius: 16,
	fisheyeCurvature: 65,
	lockHandles: false,
};

export const DEFAULT_TILED_PREVIEW: TiledPreviewSettings = {
	enabled: false,
	axis: "both",
	opacity: 75,
};
