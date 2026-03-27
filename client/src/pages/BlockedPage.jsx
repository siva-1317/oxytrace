import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function BlockedPage() {
  const { signOut } = useAuth();

  useEffect(() => {
    document.title = 'OxyTrace · Account Blocked';
  }, []);

  return (
    <div className="relative grid h-screen place-items-center bg-bg">
      <div className="absolute inset-0 bg-danger/5 backdrop-blur-3xl" />
      <div className="relative z-10 w-full max-w-lg px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="glass-card rounded-3xl p-8 shadow-2xl text-center border-danger/30"
        >
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-danger/10 text-danger mb-6 ring-4 ring-danger/20">
            <ShieldAlert size={40} />
          </div>
          <h1 className="text-3xl font-bold text-text mb-2">Account Suspended</h1>
          <p className="text-muted text-lg mb-8">
            Your access to OxyTrace has been blocked by the system administrator. 
            You can no longer access the application or APIs.
          </p>
          <button
            onClick={() => {
              signOut();
              window.location.href = '/login';
            }}
            className="rounded-xl bg-danger px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-danger/30 transition hover:bg-red-600"
          >
            Sign out
          </button>
        </motion.div>
      </div>
    </div>
  );
}
