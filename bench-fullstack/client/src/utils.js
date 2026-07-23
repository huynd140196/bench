// SQLite's datetime('now') yields "YYYY-MM-DD HH:MM:SS" in UTC with no zone marker.
export function timeAgo(sqliteUtcString) {
  if (!sqliteUtcString) return "";
  const ms = Date.now() - new Date(sqliteUtcString.replace(" ", "T") + "Z").getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
