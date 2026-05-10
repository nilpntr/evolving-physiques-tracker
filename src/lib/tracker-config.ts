// ---------------------------------------------------------------------------
// Field & section type definitions
// ---------------------------------------------------------------------------

export type FieldKind =
	| "rating" // 1–N scale
	| "number" // numeric input
	| "date" // date picker (ISO output)
	| "text" // single-line free text
	| "textarea" // multi-line free text
	| "select"; // predefined options

export type Field = {
	key: string;
	label: string;
	/** Substring to find this row by scanning the label column (case-insensitive) */
	labelMatch: string;
	kind: FieldKind;
	options?: string[]; // for 'select'
	unit?: string; // for 'number', e.g. 'kg', 'mins'
	min?: number; // for 'rating' and 'number'
	max?: number; // for 'rating'
	step?: number; // for 'number'
	/**
	 * True when the cell is merged across all day columns in the sheet —
	 * treated as a single weekly value rather than 7 per-day values.
	 * The API returns the content in values[0], the rest are empty.
	 */
	weekField?: boolean;
};

export type Section = {
	key: string;
	title: string;
	fields: Field[];
};

/**
 * Single-cell header fields (athlete name, check-in number, etc.).
 * The label and value live in a specific column pair on the same row.
 */
export type HeaderField = {
	key: string;
	label: string;
	/** Substring to search for in `searchColumn` to locate the row */
	labelMatch: string;
	searchColumn: number; // 0-indexed column that contains the label text
	valueColumn: number; // 0-indexed column that contains the value
};

// ---------------------------------------------------------------------------
// Top-level config type
// ---------------------------------------------------------------------------

export type TrackerConfig = {
	name: string;

	// ---- column layout (0-indexed) ----
	/** Column that holds the row label for each metric (B = 1) */
	labelColumn: number;
	/** First "day" data column (E = 4) */
	dayStartColumn: number;
	/** How many day columns exist (typically 7) */
	dayCount: number;
	/** Column for the weekly average formula result (L = 11) */
	weeklyAverageColumn: number;

	// ---- anchor row detection ----
	/** Substring present in the row that shows "DAY 1 / DAY 2 …" column headers */
	dayHeaderLabelMatch: string;
	/** Substring present in the dates row (e.g. "DATE") */
	dateLabelMatch: string;

	// ---- header / meta fields ----
	headerFields: HeaderField[];

	// ---- main per-day sections ----
	sections: Section[];
};

// ---------------------------------------------------------------------------
// Parsed output types (returned from server fn, consumed by the UI)
// ---------------------------------------------------------------------------

export type ParsedField = Pick<
	Field,
	"key" | "label" | "kind" | "options" | "unit" | "min" | "max" | "step" | "weekField"
> & {
	/** One value per day (null when the cell is empty) */
	values: (string | null)[];
	weeklyAverage: string | null;
	/** 0-indexed row number in the sheet grid — used to build A1 ranges for writes */
	rowIndex: number | null;
};

export type ParsedSection = {
	key: string;
	title: string;
	fields: ParsedField[];
};

export type ParsedWeekData = {
	sheetName: string;
	/** Formatted date strings, one per day column */
	dates: (string | null)[];
	/** Keyed by HeaderField.key */
	header: Record<string, string>;
	sections: ParsedSection[];
};

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function findRow(grid: string[][], match: string): string[] | undefined {
	const upper = match.toUpperCase();
	return grid.find((row) =>
		row.some(
			(cell) => typeof cell === "string" && cell.toUpperCase().includes(upper),
		),
	);
}

function findRowIndex(grid: string[][], match: string): number | null {
	const upper = match.toUpperCase();
	const idx = grid.findIndex((row) =>
		row.some(
			(cell) => typeof cell === "string" && cell.toUpperCase().includes(upper),
		),
	);
	return idx === -1 ? null : idx;
}

export function parseWeekData(
	grid: string[][],
	sheetName: string,
	config: TrackerConfig,
): ParsedWeekData {
	const { dayStartColumn, dayCount, weeklyAverageColumn } = config;

	// Date row
	const dateRow = findRow(grid, config.dateLabelMatch);
	const dates = Array.from(
		{ length: dayCount },
		(_, i) => dateRow?.[dayStartColumn + i] ?? null,
	);

	// Header / meta fields
	const header: Record<string, string> = {};
	for (const hf of config.headerFields) {
		const row = findRow(grid, hf.labelMatch);
		header[hf.key] = row?.[hf.valueColumn] ?? "";
	}

	// Per-day sections
	const sections: ParsedSection[] = config.sections.map((section) => ({
		key: section.key,
		title: section.title,
		fields: section.fields.map((field) => {
			const row = findRow(grid, field.labelMatch);
			const rowIndex = findRowIndex(grid, field.labelMatch);
			const values = Array.from(
				{ length: dayCount },
				(_, i) => row?.[dayStartColumn + i] ?? null,
			);
			const weeklyAverage = row?.[weeklyAverageColumn] ?? null;
			return {
				key: field.key,
				label: field.label,
				kind: field.kind,
				options: field.options,
				unit: field.unit,
				min: field.min,
				max: field.max,
				step: field.step,
				weekField: field.weekField,
				values,
				weeklyAverage,
				rowIndex,
			};
		}),
	}));

	return { sheetName, dates, header, sections };
}

// ---------------------------------------------------------------------------
// Evolving Physiques — default tracker config
// ---------------------------------------------------------------------------

export const evolvingPhysiquesConfig: TrackerConfig = {
	name: "Evolving Physiques Check-In Form",
	labelColumn: 1, // column B
	dayStartColumn: 4, // column E
	dayCount: 7,
	weeklyAverageColumn: 11, // column L
	dayHeaderLabelMatch: "DAY 1",
	dateLabelMatch: "DATE",
	headerFields: [
		{
			key: "name",
			label: "Athlete Name",
			labelMatch: "NAME:",
			searchColumn: 9,
			valueColumn: 10,
		},
		{
			key: "checkInNr",
			label: "Check-In #",
			labelMatch: "CHECK IN NR",
			searchColumn: 9,
			valueColumn: 10,
		},
		{
			key: "startingWeight",
			label: "Starting Weight",
			labelMatch: "STARTING WEIGHT",
			searchColumn: 9,
			valueColumn: 10,
		},
	],
	sections: [
		{
			key: "weight",
			title: "Weight",
			fields: [
				{
					key: "date",
					label: "Date",
					labelMatch: "DATE:",
					kind: "date",
				},
				{
					key: "weight",
					label: "Morning Weight",
					labelMatch: "WEIGHT READINGS",
					kind: "number",
					unit: "kg",
					step: 0.1,
				},
			],
		},
		{
			key: "biomarkers",
			title: "Bio Markers",
			fields: [
				{
					key: "energy",
					label: "Energy Levels",
					labelMatch: "ENERGY LEVELS",
					kind: "rating",
					min: 1,
					max: 5,
				},
				{
					key: "focus",
					label: "Ability to Focus",
					labelMatch: "ABILITY TO FOCUS",
					kind: "rating",
					min: 1,
					max: 5,
				},
				{
					key: "stress",
					label: "Mental & Emotional Stress",
					labelMatch: "MENTAL AND EMOTIONAL",
					kind: "rating",
					min: 1,
					max: 5,
				},
				{
					key: "illness",
					label: "Signs of Illness / Flu",
					labelMatch: "SIGNS OF ILLNESS",
					kind: "rating",
					min: 1,
					max: 5,
				},
				{
					key: "soreness",
					label: "Muscle Soreness",
					labelMatch: "MUSCLE SORENESS",
					kind: "rating",
					min: 1,
					max: 5,
				},
				{
					key: "menCycle",
					label: "Men. Cycle",
					labelMatch: "MEN. CYCLE",
					kind: "select",
					options: ["On", "Off"],
				},
			],
		},
		{
			key: "nutrition",
			title: "Nutrition",
			fields: [
				{
					key: "accuracy",
					label: "Accuracy",
					labelMatch: "ACCURACY",
					kind: "select",
					options: ["Accurate", "Under", "Over"],
				},
				{
					key: "hunger",
					label: "Hunger / Appetite",
					labelMatch: "HUNGER",
					kind: "rating",
					min: 1,
					max: 5,
				},
				{
					key: "cravings",
					label: "Cravings",
					labelMatch: "CRAVINGS",
					kind: "rating",
					min: 1,
					max: 5,
				},
				{
					key: "stoolFreq",
					label: "Stool Frequency",
					labelMatch: "FREQUENCY OF STOOL",
					kind: "rating",
					min: 1,
					max: 5,
				},
				{
					key: "stoolQuality",
					label: "Stool Quality",
					labelMatch: "QUALITY OF STOOL",
					kind: "select",
					options: ["Regular", "Solid", "Loose"],
				},
				{
					key: "digestiveStress",
					label: "Digestive Stress",
					labelMatch: "DIGESTIVE STRESS",
					kind: "select",
					options: ["No", "Gas", "Gas and bloating", "Other"],
				},
			],
		},
		{
			key: "training",
			title: "Training & Activity",
			fields: [
				{
					key: "session",
					label: "Session Executed",
					labelMatch: "SESSION EXECUTED",
					kind: "text",
				},
				{
					key: "performance",
					label: "Strength / Performance",
					labelMatch: "STRENGTH / PERFORMANCE",
					kind: "select",
					options: ["Progress", "Maintenance", "Regress"],
				},
				{
					key: "motivation",
					label: "Motivation Levels",
					labelMatch: "MOTIVATION LEVELS",
					kind: "rating",
					min: 1,
					max: 5,
				},
				{
					key: "steps",
					label: "Steps / Calories",
					labelMatch: "STEPS OR CALORIES",
					kind: "number",
					unit: "steps",
				},
				{
					key: "cardio",
					label: "Scheduled Cardio",
					labelMatch: "SCHEDULED CARDIO",
					kind: "number",
					unit: "mins",
				},
				{
					key: "pumps",
					label: "Muscle Pumps",
					labelMatch: "MUSCLE PUMPS",
					kind: "select",
					options: ["No", "Medium", "Good"],
				},
			],
		},
		{
			key: "sleep",
			title: "Sleep",
			fields: [
				{
					key: "sleepHours",
					label: "Total Hours",
					labelMatch: "TOTAL HOURS",
					kind: "number",
					unit: "hrs",
					step: 0.5,
				},
				{
					key: "sleepSatisfaction",
					label: "Sleep Satisfaction",
					labelMatch: "SATISFACTION",
					kind: "rating",
					min: 1,
					max: 5,
				},
			],
		},
		{
			key: "comments",
			title: "Additional Comments",
			fields: [
				{
					key: "coffee",
					label: "Coffee / Stimulants",
					labelMatch: "COFFEE",
					kind: "text",
				},
				{
					key: "daylight",
					label: "Daylight / Outdoors",
					labelMatch: "DAYLIGHT",
					kind: "text",
				},
				{
					key: "supplements",
					label: "Supplements",
					labelMatch: "SUPPLEMENTS",
					kind: "text",
				},
				{
					key: "generalComments",
					label: "General Comments",
					labelMatch: "GENERAL COMMENTS",
					kind: "textarea",
					weekField: true,
				},
			],
		},
	],
};
