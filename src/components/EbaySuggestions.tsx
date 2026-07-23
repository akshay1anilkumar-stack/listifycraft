import React, { useState, useEffect } from 'react';
import { ShoppingBag, Globe, CheckSquare, Settings, Play, RefreshCw, AlertCircle, CheckCircle2, Sliders, ArrowLeftRight, HelpCircle } from 'lucide-react';

interface EbayConfig {
  ebayConnected: boolean;
  ebayAccount: string | null;
  ebayAutomationEnabled: boolean;
}

interface EbaySuggestionsProps {
  shopifyProducts: any[];
  onRefreshProducts: () => void;
}

export default function EbaySuggestions({ shopifyProducts, onRefreshProducts }: EbaySuggestionsProps) {
  // eBay Configuration
  const [ebayConfig, setEbayConfig] = useState<EbayConfig>({
    ebayConnected: false,
    ebayAccount: null,
    ebayAutomationEnabled: false
  });
  
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [ebayAccountInput, setEbayAccountInput] = useState('');
  
  // Selection and syncing state
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [isPushing, setIsPushing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [syncLogs, setSyncLogs] = useState<any[]>([]);

  const fetchEbayConfig = async () => {
    try {
      const res = await fetch('/api/ebay/config');
      if (res.ok) {
        const data = await res.json();
        setEbayConfig(data);
        if (data.ebayAccount) {
          setEbayAccountInput(data.ebayAccount);
        }
      }
    } catch (e) {
      console.error("Failed to load eBay configuration", e);
    } finally {
      setLoadingConfig(false);
    }
  };

  useEffect(() => {
    fetchEbayConfig();
  }, []);

  // Filter products matching category ("Vintage", "Y2K", "Retro") and price > AED 200 (~$55)
  const isVintageCategory = (product: any): boolean => {
    const title = (product.title || '').toLowerCase();
    const type = (product.product_type || '').toLowerCase();
    const vendor = (product.vendor || '').toLowerCase();
    
    const tags = Array.isArray(product.tags) 
      ? product.tags.map((t: string) => t.toLowerCase())
      : [];

    const matchesKeywords = 
      title.includes('vintage') || title.includes('y2k') || title.includes('retro') ||
      type.includes('vintage') || type.includes('y2k') || type.includes('retro') ||
      tags.some(t => t.includes('vintage') || t.includes('y2k') || t.includes('retro'));

    return matchesKeywords;
  };

  const getProductPriceAED = (product: any): number => {
    // Check various common fields
    const val = product.price || product.shopify?.price || "150";
    return parseFloat(val);
  };

  // Filtered List based on specifications: Price > AED 200 and matches vintage style
  const suggestions = shopifyProducts.filter(p => {
    const priceAED = getProductPriceAED(p);
    const hasVintageStyle = isVintageCategory(p);
    return priceAED >= 200 && hasVintageStyle;
  });

  // Calculate eBay listing price formula: (AED / 3.67) * 1.35
  const calculateEbayPriceUSD = (priceAED: number): string => {
    const usdVal = priceAED / 3.67;
    return (usdVal * 1.35).toFixed(2);
  };

  const handleToggleSelectAll = () => {
    if (selectedProductIds.length === suggestions.length) {
      setSelectedProductIds([]);
    } else {
      setSelectedProductIds(suggestions.map(s => s.id));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    if (selectedProductIds.includes(id)) {
      setSelectedProductIds(prev => prev.filter(item => item !== id));
    } else {
      setSelectedProductIds(prev => [...prev, id]);
    }
  };

  const handleSaveEbayConfig = async (updatedFields: Partial<EbayConfig>) => {
    try {
      const res = await fetch('/api/ebay/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedFields)
      });
      if (res.ok) {
        const data = await res.json();
        setEbayConfig({
          ebayConnected: data.config.ebayConnected,
          ebayAccount: data.config.ebayAccount,
          ebayAutomationEnabled: data.config.ebayAutomationEnabled
        });
        setSuccessMessage("eBay account and settings updated successfully.");
      }
    } catch (e) {
      setErrorMessage("Failed to save eBay connection configuration.");
    }
  };

  const handleConnectAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ebayAccountInput.trim()) {
      setErrorMessage("Please enter a valid eBay seller account ID.");
      return;
    }
    setIsConnecting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    
    // Simulate API handshaking
    setTimeout(() => {
      handleSaveEbayConfig({
        ebayConnected: true,
        ebayAccount: ebayAccountInput.trim()
      });
      setIsConnecting(false);
    }, 800);
  };

  const handleDisconnectAccount = () => {
    handleSaveEbayConfig({
      ebayConnected: false,
      ebayAccount: null
    });
    setEbayAccountInput('');
  };

  // Push Selected/Bulk listings to eBay
  const handlePushToEbay = async (itemsToPush: any[]) => {
    if (itemsToPush.length === 0) return;
    if (!ebayConfig.ebayConnected) {
      setErrorMessage("Please link and authorize your eBay merchant account before pushing listings.");
      return;
    }

    setIsPushing(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/ebay/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: itemsToPush })
      });

      if (!res.ok) {
        throw new Error("eBay listing sandbox returned communication failure.");
      }

      const data = await res.json();
      setSuccessMessage(`Successfully listed ${data.listedCount} vintage garments onto eBay! Check logs below.`);
      setSyncLogs(prev => [...data.logs, ...prev]);
      setSelectedProductIds([]);
      onRefreshProducts();
    } catch (e: any) {
      setErrorMessage(e.message || "Failed during eBay bulk upload push.");
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <div className="space-y-6 font-sans text-left" id="ebay-integration-tab">
      
      {/* Header and overview */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 pb-4">
        <div>
          <h2 className="text-base font-bold text-zinc-900 tracking-tight flex items-center gap-2">
            <Globe className="w-5 h-5 text-[#008060]" />
            EBAY MULTI-CHANNEL LISTING ENGINE
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Cross-list premium vintage products with automatic currency conversions and smart retail markups.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {ebayConfig.ebayConnected ? (
            <span className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold uppercase tracking-wider rounded-xl flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
              Linked: {ebayConfig.ebayAccount}
            </span>
          ) : (
            <span className="px-3 py-1 bg-rose-50 text-rose-800 border border-rose-200 text-[10px] font-bold uppercase tracking-wider rounded-xl">
              Merchant Disconnected
            </span>
          )}
        </div>
      </div>

      {/* Action Logs Banner Notifications */}
      {successMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-start gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-start gap-2 animate-fade-in">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Grid: 1. Account Settings & Formula, 2. Vintage Suggestions List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Hand: Config Panel & Live Pricing Tool */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* eBay Account Integration Card */}
          <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-4">
            <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider flex items-center gap-1.5">
              <Settings className="w-4 h-4 text-[#008060]" />
              eBay Account Linking
            </h3>

            {!ebayConfig.ebayConnected ? (
              <form onSubmit={handleConnectAccount} className="space-y-3">
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Authorize connection with your international eBay seller sandbox to directly publish approved products.
                </p>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block">Seller ID (Sandbox/Prod)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., fashion_rerun_merchant"
                    value={ebayAccountInput}
                    onChange={e => setEbayAccountInput(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:outline-none focus:border-[#008060] focus:bg-white transition"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isConnecting}
                  className="w-full py-2 bg-[#008060] hover:bg-[#006e52] text-white text-[11px] font-bold uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center justify-center gap-1"
                >
                  {isConnecting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    "Authorize Store"
                  )}
                </button>
              </form>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-left">
                  <div className="text-[10px] text-zinc-400 font-mono">AUTHORIZED MERCHANT</div>
                  <div className="text-xs font-bold text-zinc-800 mt-0.5">{ebayConfig.ebayAccount}</div>
                  <div className="text-[9px] text-zinc-500 font-mono mt-1">Status: Operational Active</div>
                </div>
                <button
                  onClick={handleDisconnectAccount}
                  className="w-full py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold uppercase tracking-wider rounded-xl transition cursor-pointer"
                >
                  Unlink Merchant Profile
                </button>
              </div>
            )}
          </div>

          {/* Pricing Formula details card */}
          <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-3.5">
            <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider flex items-center gap-1.5">
              <ArrowLeftRight className="w-4 h-4 text-[#008060]" />
              Smart Formula Appraiser
            </h3>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Standard vintage criteria: Category equals **Vintage, Y2K, or Retro** and price is strictly greater than **AED 200 (~$55)**.
            </p>
            
            <div className="p-3.5 bg-[#FAFAFA] border border-zinc-200 rounded-xl space-y-2">
              <div className="text-[9px] text-zinc-400 font-extrabold uppercase tracking-widest">Active Formula Standard</div>
              <div className="text-xs font-mono font-bold text-zinc-800">
                eBay USD = (AED ÷ 3.67) × 1.35
              </div>
              <div className="text-[10px] text-zinc-500 leading-normal">
                Includes currency exchange buffer from AED Dirhams to US Dollars, plus flat 35% premium markup on cross-listed items.
              </div>
            </div>

            {/* Automation Toggle and options */}
            <div className="pt-2 border-t border-zinc-100 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-zinc-800 block">Listing Automation</span>
                <span className="text-[10px] text-zinc-400">Auto-approve/push to eBay</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={ebayConfig.ebayAutomationEnabled}
                  onChange={e => handleSaveEbayConfig({ ebayAutomationEnabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-zinc-300 rounded-full peer peer-focus:ring-2 peer-focus:ring-emerald-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#008060]"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Right Hand: Cross-List Recommendations and suggestions table */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-4 shadow-xs">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-3">
              <div>
                <h3 className="text-xs font-extrabold text-zinc-950 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckSquare className="w-4 h-4 text-[#008060]" />
                  eBay Suggestion Desk ({suggestions.length} items found)
                </h3>
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  The following items qualify based on category metadata and retail threshold &gt; AED 200.
                </p>
              </div>

              {suggestions.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleToggleSelectAll}
                    className="px-2.5 py-1.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 rounded-lg text-[10px] font-bold uppercase transition border border-zinc-200"
                  >
                    {selectedProductIds.length === suggestions.length ? "Deselect All" : "Select All"}
                  </button>
                  <button
                    onClick={() => handlePushToEbay(suggestions.filter(s => selectedProductIds.includes(s.id)))}
                    disabled={selectedProductIds.length === 0 || isPushing}
                    className="px-3 py-1.5 bg-[#008060] hover:bg-[#006e52] text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition disabled:opacity-50 flex items-center gap-1"
                  >
                    {isPushing ? (
                      <>
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Pushing...
                      </>
                    ) : (
                      `Bulk Push (${selectedProductIds.length})`
                    )}
                  </button>
                </div>
              )}
            </div>

            {suggestions.length === 0 ? (
              <div className="py-12 text-center text-zinc-400 space-y-1.5">
                <ShoppingBag className="w-8 h-8 text-zinc-300 mx-auto" />
                <h4 className="text-xs font-bold text-zinc-700 uppercase">No Cross-List Suggestion Available</h4>
                <p className="text-[11px] text-zinc-500 max-w-sm mx-auto">
                  Only premium listings tagged as Vintage/Y2K/Retro with prices exceeding AED 200 qualify for international cross-listing recommendations.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {suggestions.map((p) => {
                  const priceAED = getProductPriceAED(p);
                  const ebayPriceUSD = calculateEbayPriceUSD(priceAED);
                  const isSelected = selectedProductIds.includes(p.id);

                  return (
                    <div 
                      key={p.id} 
                      className={`p-3 border.5 rounded-xl flex items-center justify-between transition ${
                        isSelected 
                          ? 'border-[#008060] bg-emerald-50/20' 
                          : 'border-zinc-200 hover:border-[#008060] bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3 truncate pr-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectOne(p.id)}
                          className="w-3.5 h-3.5 accent-[#008060] shrink-0 cursor-pointer"
                        />
                        {p.imageUrl ? (
                          <img 
                            src={p.imageUrl} 
                            alt={p.title} 
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 object-cover rounded-lg border border-zinc-200 shrink-0" 
                          />
                        ) : (
                          <div className="w-10 h-10 bg-zinc-100 rounded-lg shrink-0 flex items-center justify-center">
                            <ShoppingBag className="w-4 h-4 text-zinc-400" />
                          </div>
                        )}
                        <div className="truncate">
                          <h4 className="text-xs font-bold text-zinc-800 truncate max-w-[280px]">{p.title}</h4>
                          <div className="flex items-center gap-2 mt-0.5 text-[9px] text-zinc-500 font-mono">
                            <span className="px-1.5 py-0.5 bg-zinc-100 text-zinc-600 rounded">AED {priceAED.toFixed(2)}</span>
                            <span className="text-zinc-400">➔</span>
                            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold">eBay: ${ebayPriceUSD} USD</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handlePushToEbay([p])}
                          disabled={!ebayConfig.ebayConnected || isPushing}
                          className="px-2.5 py-1.5 bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-300 rounded-lg text-[9px] font-bold uppercase tracking-wider transition disabled:opacity-50"
                        >
                          Push Single
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sync log records audit trail */}
          {syncLogs.length > 0 && (
            <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-2.5">
              <h4 className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest text-left">Live eBay Synchronization Logs</h4>
              <div className="bg-zinc-900 border border-zinc-800 text-zinc-100 p-3 rounded-xl font-mono text-[9px] max-h-32 overflow-y-auto space-y-1 text-left">
                {syncLogs.map((log, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[#82f5bc]">
                    <span>[SUCCESS] Cross-listed Item {log.ebayItemId} ({log.title})</span>
                    <span>Price: ${log.ebayPriceUSD} USD</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
