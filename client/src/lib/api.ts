const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

type AuthResp = {
  success: boolean;
  token?: string;
  message?: string;
  user?: any;
  sessionId?: string;
  requiresOTP?: boolean;
  devEmailOTP?: string | number;
};

const DISABLE = import.meta.env.VITE_DISABLE_AUTH === 'true';

function delay<T>(val: T, ms = 200) {
  return new Promise<T>((resolve) => setTimeout(() => resolve(val), ms));
}

export async function login(email: string, password: string): Promise<AuthResp> {
  if (DISABLE) return delay({ success: true, token: 'demo-token', user: { email } as any });
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}

export async function register(name: string | undefined, phone: string | undefined, email: string, password: string): Promise<AuthResp> {
  if (DISABLE) {
    // return a demo response but do not create a session by default — keep it simple for UI/UX
    return delay({ success: true, message: 'Demo registration (no backend)', devEmailOTP: '123456' });
  }
  const payload: any = { email, password };
  if (name) payload.name = name;
  if (phone) payload.phone = phone;

  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function getMe(token: string): Promise<any> {
  if (DISABLE) return delay({ user: { email: 'demo@local' } });
  const res = await fetch(`${BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export async function verifyEmailOTP(sessionId: string, otp: string): Promise<any> {
  if (DISABLE) return delay({ success: true });
  const res = await fetch(`${BASE}/api/auth/verify-email-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, otp }),
  });
  return res.json();
}

export async function verifyMobileOTP(sessionId: string, otp: string): Promise<any> {
  if (DISABLE) return delay({ success: true, token: 'demo-mobile-token' });
  const res = await fetch(`${BASE}/api/auth/verify-mobile-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, otp }),
  });
  return res.json();
}

export async function resendOTP(sessionId: string, type: 'email' | 'mobile') {
  if (DISABLE) return delay({ success: true, devOTP: '123456' });
  const res = await fetch(`${BASE}/api/auth/resend-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, type }),
  });
  return res.json();
}

export default { login, register, getMe, verifyEmailOTP, verifyMobileOTP, resendOTP };
