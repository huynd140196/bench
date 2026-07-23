const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

function getToken() {
  return sessionStorage.getItem("bench_token");
}
export function setToken(token) {
  if (token) sessionStorage.setItem("bench_token", token);
  else sessionStorage.removeItem("bench_token");
}

async function request(path, { method = "GET", body, isForm = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isForm && body) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  signup: (body) => request("/auth/signup", { method: "POST", body }),
  login: (body) => request("/auth/login", { method: "POST", body }),
  me: () => request("/auth/me"),
  // Separate, admin-only login endpoint (Part A) — same JWT shape as regular login, but
  // only ever succeeds for the one is_admin account, and is rate-limited server-side.
  adminLogin: (body) => request("/admin/auth/login", { method: "POST", body }),
  // Reset flow reachable from the hidden admin login page only. The token itself is never
  // returned by either call — it only ever appears in the server's own console log.
  adminRequestReset: () => request("/admin/auth/request-reset", { method: "POST" }),
  adminResetPassword: (body) => request("/admin/auth/reset-password", { method: "POST", body }),

  listWorkspaces: () => request("/workspaces"),
  createWorkspace: (name) => request("/workspaces", { method: "POST", body: { name } }),
  deleteWorkspace: (workspaceId) => request(`/workspaces/${workspaceId}`, { method: "DELETE" }),
  listMembers: (workspaceId) => request(`/workspaces/${workspaceId}/members`),
  addMember: (workspaceId, email, role) => request(`/workspaces/${workspaceId}/members`, { method: "POST", body: { email, role } }),

  listSheets: (workspaceId) => request(`/workspaces/${workspaceId}/sheets`),
  getSheet: (workspaceId, sheetId) => request(`/workspaces/${workspaceId}/sheets/${sheetId}`),
  uploadSheet: (workspaceId, file) => {
    const form = new FormData();
    form.append("file", file);
    return request(`/workspaces/${workspaceId}/sheets/upload`, { method: "POST", body: form, isForm: true });
  },
  deleteSheet: (workspaceId, sheetId) => request(`/workspaces/${workspaceId}/sheets/${sheetId}`, { method: "DELETE" }),
  addSheetFromUrl: (workspaceId, url, name) => request(`/workspaces/${workspaceId}/sheets/from-url`, { method: "POST", body: { url, name } }),
  refreshSheet: (workspaceId, sheetId) => request(`/workspaces/${workspaceId}/sheets/${sheetId}/refresh`, { method: "POST" }),
  updateCalculatedFields: (workspaceId, sheetId, fields) => request(`/workspaces/${workspaceId}/sheets/${sheetId}/calculated-fields`, { method: "PATCH", body: { fields } }),

  // Dashboards are public: listDashboards/getDashboard require no auth or workspace membership.
  listAllDashboards: () => request(`/dashboards`),
  listDashboards: (workspaceId) => request(`/workspaces/${workspaceId}/dashboards`),
  createDashboard: (workspaceId, name) => request(`/workspaces/${workspaceId}/dashboards`, { method: "POST", body: { name } }),
  getDashboard: (workspaceId, dashboardId) => request(`/workspaces/${workspaceId}/dashboards/${dashboardId}`),
  // Fetch a dashboard by id alone — used by the public read-only view, which may not know the workspaceId.
  getDashboardById: (dashboardId) => request(`/dashboards/${dashboardId}`),
  updateDashboard: (workspaceId, dashboardId, patch) => request(`/workspaces/${workspaceId}/dashboards/${dashboardId}`, { method: "PATCH", body: patch }),
  deleteDashboard: (workspaceId, dashboardId) => request(`/workspaces/${workspaceId}/dashboards/${dashboardId}`, { method: "DELETE" }),

  addChart: (workspaceId, dashboardId, body) => request(`/workspaces/${workspaceId}/dashboards/${dashboardId}/charts`, { method: "POST", body }),
  updateChart: (workspaceId, dashboardId, chartId, body) => request(`/workspaces/${workspaceId}/dashboards/${dashboardId}/charts/${chartId}`, { method: "PATCH", body }),
  deleteChart: (workspaceId, dashboardId, chartId) => request(`/workspaces/${workspaceId}/dashboards/${dashboardId}/charts/${chartId}`, { method: "DELETE" }),

  // Invite-only signup: the single site admin is the only one who can call createInvite.
  createInvite: () => request(`/invites`, { method: "POST" }),
  adminUsers: () => request(`/admin/users`),
  adminWorkspaces: () => request(`/admin/workspaces`),
  adminInvites: () => request(`/admin/invites`),
  adminSetUserDisabled: (userId, disabled) => request(`/admin/users/${userId}/disable`, { method: "PATCH", body: { disabled } }),
  adminDeleteUser: (userId) => request(`/admin/users/${userId}`, { method: "DELETE" }),
};
