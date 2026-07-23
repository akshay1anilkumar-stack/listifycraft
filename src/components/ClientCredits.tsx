import React, { useState, useEffect, useRef } from 'react';
import { UserSession } from './UserAuth';
import { 
  CreditCard, Wallet, Coins, RefreshCw, AlertCircle, FileText, 
  ArrowUpRight, ArrowDownLeft, Calendar, ShieldCheck, HelpCircle,
  X, Printer, CheckCircle2, ShoppingCart, Award
} from 'lucide-react';

interface ClientCreditsProps {
  currentUser: UserSession | null;
}

interface ClientProfile {
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
  invoice?: {
    invoiceNumber: string;
    date: string;
    companyName: string;
    email: string;
    phone: string;
    packageName: string;
    creditsPurchased: number;
    subtotalAED: number;
    vatAED: number;
    totalAED: number;
    paymentMethod: string;
    cardHolder: string;
    status: string;
  };
}

export default function ClientCredits({ currentUser }: ClientCreditsProps) {
  const [client, setClient] = useState<ClientProfile | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Billing Form States
  const [selectedPackage, setSelectedPackage] = useState<'starter' | 'growth' | 'enterprise' | null>(null);
  const [cardHolder, setCardHolder] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);

  // Active Invoice View Modal State
  const [activeInvoice, setActiveInvoice] = useState<any | null>(null);
  const invoiceRef = useRef<HTMLDivElement>(null);

  const packages = {
    starter: { id: 'starter', name: 'Starter Bundle', credits: 50, priceAED: 87.50, usdApprox: 23.80, popular: false },
    growth: { id: 'growth', name: 'Growth Pack', credits: 150, priceAED: 262.50, usdApprox: 71.50, popular: true },
    enterprise: { id: 'enterprise', name: 'Enterprise Pro', credits: 350, priceAED: 612.50, usdApprox: 166.70, popular: false }
  };

  useEffect(() => {
    fetchCreditData();
  }, [currentUser]);

  const fetchCreditData = async () => {
    if (!currentUser?.clientId) return;
    setLoading(true);
    setError(null);
    try {
      // Load specific client profile
      const clientRes = await fetch(`/api/admin/clients`);
      if (clientRes.ok) {
        const allClients: ClientProfile[] = await clientRes.json();
        const myClient = allClients.find(c => c.id === currentUser.clientId);
        if (myClient) {
          setClient(myClient);
        } else {
          setError("Your user profile is not linked to an active SaaS client directory.");
        }
      }

      // Load specific client transactions
      const txRes = await fetch(`/api/admin/transactions?clientId=${currentUser.clientId}`);
      if (txRes.ok) {
        const data = await txRes.json();
        setTransactions(data);
      }
    } catch (e) {
      setError("Failed to synchronize billing and transaction ledger from local store.");
    } finally {
      setLoading(false);
    }
  };

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await fetchCreditData();
    setRefreshing(false);
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPackage) {
      setPaymentError("Please select a top-up credit bundle package.");
      return;
    }
    if (!cardHolder.trim() || !cardNumber.trim() || !cardExpiry.trim() || !cvv.trim()) {
      setPaymentError("Please complete all credit card authorization fields.");
      return;
    }

    setPaymentLoading(true);
    setPaymentError(null);
    setPaymentSuccess(null);

    try {
      const res = await fetch('/api/billing/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: selectedPackage,
          cardNumber,
          cvv,
          cardHolder
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setPaymentError(data.error || "Payment transaction declined by issuer.");
        return;
      }

      setPaymentSuccess(data.message);
      // Reset form
      setCardHolder('');
      setCardNumber('');
      setCardExpiry('');
      setCvv('');
      setSelectedPackage(null);

      // Auto-trigger invoice display
      if (data.invoice) {
        setActiveInvoice(data.invoice);
      }

      // Refresh balances
      fetchCreditData();
    } catch (err: any) {
      setPaymentError("Unable to establish secure handshake with payment processor.");
    } finally {
      setPaymentLoading(false);
    }
  };

  const handlePrintInvoice = () => {
    const printContent = invoiceRef.current?.innerHTML;
    if (!printContent) return;
    const windowUrl = 'about:blank';
    const uniqueName = new Date().getTime();
    const windowName = `PrintInvoice_${uniqueName}`;
    const printWindow = window.open(windowUrl, windowName, 'left=5000,top=5000,width=0,height=0');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Invoice Summary - ListifyCraft</title>
            <style>
              body { font-family: monospace; padding: 30px; font-size: 13px; line-height: 1.5; color: #1f2937; }
              .header { text-align: center; margin-bottom: 20px; border-bottom: 2px dashed #d1d5db; padding-bottom: 15px; }
              .header h1 { margin: 0; font-size: 20px; text-transform: uppercase; font-weight: 900; letter-spacing: 1px; }
              .invoice-meta { display: flex; justify-content: space-between; margin-bottom: 25px; }
              .invoice-section { margin-bottom: 20px; }
              .section-title { font-weight: bold; border-bottom: 1px solid #e5e7eb; padding-bottom: 3px; text-transform: uppercase; margin-bottom: 8px; }
              table { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 20px; }
              th { border-bottom: 2px solid #e5e7eb; text-align: left; padding: 8px; font-weight: bold; text-transform: uppercase; }
              td { padding: 8px; border-bottom: 1px solid #f3f4f6; }
              .total-block { margin-left: auto; width: 250px; border-top: 2px solid #e5e7eb; padding-top: 10px; margin-top: 15px; }
              .total-row { display: flex; justify-content: space-between; margin-bottom: 5px; }
              .total-row.grand-total { font-weight: bold; font-size: 15px; border-top: 1px double #9ca3af; padding-top: 5px; }
              .footer { text-align: center; margin-top: 45px; font-size: 11px; color: #9ca3af; border-top: 1px dashed #e5e7eb; padding-top: 15px; }
            </style>
          </head>
          <body>
            ${printContent}
            <script>
              window.onload = function() {
                window.print();
                window.close();
              }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-zinc-500 font-sans">
        <RefreshCw className="w-6 h-6 animate-spin text-emerald-500 mb-2" />
        <span className="text-xs font-semibold uppercase tracking-wider">Syncing billing ledger...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left font-sans" id="client-credits-dashboard">
      
      {/* Sync Failure Error Banner */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-start gap-3 text-xs shadow-xs">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <div>
            <span className="font-bold block uppercase text-[10px]">Registry Out of Sync</span>
            <p className="mt-0.5 font-semibold">{error}</p>
          </div>
        </div>
      )}

      {/* Header Profile Panel */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white border border-zinc-200 p-6 rounded-2xl shadow-xs">
        <div>
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest block font-mono">Workspace Wallet & Billing</span>
          <h1 className="text-xl font-black text-zinc-900 tracking-tight mt-0.5">
            {client?.companyName || 'ListifyCraft'}
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Top up credit balances instantly, review transaction histories, and download printable VAT invoice receipts.
          </p>
        </div>
        <button
          onClick={handleManualRefresh}
          disabled={refreshing}
          className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 border border-zinc-800 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition shadow-xs disabled:opacity-50 font-mono"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh Balance</span>
        </button>
      </div>

      {/* Wallet Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Credit Wallet Display */}
        <div className="bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-md text-white flex flex-col justify-between h-48 relative overflow-hidden">
          <div className="absolute top-[-20%] right-[-10%] w-36 h-36 bg-[#008060]/10 rounded-full blur-[40px] pointer-events-none" />
          <div className="absolute bottom-[-10%] left-[-10%] w-24 h-24 bg-blue-900/10 rounded-full blur-[30px] pointer-events-none" />

          <div className="flex justify-between items-start relative z-10">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Available Wallet Balance</span>
              <span className="text-3xl font-black tracking-tight block">
                {client ? client.creditBalance.toFixed(2) : '0.00'}{' '}
                <span className="text-xs font-normal text-emerald-400 uppercase tracking-widest">CR</span>
              </span>
            </div>
            <Wallet className="w-5 h-5 text-emerald-400" />
          </div>

          <div className="flex justify-between items-end border-t border-zinc-800/80 pt-4 relative z-10">
            <div className="text-left">
              <span className="text-[8px] text-zinc-500 uppercase tracking-widest block">Current Value</span>
              <span className="text-sm font-bold text-emerald-400 font-mono">
                AED {client ? (client.creditBalance * 1.75).toFixed(2) : '0.00'}
              </span>
            </div>
            <span className="text-[9px] bg-zinc-800 border border-zinc-700 text-zinc-300 px-2 py-0.5 rounded font-mono">
              1 CR = AED 1.75
            </span>
          </div>
        </div>

        {/* Client Profile Context */}
        <div className="bg-white border border-zinc-200 p-6 rounded-2xl shadow-xs flex flex-col justify-between h-48">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4 text-[#008060]" />
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Tenant License</span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${client?.licenseStatus === 'Active' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <span className="text-sm font-extrabold text-zinc-900">{client?.licenseStatus || 'Unknown'} License</span>
              </div>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Licensed to <strong className="text-zinc-800">{client?.contactPerson || 'Operator'}</strong>. Your subscription guarantees real-time active Shopify sync limits.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-zinc-500 text-[10px] border-t border-zinc-100 pt-3">
            <Calendar className="w-3.5 h-3.5" />
            <span>Valid Period: <strong className="text-zinc-700">{client?.subscriptionPeriod || 'N/A'}</strong></span>
          </div>
        </div>

        {/* Commercial Policies FAQs */}
        <div className="bg-white border border-zinc-200 p-6 rounded-2xl shadow-xs flex flex-col justify-between h-48 text-xs text-zinc-600">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-indigo-600">
              <HelpCircle className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest">SaaS Billing Policies</span>
            </div>
            <ul className="space-y-1.5 text-[11px] list-disc list-inside">
              <li>Vision Listing Appraisal costs <strong className="text-zinc-800">1 credit</strong>.</li>
              <li>On-demand AI Model regeneration is <strong className="text-zinc-800">free (0 credits)</strong>.</li>
              <li>All payments are securely processed and subject to standard **5% UAE VAT**.</li>
              <li>Invoices are generated instantly in digital PDF formats.</li>
            </ul>
          </div>
          <div className="text-[9px] text-zinc-400 font-mono text-center">
            ListifyCraft Listing Studio v2.5 SaaS Platform
          </div>
        </div>

      </div>

      {/* ONLINE CREDIT TOP-UP CHECKOUT PANEL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Package Selector Cards (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-[#008060]" />
            <h2 className="text-sm font-bold text-zinc-800 uppercase tracking-widest">Select Top-Up Bundle Package</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Object.values(packages).map((pkg) => {
              const isSelected = selectedPackage === pkg.id;
              return (
                <button
                  type="button"
                  key={pkg.id}
                  onClick={() => { setSelectedPackage(pkg.id as any); setPaymentError(null); setPaymentSuccess(null); }}
                  className={`border text-left rounded-2xl p-5 relative transition cursor-pointer flex flex-col justify-between h-40 ${
                    isSelected 
                      ? 'border-[#008060] bg-green-50/20 shadow-xs' 
                      : 'border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-xs'
                  }`}
                >
                  {pkg.popular && (
                    <span className="absolute top-3 right-3 inline-flex items-center gap-0.5 px-2 py-0.5 bg-green-100 text-[9px] font-extrabold text-[#008060] uppercase rounded-full tracking-wider border border-green-200">
                      <Award className="w-2.5 h-2.5" /> Popular
                    </span>
                  )}
                  
                  <div className="space-y-1">
                    <span className="text-xs font-black text-zinc-800 block">{pkg.name}</span>
                    <span className="text-[20px] font-black text-zinc-950 block">
                      +{pkg.credits}{' '}
                      <span className="text-xs text-zinc-500 uppercase tracking-widest font-normal">Credits</span>
                    </span>
                  </div>

                  <div className="border-t border-zinc-100 pt-3 mt-3">
                    <span className="text-xs font-black text-[#008060] block font-mono">
                      AED {pkg.priceAED.toFixed(2)}
                    </span>
                    <span className="text-[9px] text-zinc-400 block font-mono">
                      Approx. ${pkg.usdApprox.toFixed(2)} USD
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Secure Authorization Form Card (1 col) */}
        <div className="bg-white border border-zinc-200 p-5 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center gap-1.5">
            <CreditCard className="w-4 h-4 text-zinc-700" />
            <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-widest">Card Authorization</h3>
          </div>

          <form onSubmit={handleCheckoutSubmit} className="space-y-3">
            <div>
              <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Cardholder Name</label>
              <input
                type="text"
                required
                placeholder="Jane Doe"
                value={cardHolder}
                onChange={e => setCardHolder(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-lg bg-zinc-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#008060]"
              />
            </div>

            <div>
              <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Card Number</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  maxLength={19}
                  placeholder="4000 1234 5678 9010"
                  value={cardNumber}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '');
                    // format with spaces
                    const formatted = val.match(/.{1,4}/g)?.join(' ') || val;
                    setCardNumber(formatted);
                  }}
                  className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-lg bg-zinc-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#008060] font-mono"
                />
                <CreditCard className="absolute right-3 top-2.5 w-4 h-4 text-zinc-400" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Expiry Date</label>
                <input
                  type="text"
                  required
                  maxLength={5}
                  placeholder="MM/YY"
                  value={cardExpiry}
                  onChange={e => {
                    let val = e.target.value.replace(/\D/g, '');
                    if (val.length > 2) val = `${val.slice(0, 2)}/${val.slice(2, 4)}`;
                    setCardExpiry(val);
                  }}
                  className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-lg bg-zinc-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#008060] font-mono text-center"
                />
              </div>

              <div>
                <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">CVV Code</label>
                <input
                  type="password"
                  required
                  maxLength={4}
                  placeholder="•••"
                  value={cvv}
                  onChange={e => setCvv(e.target.value.replace(/\D/g, ''))}
                  className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-lg bg-zinc-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#008060] font-mono text-center"
                />
              </div>
            </div>

            {paymentError && (
              <div className="p-2.5 bg-rose-50 border border-rose-100 text-rose-800 rounded-lg text-[11px] leading-relaxed">
                {paymentError}
              </div>
            )}

            {paymentSuccess && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-lg text-[11px] leading-relaxed">
                {paymentSuccess}
              </div>
            )}

            <button
              type="submit"
              disabled={paymentLoading || !selectedPackage}
              className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer transition shadow-xs"
            >
              {paymentLoading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <span>Authorize Top-up</span>
              )}
            </button>
          </form>
        </div>

      </div>

      {/* Credit Transactions History Logs */}
      <div className="bg-white border border-zinc-200 p-6 rounded-2xl shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-zinc-100 pb-3">
          <FileText className="w-5 h-5 text-[#008060]" />
          <div>
            <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">Transaction History Ledger</h3>
            <p className="text-[10px] text-zinc-500 mt-0.5">Audit trail of vision appraisals, model generations, and credit refills.</p>
          </div>
        </div>

        {transactions.length === 0 ? (
          <div className="py-12 text-center text-zinc-400 text-xs">
            <FileText className="w-8 h-8 mx-auto text-zinc-300 mb-2" />
            No wallet transactions recorded. Complete vision appraises to view billing items here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-600">
              <thead>
                <tr className="border-b border-zinc-100 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  <th className="py-2 px-3">Transaction ID</th>
                  <th className="py-2 px-3">Date & Time</th>
                  <th className="py-2 px-3">Action Type</th>
                  <th className="py-2 px-3">Operator</th>
                  <th className="py-2 px-3">Reference Item / Note</th>
                  <th className="py-2 px-3 text-right">Credit Delta</th>
                  <th className="py-2 px-3 text-right">Ending Wallet</th>
                  <th className="py-2 px-3 text-center">VAT Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50 font-sans">
                {transactions.map((tx) => {
                  const isDeduction = tx.amount < 0;
                  return (
                    <tr key={tx.id} className="hover:bg-zinc-50/50 transition">
                      <td className="py-2 px-3 font-mono text-[10px] text-zinc-400">{tx.id}</td>
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
                      <td className="py-2 px-3 font-semibold text-zinc-700">{tx.username}</td>
                      <td className="py-2 px-3 text-zinc-500 font-medium truncate max-w-[150px]" title={tx.productRef}>
                        {tx.productRef || 'Wallet Adjustment'}
                      </td>
                      <td className={`py-2 px-3 text-right font-mono font-black ${isDeduction ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {isDeduction ? '' : '+'}{tx.amount.toFixed(2)} CR
                        <span className="text-[10px] text-zinc-400 block font-normal font-sans">AED {(tx.amount * 1.75).toFixed(2)}</span>
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-zinc-800">
                        {tx.balanceAfter.toFixed(2)} CR
                      </td>
                      <td className="py-2 px-3 text-center">
                        {tx.invoice ? (
                          <button
                            type="button"
                            onClick={() => setActiveInvoice(tx.invoice)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-zinc-100 hover:bg-[#008060] text-zinc-700 hover:text-white rounded font-mono text-[9px] font-bold border border-zinc-200 transition cursor-pointer"
                          >
                            <FileText className="w-3 h-3" /> View
                          </button>
                        ) : (
                          <span className="text-[9px] text-zinc-400 italic">No Invoice</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DETAILED PRINTABLE VAT INVOICE MODAL */}
      {activeInvoice && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Actions Header */}
            <div className="p-4 border-b border-zinc-200 bg-zinc-50 flex justify-between items-center">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest font-mono">Invoice Ledger</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handlePrintInvoice}
                  className="px-3 py-1.5 bg-[#008060] hover:bg-emerald-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" /> Print Invoice
                </button>
                <button
                  type="button"
                  onClick={() => setActiveInvoice(null)}
                  className="p-1.5 hover:bg-zinc-200 text-zinc-500 rounded-lg transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Printable Invoice Container (Ref for printing) */}
            <div className="p-8 overflow-y-auto flex-1 font-mono text-zinc-800" ref={invoiceRef}>
              
              {/* Receipt Header */}
              <div className="header text-center pb-6 border-b-2 border-dashed border-zinc-200 mb-6">
                <h1 className="text-xl font-black uppercase tracking-wider text-zinc-900 m-0">LISTIFYCRAFT</h1>
                <p className="text-[10px] text-zinc-500 mt-1 leading-normal">
                  AI PRODUCT LISTING STUDIO SaaS PLATFORM<br />
                  VAT Registration No. 100456789000003<br />
                  Dubai Design District, Building 3, Dubai, UAE
                </p>
              </div>

              {/* Meta information grid */}
              <div className="grid grid-cols-2 gap-4 text-xs mb-6 pb-6 border-b border-zinc-200">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">INVOICE TO:</span>
                  <strong className="text-zinc-900 block uppercase">{activeInvoice.companyName}</strong>
                  <span className="text-zinc-500 block">Email: {activeInvoice.email}</span>
                  <span className="text-zinc-500 block">Phone: {activeInvoice.phone}</span>
                </div>
                <div className="space-y-1 text-right">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">INVOICE DETAILS:</span>
                  <span className="block text-zinc-900 font-bold">No. {activeInvoice.invoiceNumber}</span>
                  <span className="text-zinc-500 block">Date: {new Date(activeInvoice.date).toLocaleDateString()}</span>
                  <span className="text-zinc-500 block">Payment: {activeInvoice.paymentMethod}</span>
                </div>
              </div>

              {/* Items Breakdown Table */}
              <div className="space-y-2 mb-6">
                <div className="font-bold border-b border-zinc-300 pb-1 text-[10px] text-zinc-400 uppercase tracking-wider">Line Items</div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 text-left font-bold">
                      <th className="py-2 text-zinc-500 font-bold uppercase text-[10px]">Description</th>
                      <th className="py-2 text-center text-zinc-500 font-bold uppercase text-[10px] w-20">Quantity</th>
                      <th className="py-2 text-right text-zinc-500 font-bold uppercase text-[10px] w-28">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-3">
                        <strong className="text-zinc-900">{activeInvoice.packageName}</strong>
                        <span className="text-[10px] text-zinc-400 block mt-0.5">SaaS Multimodal Image Appraisal Credits</span>
                      </td>
                      <td className="py-3 text-center font-bold">1</td>
                      <td className="py-3 text-right font-mono font-bold">
                        AED {activeInvoice.subtotalAED.toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Totals Summary */}
              <div className="w-64 ml-auto border-t-2 border-zinc-300 pt-3 text-xs space-y-2">
                <div className="flex justify-between text-zinc-500 font-medium">
                  <span>Subtotal:</span>
                  <span className="font-mono">AED {activeInvoice.subtotalAED.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-zinc-500 font-medium">
                  <span>UAE VAT (5.00%):</span>
                  <span className="font-mono">AED {activeInvoice.vatAED.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-zinc-900 font-black text-sm border-t border-zinc-200 pt-2">
                  <span>TOTAL DUE (AED):</span>
                  <span className="font-mono text-emerald-700">AED {activeInvoice.totalAED.toFixed(2)}</span>
                </div>
              </div>

              {/* Receipt Footer */}
              <div className="text-center mt-12 pt-6 border-t border-dashed border-zinc-200 text-[10px] text-zinc-400 leading-normal">
                <div className="flex items-center justify-center gap-1 text-emerald-600 font-bold mb-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>TRANSACTION FULLY AUTHORIZED & PAID</span>
                </div>
                Thank you for subscribing to ListifyCraft.<br />
                For any billing disputes or inquiries, contact billing@fashionrerun.com
              </div>

            </div>

            {/* Close footer button */}
            <div className="p-4 bg-zinc-50 border-t border-zinc-200 text-center">
              <button
                type="button"
                onClick={() => setActiveInvoice(null)}
                className="px-6 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer transition shadow-xs"
              >
                Close Receipt
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
