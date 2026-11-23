import { beforeEach, describe, expect, it } from "vitest";
import { parseDocument, serializeDocument } from "../lib/persistence";
import {
	documentData,
	framePixels,
	syncedFrames,
	useEditorStore,
} from "./editorStore";

const RED = 0xff_00_00_ff;
const BLUE = 0xff_ff_00_00;
const get = useEditorStore.getState;

/** Paints pixel 0 of the active layer on the current frame. */
function paint(color: number, index = 0): void {
	const pixels = get().pixels.slice();
	pixels[index] = color;
	get().commitPixels(pixels);
}

const celAt = (frame: number, layer: number, index = 0): number | undefined => {
	const state = get();
	const id = state.layers[layer]?.id ?? -1;
	return syncedFrames(state)[frame]?.cels[id]?.[index];
};

describe("animation frames in the store", () => {
	beforeEach(() => {
		get().newCanvas(4, 4);
	});

	it("keeps each frame's pixels separate", () => {
		paint(RED);
		get().addFrame();
		expect(get().currentFrame).toBe(1);
		expect(get().pixels[0]).toBe(0);
		paint(BLUE);
		get().setCurrentFrame(0);
		expect(get().pixels[0]).toBe(RED);
		get().setCurrentFrame(1);
		expect(get().pixels[0]).toBe(BLUE);
	});

	it("duplicates a frame and undoes it", () => {
		paint(RED);
		get().duplicateFrame();
		expect(get().frames).toHaveLength(2);
		expect(get().pixels[0]).toBe(RED);
		get().undo();
		expect(get().frames).toHaveLength(1);
		expect(get().currentFrame).toBe(0);
	});

	it("shares layers across frames (add, duplicate, delete)", () => {
		paint(RED);
		get().duplicateFrame();
		get().addLayer();
		expect(get().layers).toHaveLength(2);
		get().setCurrentFrame(0);
		expect(get().layers).toHaveLength(2);
		// Duplicating the bottom layer copies its pixels in every frame.
		get().setActiveLayer(0);
		get().duplicateLayer();
		expect(celAt(0, 1)).toBe(RED);
		expect(celAt(1, 1)).toBe(RED);
		get().deleteLayer();
		expect(get().layers).toHaveLength(2);
	});

	it("merges down and flattens every frame", () => {
		paint(RED, 0);
		get().addFrame();
		paint(RED, 1);
		get().addLayer();
		paint(BLUE, 1);
		get().mergeDown();
		expect(get().layers).toHaveLength(1);
		expect(celAt(0, 0, 0)).toBe(RED);
		expect(celAt(1, 0, 1)).toBe(BLUE);
		get().addLayer();
		get().setCurrentFrame(0);
		paint(BLUE, 2);
		get().flattenImage();
		expect(get().layers).toHaveLength(1);
		expect(framePixels(get(), 0)[2]).toBe(BLUE);
		expect(framePixels(get(), 1)[1]).toBe(BLUE);
	});

	it("resizes every frame", () => {
		paint(RED);
		get().addFrame();
		get().resizeCanvas(8, 6, "top-left");
		expect(
			get().frames.every((frame) => Object.keys(frame.cels).length > 0)
		).toBe(true);
		expect(framePixels(get(), 0)).toHaveLength(48);
		expect(framePixels(get(), 0)[0]).toBe(RED);
		expect(framePixels(get(), 1)).toHaveLength(48);
	});

	it("moves frames and keeps tags on frame edits", () => {
		paint(RED);
		get().duplicateFrame();
		get().duplicateFrame();
		get().addTag(0, 1);
		get().setCurrentFrame(1);
		get().addFrame(); // inserted at 2, at the end of the tag → tag grows
		expect(get().tags[0]).toMatchObject({ from: 0, to: 2 });
		get().moveFrame(2, 0);
		expect(get().currentFrame).toBe(0);
		expect(get().pixels[0]).toBe(0);
		get().deleteFrame();
		expect(get().frames).toHaveLength(3);
		expect(get().tags[0]).toMatchObject({ from: 0, to: 1 });
	});

	it("keeps durations through undo like other tweaks", () => {
		get().addFrame();
		get().setFrameDuration(1, 250);
		paint(RED);
		get().undo();
		expect(get().frames[1]?.duration).toBe(250);
	});

	it("saves and loads frames, tags and durations", () => {
		paint(RED);
		get().duplicateFrame();
		paint(BLUE, 3);
		get().addLayer();
		paint(BLUE, 5);
		get().setFrameDuration(1, 180);
		get().addTag(0, 1);
		const tag = get().tags[0];
		if (tag) get().updateTag(tag.id, { name: "walk", direction: "pingpong" });

		const text = serializeDocument(documentData(get()));
		const loaded = parseDocument(text);
		expect(loaded).not.toBeNull();
		if (!loaded) return;
		expect(loaded.frames).toHaveLength(2);
		expect(loaded.currentFrame).toBe(1);
		expect(loaded.frames[1]?.duration).toBe(180);
		expect(loaded.tags).toMatchObject([
			{ name: "walk", from: 0, to: 1, direction: "pingpong" },
		]);

		get().newCanvas(2, 2);
		get().loadDocument(loaded);
		expect(get().layers).toHaveLength(2);
		expect(framePixels(get(), 0)[0]).toBe(RED);
		expect(framePixels(get(), 0)[3]).toBe(0);
		expect(framePixels(get(), 1)[3]).toBe(BLUE);
		expect(framePixels(get(), 1)[5]).toBe(BLUE);
	});

	it("stores duplicated frames once", () => {
		paint(RED);
		for (let index = 0; index < 5; index++) get().duplicateFrame();
		const raw = JSON.parse(serializeDocument(documentData(get()))) as {
			cels: Array<string>;
		};
		expect(raw.cels).toHaveLength(1);
	});

	it("links and unlinks cels across frames and persists link groups", () => {
		paint(RED, 0);
		get().addFrame();
		get().addFrame();
		get().linkCels(0, 0, 2);
		expect(get().frames[0]?.linked?.[get().layers[0]!.id]).toBeTruthy();
		expect(framePixels(get(), 2)[0]).toBe(RED);

		// Painting frame 2 updates frames 0 and 1 because they are linked.
		get().setCurrentFrame(2);
		paint(BLUE, 3);
		expect(framePixels(get(), 0)[3]).toBe(BLUE);
		expect(framePixels(get(), 1)[3]).toBe(BLUE);

		// Unlink frame 1 and paint separately.
		get().unlinkCel(0, 1);
		get().setCurrentFrame(1);
		paint(0xff_00_ff_00, 3);
		expect(framePixels(get(), 0)[3]).toBe(BLUE);
		expect(framePixels(get(), 1)[3]).toBe(0xff_00_ff_00);

		// Round-trip linked cels through serialization.
		const loaded = parseDocument(serializeDocument(documentData(get())));
		expect(loaded).not.toBeNull();
		if (!loaded) return;
		get().loadDocument(loaded);
		get().setCurrentFrame(0);
		paint(0xff_aa_bb_cc, 2);
		expect(framePixels(get(), 2)[2]).toBe(0xff_aa_bb_cc);
		expect(framePixels(get(), 1)[2]).not.toBe(0xff_aa_bb_cc);
	});

	it("supports reference layers excluded from pixel compositing and flatten", () => {
		paint(RED, 0);
		get().addReferenceLayer({
			src: "data:image/png;base64,iVBORw0KGgo=",
			naturalWidth: 100,
			naturalHeight: 80,
			x: 0,
			y: 0,
			width: 4,
			height: 3.2,
			smooth: true,
		});
		expect(get().layers).toHaveLength(2);
		expect(get().layers[0]?.kind).toBe("reference");

		// Reference layers are skipped by pixel compositing and preserved on flatten.
		expect(framePixels(get(), 0)[0]).toBe(RED);
		get().flattenImage();
		expect(get().layers).toHaveLength(2);
		expect(get().layers.some((layer) => layer.kind === "reference")).toBe(true);

		const loaded = parseDocument(serializeDocument(documentData(get())));
		expect(loaded?.layers?.some((layer) => layer.kind === "reference")).toBe(
			true
		);
	});

	it("replaces colors across layer, all layers, and all frames", () => {
		paint(RED, 0);
		get().addLayer();
		paint(RED, 1);
		get().addFrame();
		paint(RED, 2);

		expect(get().replaceColor("#ff0000", "#0000ff", 0, "layer")).toBe(1);
		expect(framePixels(get(), 1)[2]).toBe(BLUE);

		get().setCurrentFrame(0);
		expect(get().replaceColor("#ff0000", "#00ff00", 0, "all-layers")).toBe(2);
		expect(celAt(0, 0, 0)).toBe(0xff_00_ff_00);
		expect(celAt(0, 1, 1)).toBe(0xff_00_ff_00);
	});

	it("scales multi-frame linked cels and reference layers with undo/redo", () => {
		get().newCanvas(8, 8);
		// Paint top-left 2x2 block on frame 0 layer 0.
		const first = get().pixels.slice();
		first[0] = RED;
		first[1] = RED;
		first[8] = RED;
		first[9] = RED;
		get().commitPixels(first);

		// Link frame 1 on layer 0.
		get().addFrame();
		get().linkCels(0, 0, 1);

		// Add layer 1 and paint bottom-right 2x2 on frame 1.
		get().addLayer();
		const second = get().pixels.slice();
		second[6 * 8 + 6] = BLUE;
		second[6 * 8 + 7] = BLUE;
		second[7 * 8 + 6] = BLUE;
		second[7 * 8 + 7] = BLUE;
		get().commitPixels(second);

		// Add a reference layer to verify proportional scaling.
		get().addReferenceLayer({
			src: "data:image/png;base64,iVBORw0KGgo=",
			naturalWidth: 100,
			naturalHeight: 100,
			x: 2,
			y: 2,
			width: 4,
			height: 4,
			smooth: true,
		});

		get().resizeCanvas(4, 4, { mode: "scale", algorithm: "nearest" });
		expect(get().width).toBe(4);
		expect(get().height).toBe(4);
		expect(celAt(0, 1, 0)).toBe(RED);
		expect(celAt(1, 1, 0)).toBe(RED);
		expect(celAt(1, 2, 3 * 4 + 3)).toBe(BLUE);

		// Linked cel buffers stay shared across frames 0 and 1 on layer 0.
		const layer0Id = get().layers[1]!.id;
		expect(get().frames[0]?.cels[layer0Id]).toBe(
			get().frames[1]?.cels[layer0Id]
		);

		const referenceLayer = get().layers.find(
			(layer) => layer.kind === "reference"
		);
		expect(referenceLayer?.reference).toMatchObject({
			x: 1,
			y: 1,
			width: 2,
			height: 2,
		});

		get().undo();
		expect(get().width).toBe(8);
		expect(get().height).toBe(8);
		expect(celAt(0, 1, 0)).toBe(RED);
		expect(celAt(1, 2, 7 * 8 + 7)).toBe(BLUE);
		expect(
			get().layers.find((layer) => layer.kind === "reference")?.reference
		).toMatchObject({ x: 2, y: 2, width: 4, height: 4 });

		get().redo();
		expect(get().width).toBe(4);
		expect(get().height).toBe(4);
		expect(celAt(0, 1, 0)).toBe(RED);
		expect(celAt(1, 2, 3 * 4 + 3)).toBe(BLUE);
	});
});
