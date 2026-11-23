import { useEffect, useRef, useState } from "react";
import type { FunctionComponent } from "../../../common/types";
import { sequenceFor } from "../lib/animation";
import { subscribeFrames } from "../lib/liveView";
import { framePixels, useEditorStore } from "../store/editorStore";
import { PanelCard, Toggle } from "./ui";

const BOX = 176;

type Source = HTMLCanvasElement;

function drawInto(canvas: HTMLCanvasElement | null, source: Source): void {
	const context = canvas?.getContext("2d");
	if (!canvas || !context) return;
	if (canvas.width !== source.width || canvas.height !== source.height) {
		canvas.width = source.width;
		canvas.height = source.height;
	}
	context.clearRect(0, 0, canvas.width, canvas.height);
	context.drawImage(source, 0, 0);
}

export const PreviewPanel = (): FunctionComponent => {
	const largeRef = useRef<HTMLCanvasElement>(null);
	const smallRef = useRef<HTMLCanvasElement>(null);
	const width = useEditorStore((state) => state.width);
	const height = useEditorStore((state) => state.height);
	const frameCount = useEditorStore((state) => state.frames.length);
	const frames = useEditorStore((state) => state.frames);
	const tags = useEditorStore((state) => state.tags);
	const playTag = useEditorStore((state) => state.playTag);
	const playing = useEditorStore((state) => state.playing);
	const [loop, setLoop] = useState(false);
	const scale = Math.max(1, Math.floor(BOX / Math.max(width, height)));
	// While the canvas itself plays, the preview simply mirrors it.
	const animate = loop && frameCount > 1 && !playing;

	useEffect(() => {
		if (animate) return;
		return subscribeFrames((source) => {
			drawInto(largeRef.current, source);
			drawInto(smallRef.current, source);
		});
	}, [animate, width, height]);

	useEffect(() => {
		if (!animate) return;
		// Loops the animation here while you keep drawing on the canvas.
		const tag = tags.find((candidate) => candidate.id === playTag) ?? null;
		const sequence = sequenceFor(tag, frames.length);
		const scratch = document.createElement("canvas");
		scratch.width = width;
		scratch.height = height;
		const context = scratch.getContext("2d");
		let position = 0;
		let timer = 0;
		const step = (): void => {
			const index = sequence[position] ?? 0;
			const pixels = framePixels(useEditorStore.getState(), index);
			context?.putImageData(
				new ImageData(new Uint8ClampedArray(pixels.buffer), width, height),
				0,
				0
			);
			drawInto(largeRef.current, scratch);
			drawInto(smallRef.current, scratch);
			position = (position + 1) % Math.max(1, sequence.length);
			timer = window.setTimeout(
				step,
				useEditorStore.getState().frames[index]?.duration ?? 100
			);
		};
		step();
		return (): void => {
			window.clearTimeout(timer);
		};
	}, [animate, frames, tags, playTag, width, height]);

	const loopName =
		tags.find((candidate) => candidate.id === playTag)?.name ?? "all frames";

	return (
		<PanelCard
			collapsible
			title="Preview"
			actions={
				frameCount > 1 ? (
					<Toggle
						checked={loop}
						label="Animate"
						onChange={() => {
							setLoop(!loop);
						}}
					/>
				) : undefined
			}
		>
			<div className="flex flex-wrap items-end gap-3">
				<div className="preview-checker flex items-center justify-center rounded-lg border border-[var(--pe-border)] p-1">
					<canvas
						ref={largeRef}
						style={{
							width: width * scale,
							height: height * scale,
							imageRendering: "pixelated",
						}}
					/>
				</div>
				{scale > 1 && (
					<div
						className="preview-checker rounded-lg border border-[var(--pe-border)] p-1"
						title="Actual size"
					>
						<canvas
							ref={smallRef}
							style={{ width, height, imageRendering: "pixelated" }}
						/>
					</div>
				)}
			</div>
			<p className="mt-2 text-[11px] text-[var(--pe-text-muted)]">
				{width}×{height}px ·{" "}
				{scale > 1 ? `preview ${scale}× and 1×` : "actual size"}
				{animate && ` · looping ${loopName}`}
			</p>
		</PanelCard>
	);
};
