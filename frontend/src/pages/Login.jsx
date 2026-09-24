// frontend/src/pages/Login.jsx
import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Mail, Eye, EyeOff, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth, ROLE_ROUTES } from "../context/AuthContext.jsx";
import "./Login.css";

export default function Login() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [otpRequired, setOtpRequired] = useState(false);
  const [tempToken, setTempToken] = useState(null);

  // ✅ Local submit lock (belt & braces on top of AuthContext lock)
  const [submitting, setSubmitting] = useState(false);
  const lastSubmittedOtpRef = useRef("");

  const goToDashboard = (userData) => {
    const destination = ROLE_ROUTES[userData.role] || "/";
    navigate(destination);
  };

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
          setOtpRequired(true);
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

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    if (submitting || loading) return;

    const trimmed = (otp || "").trim();
    if (!trimmed) {
      toast.error("Please enter the 2FA code.");
      return;
    }

    // ✅ Prevent the same OTP from being submitted twice in a row
    if (lastSubmittedOtpRef.current === trimmed) return;
    lastSubmittedOtpRef.current = trimmed;

    setSubmitting(true);
    try {
      const result = await login(email, password, { otp: trimmed, temp_token: tempToken });
      if (result.success) {
        toast.success(`Welcome, ${result.user.name}!`);
        goToDashboard(result.user);
      } else {
        // Allow retry if the code was wrong
        lastSubmittedOtpRef.current = "";
        toast.error(result.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

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
          {!otpRequired ? (
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
                    disabled={submitting || loading}
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
                    disabled={submitting || loading}
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
              <button
                type="submit"
                disabled={submitting || loading}
                className="btn btn-primary btn-block"
              >
                {submitting || loading ? "Signing in..." : "Sign In"}
              </button>
            </form>
          ) : (
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
                    disabled={submitting || loading}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={submitting || loading}
                className="btn btn-primary btn-block"
              >
                {submitting || loading ? "Verifying..." : "Verify OTP"}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-block"
                style={{ marginTop: 10 }}
                onClick={() => {
                  setOtpRequired(false);
                  setOtp("");
                  setTempToken(null);
                  lastSubmittedOtpRef.current = "";
                }}
                disabled={submitting || loading}
              >
                Back to Login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}