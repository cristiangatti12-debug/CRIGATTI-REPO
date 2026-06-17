"use client";

// Prevent static generation — this page always reads auth state at request time
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { getBaseUrl } from "@/lib/getBaseUrl";
import VelaLogo from "@/components/ui/VelaLogo";

type Mode = "login" | "signup";

function friendlyError(msg: string): string {
  if (msg.includes("User already registered") || msg.includes("already been registered"))
    return "An account with this email already exists. Try logging in instead.";
  if (msg.includes("Password should be at least") || msg.includes("password"))
    return "Your password is too short or doesn't meet requirements. Use at least 8 characters.";
  if (msg.includes("Invalid email") || msg.includes("invalid email"))
    return "Please enter a valid email address.";
  if (msg.includes("Email not confirmed") || msg.includes("email not confirmed"))
    return "Please confirm your email first — check your inbox.";
  if (msg.includes("Invalid login credentials"))
    return "Incorrect email or password. Please try again.";
  if (msg.includes("Email rate limit exceeded"))
    return "Too many attempts. Please wait a few minutes and try again.";
  return "Something went wrong. Please try again.";
}

/** Returns weak / fair / strong and a colour based on length + special chars */
function passwordStrength(p: string): { label: string; color: string; width: string } {
  if (p.length === 0) return { label: "", color: "", width: "0%" };
  const hasSpecial = /[^A-Za-z0-9]/.test(p);
  const hasDigit   = /\d/.test(p);
  if (p.length >= 12 && hasSpecial && hasDigit) return { label: "Strong",  color: "#22C55E", width: "100%" };
  if (p.length >= 8  && (hasSpecial || hasDigit)) return { label: "Fair",    color: "#EAB308", width: "60%" };
  return { label: "Weak", color: "#EF4444", width: "30%" };
}

export default function LoginPage() {
  const [mode,        setMode]        = useState<Mode>("login");
  const [email,       setEmail]       = useState("");
  const [pass,        setPass]        = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [name,        setName]        = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [info,        setInfo]        = useState<string | null>(null);

  const strength = mode === "signup" ? passwordStrength(pass) : null;

  // Read ?error= from URL on mount (set by auth callback on failure)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlError = params.get("error");
    if (urlError) setError(decodeURIComponent(urlError));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (mode === "signup") {
      if (pass.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (pass !== confirmPass) {
        setError("Passwords do not match.");
        return;
      }
    }

    setLoading(true);
    const supabase = createClient();   // lazy — only runs in browser on form submit

    try {
      if (mode === "signup") {
        const { error: signUpErr } = await supabase.auth.signUp({
          email,
          password: pass,
          options: {
            data: { display_name: name || email.split("@")[0] },
            emailRedirectTo: `${getBaseUrl()}/auth/callback`,
          },
        });
        if (signUpErr) throw signUpErr;
        setInfo("Check your email to confirm your account, then come back to log in.");
      } else {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password: pass,
        });
        if (signInErr) throw signInErr;
        // Middleware will redirect to / after cookie is set
        window.location.href = "/";
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? friendlyError(err.message) : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setError(null);
    setInfo(null);
    setLoading(true);
    const supabase = createClient();
    try {
      const { error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${getBaseUrl()}/auth/callback` },
      });
      if (oauthErr) throw oauthErr;
      // signInWithOAuth redirects away — no manual navigation needed
    } catch (err: unknown) {
      setError(err instanceof Error ? friendlyError(err.message) : "Google sign-in failed. Please try again.");
      setLoading(false);
    }
  }

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setInfo(null);
    setPass("");
    setConfirmPass("");
  }

  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2.5 mb-2">
          <VelaLogo size={44} />
          <span className="text-white font-bold text-2xl tracking-tight">Vela.ai</span>
        </div>
        <p className="text-[#8892a4] text-sm">Your AI investment assistant</p>
      </div>

      {/* Card */}
      <div className="bg-[#141b2d] border border-[#1e2d45] rounded-2xl p-6">
        {/* Tab toggle */}
        <div className="flex bg-[#0a0f1e] rounded-xl p-1 mb-6">
          {(["login", "signup"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === m
                  ? "bg-[#00d4ff] text-[#0a0f1e]"
                  : "text-[#8892a4] hover:text-white"
              }`}
            >
              {m === "login" ? "Log in" : "Sign up"}
            </button>
          ))}
        </div>

        {/* Google OAuth */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full bg-white text-[#0a0f1e] font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 text-sm flex items-center justify-center gap-2 mb-4"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.71H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
          </svg>
          Continue with Google
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-[#1e2d45]" />
          <span className="text-xs text-[#4a5568]">or</span>
          <div className="flex-1 h-px bg-[#1e2d45]" />
        </div>

        <form onSubmit={handleSubmit} method="post" action="#" data-form-type="other" className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className="block text-[#8892a4] text-xs mb-1.5 uppercase tracking-wide">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full bg-[#0a0f1e] border border-[#1e2d45] rounded-xl px-4 py-3 text-white placeholder-[#4a5568] focus:outline-none focus:border-[#00d4ff] transition-colors text-sm"
              />
            </div>
          )}

          <div>
            <label className="block text-[#8892a4] text-xs mb-1.5 uppercase tracking-wide">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full bg-[#0a0f1e] border border-[#1e2d45] rounded-xl px-4 py-3 text-white placeholder-[#4a5568] focus:outline-none focus:border-[#00d4ff] transition-colors text-sm"
            />
          </div>

          <div>
            <label className="block text-[#8892a4] text-xs mb-1.5 uppercase tracking-wide">
              Password
            </label>
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
              placeholder="••••••••"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full bg-[#0a0f1e] border border-[#1e2d45] rounded-xl px-4 py-3 text-white placeholder-[#4a5568] focus:outline-none focus:border-[#00d4ff] transition-colors text-sm"
            />

            {/* Password hint — static, no animation, no transition */}
            {mode === "signup" && (
              <p className="text-xs mt-1.5 text-[#4a5568]">Use 8+ characters with a number or symbol</p>
            )}
          </div>

          {/* Confirm password — signup only */}
          {mode === "signup" && (
            <div>
              <label className="block text-[#8892a4] text-xs mb-1.5 uppercase tracking-wide">
                Confirm password
              </label>
              <input
                type="password"
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
                placeholder="••••••••"
                required
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                className={`w-full bg-[#0a0f1e] border rounded-xl px-4 py-3 text-white placeholder-[#4a5568] focus:outline-none transition-colors text-sm ${
                  confirmPass.length > 0 && confirmPass !== pass
                    ? "border-red-500/60 focus:border-red-500"
                    : "border-[#1e2d45] focus:border-[#00d4ff]"
                }`}
              />
              {confirmPass.length > 0 && confirmPass !== pass && (
                <p className="text-xs mt-1 text-red-400">Passwords do not match</p>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}
          {info && (
            <div className="bg-[#00d4ff]/10 border border-[#00d4ff]/30 rounded-xl px-4 py-3 text-[#00d4ff] text-sm">
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-[#00d4ff] to-[#7b61ff] text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 text-sm"
          >
            {loading
              ? mode === "login" ? "Logging in…" : "Creating account…"
              : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        {mode === "login" && (
          <p className="text-center text-[#4a5568] text-xs mt-4">
            Don&apos;t have an account?{" "}
            <button
              onClick={() => switchMode("signup")}
              className="text-[#00d4ff] hover:underline"
            >
              Sign up free
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
