import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "../auth/AuthContext.jsx";
import ControlPage from "../pages/ControlPage.jsx";
import StreaksPage from "../pages/StreaksPage.jsx";
import LogsPage from "../pages/LogsPage.jsx";
import LoginPage from "../pages/LoginPage.jsx";

function AuthedApp() {
  const { user, loading } = useAuth();
  const [route, setRoute] = useState(() => location.hash.replace(/^#/, "") || "/");

  useEffect(() => {
    const onHash = () => setRoute(location.hash.replace(/^#/, "") || "/");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (loading) {
    return (
      <div className="login-page">
        <div className="login-card muted-card">Checking session…</div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  const path = route.split("?")[0];
  if (path.startsWith("/streaks")) return <StreaksPage />;
  if (path.startsWith("/logs")) return <LogsPage />;
  return <ControlPage />;
}

export default function Router() {
  return (
    <AuthProvider>
      <AuthedApp />
    </AuthProvider>
  );
}
