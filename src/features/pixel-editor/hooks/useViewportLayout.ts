import { useEffect, useState } from "react";

export const COMPACT_MEDIA_QUERY =
	"(max-width: 1023px), (orientation: portrait) and (max-width: 1024px)";

export const PORTRAIT_DOCK_MEDIA_QUERY =
	"(orientation: portrait) and (max-width: 1024px), (max-width: 639px) and (min-height: 480px)";

export const NARROW_MEDIA_QUERY = "(max-width: 639px)";

export type ViewportLayout = {
	isCompact: boolean;
	isPortraitDock: boolean;
	isNarrow: boolean;
};

function matchesMedia(query: string): boolean {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
		return false;
	}
	return window.matchMedia(query).matches;
}

export function readViewportLayout(): ViewportLayout {
	return {
		isCompact: matchesMedia(COMPACT_MEDIA_QUERY),
		isPortraitDock: matchesMedia(PORTRAIT_DOCK_MEDIA_QUERY),
		isNarrow: matchesMedia(NARROW_MEDIA_QUERY),
	};
}

export function useViewportLayout(): ViewportLayout {
	const [layout, setLayout] = useState<ViewportLayout>(() => readViewportLayout());

	useEffect(() => {
		if (
			typeof window === "undefined" ||
			typeof window.matchMedia !== "function"
		) {
			return undefined;
		}
		const compactMedia = window.matchMedia(COMPACT_MEDIA_QUERY);
		const portraitMedia = window.matchMedia(PORTRAIT_DOCK_MEDIA_QUERY);
		const narrowMedia = window.matchMedia(NARROW_MEDIA_QUERY);

		const update = (): void => {
			setLayout((previous) => {
				const next = {
					isCompact: compactMedia.matches,
					isPortraitDock: portraitMedia.matches,
					isNarrow: narrowMedia.matches,
				};
				if (
					previous.isCompact === next.isCompact &&
					previous.isPortraitDock === next.isPortraitDock &&
					previous.isNarrow === next.isNarrow
				) {
					return previous;
				}
				return next;
			});
		};

		update();
		compactMedia.addEventListener("change", update);
		portraitMedia.addEventListener("change", update);
		narrowMedia.addEventListener("change", update);
		return (): void => {
			compactMedia.removeEventListener("change", update);
			portraitMedia.removeEventListener("change", update);
			narrowMedia.removeEventListener("change", update);
		};
	}, []);

	return layout;
}
