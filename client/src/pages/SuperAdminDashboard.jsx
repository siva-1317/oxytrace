import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, User, ShieldCheck, Ban, RefreshCw, LogOut, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiJson } from '../lib/api';
import toast from 'react-hot-toast';

export default function SuperAdminDashboard() {
  const { accessToken, signOut, user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isVerifying, setIsVerifying] = useState(true);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await apiJson('/api/users', { token: accessToken });
      setUsers(data);
    } catch (err) {
      toast.error('Failed to load users: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    async function verify() {
      try {
        await apiJson('/api/users/superadmin-verify', { token: accessToken });
        setIsVerifying(false);
        fetchUsers();
      } catch (err) {
        toast.error('Verification failed: ' + err.message);
        setIsVerifying(false); // Stop the spinner even on error
      }
    }
    if (accessToken) verify();
  }, [accessToken]);

  const toggleBlock = async (targetUser) => {
    const action = targetUser.is_banned ? 'unblock' : 'block';
    try {
      await apiJson(`/api/users/${targetUser.id}/${action}`, { 
        method: 'PATCH', 
        token: accessToken 
      });
      toast.success(`User ${action}ed successfully`);
      fetchUsers();
    } catch (err) {
      toast.error(`Failed to ${action} user: ` + err.message);
    }
  };

  const filteredUsers = users.filter(u => 
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.id?.toLowerCase().includes(search.toLowerCase())
  );

  if (isVerifying) {
    return (
      <div className="grid h-screen place-items-center bg-bg">
        <div className="text-center">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-danger mb-4" />
          <p className="text-muted">Authenticating Admin Access...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg p-4 sm:p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/10 text-danger ring-1 ring-danger/25">
              <ShieldAlert size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text">Super Admin Console</h1>
              <p className="text-xs text-muted">Signed in as {user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchUsers}
              className="flex items-center gap-2 rounded-xl bg-surface/50 px-4 py-2 text-sm font-medium text-text border border-border/50 hover:bg-surface"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              onClick={() => { signOut(); window.location.href = '/login'; }}
              className="flex items-center gap-2 rounded-xl bg-danger/10 px-4 py-2 text-sm font-medium text-danger border border-danger/20 hover:bg-danger/20"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={18} />
          <input
            type="text"
            placeholder="Search by email or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-2xl border border-border/50 bg-surface/50 py-3 pl-12 pr-4 text-sm text-text focus:border-danger/50 focus:outline-none focus:ring-1 focus:ring-danger/50"
          />
        </div>

        {/* Users Table */}
        <div className="overflow-hidden rounded-3xl border border-border/40 bg-surface/50 shadow-xl backdrop-blur">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border/40 bg-surface/80">
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted">User</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted">Joined</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted">Last Activity</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted">Status</th>
                  <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-muted">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {loading && !users.length ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-muted">
                      <RefreshCw className="mx-auto h-6 w-6 animate-spin mb-2" />
                      Loading user database...
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-muted text-sm">
                      No users found matching your search.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map(u => (
                    <tr key={u.id} className="group transition hover:bg-white/5">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${u.is_banned ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'}`}>
                            <User size={20} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-text">{u.email}</span>
                            <span className="text-[10px] text-muted font-mono">{u.id}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-text/80">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-xs text-text/80">
                        {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : 'Never'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${u.is_banned ? 'bg-danger/20 text-danger' : 'bg-success/20 text-success'}`}>
                          {u.is_banned ? 'Blocked' : 'Active'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => toggleBlock(u)}
                          disabled={u.email === user?.email}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${u.is_banned ? 'border-success/50 bg-success/10 text-success hover:bg-success/20' : 'border-danger/50 bg-danger/10 text-danger hover:bg-danger/20'} disabled:opacity-50`}
                        >
                          {u.is_banned ? <ShieldCheck size={14} /> : <Ban size={14} />}
                          {u.is_banned ? 'Unblock' : 'Block User'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
