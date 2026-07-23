import React, { useState, useEffect } from 'react';
import { 
  Users, CreditCard, Coins, RefreshCw, Plus, Edit, Trash2, 
  ShieldAlert, CheckCircle, AlertCircle, FileText, ArrowUpRight, ArrowDownLeft
} from 'lucide-react';
import { UserSession } from './UserAuth';

interface CompanyAdminProps {
  currentUser: UserSession | null;
}

interface CompanyProfile {
  id: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  licenseStatus: 'Active' | 'Inactive';
  subscriptionPeriod: string;
  creditBalance: number;
}

interface CompanyUser {
  username: string;
  fullName: string;
  role: string;
  clientId: string;
  companyName: string;
}

interface CreditTransaction {
  id: string;
  clientId: string;
  companyName: string;
  username: string;
  dateTime: string;
  action: string;
  productRef?: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  status: 'SUCCESS' | 'FAILED';
}

export default function CompanyAdmin({ currentUser }: CompanyAdminProps) {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // User form modal states
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<CompanyUser | null>(null);
  const [userForm, setUserForm] = useState({
    username: '',
    fullName: '',
    password: '',
    role: 'Listing Operator'
  });

  useEffect(() => {
    fetchCompanyData();
  }, [currentUser]);

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const fetchCompanyData = async () => {
    if (!currentUser?.clientId) return;
    setLoading(true);
    try {
      const headers = {
        'x-user-username': currentUser.username,
        'x-user-role': currentUser.role,
        'x-user-client-id': currentUser.clientId
      };

      // Fetch our client profile
      const clientRes = await fetch('/api/admin/clients', { headers });
      if (clientRes.ok) {
        const clientList: CompanyProfile[] = await clientRes.json();
        const myProfile = clientList.find(c => c.id === currentUser.clientId);
        if (myProfile) setProfile(myProfile);
      }

      // Fetch company users
      const usersRes = await fetch('/api/admin/users', { headers });
      if (usersRes.ok) {
        const usersList = await usersRes.json();
        setUsers(usersList);
      }

      // Fetch transactions
      const txRes = await fetch('/api/admin/transactions', { headers });
      if (txRes.ok) {
        const txList = await txRes.json();
        setTransactions(txList);
      }
    } catch (e) {
      console.error("Error fetching company data:", e);
      showFeedback('error', 'Failed to synchronize tenant workspace database.');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setRefreshing(true);
    await fetchCompanyData();
    setRefreshing(false);
    showFeedback('success', 'Company database synchronized live.');
  };

  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userForm.username.trim() || !userForm.fullName.trim() || (!editingUser && !userForm.password)) {
      showFeedback('error', 'Please fill in all required fields.');
      return;
    }

    try {
      const headers = {
        'Content-Type': 'application/json',
        'x-user-username': currentUser?.username || '',
        'x-user-role': currentUser?.role || '',
        'x-user-client-id': currentUser?.clientId || ''
      };

      const payload = {
        username: userForm.username.trim(),
        fullName: userForm.fullName.trim(),
        password: userForm.password,
        role: userForm.role,
        clientId: currentUser?.clientId,
        isEdit: !!editingUser,
        oldUsername: editingUser?.username
      };

      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showFeedback('success', editingUser ? 'Operator profile updated successfully.' : 'New operator registered.');
        setShowUserModal(false);
        setEditingUser(null);
        setUserForm({ username: '', fullName: '', password: '', role: 'Listing Operator' });
        fetchCompanyData();
      } else {
        const err = await res.json();
        showFeedback('error', err.error || 'Failed to submit operator profile.');
      }
    } catch (e) {
      showFeedback('error', 'Network error managing operator profile.');
    }
  };

  const handleDeleteUser = async (userToDelete: CompanyUser) => {
    if (userToDelete.username === currentUser?.username) {
      showFeedback('error', 'You cannot delete your own Sub Admin account.');
      return;
    }

    if (!window.confirm(`Are you sure you want to deactivate and delete user "${userToDelete.fullName}"?`)) {
      return;
    }

    try {
      const headers = {
        'Content-Type': 'application/json',
        'x-user-username': currentUser?.username || '',
        'x-user-role': currentUser?.role || '',
        'x-user-client-id': currentUser?.clientId || ''
      };

      const res = await fetch('/api/admin/users/delete', {
        method: 'POST',
        headers,
        body: JSON.stringify({ username: userToDelete.username })
      });

      if (res.ok) {
        showFeedback('success', 'User account successfully removed.');
        fetchCompanyData();
      } else {
        const err = await res.json();
        showFeedback('error', err.error || 'Deactivation failed.');
      }
    } catch (e) {
      showFeedback('error', 'Connection lost removing user account.');
    }
  };

  const startEditUser = (user: CompanyUser) => {
    setEditingUser(user);
    setUserForm({
      username: user.username,
      fullName: user.fullName,
      password: '', // blank to leave unchanged
      role: user.role
    });
    setShowUserModal(true);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-zinc-500 font-sans">
        <RefreshCw className="w-6 h-6 animate-spin text-emerald-500 mb-2" />
        <span className="text-xs font-semibold uppercase tracking-wider">Loading company profile...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left" id="company-admin-dashboard">
      {/* Toast Feedback Banner */}
      {message && (
        <div className={`p-4 border rounded-xl flex items-center gap-3 transition-all duration-300 ${
          message.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {message.type === 'success' ? <CheckCircle className="w-5 h-5 text-emerald-600" /> : <AlertCircle className="w-5 h-5 text-rose-600" />}
          <span className="text-xs font-semibold">{message.text}</span>
        </div>
      )}

      {/* Header card */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white border border-zinc-200 p-6 rounded-2xl shadow-xs">
        <div>
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest block font-mono">Workspace Administrator</span>
          <h1 className="text-xl font-black text-zinc-900 tracking-tight mt-0.5">
            {profile?.companyName || 'Company'} Admin Center
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Manage your company's operators, track overall vision credit usage, and monitor active workspace activity.
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={refreshing}
          className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 border border-zinc-800 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition shadow-xs disabled:opacity-50 font-mono"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Sync Database</span>
        </button>
      </div>

      {/* Balance & subscription stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-zinc-200 p-5 rounded-2xl shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Available Credits</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-emerald-600">{profile?.creditBalance.toFixed(2) || '0.00'} CR</span>
            </div>
            <span className="text-[10px] text-zinc-400 block mt-0.5">AED {((profile?.creditBalance || 0) * 1.75).toFixed(2)} Valuation</span>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <Coins className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border border-zinc-200 p-5 rounded-2xl shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Operational License</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className={`text-base font-extrabold uppercase ${profile?.licenseStatus === 'Active' ? 'text-emerald-700' : 'text-rose-700'}`}>
                {profile?.licenseStatus || 'Unknown'}
              </span>
            </div>
            <span className="text-[10px] text-zinc-400 block mt-0.5">Subscription Period: {profile?.subscriptionPeriod || 'N/A'}</span>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <CreditCard className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border border-zinc-200 p-5 rounded-2xl shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Company Operators</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-zinc-900">{users.length}</span>
              <span className="text-[10px] text-zinc-500 font-semibold">Active Profiles</span>
            </div>
            <span className="text-[10px] text-zinc-400 block mt-0.5">Authority to run model appraisals</span>
          </div>
          <div className="p-3 bg-zinc-50 text-zinc-600 rounded-xl">
            <Users className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Grid: Operator list & Company Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* User Management */}
        <div className="lg:col-span-6 bg-white border border-zinc-200 p-5 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4.5 h-4.5 text-[#008060]" />
              <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">Company Users Directory</h3>
            </div>
            <button
              onClick={() => {
                setEditingUser(null);
                setUserForm({ username: '', fullName: '', password: '', role: 'Listing Operator' });
                setShowUserModal(true);
              }}
              className="px-2.5 py-1.5 bg-[#008060] hover:bg-[#006e52] text-white rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer transition shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create User</span>
            </button>
          </div>

          <div className="divide-y divide-zinc-100">
            {users.length === 0 ? (
              <p className="text-xs text-zinc-500 py-6 text-center">No operator accounts found for this company.</p>
            ) : (
              users.map(u => (
                <div key={u.username} className="flex items-center justify-between py-3">
                  <div>
                    <span className="font-bold text-zinc-900 text-xs block">{u.fullName}</span>
                    <span className="text-[10px] text-zinc-500 block">Username: @{u.username}</span>
                    <span className="inline-block mt-1 text-[9px] font-bold px-2 py-0.5 bg-zinc-100 text-zinc-600 rounded uppercase tracking-wider">
                      {u.role}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => startEditUser(u)}
                      className="p-1.5 hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800 rounded transition"
                      title="Edit Operator details"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteUser(u)}
                      disabled={u.username === currentUser?.username}
                      className="p-1.5 hover:bg-rose-50 text-zinc-400 hover:text-rose-600 rounded transition disabled:opacity-30"
                      title="Deactivate / Delete Operator"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Company Ledger */}
        <div className="lg:col-span-6 bg-white border border-zinc-200 p-5 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-zinc-100 pb-3">
            <FileText className="w-4.5 h-4.5 text-indigo-600" />
            <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">Company Usage Ledger</h3>
          </div>

          <div className="overflow-y-auto max-h-[300px] divide-y divide-zinc-50">
            {transactions.length === 0 ? (
              <p className="text-xs text-zinc-500 py-12 text-center">No transaction history exists for this company.</p>
            ) : (
              transactions.map(t => {
                const isDeduction = t.amount < 0;
                return (
                  <div key={t.id} className="py-2.5 flex justify-between items-start text-xs">
                    <div className="space-y-0.5">
                      <span className="font-bold text-zinc-800 block truncate max-w-[180px]" title={t.productRef}>
                        {t.productRef || 'Credits Refill'}
                      </span>
                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-mono">
                        <span>{new Date(t.dateTime).toLocaleDateString()}</span>
                        <span>•</span>
                        <span>@{t.username}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`font-mono font-bold block ${isDeduction ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {isDeduction ? '' : '+'}{t.amount.toFixed(2)} CR
                      </span>
                      <span className="text-[9px] text-zinc-400 block mt-0.5">
                        AED {Math.abs(t.amount * 1.75).toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* User Creation / Edit Modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-300 w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-5 animate-slide-in relative text-xs">
            <button
              onClick={() => setShowUserModal(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 font-bold text-lg"
            >
              ×
            </button>

            <div className="space-y-1 text-center">
              <h3 className="text-base font-extrabold text-zinc-900 uppercase tracking-tight">
                {editingUser ? "Modify Operator Profile" : "Register Company Operator"}
              </h3>
              <p className="text-xs text-zinc-500">
                Grant studio access privileges to members of your company.
              </p>
            </div>

            <form onSubmit={handleUserSubmit} className="space-y-3.5">
              <div className="space-y-1 text-left">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Operator Username</label>
                <input
                  type="text"
                  required
                  disabled={!!editingUser}
                  placeholder="e.g., alex_vintage"
                  value={userForm.username}
                  onChange={e => setUserForm(prev => ({ ...prev, username: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-white transition disabled:opacity-50"
                />
              </div>

              <div className="space-y-1 text-left">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Operator Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Alex Carter"
                  value={userForm.fullName}
                  onChange={e => setUserForm(prev => ({ ...prev, fullName: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                />
              </div>

              <div className="space-y-1 text-left">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">
                  {editingUser ? 'Password (Leave blank to keep unchanged)' : 'Password'}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  placeholder="••••••••"
                  value={userForm.password}
                  onChange={e => setUserForm(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                />
              </div>

              <div className="space-y-1 text-left">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Appraisal Role & Privileges</label>
                <select
                  value={userForm.role}
                  onChange={e => setUserForm(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-white transition font-sans"
                >
                  <option value="Listing Operator">Listing Operator</option>
                  <option value="Vintage Cataloger">Vintage Cataloger</option>
                  <option value="Senior Appraiser">Senior Appraiser</option>
                  <option value="Store Administrator">Store Administrator</option>
                  <option value="Sub Admin">Sub Admin</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer shadow-md"
              >
                {editingUser ? "Save Details" : "Register Operator"}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
