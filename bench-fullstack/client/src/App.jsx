import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { api, setToken } from "./api";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Workspaces from "./pages/Workspaces";
import Workspace from "./pages/Workspace";
import Dashboard from "./pages/Dashboard";
import SharedDashboard from "./pages/SharedDashboard";
import Admin from "./pages/Admin";
import AdminLogin from "./pages/AdminLogin";

// Never hardcode this path as a literal string anywhere else — the whole point of this
// route is that it isn't guessable from the codebase or linked from any page.
const ADMIN_LOGIN_PATH = import.meta.env.VITE_ADMIN_LOGIN_PATH;

function RequireAuth({ user, children }) {
  if (user === undefined) return null; // still checking
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireAdmin({ user, children }) {
  if (user === undefined) return null; // still checking
  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_admin) return <Navigate to="/workspaces" replace />;
  return children;
}

export default function App() {
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    api.me().then((d) => setUser(d.user)).catch(() => {
      setToken(null);
      setUser(null);
    });
  }, []);

  // Single source of truth for clearing a session: pages call this (rather than just
  // setToken(null) on their own) so App's user state drops too — otherwise RequireAuth/
  // RequireAdmin would keep gating on a stale truthy user until the next full api.me() check.
  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home onLogout={logout} />} />
        <Route path="/login" element={<Login onAuthed={setUser} />} />
        <Route path="/signup" element={<Signup onAuthed={setUser} />} />
        <Route path="/dashboards/:dashboardId" element={<SharedDashboard />} />
        <Route path="/workspaces" element={<RequireAuth user={user}><Workspaces user={user} onLogout={logout} /></RequireAuth>} />
        <Route path="/workspaces/:workspaceId" element={<RequireAuth user={user}><Workspace user={user} /></RequireAuth>} />
        <Route path="/workspaces/:workspaceId/dashboards/:dashboardId" element={<Dashboard user={user} />} />
        <Route path="/admin" element={<RequireAdmin user={user}><Admin user={user} onLogout={logout} /></RequireAdmin>} />
        {ADMIN_LOGIN_PATH && <Route path={`/${ADMIN_LOGIN_PATH}`} element={<AdminLogin onAuthed={setUser} />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
