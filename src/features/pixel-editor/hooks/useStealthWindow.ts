import { useCallback, useEffect, useRef, useState } from "react";
import {
	openStealthWindow,
	prepareStealthDocument,
	setStealthDocumentTitle,
	type StealthWindowMode,
} from "../lib/stealthWindow";
import { applyThemeToTargetDocument } from "../store/uiSettingsStore";
import type { ThemeId } from "../types";

type ActiveHandle = {
	popupWindow: Window;
	cleanupListeners: () => void;
};

export type UseStealthWindowResult = {
	isActive: boolean;
	mode: StealthWindowMode | null;
	stealthWindow: Window | null;
	container: HTMLDivElement | null;
	openStealth: () => Promise<boolean>;
	closeStealth: () => void;
	focusStealth: () => void;
};

export function useStealthWindow({
	theme,
	title,
}: {
	theme: ThemeId;
	title: string;
}): UseStealthWindowResult {
	const [stealthWindow, setStealthWindow] = useState<Window | null>(null);
	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const [mode, setMode] = useState<StealthWindowMode | null>(null);

	const activeHandleRef = useRef<ActiveHandle | null>(null);
	const themeRef = useRef(theme);
	const titleRef = useRef(title);

	useEffect(() => {
		themeRef.current = theme;
	}, [theme]);

	useEffect(() => {
		titleRef.current = title;
	}, [title]);

	const clearActiveState = useCallback((): void => {
		const active = activeHandleRef.current;
		activeHandleRef.current = null;
		if (active) {
			active.cleanupListeners();
		}
		setStealthWindow(null);
		setContainer(null);
		setMode(null);
	}, []);

	const closeStealth = useCallback((): void => {
		const active = activeHandleRef.current;
		activeHandleRef.current = null;
		if (active) {
			active.cleanupListeners();
			try {
				if (!active.popupWindow.closed) {
					active.popupWindow.close();
				}
			} catch {
				// Ignore close errors on already-disposed windows.
			}
		}
		setStealthWindow(null);
		setContainer(null);
		setMode(null);
	}, []);

	const focusStealth = useCallback((): void => {
		const popupWindow = activeHandleRef.current?.popupWindow;
		if (popupWindow && !popupWindow.closed) {
			popupWindow.focus();
		}
	}, []);

	const attachPopupWindow = useCallback(
		(popupWindow: Window, nextMode: StealthWindowMode): void => {
			const rootContainer = prepareStealthDocument(
				document,
				popupWindow.document,
				{
					theme: themeRef.current,
					title: titleRef.current,
				}
			);

			const onPopupClosed = (): void => {
				if (activeHandleRef.current?.popupWindow === popupWindow) {
					clearActiveState();
				}
			};

			const onOpenerFocus = (): void => {
				if (popupWindow.closed) {
					onPopupClosed();
				}
			};

			const onOpenerUnload = (): void => {
				try {
					if (!popupWindow.closed) {
						popupWindow.close();
					}
				} catch {
					// Ignore errors during page teardown.
				}
			};

			popupWindow.addEventListener("pagehide", onPopupClosed);
			popupWindow.addEventListener("beforeunload", onPopupClosed);
			window.addEventListener("focus", onOpenerFocus);
			window.addEventListener("pagehide", onOpenerUnload);
			window.addEventListener("beforeunload", onOpenerUnload);

			activeHandleRef.current = {
				popupWindow,
				cleanupListeners: (): void => {
					popupWindow.removeEventListener("pagehide", onPopupClosed);
					popupWindow.removeEventListener("beforeunload", onPopupClosed);
					window.removeEventListener("focus", onOpenerFocus);
					window.removeEventListener("pagehide", onOpenerUnload);
					window.removeEventListener("beforeunload", onOpenerUnload);
				},
			};

			setStealthWindow(popupWindow);
			setContainer(rootContainer);
			setMode(nextMode);
		},
		[clearActiveState]
	);

	const openStealth = useCallback(async (): Promise<boolean> => {
		const existing = activeHandleRef.current;
		if (existing && !existing.popupWindow.closed) {
			existing.popupWindow.focus();
			return true;
		}
		if (existing) {
			clearActiveState();
		}

		const handle = await openStealthWindow();
		if (!handle) {
			return false;
		}

		attachPopupWindow(handle.popupWindow, handle.mode);
		return true;
	}, [attachPopupWindow, clearActiveState]);

	useEffect(() => {
		if (!stealthWindow) return;
		const targetWindow = activeHandleRef.current?.popupWindow;
		if (!targetWindow || targetWindow.closed) return;
		applyThemeToTargetDocument(targetWindow.document, theme);
	}, [stealthWindow, theme]);

	useEffect(() => {
		if (!stealthWindow) return;
		const targetWindow = activeHandleRef.current?.popupWindow;
		if (!targetWindow || targetWindow.closed) return;
		setStealthDocumentTitle(targetWindow.document, title);
	}, [stealthWindow, title]);

	useEffect(() => {
		return (): void => {
			const active = activeHandleRef.current;
			activeHandleRef.current = null;
			if (!active) return;
			active.cleanupListeners();
			try {
				if (!active.popupWindow.closed) {
					active.popupWindow.close();
				}
			} catch {
				// Ignore errors during unmount cleanup.
			}
		};
	}, []);

	return {
		isActive: stealthWindow !== null && container !== null,
		mode,
		stealthWindow,
		container,
		openStealth,
		closeStealth,
		focusStealth,
	};
}
