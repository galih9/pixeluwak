import { ZOOM_LEVELS } from "../constants";

export type PinchState = {
	startDistance: number;
	startZoom: number;
	anchorDocumentX: number;
	anchorDocumentY: number;
};

/**
 * Picks the nearest `ZOOM_LEVELS` entry in log-space so crisp integer/power-of-two
 * pixel zooms step smoothly during a two-finger pinch gesture.
 */
export function snapPinchZoom(rawZoom: number): number {
	const fallback = ZOOM_LEVELS[0] ?? 1;
	if (!Number.isFinite(rawZoom) || rawZoom <= 0) return fallback;
	const targetLog = Math.log(rawZoom);
	let bestLevel = fallback;
	let bestDifference = Number.POSITIVE_INFINITY;
	for (const level of ZOOM_LEVELS) {
		const difference = Math.abs(Math.log(level) - targetLog);
		if (difference < bestDifference) {
			bestDifference = difference;
			bestLevel = level;
		}
	}
	return bestLevel;
}

export function computePinchView(
	pinch: PinchState,
	currentDistance: number,
	midpointLocalX: number,
	midpointLocalY: number
): { zoom: number; panX: number; panY: number } {
	const safeStartDistance = Math.max(1, pinch.startDistance);
	const scaleFactor = Math.max(1, currentDistance) / safeStartDistance;
	const zoom = snapPinchZoom(pinch.startZoom * scaleFactor);
	return {
		zoom,
		panX: Math.round(midpointLocalX - pinch.anchorDocumentX * zoom),
		panY: Math.round(midpointLocalY - pinch.anchorDocumentY * zoom),
	};
}
