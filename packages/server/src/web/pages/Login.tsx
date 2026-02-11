import { useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../lib/api";
import { Loading } from "../components/Loading";
import { LogoIcon } from "../components/Icons";

export function Login({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api.login(password);
      onAuthenticated();
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm mx-auto space-y-8">
        <div className="text-center space-y-2">
          <LogoIcon className="h-7 w-auto text-text-primary mx-auto" />
          <p className="text-sm text-text-secondary">
            Enter your password to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-4 py-3 text-base border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-border-secondary focus:border-border-secondary bg-surface text-text-primary"
              autoFocus
            />
            {error && (
              <p className="text-xs text-danger mt-2">{error}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 text-base font-normal rounded-lg transition-colors bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? <Loading size={16} /> : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
