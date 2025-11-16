import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { InputOTP } from "@/components/ui/input-otp";
import * as api from "@/lib/api";

export default function VerifyOTP() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get("sessionId") || undefined;
  const devEmailOTP = searchParams.get("devEmailOTP") || undefined;

  const [otp, setOtp] = useState("");
  const [mode, setMode] = useState<"email" | "mobile">("email");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const disableAuth = import.meta.env.VITE_DISABLE_AUTH === 'true';

  useEffect(() => {
    if (!sessionId) {
      setMessage("No session found. Please register first.");
    }
  }, [sessionId]);

  useEffect(() => {
    if (devEmailOTP && mode === "email") {
      setMessage(`Dev Email OTP (for testing): ${devEmailOTP}`);
    }
  }, [devEmailOTP, mode]);

  useEffect(() => {
    if (disableAuth) {
      setMessage('Authentication disabled in this deployment — demo UI only.');
    }
  }, [disableAuth]);

  const handleVerify = async () => {
    if (!sessionId) return;
    setLoading(true);
    setMessage(null);
    try {
      if (disableAuth) {
        // Demo flow: do not call backend; mimic success behavior
        if (mode === 'email') {
          setMessage('Email verified (demo). Now verify your phone.');
          setMode('mobile');
          setOtp('');
        } else {
          setMessage('Phone verified (demo). Returning to home.');
          localStorage.setItem('auth_token', 'demo-token');
          navigate('/');
        }
      } else {
        if (mode === "email") {
          const res = await api.verifyEmailOTP(sessionId, otp);
          if (res && res.success) {
            setMessage("Email verified. Now verify your phone.");
            setMode("mobile");
            setOtp("");
          } else {
            setMessage(res.message || "Verification failed");
          }
        } else {
          const res = await api.verifyMobileOTP(sessionId, otp);
          if (res && res.success) {
            if (res.token) {
              localStorage.setItem("auth_token", res.token);
              navigate('/');
            } else {
              setMessage("Registration completed. Please login.");
              navigate('/login');
            }
          } else {
            setMessage(res.message || "Mobile verification failed");
          }
        }
      }
    } catch (err: any) {
      setMessage(err?.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!sessionId) return;
    setLoading(true);
    setMessage(null);
    try {
      if (disableAuth) {
        setMessage('OTP resend simulated. Dev OTP: 123456');
      } else {
        const res = await api.resendOTP(sessionId, mode === "email" ? "email" : "mobile");
        if (res && res.success) {
          setMessage(res.devOTP ? `Dev OTP: ${res.devOTP}` : res.message || "OTP resent");
        } else {
          setMessage(res.message || "Failed to resend OTP");
        }
      }
    } catch (err: any) {
      setMessage(err?.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 glass-card p-8 border-white/20">
        <h2 className="text-2xl font-bold text-center">Verify {mode === 'email' ? 'Email' : 'Phone'}</h2>
        <p className="text-sm text-muted-foreground text-center">Enter the 6-digit code sent to your {mode === 'email' ? 'email' : 'phone'}.</p>

        <div className="flex justify-center">
          <InputOTP length={6} value={otp} onChange={(val: string) => setOtp(val)} disabled={disableAuth} />
        </div>

        {message && <div className="text-center text-sm text-foreground">{message}</div>}

        <div className="flex gap-2">
          <Button onClick={handleVerify} disabled={loading || otp.length < 6 || disableAuth} className="flex-1">{mode === 'email' ? 'Verify Email' : 'Verify Phone'}</Button>
          <Button variant="ghost" onClick={() => { setMode(mode === 'email' ? 'mobile' : 'email'); setMessage(null); }} disabled={disableAuth}>Switch</Button>
        </div>

        <div className="flex justify-between">
          <button className="text-sm text-muted-foreground" onClick={handleResend} disabled={loading || disableAuth}>Resend OTP</button>
          <button className="text-sm text-muted-foreground" onClick={() => navigate('/login')}>Back to Login</button>
        </div>
      </div>
    </div>
  );
}
