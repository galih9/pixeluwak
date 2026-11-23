import {
	MagnifyingGlassMinusIcon,
	MagnifyingGlassPlusIcon,
} from "@heroicons/react/20/solid";
import { useEffect, useMemo } from "react";
import type { FunctionComponent } from "../../../common/types";
import { maskBounds } from "../lib/raster";
import { useEditorStore } from "../store/editorStore";
import { IconButton } from "./ui";

type CanvasHudProps = {
	showStatusInfo: boolean;
};

export const CanvasHud = ({
	showStatusInfo,
}: CanvasHudProps): FunctionComponent => {
	const width = useEditorStore((state) => state.width);
	const height = useEditorStore((state) => state.height);
	const zoom = useEditorStore((state) => state.zoom);
	const zoomStep = useEditorStore((state) => state.zoomStep);
	const fitView = useEditorStore((state) => state.fitView);
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
		if (!notice) return undefined;
		const timer = window.setTimeout(clearNotice, 3500);
		return (): void => {
			window.clearTimeout(timer);
		};
	}, [notice, clearNotice]);

	return (
		<div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-2">
			<div className="flex justify-center">
				{notice && (
					<span
						className="pointer-events-auto max-w-full truncate rounded-full border border-(--pe-accent-ring) bg-(--pe-bg-panel)/95 px-3 py-1 text-[11px] font-medium text-(--pe-accent-soft-ink) shadow-sm backdrop-blur-xs"
						role="status"
					>
						{notice.message}
					</span>
				)}
			</div>

			<div className="flex items-end justify-between gap-2">
				<div className="flex min-w-0 flex-wrap items-center gap-1.5">
					{showStatusInfo && (
						<button
							className="pointer-events-auto inline-flex h-8 items-center rounded-lg border border-(--pe-border) bg-(--pe-bg-panel)/90 px-2 text-[11px] font-medium tabular-nums text-(--pe-text-secondary) shadow-xs backdrop-blur-xs transition-colors hover:bg-(--pe-bg-control-hover) hover:text-(--pe-text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--pe-accent)"
							title="Resize canvas (Shift+R)"
							type="button"
							onClick={() => {
								openDialog("resize");
							}}
						>
							{width}×{height}
						</button>
					)}
					{showStatusInfo && bounds && (
						<span className="pointer-events-auto rounded-lg border border-(--pe-border) bg-(--pe-bg-panel)/90 px-2 py-1 text-[11px] tabular-nums text-(--pe-text-secondary) shadow-xs backdrop-blur-xs">
							Sel {bounds.width}×{bounds.height}
							{floating ? ` · ${floating.offsetX},${floating.offsetY}` : ""}
						</span>
					)}
				</div>

				<div className="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-(--pe-border) bg-(--pe-bg-panel)/92 p-0.5 shadow-xs backdrop-blur-xs">
					<IconButton
						className="h-8 w-8"
						label="Zoom out (-)"
						onClick={() => {
							zoomStep(-1);
						}}
					>
						<MagnifyingGlassMinusIcon className="h-4 w-4" />
					</IconButton>
					<button
						aria-label="Fit to screen (0)"
						className="h-8 min-w-11 rounded-lg px-1.5 text-center text-[11px] font-semibold tabular-nums text-(--pe-text-secondary) transition-colors hover:bg-(--pe-bg-control-hover) hover:text-(--pe-text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--pe-accent)"
						title="Fit to screen (0)"
						type="button"
						onClick={fitView}
					>
						{Math.round(zoom * 100)}%
					</button>
					<IconButton
						className="h-8 w-8"
						label="Zoom in (+)"
						onClick={() => {
							zoomStep(1);
						}}
					>
						<MagnifyingGlassPlusIcon className="h-4 w-4" />
					</IconButton>
				</div>
			</div>
		</div>
	);
};
