import React, { useState, useEffect } from 'react';
import { Layers, Calendar, ShoppingBag, Eye, Download, Search, CheckCircle2, FileText } from 'lucide-react';

interface BatchItem {
  id: string;
  name: string;
  productCount: number;
  uploadDate: string;
  status: string;
  products: {
    title: string;
    brand?: string;
    price?: string;
    category?: string;
    imageUrl?: string;
  }[];
}

export default function CompletedBatches() {
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchBatches = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/batches');
      if (res.ok) {
        const data = await res.json();
        setBatches(data);
      }
    } catch (e) {
      console.error("Failed to load completed batches", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBatches();
  }, []);

  const activeBatch = batches.find(b => b.id === selectedBatchId) || null;

  // Filter batches based on search
  const filteredBatches = batches.filter(b => 
    b.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    b.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Export batch metadata to CSV
  const exportToCSV = (batch: BatchItem) => {
    const headers = ['SKU', 'Title', 'Brand', 'Price (AED)', 'Category', 'Image URL'];
    const rows = batch.products.map((p, idx) => [
      `SKU-${batch.id.substring(6, 12)}-${idx + 1}`,
      `"${(p.title || 'Vintage Garment').replace(/"/g, '""')}"`,
      p.brand || 'Vintage',
      p.price || '150.00',
      p.category || 'Apparel',
      p.imageUrl || ''
    ]);

    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${batch.name.replace(/\s+/g, '_')}_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export batch metadata to JSON
  const exportToJSON = (batch: BatchItem) => {
    const blob = new Blob([JSON.stringify(batch, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${batch.name.replace(/\s+/g, '_')}_export.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 font-sans text-left" id="completed-batches-tab">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 pb-4">
        <div>
          <h2 className="text-base font-bold text-zinc-900 tracking-tight flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#008060]" />
            COMPLETED BATCHES DATABASE
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Query, audit, and export successfully processed clothing upload folders.
          </p>
        </div>
        <button
          onClick={fetchBatches}
          className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer self-start md:self-auto shadow-xs"
        >
          Refresh DB
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Batches List */}
        <div className="lg:col-span-5 space-y-4">
          <div className="relative">
            <Search className="absolute top-2.5 left-3 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search by batch name or ID..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-300 rounded-xl text-xs focus:outline-none focus:border-[#008060] focus:ring-1 focus:ring-[#008060] transition"
            />
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-xs text-zinc-400">
              Loading batches from database...
            </div>
          ) : filteredBatches.length === 0 ? (
            <div className="bg-white border border-zinc-200 rounded-2xl p-8 text-center text-zinc-400">
              <FileText className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
              <p className="text-xs">No batches found in the workspace.</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[550px] overflow-y-auto pr-1">
              {filteredBatches.map(batch => (
                <div
                  key={batch.id}
                  onClick={() => setSelectedBatchId(batch.id)}
                  className={`p-4 border rounded-2xl text-left cursor-pointer transition flex items-center justify-between ${
                    selectedBatchId === batch.id
                      ? 'bg-zinc-900 border-zinc-900 text-white shadow-md'
                      : 'bg-white border-zinc-200 text-zinc-800 hover:border-[#008060] hover:shadow-xs'
                  }`}
                >
                  <div className="space-y-1.5 truncate pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs truncate max-w-[200px]">{batch.name}</span>
                      <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-500 rounded-full text-[9px] font-bold font-mono">
                        {batch.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-zinc-400 font-mono">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-zinc-400 shrink-0" />
                        {new Date(batch.uploadDate).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <ShoppingBag className="w-3 h-3 text-zinc-400 shrink-0" />
                        {batch.productCount} items
                      </span>
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 shrink-0 ${selectedBatchId === batch.id ? 'text-[#008060]' : 'text-zinc-400'}`} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Side: Batch Details and Contents */}
        <div className="lg:col-span-7">
          {activeBatch ? (
            <div className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-5 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 pb-4">
                <div className="space-y-1 text-left">
                  <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest font-mono">Batch Details</div>
                  <h3 className="text-sm font-extrabold text-zinc-900 leading-tight">{activeBatch.name}</h3>
                  <div className="text-[10px] text-zinc-500 font-mono">ID: {activeBatch.id}</div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => exportToCSV(activeBatch)}
                    className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-[#008060] rounded-xl text-[10px] font-bold uppercase tracking-wider transition flex items-center gap-1.5 border border-emerald-200"
                    title="Export CSV"
                  >
                    <Download className="w-3.5 h-3.5" />
                    CSV
                  </button>
                  <button
                    onClick={() => exportToJSON(activeBatch)}
                    className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-[10px] font-bold uppercase tracking-wider transition flex items-center gap-1.5 border border-blue-200"
                    title="Export JSON"
                  >
                    <Download className="w-3.5 h-3.5" />
                    JSON
                  </button>
                </div>
              </div>

              {/* Products content list inside active batch */}
              <div className="space-y-3">
                <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest text-left">Batch Contents</div>
                
                <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                  {activeBatch.products.map((p, idx) => (
                    <div 
                      key={idx} 
                      className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl flex items-center justify-between hover:bg-zinc-100/50 transition text-left"
                    >
                      <div className="flex items-center gap-3 truncate pr-2">
                        {p.imageUrl ? (
                          <img 
                            src={p.imageUrl} 
                            alt={p.title} 
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 object-cover rounded-lg border border-zinc-200 shrink-0" 
                          />
                        ) : (
                          <div className="w-10 h-10 bg-zinc-200 rounded-lg flex items-center justify-center shrink-0">
                            <Layers className="w-5 h-5 text-zinc-400" />
                          </div>
                        )}
                        <div className="truncate">
                          <h4 className="text-xs font-bold text-zinc-800 truncate max-w-[280px]">{p.title}</h4>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-500 font-mono">
                            <span>{p.brand || 'Vintage'}</span>
                            <span>•</span>
                            <span>{p.category || 'Apparel'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-extrabold text-[#008060] font-mono">AED {p.price || '150.00'}</div>
                        <div className="text-[9px] text-zinc-400 mt-0.5 font-mono">SKU-{idx + 1}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center text-zinc-400 h-full flex flex-col items-center justify-center space-y-3">
              <div className="p-4 bg-zinc-50 rounded-full border border-zinc-100">
                <Eye className="w-8 h-8 text-zinc-400" />
              </div>
              <h3 className="text-xs font-bold text-zinc-700 uppercase">Select a Folder Batch</h3>
              <p className="text-xs text-zinc-500 max-w-xs leading-normal">
                Click on any of the successfully processed folder batches on the left panel to inspect listing contents, image resources, and export assets.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg 
      className={className} 
      xmlns="http://www.w3.org/2000/svg" 
      fill="none" 
      viewBox="0 0 24 24" 
      strokeWidth={2} 
      stroke="currentColor" 
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}
