import React, { useState, useEffect } from 'react';
import { 
  Users, CreditCard, ShieldAlert, Sparkles, TrendingUp, RefreshCw, 
  Search, CheckCircle, XCircle, Plus, AlertCircle, Edit, DollarSign,
  ArrowUpRight, ArrowDownLeft, FileText, Ban, Check, Coins, Trash2, Key
} from 'lucide-react';
import { UserSession } from './UserAuth';

interface Client {
  id: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  licenseStatus: 'Active' | 'Inactive';
  subscriptionPeriod: string;
  creditBalance: number;
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

interface Analytics {
  clientsCount: number;
  usersCount: number;
  totalListings: number;
  totalRefilled: number;
  totalCharged: number;
  estimatedRevenueAED: number;
}

interface MasterAdminProps {
  currentUser: UserSession | null;
}

export default function MasterAdmin({ currentUser }: MasterAdminProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  
  // Costs State
  const [costListing, setCostListing] = useState<number>(1);
  const [costModel, setCostModel] = useState<number>(1);
  const [savingCosts, setSavingCosts] = useState(false);

  // Loading states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Search/Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [clientFilter, setClientFilter] = useState('all');

  // Multi-Section Navigation
  const [activeSection, setActiveSection] = useState<'SUBSCRIBERS' | 'USERS'>('SUBSCRIBERS');

  // Users management states
  const [usersList, setUsersList] = useState<any[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [userForm, setUserForm] = useState({
    username: '',
    fullName: '',
    password: '',
    role: 'Listing Operator',
    clientId: ''
  });

  // Modal / Form states
  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientForm, setClientForm] = useState({
    companyName: '',
    contactPerson: '',
    email: '',
    phone: '',
    licenseStatus: 'Active' as 'Active' | 'Inactive',
    subscriptionPeriod: '2026-01-01 to 2027-01-01',
    creditBalance: 100
  });

  // Refill Modal state
  const [showRefillModal, setShowRefillModal] = useState(false);
  const [selectedRefillClient, setSelectedRefillClient] = useState<Client | null>(null);
  const [refillForm, setRefillForm] = useState({
    amount: '',
    isRefund: false,
    description: ''
  });

  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const getHeaders = () => ({
    'Content-Type': 'application/json',
    'x-user-username': currentUser?.username || 'admin',
    'x-user-role': currentUser?.role || 'Master Admin',
    'x-user-client-id': currentUser?.clientId || ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadClients(),
        loadTransactions(),
        loadAnalytics(),
        loadCosts(),
        loadUsers()
      ]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
    showFeedback('success', 'Workspace live sync completed');
  };

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const loadClients = async () => {
    const res = await fetch('/api/admin/clients', { headers: getHeaders() });
    if (res.ok) {
      const data = await res.json();
      setClients(data);
    }
  };

  const loadUsers = async () => {
    const res = await fetch('/api/admin/users', { headers: getHeaders() });
    if (res.ok) {
      const data = await res.json();
      setUsersList(data);
    }
  };

  const loadTransactions = async () => {
    const res = await fetch('/api/admin/transactions', { headers: getHeaders() });
    if (res.ok) {
      const data = await res.json();
      setTransactions(data);
    }
  };

  const loadAnalytics = async () => {
    const res = await fetch('/api/admin/analytics', { headers: getHeaders() });
    if (res.ok) {
      const data = await res.json();
      setAnalytics(data);
    }
  };

  const loadCosts = async () => {
    const res = await fetch('/api/admin/costs', { headers: getHeaders() });
    if (res.ok) {
      const data = await res.json();
      setCostListing(data.costListingCredit ?? 1);
      setCostModel(data.costModelCredit ?? 1);
    }
  };

  const handleSaveCosts = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCosts(true);
    try {
      const res = await fetch('/api/admin/costs', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          costListingCredit: costListing,
          costModelCredit: costModel
        })
      });
      if (res.ok) {
        showFeedback('success', 'AI feature costs updated successfully');
      } else {
        showFeedback('error', 'Failed to update cost settings');
      }
    } catch (e) {
      showFeedback('error', 'Server error saving costs');
    } finally {
      setSavingCosts(false);
    }
  };

  const handleClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientForm.companyName.trim()) {
      showFeedback('error', 'Company name is required');
      return;
    }

    try {
      const payload = editingClient 
        ? { ...clientForm, id: editingClient.id }
        : clientForm;

      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showFeedback('success', editingClient ? 'Client profile updated' : 'New client registered with initial credits');
        setShowClientModal(false);
        setEditingClient(null);
        resetClientForm();
        fetchData();
      } else {
        const err = await res.json();
        showFeedback('error', err.error || 'Submission failed');
      }
    } catch (e) {
      showFeedback('error', 'Connection error to workspace client registry');
    }
  };

  const handleRefillSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRefillClient) return;
    const rawAmt = parseFloat(refillForm.amount);
    if (isNaN(rawAmt) || rawAmt <= 0) {
      showFeedback('error', 'Please specify a valid credit amount');
      return;
    }

    const finalAmount = refillForm.isRefund ? -rawAmt : rawAmt;
    try {
      const res = await fetch('/api/admin/refill', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          clientId: selectedRefillClient.id,
          amount: finalAmount,
          description: refillForm.description.trim() || (refillForm.isRefund ? 'Client Balance Refunded' : 'Client Wallet Refilled'),
          username: currentUser?.username || 'admin'
        })
      });

      if (res.ok) {
        showFeedback('success', refillForm.isRefund ? 'Credits refunded from client profile' : 'Credits refilled to client profile');
        setShowRefillModal(false);
        setSelectedRefillClient(null);
        setRefillForm({ amount: '', isRefund: false, description: '' });
        fetchData();
      } else {
        const err = await res.json();
        showFeedback('error', err.error || 'Failed to modify wallet');
      }
    } catch (e) {
      showFeedback('error', 'Connection lost modifying wallet balance');
    }
  };

  const toggleLicense = async (client: Client) => {
    const newStatus = client.licenseStatus === 'Active' ? 'Inactive' : 'Active';
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          id: client.id,
          companyName: client.companyName,
          licenseStatus: newStatus
        })
      });

      if (res.ok) {
        showFeedback('success', `Client license toggled to ${newStatus}`);
        fetchData();
      } else {
        showFeedback('error', 'Failed to change license state');
      }
    } catch (e) {
      showFeedback('error', 'Connection error toggling license');
    }
  };

  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userForm.username.trim() || !userForm.fullName.trim() || (!editingUser && !userForm.password)) {
      showFeedback('error', 'Please fill in all required fields.');
      return;
    }

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          username: userForm.username.trim(),
          fullName: userForm.fullName.trim(),
          password: userForm.password,
          role: userForm.role,
          clientId: userForm.clientId,
          isEdit: !!editingUser,
          oldUsername: editingUser?.username
        })
      });

      if (res.ok) {
        showFeedback('success', editingUser ? 'User profile updated' : 'New user account registered');
        setShowUserModal(false);
        setEditingUser(null);
        setUserForm({ username: '', fullName: '', password: '', role: 'Listing Operator', clientId: clients[0]?.id || '' });
        fetchData();
      } else {
        const err = await res.json();
        showFeedback('error', err.error || 'Failed to submit user profile');
      }
    } catch (e) {
      showFeedback('error', 'Network error managing user profile');
    }
  };

  const handleDeleteUser = async (usernameToDelete: string) => {
    if (usernameToDelete === currentUser?.username) {
      showFeedback('error', 'You cannot delete your own logged-in session account.');
      return;
    }

    if (!window.confirm(`Are you sure you want to deactivate and delete user account "${usernameToDelete}"?`)) {
      return;
    }

    try {
      const res = await fetch('/api/admin/users/delete', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ username: usernameToDelete })
      });

      if (res.ok) {
        showFeedback('success', 'User account successfully deleted');
        fetchData();
      } else {
        const err = await res.json();
        showFeedback('error', err.error || 'Deactivation failed');
      }
    } catch (e) {
      showFeedback('error', 'Connection lost removing user account');
    }
  };

  const startEditUser = (user: any) => {
    setEditingUser(user);
    setUserForm({
      username: user.username,
      fullName: user.fullName,
      password: '',
      role: user.role,
      clientId: user.clientId || ''
    });
    setShowUserModal(true);
  };

  const resetClientForm = () => {
    setClientForm({
      companyName: '',
      contactPerson: '',
      email: '',
      phone: '',
      licenseStatus: 'Active',
      subscriptionPeriod: '2026-01-01 to 2027-01-01',
      creditBalance: 100
    });
  };

  const startEditClient = (client: Client) => {
    setEditingClient(client);
    setClientForm({
      companyName: client.companyName,
      contactPerson: client.contactPerson,
      email: client.email,
      phone: client.phone,
      licenseStatus: client.licenseStatus,
      subscriptionPeriod: client.subscriptionPeriod,
      creditBalance: client.creditBalance
    });
    setShowClientModal(true);
  };

  const startRefill = (client: Client) => {
    setSelectedRefillClient(client);
    setRefillForm({
      amount: '',
      isRefund: false,
      description: ''
    });
    setShowRefillModal(true);
  };

  const filteredClients = (clients || []).filter(c => 
    (c?.companyName || '').toLowerCase().includes((searchQuery || '').toLowerCase()) ||
    (c?.contactPerson || '').toLowerCase().includes((searchQuery || '').toLowerCase()) ||
    (c?.email || '').toLowerCase().includes((searchQuery || '').toLowerCase())
  );

  const filteredTransactions = transactions.filter(t => {
    if (clientFilter !== 'all' && t.clientId !== clientFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6 text-left" id="master-admin-dashboard">
      {/* Top feedback banner */}
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

      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white border border-zinc-200 p-6 rounded-2xl shadow-xs">
        <div>
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest block font-mono">SaaS Owner Panel</span>
          <h1 className="text-xl font-black text-zinc-900 tracking-tight mt-0.5">Studio Master Controller</h1>
          <p className="text-xs text-zinc-500 mt-1">
            Global cloud tenant profiles, credit cost controllers, subscriber analytics, and system transaction history ledger.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 border border-zinc-800 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition shadow-xs disabled:opacity-50 font-mono"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Sync Workspace</span>
        </button>
      </div>

      {/* Analytics Summary */}
      {analytics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-zinc-200 p-5 rounded-2xl shadow-xs">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Clients / Tenancies</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-zinc-900">{analytics.clientsCount}</span>
              <span className="text-[10px] text-emerald-600 font-bold">Profiles Live</span>
            </div>
          </div>
          
          <div className="bg-white border border-zinc-200 p-5 rounded-2xl shadow-xs">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Total Products Listed</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-zinc-900">{analytics.totalListings}</span>
              <span className="text-[10px] text-zinc-500 font-medium">Drafts</span>
            </div>
          </div>

          <div className="bg-white border border-zinc-200 p-5 rounded-2xl shadow-xs">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Credits Allocated</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-zinc-900">{analytics.totalRefilled}</span>
              <span className="text-[10px] text-indigo-500 font-bold">Issued</span>
            </div>
          </div>

          <div className="bg-white border border-zinc-200 p-5 rounded-2xl shadow-xs bg-gradient-to-br from-emerald-50/20 to-teal-50/20 border-emerald-200">
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest block font-mono">Gross Estimates</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-emerald-950">AED {analytics.estimatedRevenueAED.toFixed(2)}</span>
              <span className="text-[9px] text-emerald-600 font-semibold block uppercase">1 CR = AED 1.75</span>
            </div>
          </div>
        </div>
      )}

      {/* Nested View Switcher */}
      <div className="flex border-b border-zinc-200">
        <button
          onClick={() => setActiveSection('SUBSCRIBERS')}
          className={`px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
            activeSection === 'SUBSCRIBERS'
              ? 'border-[#008060] text-[#008060]'
              : 'border-transparent text-zinc-500 hover:text-zinc-800'
          }`}
        >
          Subscriber Workspaces
        </button>
        <button
          onClick={() => setActiveSection('USERS')}
          className={`px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
            activeSection === 'USERS'
              ? 'border-[#008060] text-[#008060]'
              : 'border-transparent text-zinc-500 hover:text-zinc-800'
          }`}
        >
          All Registered Users
        </button>
      </div>

      {activeSection === 'SUBSCRIBERS' ? (
        <>
          {/* Main Grid: Management & Cost Controller */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Cost Controls Panel */}
        <div className="lg:col-span-4 bg-white border border-zinc-200 p-5 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-zinc-100 pb-3">
            <Coins className="w-5 h-5 text-emerald-600" />
            <div>
              <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">AI Credit Cost Controller</h3>
              <p className="text-[10px] text-zinc-500 mt-0.5">Determine global feature execution costs.</p>
            </div>
          </div>

          <form onSubmit={handleSaveCosts} className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Vision Appraisal Generation</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={costListing}
                  onChange={e => setCostListing(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-emerald-500 focus:bg-white"
                />
                <span className="text-[11px] text-zinc-500 font-medium shrink-0">Credit(s)</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">AI Model wearing Product</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={costModel}
                  onChange={e => setCostModel(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-emerald-500 focus:bg-white"
                />
                <span className="text-[11px] text-zinc-500 font-medium shrink-0">Credit(s)</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={savingCosts}
              className="w-full py-2 bg-[#008060] hover:bg-[#006e52] text-white text-[11px] font-bold uppercase tracking-wider rounded-lg transition duration-200 cursor-pointer disabled:opacity-50 shadow-xs flex items-center justify-center gap-1.5"
            >
              <Coins className="w-3.5 h-3.5" />
              <span>{savingCosts ? 'Saving Cost Settings...' : 'Save Cost Policy'}</span>
            </button>
          </form>

          {/* Quick SaaS parameters summary */}
          <div className="pt-3 border-t border-zinc-100 bg-zinc-50/50 p-3 rounded-lg space-y-1.5 text-[11px] text-zinc-600">
            <span className="font-bold text-zinc-800 uppercase text-[9px] block mb-1">Commercial Policy Parameters:</span>
            <div className="flex justify-between">
              <span>Standard Billing Unit:</span>
              <strong className="text-zinc-900 font-mono">1.00 Credit</strong>
            </div>
            <div className="flex justify-between">
              <span>Standard Value:</span>
              <strong className="text-zinc-900 font-semibold">AED 1.75 / Credit</strong>
            </div>
            <div className="flex justify-between">
              <span>Standard Multi-Tenancy:</span>
              <strong className="text-emerald-600 font-semibold">Active</strong>
            </div>
          </div>
        </div>

        {/* Client Management Registry */}
        <div className="lg:col-span-8 bg-white border border-zinc-200 p-5 rounded-2xl shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-100 pb-3">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">Subscriber Directory</h3>
                <p className="text-[10px] text-zinc-500 mt-0.5">Control subscriptions, wallet, and state permissions.</p>
              </div>
            </div>
            <button
              onClick={() => { resetClientForm(); setEditingClient(null); setShowClientModal(true); }}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 border border-zinc-800 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer transition shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Onboard Client</span>
            </button>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute top-2.5 left-3" />
            <input
              type="text"
              placeholder="Search clients by company name, contact, or email address..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-xs focus:outline-none focus:border-indigo-500 focus:bg-white transition"
            />
          </div>

          {/* Clients List */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-600">
              <thead>
                <tr className="border-b border-zinc-100 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  <th className="py-2.5 px-3">Company / Subscriber</th>
                  <th className="py-2.5 px-3">Contact Person</th>
                  <th className="py-2.5 px-3">License & Period</th>
                  <th className="py-2.5 px-3 text-right">Wallet Balance</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {filteredClients.map((client) => {
                  const isActive = client.licenseStatus === 'Active';
                  return (
                    <tr key={client.id} className="hover:bg-zinc-50/50 transition">
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-zinc-900 block">{client.companyName}</span>
                        <span className="text-[10px] text-zinc-400 font-mono">ID: {client.id}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-semibold block text-zinc-800">{client.contactPerson}</span>
                        <span className="text-[10px] text-zinc-400 block">{client.email}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                          isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}>
                          <span className={`w-1 h-1 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          {client.licenseStatus}
                        </span>
                        <span className="text-[10px] text-zinc-400 block mt-0.5 font-mono">Expires: {client.subscriptionPeriod.split(' to ')[1] || client.subscriptionPeriod}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        <span className="font-bold text-zinc-900 block">{client.creditBalance.toFixed(2)} CR</span>
                        <span className="text-[10px] text-zinc-400">AED {(client.creditBalance * 1.75).toFixed(2)}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex gap-1.5 justify-end">
                          <button
                            onClick={() => startRefill(client)}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                            title="Refill/Refund Wallet"
                          >
                            <Coins className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => startEditClient(client)}
                            className="p-1 text-zinc-500 hover:bg-zinc-100 rounded"
                            title="Edit Subscriber Profile"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => toggleLicense(client)}
                            className={`p-1 rounded ${isActive ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
                            title={isActive ? "Deactivate Client License" : "Activate Client License"}
                          >
                            {isActive ? <Ban className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Credit Transactions History Logs */}
      <div className="bg-white border border-zinc-200 p-6 rounded-2xl shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-100 pb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">Global System Ledger</h3>
              <p className="text-[10px] text-zinc-500 mt-0.5">Audit log of all commercial transactions, refunds, and AI appraises.</p>
            </div>
          </div>

          <div className="flex items-center gap-2 border border-zinc-300 rounded px-3 py-1.5 bg-[#FAFAFA]">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Filter Client:</span>
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="text-xs font-semibold text-zinc-700 bg-transparent border-none focus:outline-none focus:ring-0 pr-6 py-0.5 cursor-pointer font-sans"
            >
              <option value="all">All Subscribers</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.companyName}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-600">
            <thead>
              <tr className="border-b border-zinc-100 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                <th className="py-2 px-3">Transaction ID</th>
                <th className="py-2 px-3">Client Profile</th>
                <th className="py-2 px-3">Date & Time</th>
                <th className="py-2 px-3">Action Type</th>
                <th className="py-2 px-3">Reference item</th>
                <th className="py-2 px-3 text-right">Credit Value</th>
                <th className="py-2 px-3 text-right">Ending Wallet</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50 font-sans">
              {filteredTransactions.map((tx) => {
                const isDeduction = tx.amount < 0;
                return (
                  <tr key={tx.id} className="hover:bg-zinc-50/50 transition">
                    <td className="py-2 px-3 font-mono text-[10px] text-zinc-400">{tx.id}</td>
                    <td className="py-2 px-3">
                      <span className="font-bold text-zinc-800 block">{tx.companyName}</span>
                      <span className="text-[10px] text-zinc-400 font-mono block">Operator: {tx.username}</span>
                    </td>
                    <td className="py-2 px-3 text-zinc-500 font-mono text-[10px]">
                      {new Date(tx.dateTime).toLocaleString()}
                    </td>
                    <td className="py-2 px-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                        tx.action === 'Credit Refill' ? 'bg-emerald-50 text-emerald-800' :
                        tx.action === 'Credit Refund' ? 'bg-indigo-50 text-indigo-800' :
                        'bg-zinc-50 text-zinc-800'
                      }`}>
                        {tx.action === 'Credit Refill' ? <ArrowDownLeft className="w-2.5 h-2.5 text-emerald-600" /> : <ArrowUpRight className="w-2.5 h-2.5 text-rose-600" />}
                        {tx.action}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-zinc-600 font-semibold truncate max-w-[150px]" title={tx.productRef}>
                      {tx.productRef || 'General Adjust'}
                    </td>
                    <td className={`py-2 px-3 text-right font-mono font-black ${isDeduction ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {isDeduction ? '' : '+'}{tx.amount.toFixed(2)} CR
                      <span className="text-[10px] text-zinc-400 block font-normal font-sans">AED {(tx.amount * 1.75).toFixed(2)}</span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-zinc-800">
                      {tx.balanceAfter.toFixed(2)} CR
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
        </>
      ) : (
        <div className="bg-white border border-zinc-200 p-6 rounded-2xl shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-100 pb-3">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-[#008060]" />
              <div>
                <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">Global Users Directory</h3>
                <p className="text-[10px] text-zinc-500 mt-0.5">Manage access permissions, promote roles, and assign users to company workspaces.</p>
              </div>
            </div>

            <button
              onClick={() => {
                setEditingUser(null);
                setUserForm({ username: '', fullName: '', password: '', role: 'Listing Operator', clientId: clients[0]?.id || '' });
                setShowUserModal(true);
              }}
              className="px-3 py-1.5 bg-[#008060] hover:bg-[#006e52] text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer transition shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create User Profile</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-600">
              <thead>
                <tr className="border-b border-zinc-100 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  <th className="py-2 px-3">Username</th>
                  <th className="py-2 px-3">Full Name</th>
                  <th className="py-2 px-3">Company Workspace</th>
                  <th className="py-2 px-3">System Role</th>
                  <th className="py-2 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50 font-sans">
                {usersList.map((usr) => {
                  const company = clients.find(c => c.id === usr.clientId);
                  return (
                    <tr key={usr.username} className="hover:bg-zinc-50/50 transition">
                      <td className="py-2.5 px-3 font-mono font-semibold text-zinc-800">@{usr.username}</td>
                      <td className="py-2.5 px-3 font-bold text-zinc-900">{usr.fullName}</td>
                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-zinc-700">{company?.companyName || 'Master Admin Workspace'}</span>
                        <span className="text-[10px] text-zinc-400 font-mono block">ID: {usr.clientId || 'N/A'}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-block text-[9px] font-bold px-2.5 py-0.5 rounded uppercase tracking-wider ${
                          usr.role === 'Master Admin' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                          usr.role === 'Sub Admin' || usr.role === 'Store Administrator' ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' :
                          'bg-zinc-100 text-zinc-700'
                        }`}>
                          {usr.role}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex gap-1.5 justify-end">
                          <button
                            onClick={() => startEditUser(usr)}
                            className="p-1.5 text-zinc-500 hover:bg-zinc-100 rounded"
                            title="Edit User Details"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(usr.username)}
                            disabled={usr.username === currentUser?.username}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded disabled:opacity-30"
                            title="Delete User Account"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Global User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-300 w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-5 animate-slide-in relative text-xs text-left">
            <button
              onClick={() => setShowUserModal(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 font-bold text-lg"
            >
              ×
            </button>

            <div className="space-y-1 text-center">
              <h3 className="text-base font-extrabold text-zinc-900 uppercase tracking-tight">
                {editingUser ? "Modify User Profile" : "Register System User"}
              </h3>
              <p className="text-xs text-zinc-500">
                Grant custom access privileges across subscriber workspaces.
              </p>
            </div>

            <form onSubmit={handleUserSubmit} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">User Username</label>
                <input
                  type="text"
                  required
                  disabled={!!editingUser}
                  placeholder="e.g., alex_vintage"
                  value={userForm.username}
                  onChange={e => setUserForm(prev => ({ ...prev, username: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-[#008060] focus:bg-white transition disabled:opacity-50 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">User Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Alex Carter"
                  value={userForm.fullName}
                  onChange={e => setUserForm(prev => ({ ...prev, fullName: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-[#008060] focus:bg-white transition"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">
                  {editingUser ? 'Password (Leave blank to keep unchanged)' : 'Password'}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  placeholder="••••••••"
                  value={userForm.password}
                  onChange={e => setUserForm(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-[#008060] focus:bg-white transition"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">System Role & Access Level</label>
                <select
                  value={userForm.role}
                  onChange={e => setUserForm(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-[#008060] focus:bg-white transition font-sans"
                >
                  <option value="Listing Operator">Listing Operator</option>
                  <option value="Vintage Cataloger">Vintage Cataloger</option>
                  <option value="Senior Appraiser">Senior Appraiser</option>
                  <option value="Store Administrator">Store Administrator</option>
                  <option value="Sub Admin">Sub Admin</option>
                  <option value="Master Admin">Master Admin</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Workspace / Client Tenancy</label>
                <select
                  value={userForm.clientId}
                  onChange={e => setUserForm(prev => ({ ...prev, clientId: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-[#008060] focus:bg-white transition font-sans"
                >
                  <option value="">None (Master Workspace)</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.companyName}</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer shadow-md"
              >
                {editingUser ? "Save Details" : "Register User"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Onboard / Edit Client Modal */}
      {showClientModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-300 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-5 animate-slide-in relative">
            <button
              onClick={() => setShowClientModal(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 font-bold text-lg"
            >
              ×
            </button>

            <div className="space-y-1 text-center">
              <h3 className="text-base font-extrabold text-zinc-900 uppercase tracking-tight">
                {editingClient ? "Modify Client Profile" : "Onboard New Client"}
              </h3>
              <p className="text-xs text-zinc-500">
                Setup high-performance operational workspace environments for clients.
              </p>
            </div>

            <form onSubmit={handleClientSubmit} className="space-y-3.5 text-xs">
              <div className="space-y-1 text-left">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Company / Workspace Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Rerun Dubai"
                  value={clientForm.companyName}
                  onChange={e => setClientForm(prev => ({ ...prev, companyName: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                />
              </div>

              <div className="space-y-1 text-left">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Contact Person</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Akshay Kumar"
                  value={clientForm.contactPerson}
                  onChange={e => setClientForm(prev => ({ ...prev, contactPerson: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 text-left">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="name@company.com"
                    value={clientForm.email}
                    onChange={e => setClientForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                  />
                </div>
                <div className="space-y-1 text-left">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Phone Number</label>
                  <input
                    type="text"
                    required
                    placeholder="+971 50..."
                    value={clientForm.phone}
                    onChange={e => setClientForm(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 text-left">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">License Status</label>
                  <select
                    value={clientForm.licenseStatus}
                    onChange={e => setClientForm(prev => ({ ...prev, licenseStatus: e.target.value as any }))}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-white transition font-sans"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
                <div className="space-y-1 text-left">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Subscription Period</label>
                  <input
                    type="text"
                    required
                    placeholder="2026-01-01 to 2027-01-01"
                    value={clientForm.subscriptionPeriod}
                    onChange={e => setClientForm(prev => ({ ...prev, subscriptionPeriod: e.target.value }))}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                  />
                </div>
              </div>

              <div className="space-y-1 text-left">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Wallet Credits (Direct Adjustment)</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  required
                  value={clientForm.creditBalance}
                  onChange={e => setClientForm(prev => ({ ...prev, creditBalance: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl font-semibold focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer shadow-md"
              >
                {editingClient ? "Update Client Profile" : "Provision Client Profile"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Wallet Refill / Refund Modal */}
      {showRefillModal && selectedRefillClient && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-300 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-5 animate-slide-in relative">
            <button
              onClick={() => setShowRefillModal(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 font-bold text-lg"
            >
              ×
            </button>

            <div className="space-y-1 text-center">
              <h3 className="text-base font-extrabold text-zinc-900 uppercase tracking-tight">
                {refillForm.isRefund ? "Refund Client Credits" : "Refill Client Wallet"}
              </h3>
              <p className="text-xs text-zinc-500">
                Direct balance adjustment for <strong className="text-zinc-800">{selectedRefillClient.companyName}</strong>.
              </p>
            </div>

            <form onSubmit={handleRefillSubmit} className="space-y-3.5 text-xs">
              
              <div className="flex bg-zinc-100 p-1.5 rounded-xl justify-between items-center">
                <button
                  type="button"
                  onClick={() => setRefillForm(prev => ({ ...prev, isRefund: false }))}
                  className={`w-1/2 py-2 text-xs font-bold uppercase rounded-lg transition ${
                    !refillForm.isRefund ? 'bg-white text-emerald-800 shadow-xs' : 'text-zinc-500'
                  }`}
                >
                  Refill Credits
                </button>
                <button
                  type="button"
                  onClick={() => setRefillForm(prev => ({ ...prev, isRefund: true }))}
                  className={`w-1/2 py-2 text-xs font-bold uppercase rounded-lg transition ${
                    refillForm.isRefund ? 'bg-white text-rose-800 shadow-xs' : 'text-zinc-500'
                  }`}
                >
                  Refund Credits
                </button>
              </div>

              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 flex justify-between items-center">
                <span className="font-semibold text-zinc-500">Current Balance:</span>
                <strong className="text-sm text-zinc-800 font-mono">{selectedRefillClient.creditBalance.toFixed(2)} CR</strong>
              </div>

              <div className="space-y-1 text-left">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Adjustment Amount (Credits)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    placeholder="e.g., 50"
                    value={refillForm.amount}
                    onChange={e => setRefillForm(prev => ({ ...prev, amount: e.target.value }))}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-emerald-500 focus:bg-white transition"
                  />
                  <span className="font-bold text-zinc-500 shrink-0 font-mono">CR</span>
                </div>
                {refillForm.amount && (
                  <span className="text-[10px] text-zinc-400 block mt-1">
                    Value in AED: <strong className="text-zinc-700">AED {(parseFloat(refillForm.amount) * 1.75 || 0).toFixed(2)}</strong>
                  </span>
                )}
              </div>

              <div className="space-y-1 text-left">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Transaction Description / Notes</label>
                <textarea
                  placeholder="e.g., Bank deposit received ref: DXB-201823"
                  value={refillForm.description}
                  onChange={e => setRefillForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-white transition font-sans"
                />
              </div>

              <button
                type="submit"
                className={`w-full py-2.5 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer shadow-md ${
                  refillForm.isRefund 
                    ? 'bg-rose-600 hover:bg-rose-700' 
                    : 'bg-emerald-600 hover:bg-emerald-750'
                }`}
              >
                {refillForm.isRefund ? "Deduct Refund" : "Add Refill Credits"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
