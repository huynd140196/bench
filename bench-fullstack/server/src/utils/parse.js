import Papa from "papaparse";
import * as XLSX from "xlsx";

// A column is a "measure" (aggregatable number) only if every non-blank value in it parses
// as a finite number — a single stray non-numeric value (a typo, a unit suffix, a blank row)
// falls back to "dimension" rather than silently coercing bad data to 0 everywhere it's used.
function inferColumns(rows) {
  const names = rows.length ? Object.keys(rows[0]) : [];
  return names.map((name) => {
    const isMeasure = rows.every((r) => {
      const v = r[name];
      if (v === undefined || v === null || v === "") return true;
      return Number.isFinite(Number(v));
    });
    return { name, type: isMeasure ? "measure" : "dimension" };
  });
}

function sheetFromRows(name, rows) {
  // Drop fully-blank trailing rows (common in exported CSVs/spreadsheets).
  const cleaned = rows.filter((r) => Object.values(r).some((v) => v !== "" && v !== null && v !== undefined));
  return { name, columns: inferColumns(cleaned), rows: cleaned };
}

// Parses an uploaded file's buffer into one or more logical sheets: [{ name, columns, rows }].
// CSV/TSV/plain text always produce exactly one sheet named after the file. Excel workbooks
// are split into one logical sheet per worksheet tab, so a multi-tab workbook becomes multiple
// independent sheets in the app rather than only ever importing the first tab.
export function parseUpload(buffer, originalFilename) {
  const baseName = originalFilename.replace(/\.[^.]+$/, "");
  const ext = (originalFilename.match(/\.([^.]+)$/) || [, ""])[1].toLowerCase();

  if (ext === "xlsx" || ext === "xls") {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    return workbook.SheetNames.map((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
      const label = workbook.SheetNames.length > 1 ? `${baseName} — ${sheetName}` : baseName;
      return sheetFromRows(label, rows);
    });
  }

  // CSV, TSV, or plain text — papaparse auto-detects the delimiter.
  const text = buffer.toString("utf-8");
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });
  return [sheetFromRows(baseName, data)];
}
