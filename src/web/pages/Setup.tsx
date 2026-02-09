import { useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../lib/api";
import { Loading } from "../components/Loading";
import { LogoIcon } from "../components/Icons";

export function Setup({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 4) {
      setError("Password must be at least 4 characters");
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await api.setup(password);
      onAuthenticated();
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
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
            Set a password to secure your instance.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (4+ characters)"
              className="w-full px-4 py-3 border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-border-secondary focus:border-border-secondary bg-surface text-text-primary"
              autoFocus
            />
          </div>
          <div>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm password"
              className="w-full px-4 py-3 border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-border-secondary focus:border-border-secondary bg-surface text-text-primary"
            />
          </div>
          {error && (
            <p className="text-xs text-danger">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 text-base font-normal rounded-lg transition-colors bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? <Loading size={16} /> : "Get Started"}
          </button>
        </form>
      </div>
    </div>
  );
}
