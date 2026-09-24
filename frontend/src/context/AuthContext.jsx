// frontend/src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import api from "../api/axios.js";

const AuthContext = createContext(null);

export const ROLE_ROUTES = {
  SuperAdmin: "/dashboard/admin",
  admin: "/dashboard/admin",
  IT: "/dashboard/it",
  "IT Sales": "/dashboard/itsales",
  PCM: "/dashboard/pcm",
  MedTech: "/dashboard/medtech",
  Caredx: "/dashboard/caredx",
  Corporate: "/dashboard/corporate",
  Adminstrationfunctionalunit: "/dashboard/adminfunctionalunit",
  ResearchDevelopment: "/dashboard/researchdevelopment",
  SalesEnterprise: "/dashboard/salesenterprise",
  Dental: "/dashboard/dental",
  Everglades: "/dashboard/everglades",
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(false);

  // ✅ Prevent double-submits (mobile double-tap, React StrictMode, etc.)
  const inFlightRef = useRef(null);

  const login = useCallback(async (email, password, otpData = null) => {
    // If a login/verify is already running, ignore the new request
    if (inFlightRef.current) {
      return { success: false, message: "Please wait..." };
    }

    setLoading(true);
    const promise = (async () => {
      try {
        let res;
        if (otpData) {
          res = await api.post("/auth/verify-otp", otpData);
        } else {
          res = await api.post("/auth/login", { email, password });
        }

        if (res.data.requires_2fa) {
          return { success: true, requires_2fa: true, temp_token: res.data.temp_token };
        }

        const { access_token, user: userData } = res.data;
        if (!access_token || !userData) {
          return { success: false, message: "Login response was malformed." };
        }

        localStorage.setItem("token", access_token);
        localStorage.setItem("user", JSON.stringify(userData));
        setUser(userData);

        return { success: true, user: userData };
      } catch (err) {
        const message =
          err.response?.data?.message || "Unable to log in. Please try again.";
        return { success: false, message };
      } finally {
        setLoading(false);
        inFlightRef.current = null;
      }
    })();

    inFlightRef.current = promise;
    return promise;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}