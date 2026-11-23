export const PIXELUWAK_LOGO_SIZE = 32;

export const PIXELUWAK_LOGO_BACKGROUND = "#1f1512";

export const PIXELUWAK_LOGO_PALETTE: ReadonlyArray<string> = [
	"#1f1512",
	"#c87d42",
	"#f6ead4",
];

export const PIXELUWAK_LOGO_ROWS: ReadonlyArray<string> = [
	"................................",
	"................................",
	"................................",
	"................................",
	"................................",
	"..................CC.A..........",
	"..................CACAA.........",
	"..................CCCCCCC.......",
	".................CCCCC..CCC.....",
	".................CCCCCCCCCCA....",
	"...........CCCCCCCCCCCCC........",
	"........CCCCCCCCCCCCCCC.........",
	".......CCCC..CCCCCCCC.......CC..",
	"......CCCCCCCCCCCCCCC......CCC..",
	".....CCCCCCCCCCCCCCCC.....CCAA..",
	"....CCC.CCC.A...A..CC.....CAA...",
	"...CCC..CC..C...C..CC.....AA....",
	"..CCA...CC..C...C...CC..AAAA....",
	"..AAA...CC..CC..CC..CCAAAA......",
	"..CCA...CCC.AAAAAAAAAAAAAA......",
	"..CCC.AAAAAAAAAAAAAAAA..CAA.....",
	"..CCA..AAAAAAAA........CA.AA....",
	"..AAA..................AA.AA....",
	"...CCA.................AAA.A....",
	"....CCC.................AAA.....",
	".....CCC.......CC...............",
	"......CCCCCCAACCC...............",
	"........CCCCAAAAA...............",
	"..........AAAAA.................",
	"................................",
	"................................",
	"................................",
];

export type LogoPixelSegment = {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly fill: string;
};

const FOREGROUND_COLOR_MAP: Readonly<Record<string, string>> = {
	A: "#c87d42",
	C: "#f6ead4",
};

function buildLogoSegments(
	rows: ReadonlyArray<string>
): ReadonlyArray<LogoPixelSegment> {
	const segments: Array<LogoPixelSegment> = [];
	for (const [rowIndex, row] of rows.entries()) {
		let columnIndex = 0;
		while (columnIndex < row.length) {
			const character = row[columnIndex];
			const fill = character ? FOREGROUND_COLOR_MAP[character] : undefined;
			if (!fill) {
				columnIndex++;
				continue;
			}
			const startColumn = columnIndex;
			while (
				columnIndex < row.length &&
				row[columnIndex] === character
			) {
				columnIndex++;
			}
			segments.push({
				x: startColumn,
				y: rowIndex,
				width: columnIndex - startColumn,
				fill,
			});
		}
	}
	return segments;
}

export const PIXELUWAK_LOGO_SEGMENTS: ReadonlyArray<LogoPixelSegment> =
	buildLogoSegments(PIXELUWAK_LOGO_ROWS);
