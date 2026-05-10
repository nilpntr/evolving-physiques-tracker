import { google } from "googleapis";

export function getSheetsClient() {
	const raw = process.env.GOOGLE_DRIVE_CREDENTIALS_FILE;
	if (!raw) {
		throw new Error("GOOGLE_DRIVE_CREDENTIALS_FILE env var is not set");
	}
	const json = Buffer.from(raw, "base64").toString("utf-8");
	const credentials = JSON.parse(json);
	const auth = new google.auth.GoogleAuth({
		credentials,
		scopes: ["https://www.googleapis.com/auth/spreadsheets"],
	});
	return google.sheets({ version: "v4", auth });
}
