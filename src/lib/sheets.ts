import { createServerFn } from "@tanstack/react-start";
import { auth } from "@clerk/tanstack-react-start/server";
import { z } from "zod";
import { env } from "#/env";
import {
  evolvingPhysiquesConfig,
  parseWeekData,
  type ParsedWeekData,
} from "./tracker-config";

export type SpreadsheetMeta = {
  title: string;
  tabs: string[];
};

async function getAllowedIds(): Promise<string[]> {
  const { userId } = await auth();
  if (!userId) return [];
  const { createClerkClient } = await import("@clerk/backend");
  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
  const user = await clerk.users.getUser(userId);
  return (user.privateMetadata.allowedSpreadsheetIds ?? []) as string[];
}

export const getAllowedSpreadsheetIds = createServerFn({
  method: "GET",
}).handler(async (): Promise<string[]> => getAllowedIds());

export const checkSpreadsheetAccess = createServerFn({ method: "GET" })
  .inputValidator(z.object({ spreadsheetId: z.string() }))
  .handler(async ({ data }): Promise<boolean> => {
    const allowed = await getAllowedIds();
    return allowed.includes(data.spreadsheetId);
  });

export type { ParsedWeekData };

export const getSpreadsheetMeta = createServerFn({ method: "GET" })
  .inputValidator(z.object({ spreadsheetId: z.string() }))
  .handler(async ({ data }): Promise<SpreadsheetMeta> => {
    const { getSheetsClient } = await import("./google");
    const sheets = getSheetsClient();
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: data.spreadsheetId,
      fields: "properties.title,sheets.properties.title",
    });

    const title = spreadsheet.data.properties?.title ?? "Untitled Spreadsheet";
    const tabs = (spreadsheet.data.sheets ?? [])
      .map((s) => s.properties?.title ?? "")
      .filter(Boolean);

    return { title, tabs };
  });

export const saveDay = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      spreadsheetId: z.string(),
      updates: z.array(z.object({ range: z.string(), value: z.string() })),
    }),
  )
  .handler(async ({ data }) => {
    const { getSheetsClient } = await import("./google");
    const sheets = getSheetsClient();
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: data.spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: data.updates.map(({ range, value }) => ({
          range,
          values: [[value]],
        })),
      },
    });
  });

export const getTabData = createServerFn({ method: "GET" })
  .inputValidator(z.object({ spreadsheetId: z.string(), tab: z.string() }))
  .handler(async ({ data }): Promise<ParsedWeekData> => {
    const { getSheetsClient } = await import("./google");
    const sheets = getSheetsClient();
    const range = await sheets.spreadsheets.values.get({
      spreadsheetId: data.spreadsheetId,
      range: data.tab,
    });

    const grid = (range.data.values ?? []) as string[][];
    return parseWeekData(grid, data.tab, evolvingPhysiquesConfig);
  });
