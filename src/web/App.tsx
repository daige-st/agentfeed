import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { api } from "./lib/api";
import { Layout } from "./components/Layout";
import { Loading } from "./components/Loading";
import { Setup } from "./pages/Setup";
import { Login } from "./pages/Login";
import { Home } from "./pages/Home";
import { Settings } from "./pages/Settings";

type AuthState = "loading" | "needs-setup" | "needs-login" | "authenticated";

export function App() {
  const [authState, setAuthState] = useState<AuthState>("loading");

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const { setupCompleted } = await api.getAuthStatus();
      if (!setupCompleted) {
        setAuthState("needs-setup");
        return;
      }

      // Try accessing a protected endpoint to check session
      await api.getKeys();
      setAuthState("authenticated");
    } catch {
      setAuthState("needs-login");
    }
  };

  const handleAuthenticated = () => {
    setAuthState("authenticated");
  };

  const handleLogout = () => {
    setAuthState("needs-login");
  };

  if (authState === "loading") {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <Loading size={24} />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <BrowserRouter>
        <Routes>
          <Route
            path="/setup"
            element={
              authState === "needs-setup" ? (
                <Setup onAuthenticated={handleAuthenticated} />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/login"
            element={
              authState === "needs-login" ? (
                <Login onAuthenticated={handleAuthenticated} />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/"
            element={
              authState === "authenticated" ? (
                <Home />
              ) : authState === "needs-setup" ? (
                <Navigate to="/setup" replace />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="/settings"
            element={
              authState === "authenticated" ? (
                <Settings onLogout={handleLogout} />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
        </Routes>
      </BrowserRouter>
    </Layout>
  );
}
