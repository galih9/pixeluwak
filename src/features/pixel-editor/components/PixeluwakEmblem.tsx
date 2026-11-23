import type { FunctionComponent } from "../../../common/types";
import {
	PIXELUWAK_LOGO_BACKGROUND,
	PIXELUWAK_LOGO_SEGMENTS,
	PIXELUWAK_LOGO_SIZE,
} from "../assets/pixeluwakLogo";

export const PixeluwakEmblem = (): FunctionComponent => (
	<svg
		aria-hidden="true"
		className="h-8 w-8 shrink-0 rounded-md shadow-xs ring-1 ring-(--pe-border-strong)"
		shapeRendering="crispEdges"
		viewBox={`0 0 ${PIXELUWAK_LOGO_SIZE} ${PIXELUWAK_LOGO_SIZE}`}
	>
		<rect
			fill={PIXELUWAK_LOGO_BACKGROUND}
			height={PIXELUWAK_LOGO_SIZE}
			width={PIXELUWAK_LOGO_SIZE}
			x={0}
			y={0}
		/>
		{PIXELUWAK_LOGO_SEGMENTS.map((segment) => (
			<rect
				key={`${segment.x}-${segment.y}`}
				fill={segment.fill}
				height={1}
				width={segment.width}
				x={segment.x}
				y={segment.y}
			/>
		))}
	</svg>
);
