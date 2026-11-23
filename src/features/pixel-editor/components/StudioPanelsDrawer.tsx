import { XMarkIcon } from "@heroicons/react/20/solid";
import { useCallback, useEffect, useId, useRef } from "react";
import type { FunctionComponent } from "../../../common/types";
import type { PanelId } from "../types";
import { ColorPickerPanel } from "./ColorPanel";
import { LayersPanel } from "./LayersPanel";
import { PalettePanel } from "./PalettePanel";
import { PreviewPanel } from "./PreviewPanel";
import { TilemapPanel } from "./TilemapPreview";

export type StudioDrawerTab = "color" | "layers" | "preview";

type StudioPanelsDrawerProps = {
	open: boolean;
	activeTab: StudioDrawerTab;
	availableTabs: Array<StudioDrawerTab>;
	panels: Record<PanelId, boolean>;
	onSelectTab: (tab: StudioDrawerTab) => void;
	onClose: () => void;
};

function prefersReducedMotion(): boolean {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
		return false;
	}
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export const StudioPanelsDrawer = ({
	open,
	activeTab,
	availableTabs,
	panels,
	onSelectTab,
	onClose,
}: StudioPanelsDrawerProps): FunctionComponent => {
	const dialogReference = useRef<HTMLDialogElement>(null);
	const scrollerReference = useRef<HTMLDivElement>(null);
	const sheetReference = useRef<HTMLDivElement>(null);
	const isClosingViaSwipe = useRef(false);
	const isUnmounting = useRef(false);
	const closeFallbackTimer = useRef<number | null>(null);
	const openReferenceFrames = useRef<Array<number>>([]);
	const onCloseReference = useRef(onClose);
	useEffect(() => {
		onCloseReference.current = onClose;
	}, [onClose]);

	const headingId = useId();
	const tabListId = useId();

	const clearPendingTimers = useCallback((): void => {
		for (const frameId of openReferenceFrames.current) {
			window.cancelAnimationFrame(frameId);
		}
		openReferenceFrames.current = [];
		if (closeFallbackTimer.current !== null) {
			window.clearTimeout(closeFallbackTimer.current);
			closeFallbackTimer.current = null;
		}
	}, []);

	const finishClose = useCallback((): void => {
		clearPendingTimers();
		const dialog = dialogReference.current;
		isClosingViaSwipe.current = false;
		if (dialog?.open) {
			dialog.returnValue = "";
			dialog.close();
		}
		if (!isUnmounting.current) {
			onCloseReference.current();
		}
	}, [clearPendingTimers]);

	const requestClose = useCallback((): void => {
		const dialog = dialogReference.current;
		const scroller = scrollerReference.current;
		const sheet = sheetReference.current;
		if (!dialog?.open) {
			onCloseReference.current();
			return;
		}
		if (
			!scroller ||
			!sheet ||
			sheet.offsetWidth === 0 ||
			typeof scroller.scrollTo !== "function" ||
			prefersReducedMotion()
		) {
			finishClose();
			return;
		}
		isClosingViaSwipe.current = true;
		scroller.scrollTo({ left: 0, behavior: "auto" });
		if (closeFallbackTimer.current !== null) {
			window.clearTimeout(closeFallbackTimer.current);
		}
		closeFallbackTimer.current = window.setTimeout(() => {
			finishClose();
		}, 450);
	}, [finishClose]);

	useEffect(() => {
		const dialog = dialogReference.current;
		const scroller = scrollerReference.current;
		const sheet = sheetReference.current;
		if (!dialog || !scroller || !sheet) return undefined;

		isUnmounting.current = false;

		if (!open) {
			clearPendingTimers();
			if (dialog.open) {
				dialog.returnValue = "";
				dialog.close();
			}
			return undefined;
		}

		isClosingViaSwipe.current = false;
		if (!dialog.open) {
			dialog.showModal();
		}

		const supportsScrollAnimation =
			typeof CSS !== "undefined" &&
			typeof CSS.supports === "function" &&
			CSS.supports("animation-timeline: scroll()");

		if (!supportsScrollAnimation) {
			dialog.style.setProperty("--pe-drawer-backdrop", "1");
		}

		if (
			sheet.offsetWidth === 0 ||
			typeof scroller.scrollTo !== "function" ||
			prefersReducedMotion()
		) {
			if (typeof scroller.scrollTo === "function") {
				scroller.scrollTo({
					left: scroller.scrollWidth,
					behavior: "instant" as ScrollBehavior,
				});
			}
		} else {
			scroller.scrollTo({
				left: 0,
				behavior: "instant" as ScrollBehavior,
			});
			const firstFrame = window.requestAnimationFrame(() => {
				const secondFrame = window.requestAnimationFrame(() => {
					scroller.scrollTo({
						left: scroller.scrollWidth,
						behavior: "auto",
					});
				});
				openReferenceFrames.current.push(secondFrame);
			});
			openReferenceFrames.current.push(firstFrame);
		}

		let observer: IntersectionObserver | null = null;
		let hasEnteredView = false;
		if (
			typeof IntersectionObserver !== "undefined" &&
			sheet.offsetWidth > 0
		) {
			const visibleThreshold = 1 / Math.max(1, window.innerWidth);
			observer = new IntersectionObserver(
				(entries) => {
					const latest = entries[entries.length - 1];
					if (!latest) return;
					if (latest.intersectionRatio >= visibleThreshold) {
						hasEnteredView = true;
						return;
					}
					if (isClosingViaSwipe.current || hasEnteredView) {
						finishClose();
					}
				},
				{
					root: dialog,
					threshold: [visibleThreshold, 1],
				}
			);
			observer.observe(sheet);
		}

		const handleScroll = (): void => {
			if (!supportsScrollAnimation) {
				const maxScroll = Math.max(1, scroller.scrollWidth - scroller.clientWidth);
				const ratio = Math.max(0, Math.min(1, scroller.scrollLeft / maxScroll));
				dialog.style.setProperty("--pe-drawer-backdrop", String(ratio));
			}
		};

		scroller.addEventListener("scroll", handleScroll, { passive: true });

		return (): void => {
			isUnmounting.current = true;
			clearPendingTimers();
			observer?.disconnect();
			scroller.removeEventListener("scroll", handleScroll);
			if (dialog.open) {
				dialog.returnValue = "";
				dialog.close();
			}
		};
	}, [open, clearPendingTimers, finishClose]);

	const resolvedTab = availableTabs.includes(activeTab)
		? activeTab
		: (availableTabs[0] ?? "color");

	const previewTabLabel =
		!panels.preview && panels.tilemap ? "Tilemap" : "Preview";

	const tabLabel = (tab: StudioDrawerTab): string => {
		if (tab === "color") return "Color";
		if (tab === "layers") return "Layers";
		return previewTabLabel;
	};

	return (
		<dialog
			ref={dialogReference}
			aria-labelledby={headingId}
			className="pe-drawer"
			onCancel={(event): void => {
				if (event.cancelable) {
					event.preventDefault();
					requestClose();
				}
			}}
			onClick={(event): void => {
				const sheet = sheetReference.current;
				if (sheet && !sheet.contains(event.target as Node)) {
					requestClose();
				}
			}}
			onClose={(): void => {
				const dialog = dialogReference.current;
				if (dialog && !dialog.open && !isUnmounting.current) {
					clearPendingTimers();
					onCloseReference.current();
				}
			}}
		>
			<div ref={scrollerReference} className="pe-drawer-scroller">
				<div ref={sheetReference} className="pe-drawer-sheet">
					<header className="flex shrink-0 items-center justify-between gap-2 border-b border-(--pe-border) bg-(--pe-bg-chrome) px-3 py-2">
						<h2 className="sr-only" id={headingId}>
							Studio panels
						</h2>
						<div
							aria-label="Studio panel sections"
							className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
							id={tabListId}
							role="tablist"
						>
							{availableTabs.map((tab) => {
								const selected = resolvedTab === tab;
								return (
									<button
										key={tab}
										aria-selected={selected}
										role="tab"
										type="button"
										className={`inline-flex min-h-8 shrink-0 items-center rounded-lg border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--pe-accent) ${
											selected
												? "border-(--pe-accent-ring) bg-(--pe-accent) text-(--pe-accent-ink)"
												: "border-(--pe-border) bg-(--pe-bg-control) text-(--pe-text-secondary) hover:bg-(--pe-bg-control-hover) hover:text-(--pe-text)"
										}`}
										onClick={() => {
											onSelectTab(tab);
										}}
									>
										{tabLabel(tab)}
									</button>
								);
							})}
						</div>
						<button
							autoFocus
							aria-label="Close studio panels"
							className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-(--pe-border) bg-(--pe-bg-control) text-(--pe-text-secondary) transition-colors hover:bg-(--pe-bg-control-hover) hover:text-(--pe-text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--pe-accent)"
							title="Close (Esc)"
							type="button"
							onClick={requestClose}
						>
							<XMarkIcon className="h-4 w-4" />
						</button>
					</header>

					<div className="pe-drawer-body editor-scrollbar">
						<div className="pe-studio-panel-container space-y-2.5 p-3">
							{resolvedTab === "color" && (
								<>
									{panels.colorPicker && <ColorPickerPanel />}
									{panels.palette && <PalettePanel />}
								</>
							)}
							{resolvedTab === "layers" && panels.layers && <LayersPanel />}
							{resolvedTab === "preview" && (
								<>
									{panels.preview && <PreviewPanel />}
									{panels.tilemap && <TilemapPanel />}
								</>
							)}
						</div>
					</div>
				</div>
			</div>
		</dialog>
	);
};
