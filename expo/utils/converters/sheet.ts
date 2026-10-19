import * as XLSX from "xlsx";

const MAX_ROWS_PER_SHEET = 1000;
const MAX_COLS = 40;

/** Converts a spreadsheet (xlsx/xls/csv, base64 or raw csv text) into Markdown tables. */
export function spreadsheetToMarkdown(
  data: string,
  dataType: "base64" | "string",
): string {
  const workbook = XLSX.read(data, { type: dataType });
  const sections: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });
    if (rows.length === 0) continue;

    const truncatedRows = rows.slice(0, MAX_ROWS_PER_SHEET);
    const colCount = Math.min(
      Math.max(...truncatedRows.map((r) => (Array.isArray(r) ? r.length : 0)), 1),
      MAX_COLS,
    );

    const toCells = (row: (string | number | boolean | null)[]): string[] => {
      const cells: string[] = [];
      for (let i = 0; i < colCount; i++) {
        const value = Array.isArray(row) && i < row.length ? row[i] : "";
        cells.push(
          String(value ?? "")
            .replace(/\|/g, "\\|")
            .replace(/\n/g, " ")
            .trim(),
        );
      }
      return cells;
    };

    const lines: string[] = [];
    lines.push(`| ${toCells(truncatedRows[0]).join(" | ")} |`);
    lines.push(`| ${Array(colCount).fill("---").join(" | ")} |`);
    for (const row of truncatedRows.slice(1)) {
      lines.push(`| ${toCells(row).join(" | ")} |`);
    }
    if (rows.length > MAX_ROWS_PER_SHEET) {
      lines.push("");
      lines.push(`> Truncated: showing ${MAX_ROWS_PER_SHEET} of ${rows.length} rows.`);
    }

    if (workbook.SheetNames.length > 1) {
      sections.push(`## ${sheetName}\n\n${lines.join("\n")}`);
    } else {
      sections.push(lines.join("\n"));
    }
  }

  if (sections.length === 0) throw new Error("No data found in spreadsheet");
  return sections.join("\n\n");
}
