import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext.jsx';
import { Navigate } from 'react-router-dom';

function FloatingParticles() {
  const dots = Array.from({ length: 18 });
  const w = typeof window === 'undefined' ? 800 : window.innerWidth;
  const h = typeof window === 'undefined' ? 600 : window.innerHeight;
  return (
    <div className="absolute inset-0 overflow-hidden">
      {dots.map((_, i) => (
        <motion.div
          key={i}
          className="absolute h-2 w-2 rounded-full bg-accent/35 blur-[0.5px]"
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

export default function Login() {
  const { session, signInWithGoogle } = useAuth();

  useEffect(() => {
    document.title = 'OxyTrace · Login';
  }, []);

  if (session) return <Navigate to="/dashboard" replace />;

  return (
    <div className="relative grid h-full place-items-center bg-bg">
      <div className="mesh-bg" />
      <FloatingParticles />
      <div className="relative z-10 w-full max-w-md px-4">
        <div className="glass-card rounded-3xl p-6 shadow-xl">
          <div className="flex items-center justify-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 ring-1 ring-accent/25">
              <span className="text-xl font-semibold text-accent">O₂</span>
            </div>
          </div>
          <div className="mt-4 text-center">
            <div className="text-2xl font-semibold text-text">OxyTrace</div>
            <div className="mt-1 text-sm text-muted">Real-time oxygen monitoring for critical care</div>
          </div>
          <button
            onClick={signInWithGoogle}
            className="mt-6 w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent2"
          >
            Sign in with Google
          </button>
          <div className="mt-4 text-center text-xs text-muted">use mail id to login</div>
        </div>
      </div>
    </div>
  );
}
