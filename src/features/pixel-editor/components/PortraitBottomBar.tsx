import {
	EyeIcon,
	FilmIcon,
	Square3Stack3DIcon,
} from "@heroicons/react/20/solid";
import type { FunctionComponent } from "../../../common/types";
import { useEditorStore } from "../store/editorStore";
import type { StudioDrawerTab } from "./StudioPanelsDrawer";

type PortraitBottomBarProps = {
	availableTabs: Array<StudioDrawerTab>;
	drawerOpen: boolean;
	activeTab: StudioDrawerTab;
	showFrames: boolean;
	timelineOpen: boolean;
	previewLabel: string;
	onOpenDrawerTab: (tab: StudioDrawerTab) => void;
	onToggleTimeline: () => void;
};

export const PortraitBottomBar = ({
	availableTabs,
	drawerOpen,
	activeTab,
	showFrames,
	timelineOpen,
	previewLabel,
	onOpenDrawerTab,
	onToggleTimeline,
}: PortraitBottomBarProps): FunctionComponent => {
	const primaryColor = useEditorStore((state) => state.primaryColor);
	const secondaryColor = useEditorStore((state) => state.secondaryColor);
	const layerCount = useEditorStore((state) => state.layers.length);
	const currentFrame = useEditorStore((state) => state.currentFrame);
	const frameCount = useEditorStore((state) => state.frames.length);
	const playing = useEditorStore((state) => state.playing);

	const buttonBaseClass =
		"pe-btn inline-flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border px-1.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--pe-accent) sm:gap-1.5 sm:px-2.5 sm:text-xs";

	const stateClass = (active: boolean): string =>
		active
			? "border-(--pe-accent-ring) bg-(--pe-accent) text-(--pe-accent-ink) shadow-xs"
			: "border-(--pe-border) bg-(--pe-bg-control) text-(--pe-text-secondary) hover:bg-(--pe-bg-control-hover) hover:text-(--pe-text)";

	return (
		<nav
			aria-label="Studio panels and timeline"
			className="pe-bottom-dock pe-bottom-safe flex shrink-0 items-center justify-around gap-1 border-t border-(--pe-border) bg-(--pe-bg-chrome) px-1.5 py-1"
		>
			{availableTabs.includes("color") && (
				<button
					aria-pressed={drawerOpen && activeTab === "color"}
					className={`${buttonBaseClass} ${stateClass(drawerOpen && activeTab === "color")}`}
					type="button"
					onClick={() => {
						onOpenDrawerTab("color");
					}}
				>
					<span aria-hidden="true" className="relative h-4 w-4 shrink-0">
						<span
							className="swatch-preserve absolute right-0 bottom-0 h-2.5 w-2.5 rounded-xs border border-(--pe-border-strong)"
							style={{ background: secondaryColor }}
						/>
						<span
							className="swatch-preserve absolute top-0 left-0 h-3 w-3 rounded-xs border border-(--pe-bg-panel) ring-1 ring-(--pe-border-strong)"
							style={{ background: primaryColor }}
						/>
					</span>
					<span className="truncate">Color</span>
				</button>
			)}

			{availableTabs.includes("layers") && (
				<button
					aria-pressed={drawerOpen && activeTab === "layers"}
					className={`${buttonBaseClass} ${stateClass(drawerOpen && activeTab === "layers")}`}
					type="button"
					onClick={() => {
						onOpenDrawerTab("layers");
					}}
				>
					<Square3Stack3DIcon
						aria-hidden="true"
						className="h-4 w-4 shrink-0"
					/>
					<span className="truncate">Layers</span>
					<span className="hidden rounded-full bg-black/15 px-1.5 py-px text-[10px] tabular-nums min-[430px]:inline-flex">
						{layerCount}
					</span>
				</button>
			)}

			{availableTabs.includes("preview") && (
				<button
					aria-pressed={drawerOpen && activeTab === "preview"}
					className={`${buttonBaseClass} ${stateClass(drawerOpen && activeTab === "preview")}`}
					type="button"
					onClick={() => {
						onOpenDrawerTab("preview");
					}}
				>
					<EyeIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
					<span className="truncate">{previewLabel}</span>
				</button>
			)}

			{showFrames && (
				<button
					aria-expanded={timelineOpen}
					aria-pressed={timelineOpen}
					className={`${buttonBaseClass} ${stateClass(timelineOpen || playing)}`}
					type="button"
					onClick={onToggleTimeline}
				>
					<FilmIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
					<span className="truncate">Frames</span>
					<span className="hidden rounded-full bg-black/15 px-1.5 py-px text-[10px] tabular-nums min-[430px]:inline-flex">
						{currentFrame + 1}/{frameCount}
					</span>
				</button>
			)}
		</nav>
	);
};
