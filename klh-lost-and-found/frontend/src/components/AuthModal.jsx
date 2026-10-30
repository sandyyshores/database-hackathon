import React, { useEffect, useState } from "react";
import { X, UserCheck, Shield } from "lucide-react";
import { api, setExplicitlySignedOut, setStoredToken } from "../api";
import { KlhCrest } from "../uiHelpers";

export default function AuthModal({
  open,
  demoAccounts = [],
  onClose,
  onAuthenticated
}) {
  const [mode, setMode] = useState("login");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("CSE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleQuickDemo = async (acct) => {
    setBusy(true);
    setError("");
    try {
      const pw = acct.role === "staff" ? "klhstaff" : "klhstudent";
      const res = await api.login(acct.roll_number, pw);
      setExplicitlySignedOut(false);
      setStoredToken(res.access_token);
      await onAuthenticated(res.user);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res =
        mode === "login"
          ? await api.login(identifier, password)
          : await api.register({
              roll_number: rollNumber,
              full_name: fullName,
              email,
              department,
              phone: "",
              password
            });
      setExplicitlySignedOut(false);
      setStoredToken(res.access_token);
      await onAuthenticated(res.user);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-campus-ink/40 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-sm rounded-3xl border border-campus-border shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-campus-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <KlhCrest className="w-7 h-7" />
            <h3 className="text-base font-semibold text-campus-ink">Switch Account</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-campus-muted hover:text-campus-ink hover:bg-campus-sand"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {demoAccounts.length > 0 && (
            <div className="space-y-1.5">
              {demoAccounts.map((acct) => (
                <button
                  key={acct.id}
                  type="button"
                  disabled={busy}
                  onClick={() => handleQuickDemo(acct)}
                  className="w-full px-3 py-2 rounded-xl border border-campus-border hover:border-campus-crimson/50 hover:bg-campus-crimsonSoft/40 transition flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        acct.role === "staff"
                          ? "bg-campus-crimson text-white"
                          : "bg-campus-sand text-campus-ink"
                      }`}
                    >
                      {acct.role === "staff" ? (
                        <Shield className="w-3.5 h-3.5" />
                      ) : (
                        <UserCheck className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-campus-ink truncate">
                        {acct.full_name}
                      </div>
                      <div className="text-[11px] text-campus-muted truncate">
                        {acct.roll_number} · {acct.role === "staff" ? "Helpdesk" : acct.department}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="relative flex items-center">
            <div className="flex-grow border-t border-campus-border" />
            <span className="shrink mx-2.5 text-[11px] text-campus-muted">or</span>
            <div className="flex-grow border-t border-campus-border" />
          </div>

          <div className="inline-flex rounded-xl p-1 bg-campus-sand w-full">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
              }}
              className={`flex-1 py-1 rounded-lg text-xs font-semibold transition ${
                mode === "login" ? "bg-white text-campus-ink shadow-sm" : "text-campus-muted"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError("");
              }}
              className={`flex-1 py-1 rounded-lg text-xs font-semibold transition ${
                mode === "register" ? "bg-white text-campus-ink shadow-sm" : "text-campus-muted"
              }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-2.5">
            {mode === "login" ? (
              <>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Roll Number"
                  className="w-full rounded-xl border border-campus-border px-3 py-2 text-sm focus:outline-none focus:border-campus-crimson"
                />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full rounded-xl border border-campus-border px-3 py-2 text-sm focus:outline-none focus:border-campus-crimson"
                />
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={rollNumber}
                    onChange={(e) => setRollNumber(e.target.value)}
                    placeholder="Roll No"
                    className="w-full rounded-xl border border-campus-border px-3 py-2 text-sm focus:outline-none focus:border-campus-crimson"
                  />
                  <input
                    type="text"
                    required
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="Branch"
                    className="w-full rounded-xl border border-campus-border px-3 py-2 text-sm focus:outline-none focus:border-campus-crimson"
                  />
                </div>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Full Name"
                  className="w-full rounded-xl border border-campus-border px-3 py-2 text-sm focus:outline-none focus:border-campus-crimson"
                />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  className="w-full rounded-xl border border-campus-border px-3 py-2 text-sm focus:outline-none focus:border-campus-crimson"
                />
                <input
                  type="password"
                  required
                  minLength={4}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full rounded-xl border border-campus-border px-3 py-2 text-sm focus:outline-none focus:border-campus-crimson"
                />
              </>
            )}

            {error && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-xl bg-campus-crimson hover:bg-campus-crimsonDark text-white text-sm font-semibold transition disabled:opacity-60"
            >
              {busy ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
