import { applyThemeToTargetDocument } from "../store/uiSettingsStore";
import type { ThemeId } from "../types";

export type DocumentPictureInPictureOptions = {
	width?: number;
	height?: number;
	disallowReturnToOpener?: boolean;
	preferInitialWindowPlacement?: boolean;
};

export type DocumentPictureInPictureApi = {
	requestWindow: (
		options?: DocumentPictureInPictureOptions
	) => Promise<Window>;
	readonly window: Window | null;
};

export type StealthWindowMode = "pip" | "popup";

export type StealthWindowHandle = {
	popupWindow: Window;
	mode: StealthWindowMode;
};

export const DEFAULT_STEALTH_WIDTH = 320;
export const DEFAULT_STEALTH_HEIGHT = 300;
export const STEALTH_POPUP_NAME = "pixeluwak-stealth-window";

type WindowWithDocumentPip = Window & {
	documentPictureInPicture?: DocumentPictureInPictureApi;
};

function openPopupFallback(
	width: number,
	height: number
): StealthWindowHandle | null {
	const features = [
		"popup=yes",
		`width=${width}`,
		`height=${height}`,
		"resizable=yes",
		"menubar=no",
		"toolbar=no",
		"location=no",
		"status=no",
	].join(",");
	const popupWindow = window.open("", STEALTH_POPUP_NAME, features);
	if (!popupWindow) return null;
	return { popupWindow, mode: "popup" };
}

/**
 * Opens a floating, resizable mini-window for Stealth Mode.
 * Prefers the always-on-top Document Picture-in-Picture API when available
 * and falls back to a resizable popup window on other browsers.
 */
export async function openStealthWindow(options?: {
	width?: number;
	height?: number;
}): Promise<StealthWindowHandle | null> {
	const width = options?.width ?? DEFAULT_STEALTH_WIDTH;
	const height = options?.height ?? DEFAULT_STEALTH_HEIGHT;
	const documentPictureInPicture = (window as WindowWithDocumentPip)
		.documentPictureInPicture;

	if (
		documentPictureInPicture &&
		typeof documentPictureInPicture.requestWindow === "function"
	) {
		try {
			const popupWindow = await documentPictureInPicture.requestWindow({
				width,
				height,
			});
			return { popupWindow, mode: "pip" };
		} catch {
			return openPopupFallback(width, height);
		}
	}

	return openPopupFallback(width, height);
}

/**
 * Copies active stylesheets and favicon links into a pop-out document so
 * Tailwind utilities, theme tokens, and container queries work identically.
 */
export function copyStylesToDocument(
	sourceDocument: Document,
	targetDocument: Document
): void {
	const head = targetDocument.head;
	if (!head) return;

	let addedStyleNodes = 0;

	for (const styleSheet of Array.from(sourceDocument.styleSheets)) {
		try {
			const cssRules = Array.from(styleSheet.cssRules)
				.map((rule) => rule.cssText)
				.join("\n");
			if (cssRules.length > 0) {
				const styleElement = targetDocument.createElement("style");
				styleElement.textContent = cssRules;
				head.append(styleElement);
				addedStyleNodes++;
				continue;
			}
		} catch {
			// Cross-origin or restricted stylesheet: fall back to linking href below.
		}

		if (styleSheet.href) {
			const linkElement = targetDocument.createElement("link");
			linkElement.rel = "stylesheet";
			linkElement.href = styleSheet.href;
			head.append(linkElement);
			addedStyleNodes++;
		}
	}

	if (addedStyleNodes === 0 && sourceDocument.head) {
		for (const node of Array.from(
			sourceDocument.head.querySelectorAll('style, link[rel="stylesheet"]')
		)) {
			if (node.tagName === "STYLE") {
				const styleElement = targetDocument.createElement("style");
				styleElement.textContent = node.textContent;
				head.append(styleElement);
			} else if (node instanceof HTMLLinkElement && node.href) {
				const linkElement = targetDocument.createElement("link");
				linkElement.rel = "stylesheet";
				linkElement.href = node.href;
				head.append(linkElement);
			}
		}
	}

	const iconLink = sourceDocument.head?.querySelector('link[rel="icon"]');
	if (iconLink) {
		const href = iconLink.getAttribute("href");
		if (href) {
			const clonedIcon = targetDocument.createElement("link");
			clonedIcon.rel = "icon";
			const type = iconLink.getAttribute("type");
			if (type) clonedIcon.type = type;
			clonedIcon.href = new URL(href, sourceDocument.baseURI).href;
			head.append(clonedIcon);
		}
	}
}

/**
 * Updates the document title of a stealth popup window.
 */
export function setStealthDocumentTitle(
	targetDocument: Document,
	title: string
): void {
	targetDocument.title = title;
}

/**
 * Prepares a clean, styled root container inside a newly opened stealth window.
 */
export function prepareStealthDocument(
	sourceDocument: Document,
	targetDocument: Document,
	options: { theme: ThemeId; title: string }
): HTMLDivElement {
	setStealthDocumentTitle(targetDocument, options.title);
	targetDocument.head?.replaceChildren();
	targetDocument.body?.replaceChildren();

	copyStylesToDocument(sourceDocument, targetDocument);
	applyThemeToTargetDocument(targetDocument, options.theme);

	targetDocument.documentElement.style.height = "100%";
	targetDocument.body.style.margin = "0";
	targetDocument.body.style.overflow = "hidden";
	targetDocument.body.style.height = "100%";
	targetDocument.body.style.width = "100%";

	const container = targetDocument.createElement("div");
	container.id = "pixeluwak-stealth-root";
	container.style.width = "100%";
	container.style.height = "100%";
	targetDocument.body.append(container);

	return container;
}
