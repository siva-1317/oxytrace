import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext.jsx';
import { ShieldAlert } from 'lucide-react';

function FloatingAdminParticles() {
  const dots = Array.from({ length: 18 });
  const w = typeof window === 'undefined' ? 800 : window.innerWidth;
  const h = typeof window === 'undefined' ? 600 : window.innerHeight;
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {dots.map((_, i) => (
        <motion.div
          key={i}
          className="absolute h-2 w-2 rounded-full bg-danger/30 blur-[0.5px]"
          initial={{
             x: Math.random() * w,
             y: Math.random() * h,
             opacity: 0.2 + Math.random() * 0.6
          }}
          animate={{ y: [null, Math.random() * h], x: [null, Math.random() * w] }}
          transition={{ duration: 10 + Math.random() * 12, repeat: Infinity, repeatType: 'mirror' }}
        />
      ))}
    </div>
  );
}

export default function SuperAdminLogin() {
  const { session, signInWithGoogle, signOut, user } = useAuth();

  useEffect(() => {
    document.title = 'OxyTrace · Super Admin Login';
  }, []);

  const handleAdminSignIn = () => {
    localStorage.setItem('admin_login_intent', 'true');
    signInWithGoogle({ redirectTo: window.location.origin + '/superAdminDashboard' });
  };

  return (
    <div className="relative grid h-screen place-items-center bg-bg">
      <div className="absolute inset-0 bg-danger/5 backdrop-blur-3xl" />
      <FloatingAdminParticles />
      <div className="relative z-10 w-full max-w-md px-4">
        <div className="glass-card rounded-3xl p-6 shadow-2xl border-danger/30">
          <div className="flex items-center justify-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/10 ring-1 ring-danger/25">
              <ShieldAlert className="text-danger" size={24} />
            </div>
          </div>
          <div className="mt-4 text-center">
            <div className="text-2xl font-bold text-text">Super Admin</div>
            <div className="mt-1 text-sm text-muted">Authorized Personnel Only</div>
          </div>
          
          {session ? (
            <div className="mt-8 space-y-4">
              <div className="rounded-xl bg-surface/80 p-4 border border-border/50">
                <p className="text-xs text-muted mb-1 uppercase font-bold tracking-wider">Current Session</p>
                <p className="text-sm font-medium text-text truncate">{user?.email}</p>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => window.location.href = '/superAdminDashboard'}
                  className="flex-1 rounded-2xl bg-danger px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-danger/25 transition hover:bg-red-600"
                >
                  Enter Dashboard
                </button>
                <button
                  onClick={() => signOut()}
                  className="rounded-2xl bg-surface px-4 py-3 text-sm font-semibold text-text border border-border/50 hover:bg-surface/80"
                >
                  Sign Out
                </button>
              </div>
              <p className="text-[10px] text-center text-muted">
                If this is not your Admin account, please Sign Out first.
              </p>
            </div>
          ) : (
            <button
              onClick={handleAdminSignIn}
              className="mt-8 w-full rounded-2xl bg-danger px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-danger/25 transition hover:bg-red-600"
            >
              Sign in with Google
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
