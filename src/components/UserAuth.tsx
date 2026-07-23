import React, { useState, useEffect } from 'react';
import { User, LogIn, UserPlus, LogOut, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';

export interface UserSession {
  username: string;
  fullName: string;
  role: string;
  clientId?: string;
  companyName?: string;
  creditBalance?: number;
}

interface UserAuthProps {
  currentUser: UserSession | null;
  onLogin: (user: UserSession) => void;
  onLogout: () => void;
}

export default function UserAuth({ currentUser, onLogin, onLogout }: UserAuthProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  
  // Form fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('Listing Operator');
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [usersList, setUsersList] = useState<any[]>([]);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/auth/users');
      if (res.ok) {
        const data = await res.json();
        setUsersList(data);
      }
    } catch (e) {
      console.error("Error loading registered users", e);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!username.trim() || !password.trim()) {
      setError("Please fill in all credentials.");
      return;
    }

    if (isRegister && !fullName.trim()) {
      setError("Please specify your full name.");
      return;
    }

    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
    const payload = isRegister 
      ? { username: username.trim(), password, fullName: fullName.trim(), role }
      : { username: username.trim(), password };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Authentication failed.");
        return;
      }

      if (isRegister) {
        setSuccess("Account successfully registered! You can now log in.");
        setIsRegister(false);
        setPassword('');
        fetchUsers();
      } else {
        onLogin(data.user);
        setIsOpen(false);
        // Clear inputs
        setUsername('');
        setPassword('');
      }
    } catch (err: any) {
      setError("Server connection lost. Please try again.");
    }
  };

  return (
    <div className="relative font-sans" id="user-auth-module">
      {currentUser ? (
        <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#008060] text-white flex items-center justify-center font-bold text-xs uppercase shadow-inner">
              {currentUser.fullName.charAt(0)}
            </div>
            <div className="text-left">
              <div className="text-xs font-bold text-white leading-tight truncate max-w-[120px]">
                {currentUser.fullName}
              </div>
              <div className="text-[9px] text-zinc-400 uppercase font-mono font-bold tracking-wider">
                {currentUser.role}
              </div>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-rose-400 rounded-lg transition"
            title="Sign Out"
            id="auth-logout-btn"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => { setIsOpen(true); setError(null); setSuccess(null); }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-100 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-xs"
          id="auth-login-trigger"
        >
          <LogIn className="w-4 h-4 text-[#008060]" />
          <span>Workspace Sign In</span>
        </button>
      )}

      {/* Modal Dialog overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-300 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-5 animate-slide-in relative">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 font-bold text-lg"
            >
              ×
            </button>

            <div className="space-y-1 text-center">
              <div className="p-2.5 bg-green-50 text-brand-green rounded-full w-fit mx-auto border border-green-100">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-base font-extrabold text-zinc-900 uppercase tracking-tight">
                {isRegister ? "Create Appraiser Account" : "Store Workspace Authentication"}
              </h3>
              <p className="text-xs text-zinc-500">
                {isRegister 
                  ? "Register a new profile to track your garment upload batches" 
                  : "Sign in with your Operator credentials to manage products"
                }
              </p>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{success}</span>
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-3.5">
              <div className="space-y-1 text-left">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Username</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., alex_vintage"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:outline-none focus:border-[#008060] focus:bg-white transition"
                />
              </div>

              <div className="space-y-1 text-left">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:outline-none focus:border-[#008060] focus:bg-white transition"
                />
              </div>

              {isRegister && (
                <>
                  <div className="space-y-1 text-left">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Full Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Alex Carter"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:outline-none focus:border-[#008060] focus:bg-white transition"
                    />
                  </div>

                  <div className="space-y-1 text-left">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Operational Role</label>
                    <select
                      value={role}
                      onChange={e => setRole(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:outline-none focus:border-[#008060] focus:bg-white transition font-sans"
                    >
                      <option value="Listing Operator">Listing Operator</option>
                      <option value="Vintage Cataloger">Vintage Cataloger</option>
                      <option value="Senior Appraiser">Senior Appraiser</option>
                      <option value="Store Administrator">Store Administrator</option>
                    </select>
                  </div>
                </>
              )}

              <button
                type="submit"
                className="w-full py-2.5 bg-[#008060] hover:bg-[#006e52] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer shadow-xs"
              >
                {isRegister ? "Confirm Registration" : "Enter Dashboard Workspace"}
              </button>
            </form>

            <div className="pt-3 border-t border-zinc-100 flex items-center justify-between text-xs">
              <span className="text-zinc-500">
                {isRegister ? "Already registered?" : "New to the Studio workspace?"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError(null);
                  setSuccess(null);
                }}
                className="text-[#008060] hover:underline font-bold"
              >
                {isRegister ? "Sign In Instead" : "Create Account"}
              </button>
            </div>

            {/* List existing users for ease of local evaluation */}
            {usersList.length > 0 && (
              <div className="pt-3 border-t border-zinc-100 text-[10px] text-zinc-400 text-left">
                <span className="font-bold block uppercase mb-1">Registered accounts (for evaluation):</span>
                <div className="flex flex-wrap gap-2">
                  {usersList.map((u, i) => (
                    <span 
                      key={i} 
                      onClick={() => {
                        setUsername(u.username);
                        setPassword('');
                        setIsRegister(false);
                      }}
                      className="px-2 py-1 bg-zinc-100 text-zinc-600 rounded-lg hover:bg-zinc-200 transition cursor-pointer"
                    >
                      {u.username} ({u.fullName})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
