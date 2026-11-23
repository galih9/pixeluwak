import { useEffect, useMemo } from "react";
import type { FunctionComponent } from "../../../common/types";
import { maskBounds } from "../lib/raster";
import { useEditorStore } from "../store/editorStore";

export const StatusBar = (): FunctionComponent => {
	const cursor = useEditorStore((state) => state.cursor);
	const width = useEditorStore((state) => state.width);
	const height = useEditorStore((state) => state.height);
	const zoom = useEditorStore((state) => state.zoom);
	const selection = useEditorStore((state) => state.selection);
	const floating = useEditorStore((state) => state.floating);
	const notice = useEditorStore((state) => state.notice);
	const clearNotice = useEditorStore((state) => state.clearNotice);
	const openDialog = useEditorStore((state) => state.openDialog);

	const bounds = useMemo(
		() => (selection ? maskBounds(selection, width, height) : null),
		[selection, width, height]
	);

	useEffect(() => {
		if (!notice) return;
		const timer = window.setTimeout(clearNotice, 3500);
		return (): void => {
			window.clearTimeout(timer);
		};
	}, [notice, clearNotice]);

	return (
		<footer className="pe-statusbar pe-bottom-safe editor-scrollbar flex min-h-7 shrink-0 items-center gap-2 overflow-x-auto whitespace-nowrap border-t border-(--pe-border) bg-(--pe-bg-chrome) px-2 text-[11px] tabular-nums text-(--pe-text-muted) sm:gap-4 sm:px-3">
			<span className="min-w-16 shrink-0 text-(--pe-text-secondary) sm:w-20">
				{cursor ? `x ${cursor.x}, y ${cursor.y}` : "—"}
			</span>
			<button
				className="rounded px-1.5 py-0.5 text-(--pe-text-secondary) transition-colors hover:bg-(--pe-bg-control-hover) hover:text-(--pe-text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--pe-accent)"
				title="Resize canvas (Shift+R)"
				type="button"
				onClick={() => {
					openDialog("resize");
				}}
			>
				Canvas {width}×{height}
			</button>
			<span>Zoom {zoom}×</span>
			{bounds && (
				<span className="text-(--pe-text-secondary)">
					Selection {bounds.width}×{bounds.height}
					{floating ? ` · moved ${floating.offsetX}, ${floating.offsetY}` : ""}
				</span>
			)}
			{notice ? (
				<span
					className="ml-auto rounded-md bg-(--pe-accent-soft) px-2 py-0.5 font-medium text-(--pe-accent-soft-ink)"
					role="status"
				>
					{notice.message}
				</span>
			) : (
				<span className="ml-auto hidden sm:inline">
					Autosaved locally · works offline
				</span>
			)}
		</footer>
	);
};
