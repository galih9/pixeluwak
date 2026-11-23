import { useEffect } from "react";
import { TOOLS } from "../constants";
import { openFile, saveProject } from "../lib/files";
import { useEditorStore } from "../store/editorStore";

const TOOL_KEYS = new Map(
	TOOLS.map((info) => [info.shortcut.toLowerCase(), info.id])
);

export function useShortcuts(): void {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent): void => {
			const target = event.target;
			// Checkboxes and color swatches keep focus after a click; shortcuts
			// should still work there. Text fields, sliders and selects own keys.
			const passThrough =
				target instanceof HTMLInputElement &&
				(target.type === "checkbox" ||
					target.type === "radio" ||
					target.type === "color");
			if (
				!passThrough &&
				target instanceof HTMLElement &&
				(target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA" ||
					target.tagName === "SELECT")
			) {
				return;
			}
			const state = useEditorStore.getState();
			if (state.dialog) return;
			const key = event.key.toLowerCase();
			const command = event.ctrlKey || event.metaKey;

			if (command) {
				let handled = true;
				if (key === "z" && event.shiftKey) state.redo();
				else if (key === "z") state.undo();
				else if (key === "y") state.redo();
				else if (key === "a") state.selectAll();
				else if (key === "d") state.deselect();
				else if (key === "i" && event.shiftKey) state.invertSelection();
				else if (key === "c") state.copy();
				else if (key === "x") state.cut();
				else if (key === "v") state.paste();
				else if (key === "s") saveProject();
				else if (key === "o") void openFile();
				else if (key === "e" && event.shiftKey) state.openDialog("spritesheet");
				else if (key === "e") state.openDialog("export");
				else if (key === ",") state.openDialog("settings");
				else handled = false;
				if (handled) event.preventDefault();
				return;
			}
			if (event.altKey) {
				// event.code: Alt+letter types other characters on macOS.
				if (event.code === "KeyN") {
					event.preventDefault();
					if (event.shiftKey) state.addFrame();
					else state.duplicateFrame();
				}
				return;
			}

			const step = event.shiftKey ? 8 : 1;
			switch (event.key) {
				case "ArrowLeft":
				case "ArrowRight":
				case "ArrowUp":
				case "ArrowDown": {
					if (!state.selection && !state.floating) {
						// Without a selection, arrows move through frames and layers.
						event.preventDefault();
						const frames = state.frames.length;
						if (event.key === "ArrowLeft") {
							state.setCurrentFrame((state.currentFrame - 1 + frames) % frames);
						} else if (event.key === "ArrowRight") {
							state.setCurrentFrame((state.currentFrame + 1) % frames);
						} else if (event.key === "ArrowUp") {
							state.setActiveLayer(state.activeLayer + 1);
						} else {
							state.setActiveLayer(state.activeLayer - 1);
						}
						return;
					}
					event.preventDefault();
					const dx =
						event.key === "ArrowLeft"
							? -step
							: event.key === "ArrowRight"
								? step
								: 0;
					const dy =
						event.key === "ArrowUp"
							? -step
							: event.key === "ArrowDown"
								? step
								: 0;
					state.nudge(dx, dy);
					return;
				}
				case "Delete":
				case "Backspace": {
					event.preventDefault();
					state.deleteSelection();
					return;
				}
				case "Escape": {
					if (state.textDraft) state.cancelText();
					else state.deselect();
					return;
				}
				case "Enter": {
					if (state.textDraft) state.commitText();
					else if (state.floating) state.anchorFloating();
					else state.togglePlaying();
					return;
				}
				case ",": {
					const frames = state.frames.length;
					state.setCurrentFrame((state.currentFrame - 1 + frames) % frames);
					return;
				}
				case ".": {
					state.setCurrentFrame((state.currentFrame + 1) % state.frames.length);
					return;
				}
				case "Home": {
					state.setCurrentFrame(0);
					return;
				}
				case "End": {
					state.setCurrentFrame(state.frames.length - 1);
					return;
				}
				case "+":
				case "=": {
					state.zoomStep(1);
					return;
				}
				case "-":
				case "_": {
					state.zoomStep(-1);
					return;
				}
				case "0": {
					state.fitView();
					return;
				}
				case "[": {
					state.setBrushSize(state.brushSize - 1);
					return;
				}
				case "]": {
					state.setBrushSize(state.brushSize + 1);
					return;
				}
				case "#": {
					state.toggleGrid();
					return;
				}
				case "?": {
					state.openDialog("help");
					return;
				}
			}

			if (event.shiftKey && key === "n") {
				state.addLayer();
				return;
			}
			if (event.shiftKey && key === "o") {
				state.openDialog("outline");
				return;
			}
			if (event.shiftKey && key === "r") {
				state.openDialog("resize");
				return;
			}
			if (event.shiftKey && key === "t") {
				state.openDialog("tilemap");
				return;
			}
			if (key === "x") {
				state.swapColors();
				return;
			}
			if (key === "k") {
				state.toggleOnionSkin();
				return;
			}
			const tool = TOOL_KEYS.get(key);
			if (tool) state.setTool(tool);
		};
		window.addEventListener("keydown", onKeyDown);
		return (): void => {
			window.removeEventListener("keydown", onKeyDown);
		};
	}, []);
}
