// frontend/src/pages/Login.jsx
import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Mail, Eye, EyeOff, ShieldCheck, KeyRound, ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth, ROLE_ROUTES } from "../context/AuthContext.jsx";
import api from "../api/axios.js";
import "./Login.css";

export default function Login() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();

  // One of: "login" | "2fa" | "forgot-email" | "forgot-otp" | "forgot-reset"
  const [view, setView] = useState("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [tempToken, setTempToken] = useState(null);

  // ── Forgot-password state ─────────────────────────────────────
  const [resetEmail, setResetEmail] = useState("");
  const [resetUserId, setResetUserId] = useState(null);
  const [resetMaskedEmail, setResetMaskedEmail] = useState("");
  const [resetToken, setResetToken] = useState(null);
  const [resetOtp, setResetOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPwd, setShowNewPwd] = useState(false);

  // ✅ Local submit lock
  const [submitting, setSubmitting] = useState(false);
  const lastSubmittedOtpRef = useRef("");

  const goToDashboard = (userData) => {
    const destination = ROLE_ROUTES[userData.role] || "/";
    navigate(destination);
  };

  // ─────────────────────────────────────────────────────────────
  // Login
  // ─────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting || loading) return;

    if (!email || !password) {
      toast.error("Please enter both email and password.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await login(email, password);
      if (result.success) {
        if (result.requires_2fa) {
          setTempToken(result.temp_token);
          setView("2fa");
          setOtp("");
          lastSubmittedOtpRef.current = "";
          toast.success("2FA required. Please check your email for the code.");
          return;
        }
        toast.success(`Welcome, ${result.user.name}!`);
        goToDashboard(result.user);
      } else {
        toast.error(result.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Login 2FA
  // ─────────────────────────────────────────────────────────────
  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    if (submitting || loading) return;

    const trimmed = (otp || "").trim();
    if (!trimmed) return toast.error("Please enter the 2FA code.");
    if (lastSubmittedOtpRef.current === trimmed) return;
    lastSubmittedOtpRef.current = trimmed;

    setSubmitting(true);
    try {
      const result = await login(email, password, { otp: trimmed, temp_token: tempToken });
      if (result.success) {
        toast.success(`Welcome, ${result.user.name}!`);
        goToDashboard(result.user);
      } else {
        lastSubmittedOtpRef.current = "";
        toast.error(result.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Forgot Password — step 1: send OTP
  // ─────────────────────────────────────────────────────────────
  const handleForgotEmail = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const trimmed = resetEmail.trim().toLowerCase();
    if (!trimmed) return toast.error("Please enter your email.");

    setSubmitting(true);
    try {
      const res = await api.post("/auth/forgot-password", { email: trimmed });
      const data = res.data || {};

      if (!data.user_id) {
        // Backend intentionally hides account existence.
        toast.success(data.message || "If that email is registered, a code has been sent.");
        setView("login");
        return;
      }

      setResetUserId(data.user_id);
      setResetMaskedEmail(data.email_masked || trimmed);
      setResetOtp("");
      setView("forgot-otp");
      toast.success(`Reset code sent to ${data.email_masked || trimmed}.`);
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to send reset code.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Forgot Password — step 2: verify OTP
  // ─────────────────────────────────────────────────────────────
  const handleForgotVerifyOtp = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const trimmed = (resetOtp || "").trim();
    if (!trimmed) return toast.error("Please enter the reset code.");

    setSubmitting(true);
    try {
      const res = await api.post("/auth/forgot-verify-otp", {
        user_id: resetUserId,
        otp: trimmed,
      });
      const data = res.data || {};
      if (!data.reset_token) throw new Error("No reset token returned.");

      setResetToken(data.reset_token);
      setNewPassword("");
      setConfirmPassword("");
      setView("forgot-reset");
      toast.success("Code verified. Choose a new password.");
    } catch (err) {
      const msg = err.response?.data?.message || "Invalid or expired code.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Forgot Password — step 3: set new password
  // ─────────────────────────────────────────────────────────────
  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (submitting) return;

    if (!newPassword) return toast.error("Please enter a new password.");
    if (newPassword.length < 6) return toast.error("Password must be at least 6 characters.");
    if (newPassword !== confirmPassword) return toast.error("Passwords do not match.");

    setSubmitting(true);
    try {
      const res = await api.post("/auth/reset-password", {
        reset_token: resetToken,
        otp: resetOtp.trim(),
        new_password: newPassword,
      });
      toast.success(res.data?.message || "Password reset successfully.");

      // Reset the flow state and go back to login
      setResetEmail("");
      setResetUserId(null);
      setResetMaskedEmail("");
      setResetToken(null);
      setResetOtp("");
      setNewPassword("");
      setConfirmPassword("");
      setPassword("");
      setView("login");
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to reset password.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const goBackToLogin = () => {
    setView("login");
    setResetEmail("");
    setResetUserId(null);
    setResetMaskedEmail("");
    setResetToken(null);
    setResetOtp("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const busy = submitting || loading;

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="login-page">
      <div className="login-wrap">
        <div className="login-logo-wrap">
          {!logoFailed ? (
            <img
              src="/primaria.png"
              alt="Company Logo"
              className="login-logo"
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <div className="login-logo-fallback"><Lock color="#fff" size={24} /></div>
          )}
        </div>
        <div className="login-brand"><h1>CEO Governance Dashboard</h1></div>

        <div className="login-card">
          {/* ══════════════════════════════════════════════════ */}
          {/* Sign in                                            */}
          {/* ══════════════════════════════════════════════════ */}
          {view === "login" && (
            <form onSubmit={handleSubmit} className="login-form">
              <div className="form-group">
                <label className="form-label">Email</label>
                <div className="input-icon-wrap">
                  <span className="input-icon"><Mail size={16} /></span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@primaria.com"
                    className="form-control"
                    autoComplete="username"
                    disabled={busy}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <div className="input-icon-wrap">
                  <span className="input-icon"><Lock size={16} /></span>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter the Password"
                    className="form-control"
                    style={{ paddingRight: 36 }}
                    autoComplete="current-password"
                    disabled={busy}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="input-icon-toggle"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div style={{ textAlign: "right", marginTop: -4, marginBottom: 4 }}>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => { setResetEmail(email); setView("forgot-email"); }}
                  disabled={busy}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "#2563eb", fontSize: 13, padding: 0,
                  }}
                >
                  Forgot password?
                </button>
              </div>

              <button type="submit" disabled={busy} className="btn btn-primary btn-block">
                {busy ? "Signing in..." : "Sign In"}
              </button>
            </form>
          )}

          {/* ══════════════════════════════════════════════════ */}
          {/* Login 2FA                                          */}
          {/* ══════════════════════════════════════════════════ */}
          {view === "2fa" && (
            <form onSubmit={handleOtpSubmit} className="login-form">
              <div className="otp-header" style={{ textAlign: "center", marginBottom: 16 }}>
                <ShieldCheck size={32} color="#2f5dd4" style={{ marginBottom: 8 }} />
                <h3>Two-Factor Authentication</h3>
                <p className="text-muted" style={{ fontSize: 14 }}>
                  Enter the 6-digit code sent to your email.
                </p>
              </div>
              <div className="form-group">
                <label className="form-label">Verification Code</label>
                <div className="input-icon-wrap">
                  <span className="input-icon"><ShieldCheck size={16} /></span>
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="Enter OTP"
                    className="form-control"
                    maxLength={6}
                    autoFocus
                    disabled={busy}
                  />
                </div>
              </div>
              <button type="submit" disabled={busy} className="btn btn-primary btn-block">
                {busy ? "Verifying..." : "Verify OTP"}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-block"
                style={{ marginTop: 10 }}
                onClick={() => {
                  setView("login");
                  setOtp("");
                  setTempToken(null);
                  lastSubmittedOtpRef.current = "";
                }}
                disabled={busy}
              >
                Back to Login
              </button>
            </form>
          )}

          {/* ══════════════════════════════════════════════════ */}
          {/* Forgot Password — step 1: email                    */}
          {/* ══════════════════════════════════════════════════ */}
          {view === "forgot-email" && (
            <form onSubmit={handleForgotEmail} className="login-form">
              <div className="otp-header" style={{ textAlign: "center", marginBottom: 16 }}>
                <KeyRound size={32} color="#2f5dd4" style={{ marginBottom: 8 }} />
                <h3>Forgot Password</h3>
                <p className="text-muted" style={{ fontSize: 14 }}>
                  Enter the email associated with your account and we'll send you a reset code.
                </p>
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <div className="input-icon-wrap">
                  <span className="input-icon"><Mail size={16} /></span>
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="you@primaria.com"
                    className="form-control"
                    autoFocus
                    disabled={busy}
                  />
                </div>
              </div>
              <button type="submit" disabled={busy} className="btn btn-primary btn-block">
                {busy ? "Sending..." : "Send Reset Code"}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-block"
                style={{ marginTop: 10, display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 6 }}
                onClick={goBackToLogin}
                disabled={busy}
              >
                <ArrowLeft size={14} /> Back to Sign In
              </button>
            </form>
          )}

          {/* ══════════════════════════════════════════════════ */}
          {/* Forgot Password — step 2: verify OTP               */}
          {/* ══════════════════════════════════════════════════ */}
          {view === "forgot-otp" && (
            <form onSubmit={handleForgotVerifyOtp} className="login-form">
              <div className="otp-header" style={{ textAlign: "center", marginBottom: 16 }}>
                <ShieldCheck size={32} color="#2f5dd4" style={{ marginBottom: 8 }} />
                <h3>Enter Reset Code</h3>
                <p className="text-muted" style={{ fontSize: 14 }}>
                  We sent a 6-digit code to <strong>{resetMaskedEmail}</strong>.
                </p>
              </div>
              <div className="form-group">
                <label className="form-label">Reset Code</label>
                <div className="input-icon-wrap">
                  <span className="input-icon"><ShieldCheck size={16} /></span>
                  <input
                    type="text"
                    value={resetOtp}
                    onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="Enter code"
                    className="form-control"
                    maxLength={6}
                    autoFocus
                    disabled={busy}
                  />
                </div>
              </div>
              <button type="submit" disabled={busy} className="btn btn-primary btn-block">
                {busy ? "Verifying..." : "Verify Code"}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-block"
                style={{ marginTop: 10, display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 6 }}
                onClick={() => setView("forgot-email")}
                disabled={busy}
              >
                <ArrowLeft size={14} /> Change Email
              </button>
            </form>
          )}

          {/* ══════════════════════════════════════════════════ */}
          {/* Forgot Password — step 3: new password             */}
          {/* ══════════════════════════════════════════════════ */}
          {view === "forgot-reset" && (
            <form onSubmit={handleResetPassword} className="login-form">
              <div className="otp-header" style={{ textAlign: "center", marginBottom: 16 }}>
                <Lock size={32} color="#2f5dd4" style={{ marginBottom: 8 }} />
                <h3>Choose a New Password</h3>
                <p className="text-muted" style={{ fontSize: 14 }}>
                  Set a new password for your account.
                </p>
              </div>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <div className="input-icon-wrap">
                  <span className="input-icon"><Lock size={16} /></span>
                  <input
                    type={showNewPwd ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="form-control"
                    style={{ paddingRight: 36 }}
                    autoComplete="new-password"
                    autoFocus
                    disabled={busy}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPwd((s) => !s)}
                    className="input-icon-toggle"
                    tabIndex={-1}
                  >
                    {showNewPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <div className="input-icon-wrap">
                  <span className="input-icon"><Lock size={16} /></span>
                  <input
                    type={showNewPwd ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="form-control"
                    autoComplete="new-password"
                    disabled={busy}
                  />
                </div>
              </div>
              <button type="submit" disabled={busy} className="btn btn-primary btn-block">
                {busy ? "Saving..." : "Reset Password"}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-block"
                style={{ marginTop: 10, display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 6 }}
                onClick={goBackToLogin}
                disabled={busy}
              >
                <ArrowLeft size={14} /> Back to Sign In
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}