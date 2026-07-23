import Papa from "papaparse";

// Accepts a normal "share" URL (https://docs.google.com/spreadsheets/d/<id>/edit#gid=<gid>)
// and rewrites it to that sheet's CSV export endpoint — this only works for sheets shared as
// "Anyone with the link can view", same restriction the UI's helper text already states.
function toCsvExportUrl(url) {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error("Not a recognizable Google Sheets URL");
  const id = match[1];
  const gidMatch = url.match(/[?#&]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

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

// Fetches and parses a public Google Sheets URL into { name, columns, rows } — used both when
// a sheet is first added from a URL, and when it's later refreshed (re-fetches the same URL).
export async function fetchGoogleSheet(url, name) {
  const csvUrl = toCsvExportUrl(url);
  const res = await fetch(csvUrl);
  if (!res.ok) throw new Error("Couldn't fetch that Google Sheet — make sure it's shared as \"Anyone with the link can view\"");
  const text = await res.text();
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });
  const cleaned = data.filter((r) => Object.values(r).some((v) => v !== "" && v !== null && v !== undefined));
  return { name: name || "Google Sheet", columns: inferColumns(cleaned), rows: cleaned };
}
