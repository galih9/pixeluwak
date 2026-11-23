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
		<footer className="flex h-7 shrink-0 items-center gap-4 border-t border-[var(--pe-border)] bg-[var(--pe-bg-chrome)] px-3 text-[11px] tabular-nums text-[var(--pe-text-muted)]">
			<span className="w-20 text-[var(--pe-text-secondary)]">
				{cursor ? `x ${cursor.x}, y ${cursor.y}` : "—"}
			</span>
			<span>
				Canvas {width}×{height}
			</span>
			<span>Zoom {zoom}×</span>
			{bounds && (
				<span className="text-[var(--pe-text-secondary)]">
					Selection {bounds.width}×{bounds.height}
					{floating ? ` · moved ${floating.offsetX}, ${floating.offsetY}` : ""}
				</span>
			)}
			{notice ? (
				<span
					className="ml-auto rounded-md bg-[var(--pe-accent-soft)] px-2 py-0.5 font-medium text-[var(--pe-accent-soft-ink)]"
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
