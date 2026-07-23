import React, { useState, useEffect } from 'react';
import { UploadedView, AIResult, ImageProcessingConfig, AuditRecord, StudioConfig, TaxonomyMapping } from './types';
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';
import BatchStudio from './components/BatchStudio';
import AdminConfig from './components/AdminConfig';
import TestSuite from './components/TestSuite';
import UserAuth, { UserSession } from './components/UserAuth';
import CompletedBatches from './components/CompletedBatches';
import EbaySuggestions from './components/EbaySuggestions';
import MasterAdmin from './components/MasterAdmin';
import ClientCredits from './components/ClientCredits';
import CompanyAdmin from './components/CompanyAdmin';
import { convertToOldSchema } from './utils/schemaMapper';
import { generateTitle, generateHtmlDescription, getCanonicalTags } from './utils';
import { 
  Sparkles, Settings2, ShieldCheck, HelpCircle, RefreshCw, FileText, CheckCircle2, History, AlertCircle,
  Menu, X, Layers, Activity, BookOpen, Globe, CheckSquare, CreditCard, Wallet, Users
} from 'lucide-react';

function parseStoredImageName(filename: string) {
  const dot = filename.lastIndexOf('.');
  const base = dot >= 0 ? filename.slice(0, dot) : filename;
  const match = base.match(/^([a-zA-Z0-9_-]*?)([a-fA-F])$/);
  if (match && match[1]) return { sku: match[1].replace(/[_-]+$/, '').toUpperCase(), sequence: match[2].toLowerCase() };
  return { sku: base.toUpperCase(), sequence: '' };
}

function labelForSequence(sequence: string, fallback: UploadedView['label']): UploadedView['label'] {
  return ({ a: 'Front', b: 'Back', c: 'Neck Label', d: 'Wash Tag', e: 'Detail', f: 'Flaw' } as Record<string, UploadedView['label']>)[sequence] || fallback;
}


export default function App() {
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'BATCH' | 'COMPLETED_BATCHES' | 'EBAY_SUGGESTIONS' | 'TEST_SUITE' | 'ADMIN' | 'MASTER_ADMIN' | 'COMPANY_ADMIN' | 'CLIENT_CREDITS'>('DASHBOARD');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  
  // State variables
  const [views, setViews] = useState<UploadedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [imgConfig, setImgConfig] = useState<ImageProcessingConfig>({
    bgColor: '#f4f4f5',
    scale: 0.82,
    shadowEnabled: true,
    shadowIntensity: 0.4,
    rotation: 0,
  });

  const [aiResult, setAIResult] = useState<AIResult | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedLink, setPublishedLink] = useState<{ url: string; id: string } | null>(null);
  
  // Settings & DB from server
  const [mappings, setMappings] = useState<TaxonomyMapping[]>([]);
  const [config, setConfig] = useState<StudioConfig>({
    mappings: [],
    titleMaxLength: 140,
    vintageEraMigrationEnabled: false,
    colorTolerance: 2.0,
    geminiModel: 'gemini-3.6-flash',
  });
  const [auditLogs, setAuditLogs] = useState<AuditRecord[]>([]);
  const [shopifyProducts, setShopifyProducts] = useState<any[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Local full-screen Authentication states
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authFullName, setAuthFullName] = useState('');
  const [authRole, setAuthRole] = useState('Listing Operator');
  const [authCompanyName, setAuthCompanyName] = useState('');
  const [authIsRegister, setAuthIsRegister] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [registeredUsers, setRegisteredUsers] = useState<any[]>([]);

  const fetchRegisteredUsers = async () => {
    try {
      const res = await fetch('/api/auth/users');
      if (res.ok) {
        const data = await res.json();
        setRegisteredUsers(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!currentUser) {
      fetchRegisteredUsers();
    }
  }, [currentUser]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);

    if (!authUsername.trim() || !authPassword.trim()) {
      setAuthError("Please fill in both fields.");
      return;
    }

    if (authIsRegister && !authFullName.trim()) {
      setAuthError("Full Name is required for registration.");
      return;
    }

    const endpoint = authIsRegister ? '/api/auth/register' : '/api/auth/login';
    const payload = authIsRegister
      ? { username: authUsername.trim(), password: authPassword, fullName: authFullName.trim(), role: authRole, companyName: authCompanyName.trim() }
      : { username: authUsername.trim(), password: authPassword };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || "Authentication failed.");
        return;
      }

      if (authIsRegister) {
        setAuthSuccess("Registration successful! You can now log in below.");
        setAuthIsRegister(false);
        setAuthPassword('');
        fetchRegisteredUsers();
      } else {
        localStorage.setItem("fr_session_token", data.token);
        setCurrentUser(data.user);
      }
    } catch (err) {
      setAuthError("Failed to connect to authentication server.");
    }
  };

  // Load backend configurations
  const loadConfigAndAudits = async () => {
    try {
      const configRes = await fetch('/api/config');
      const configData = await configRes.json();
      setMappings(configData.mappings);
      setConfig({
        mappings: configData.mappings,
        titleMaxLength: configData.config.titleMaxLength,
        vintageEraMigrationEnabled: configData.config.vintageEraMigrationEnabled,
        colorTolerance: configData.config.colorTolerance,
        geminiModel: configData.config.geminiModel,
        shopName: configData.config.shopName,
        accessToken: configData.config.accessToken,
        defaultVendor: configData.config.defaultVendor,
      });

      const auditRes = await fetch('/api/audit-logs');
      const auditData = await auditRes.json();
      setAuditLogs(auditData);
      const prodRes = await fetch('/api/shopify/products');
      const prodData = await prodRes.json();
      setShopifyProducts(prodData);
    } catch (e: any) {
      console.error("Failed to load backend databases.", e);
    }
  };

  useEffect(() => {
    loadConfigAndAudits();
  }, []);

  // Update administrative mappings
  const handleUpdateMappings = async (newMappings: TaxonomyMapping[]) => {
    try {
      setMappings(newMappings);
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: newMappings }),
      });
      loadConfigAndAudits();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateConfig = async (newConfig: Partial<StudioConfig>) => {
    try {
      const apiPayload: any = {};
      if (newConfig.titleMaxLength !== undefined) apiPayload.titleMaxLength = newConfig.titleMaxLength;
      if (newConfig.vintageEraMigrationEnabled !== undefined) apiPayload.vintageEraMigrationEnabled = newConfig.vintageEraMigrationEnabled;
      if (newConfig.colorTolerance !== undefined) apiPayload.colorTolerance = newConfig.colorTolerance;
      if (newConfig.geminiModel !== undefined) apiPayload.geminiModel = newConfig.geminiModel;
      if (newConfig.shopName !== undefined) apiPayload.shopName = newConfig.shopName;
      if (newConfig.accessToken !== undefined) apiPayload.accessToken = newConfig.accessToken;
      if (newConfig.defaultVendor !== undefined) apiPayload.defaultVendor = newConfig.defaultVendor;

      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: apiPayload }),
      });
      const data = await res.json();
      if (data.autoSyncReport) {
        console.log("[Shopify Auto-Sync] Store details synced:", data.autoSyncReport);
      }
      loadConfigAndAudits();
    } catch (e) {
      console.error(e);
    }
  };

  const handleClearLogs = async () => {
    try {
      await fetch('/api/audit-logs', { method: 'DELETE' });
      loadConfigAndAudits();
    } catch (e) {
      console.error(e);
    }
  };

  // Upload/Add Garment view photos and run segmentations
  const handleAddViews = async (files: FileList) => {
    setErrorMessage(null);
    const newViews: UploadedView[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Basic validation
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic'];
      if (!validTypes.includes(file.type) && !file.name.toLowerCase().endsWith('.heic')) {
        setErrorMessage("Image rejected: Unsupported file format detected.");
        continue;
      }
      if (file.size > 50 * 1024 * 1024) {
        setErrorMessage("Image rejected: Exceeds 50MB file size limits.");
        continue;
      }

      const base64 = await toBase64(file);
      const viewId = `view_${Date.now()}_${i}`;
      const parsedName = parseStoredImageName(file.name);

      let autoLabel: UploadedView['label'] = 'Front';
      const existingLabels = views.map(v => v.label);
      if (existingLabels.includes('Front')) {
        if (!existingLabels.includes('Back')) autoLabel = 'Back';
        else if (!existingLabels.includes('Neck Label')) autoLabel = 'Neck Label';
        else autoLabel = 'Detail';
      }
      autoLabel = labelForSequence(parsedName.sequence, autoLabel);

      const storeRes = await fetch('/api/images/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataUrl: base64,
          sku: parsedName.sku,
          filename: file.name,
          sequence: parsedName.sequence,
          label: autoLabel,
          kind: 'original'
        })
      });
      const storeData = await storeRes.json();
      if (!storeRes.ok) throw new Error(storeData.error || `Could not store ${file.name}.`);
      const stored = storeData.image;

      const tempView: UploadedView = {
        id: viewId,
        url: stored.url,
        originalUrl: stored.url,
        filename: file.name,
        sku: parsedName.sku,
        sequence: parsedName.sequence,
        storageId: stored.id,
        label: autoLabel,
        processing: true
      };

      newViews.push(tempView);
    }

    if (newViews.length === 0) return;

    setViews(prev => {
      const updated = [...prev, ...newViews];
      if (!activeViewId) {
        setActiveViewId(newViews[0].id);
      }
      return updated;
    });

    // Run deterministic background segmentation on uploaded images
    for (const view of newViews) {
      try {
        const processRes = await fetch('/api/image/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageUrl: view.url,
            sku: view.sku,
            filename: view.filename,
            sequence: view.sequence,
            label: view.label,
            config: {
              bgColor: imgConfig.bgColor,
              scale: imgConfig.scale,
              shadowEnabled: imgConfig.shadowEnabled,
              shadowIntensity: imgConfig.shadowIntensity,
              colorTolerance: config.colorTolerance
            }
          })
        });
        const processData = await processRes.json();
        
        setViews(prev => prev.map(v => {
          if (v.id === view.id) {
            return {
              ...v,
              url: processData.processedUrl,
              processing: false
            };
          }
          return v;
        }));
      } catch (err) {
        console.error("Studio segmentation failed", err);
        setViews(prev => prev.map(v => {
          if (v.id === view.id) {
            return {
              ...v,
              processing: false,
              error: "Segmentation server timed out. Preserving photograph dimensions."
            };
          }
          return v;
        }));
      }
    }
  };

  const handleAddGeneratedView = async (base64: string, label: string) => {
    const viewId = `view_${Date.now()}`;
    const sku = views[0]?.sku || 'MODEL';
    const filename = `${sku}-ai-model-${Date.now()}.jpg`;
    try {
      const storeRes = await fetch('/api/images/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: base64, sku, filename, label, kind: 'model' })
      });
      const storeData = await storeRes.json();
      if (!storeRes.ok) throw new Error(storeData.error || 'Could not store AI model image.');
      const newView: UploadedView = {
        id: viewId,
        url: storeData.image.url,
        originalUrl: storeData.image.url,
        filename,
        sku,
        storageId: storeData.image.id,
        label: 'Detail',
        processing: false
      };
      setViews(prev => [...prev, newView]);
      setActiveViewId(viewId);
    } catch (error: any) {
      setErrorMessage(error.message || 'Could not store AI model image.');
    }
  };

  const handleProcessedViewChange = async (viewId: string, dataUrl: string) => {
    const view = views.find(v => v.id === viewId);
    if (!view || !dataUrl.startsWith('data:image/')) return;
    const sku = view.sku || 'UNASSIGNED';
    const stem = (view.filename || `${sku}-${viewId}.jpg`).replace(/\.[^.]+$/, '');
    try {
      const response = await fetch('/api/images/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataUrl, sku, filename: `${stem}-processed.png`, sequence: view.sequence, label: view.label, kind: 'processed'
        })
      });
      const data = await response.json();
      if (!response.ok) return;
      setViews(prev => prev.map(item => item.id === viewId ? { ...item, processedUrl: data.image.url, processedStorageId: data.image.id } : item));
    } catch { }
  };

  const handleUpdateViewLabel = (id: string, label: UploadedView['label']) => {
    setViews(prev => prev.map(v => v.id === id ? { ...v, label } : v));
  };

  const handleRemoveView = (id: string) => {
    setViews(prev => {
      const filtered = prev.filter(v => v.id !== id);
      if (activeViewId === id) {
        setActiveViewId(filtered[0]?.id || null);
      }
      return filtered;
    });
  };

  const toBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  // Re-run segmentation helper
  const handleRerunSegmentation = async () => {
    if (!activeViewId) return;
    const view = views.find(v => v.id === activeViewId);
    if (!view) return;

    setViews(prev => prev.map(v => v.id === activeViewId ? { ...v, processing: true } : v));

    try {
      const processRes = await fetch('/api/image/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: view.originalUrl,
          sku: view.sku,
          filename: view.filename,
          sequence: view.sequence,
          label: view.label,
          config: {
            bgColor: imgConfig.bgColor,
            scale: imgConfig.scale,
            shadowEnabled: imgConfig.shadowEnabled,
            shadowIntensity: imgConfig.shadowIntensity,
            colorTolerance: config.colorTolerance
          }
        })
      });
      const processData = await processRes.json();
      
      setViews(prev => prev.map(v => {
        if (v.id === activeViewId) {
          return {
            ...v,
            url: processData.processedUrl,
            processing: false
          };
        }
        return v;
      }));
    } catch (e) {
      console.error(e);
      setViews(prev => prev.map(v => v.id === activeViewId ? { ...v, processing: false } : v));
    }
  };

  // Trigger Gemini vision analysis to generate Shopify fields
  const refreshCurrentUserCredits = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/auth/users');
      if (res.ok) {
        const users = await res.json();
        const updatedMe = users.find((u: any) => u.username.toLowerCase() === currentUser.username.toLowerCase());
        if (updatedMe) {
          const clientRes = await fetch('/api/admin/clients');
          if (clientRes.ok) {
            const clients = await clientRes.json();
            const myClient = clients.find((c: any) => c.id === updatedMe.clientId);
            if (myClient) {
              setCurrentUser(prev => prev ? {
                ...prev,
                creditBalance: myClient.creditBalance
              } : null);
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to refresh user credits in app layout state", e);
    }
  };

  const handleTriggerAIVision = async () => {
    if (views.length === 0) return;
    setIsCompiling(true);
    setErrorMessage(null);

    const payloadImages = views.map(v => ({
      base64: v.originalUrl,
      label: v.label
    }));

    try {
      const aiRes = await fetch('/api/gemini/generate-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: payloadImages,
          model: config.geminiModel,
          clientId: currentUser?.clientId,
          username: currentUser?.username,
          promptConfig: {
            isMigrationMode: config.vintageEraMigrationEnabled,
            titleMaxLength: config.titleMaxLength,
            sku: views[0]?.sku || "VNTG-APP-01"
          }
        })
      });

      if (!aiRes.ok) {
        const errData = await aiRes.json();
        throw new Error(errData.error || errData.details || "AI Vision compilation failed.");
      }

      const rawAiData = await aiRes.json();
      const gallery = views.map(v => v.processedUrl || v.url).filter(Boolean);
      if (rawAiData?.schemaVersion === '3.0.0') {
        rawAiData.shopifyProduct = {
          ...rawAiData.shopifyProduct,
          imageUrl: gallery[0] || '',
          imageUrls: Array.from(new Set([...(rawAiData.shopifyProduct?.imageUrls || []), ...gallery]))
        };
      } else {
        rawAiData.imageUrl = gallery[0] || '';
      }
      // Keep the master v3 schema intact so taxonomy, editable review fields, confidence, and media are not lost.
      setAIResult(rawAiData);
      refreshCurrentUserCredits();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Failed to appraise garment. Confirm API secrets configuration.");
    } finally {
      setIsCompiling(false);
    }
  };

  // Create Shopify draft with Status contract locking
  const handlePublishDraft = async (operatorName: string) => {
    if (!aiResult) return;
    setIsPublishing(true);
    setErrorMessage(null);

    const master: any = aiResult as any;
    const product = master.schemaVersion === "3.0.0" ? master.shopifyProduct : master.shopify;
    const source = master.schemaVersion === "3.0.0" ? master.sourceData : master.classification;
    const imageUrls = Array.from(new Set([
      ...(product.imageUrls || []),
      ...views.map(v => v.processedUrl || v.url).filter(Boolean),
      product.imageUrl
    ].filter(Boolean)));
    const stableIdentity = String(product.sku || product.title || views[0]?.id || 'product').trim().toLowerCase();
    const idempotencyKey = `publish_${stableIdentity.replace(/[^a-z0-9]+/g, '_').slice(0, 80)}`;
    const size = source.taggedSize || source.tagged_size || "One Size";

    const finalProductPayload = master.schemaVersion === "3.0.0" ? {
      ...master,
      shopifyProduct: {
        ...product,
        imageUrl: imageUrls[0] || '',
        imageUrls,
        quantity: Number(product.quantity ?? 1),
        status: product.status || 'DRAFT'
      }
    } : {
      title: product.title,
      descriptionHtml: product.descriptionHtml || product.description_html,
      vendor: product.vendor,
      product_type: product.productType || product.product_type,
      category: product.category || '',
      tags: product.tags || [],
      status: product.status || 'DRAFT',
      price: product.variants?.[0]?.price || product.price,
      compareAtPrice: product.compareAtPrice || '',
      sku: product.variants?.[0]?.sku || product.sku,
      barcode: product.variants?.[0]?.barcode || product.barcode || '',
      quantity: Number(product.quantity ?? product.variants?.[0]?.inventory_quantity ?? 1),
      metafields: product.metafields || [],
      imageUrl: imageUrls[0] || '',
      imageUrls,
      size
    };

    try {
      const publishRes = await fetch('/api/shopify/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: finalProductPayload,
          operator: operatorName,
          idempotencyKey
        })
      });

      if (!publishRes.ok) {
        const errData = await publishRes.json();
        throw new Error(errData.error || "Shopify draft creation failed.");
      }

      const publishData = await publishRes.json();
      setPublishedLink({
        url: publishData.adminUrl,
        id: publishData.productId
      });

      // Reload config & logs
      loadConfigAndAudits();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "GraphQL Admin API returned error codes.");
    } finally {
      setIsPublishing(false);
    }
  };

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 border-r border-zinc-800 p-4 justify-between font-sans">
      <div className="space-y-6">
        {/* Brand Header */}
        <div className="pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-brand-green shrink-0 animate-pulse"></div>
            <span className="font-extrabold tracking-tight text-white text-base">Listify AI</span>
          </div>
          <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-widest block mt-1">
            Image-to-Listing Studio
          </span>
          <div className="text-[9px] text-zinc-500 mt-1.5 leading-relaxed">
            Multi-Tenant AI Catalog Compiler &amp; Fashion Model Synthesizer
          </div>
        </div>

        {/* Tab Selectors */}
        <div className="space-y-1">
          <span className="block text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2 pl-2">
            Workspaces
          </span>
          {[
            { id: 'DASHBOARD', name: 'SINGLE STUDIO', icon: Sparkles },
            { id: 'BATCH', name: 'BATCH STUDIO', icon: Layers },
            { id: 'COMPLETED_BATCHES', name: 'COMPLETED BATCHES', icon: Layers },
            { id: 'EBAY_SUGGESTIONS', name: 'EBAY CROSS-LISTING', icon: Globe },
            { id: 'TEST_SUITE', name: 'DIAGNOSTIC SUITE', icon: Activity },
            { id: 'ADMIN', name: 'ADMINISTRATION', icon: Settings2 },
            ...(currentUser?.role === 'Master Admin' ? [{ id: 'MASTER_ADMIN', name: 'SaaS MASTER PANEL', icon: ShieldCheck }] : []),
            ...((currentUser?.role === 'Sub Admin' || currentUser?.role === 'Store Administrator') ? [{ id: 'COMPANY_ADMIN', name: 'COMPANY ADMIN', icon: Users }] : []),
            ...(currentUser && currentUser.role !== 'Master Admin' ? [{ id: 'CLIENT_CREDITS', name: 'CREDIT WALLET', icon: CreditCard }] : [])
          ].map((tab) => {
            const IconComponent = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setPublishedLink(null);
                  setIsSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                  isActive 
                    ? 'bg-[#008060] text-white shadow-xs' 
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
                }`}
              >
                <IconComponent className="w-4 h-4 text-emerald-400" />
                <span>{tab.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Basic Authentication and Operator Profile */}
      <div className="mt-auto pt-4 border-t border-zinc-800 space-y-3">
        <span className="block text-[9px] font-bold text-zinc-500 uppercase tracking-widest pl-2">
          Operator Account
        </span>
        <UserAuth 
          currentUser={currentUser}
          onLogin={(user) => setCurrentUser(user)}
          onLogout={() => setCurrentUser(null)}
        />
      </div>
    </div>
  );

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 font-sans relative overflow-hidden" id="appraiser-auth-screen">
        {/* Decorative backdrop blobs */}
        <div className="absolute top-[-20%] left-[-15%] w-[50%] h-[50%] bg-[#008060]/10 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-15%] w-[50%] h-[50%] bg-blue-900/10 rounded-full blur-[140px] pointer-events-none" />

        <div className="w-full max-w-4xl bg-zinc-900/40 backdrop-blur-md border border-zinc-800/80 rounded-2xl shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-12">
          {/* Brand/Product marketing info panel */}
          <div className="md:col-span-5 bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 p-8 flex flex-col justify-between border-r border-zinc-800/80 text-left relative">
            <div className="space-y-6 relative z-10">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-[#008060] rounded-xl text-white shadow-md">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <span className="font-extrabold tracking-tight text-white text-base">ListifyCraft</span>
                  <span className="text-[10px] text-emerald-400 block -mt-1 font-mono font-bold tracking-widest">IMAGE-TO-LISTING STUDIO</span>
                </div>
              </div>

              <div className="space-y-4 pt-4">
                <h2 className="text-xl font-bold text-white leading-snug">
                  Professional Vintage Appraisal & Cataloging System
                </h2>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Enter the secure administrative environment to segment garment views, retrieve AI-backed brand credentials, and bulk syndicate active inventory channels.
                </p>
              </div>

              <div className="space-y-3 pt-4">
                <div className="flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-zinc-300">
                    <strong className="text-white block font-semibold">Gemini Vintage Engine</strong>
                    Analyze eras, stitch styles, and condition instantly.
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <Layers className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-zinc-300">
                    <strong className="text-white block font-semibold">Batch Queue Processor</strong>
                    Import directories and process bulk listing workflows.
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <Globe className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-zinc-300">
                    <strong className="text-white block font-semibold">Shopify & eBay Sync</strong>
                    Two-way automated cross-listing drafts creation.
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-8 border-t border-zinc-800/60 text-[10px] text-zinc-500 font-mono flex items-center justify-between z-10">
              <span>Secure Client Tunnel</span>
              <span className="text-emerald-500 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                ACTIVE
              </span>
            </div>
          </div>

          {/* Form Auth Controls Panel */}
          <div className="md:col-span-7 p-8 sm:p-10 bg-zinc-900/30 flex flex-col justify-center space-y-6 text-left">
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-white uppercase tracking-tight">
                {authIsRegister ? "Register New Account" : "Workspace Authentication"}
              </h3>
              <p className="text-xs text-zinc-400">
                {authIsRegister 
                  ? "Register a new tenant account to start cataloging and modeling garment inventory."
                  : "Provide your credentials to access your organization's listing studio."
                }
              </p>
            </div>

            {authError && (
              <div className="p-3 bg-rose-950/40 border border-rose-800/60 text-rose-300 rounded-xl text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4.5 h-4.5 text-rose-500 shrink-0 mt-0.5" />
                <span className="font-medium">{authError}</span>
              </div>
            )}

            {authSuccess && (
              <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 rounded-xl text-xs flex items-start gap-2.5">
                <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500 shrink-0 mt-0.5" />
                <span className="font-medium">{authSuccess}</span>
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block font-mono">Username</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. alex_vintage"
                  value={authUsername}
                  onChange={e => setAuthUsername(e.target.value)}
                  className="w-full px-3.5 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block font-mono">Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={e => setAuthPassword(e.target.value)}
                  className="w-full px-3.5 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              {authIsRegister && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block font-mono">Full Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Alex Carter"
                      value={authFullName}
                      onChange={e => setAuthFullName(e.target.value)}
                      className="w-full px-3.5 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500 transition"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block font-mono">Company / Business Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Fashion ReRun"
                      value={authCompanyName}
                      onChange={e => setAuthCompanyName(e.target.value)}
                      className="w-full px-3.5 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500 transition"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block font-mono">Operational Role</label>
                    <select
                      value={authRole}
                      onChange={e => setAuthRole(e.target.value)}
                      className="w-full px-3.5 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500 transition font-sans"
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
                className="w-full py-2.5 bg-[#008060] hover:bg-[#006e52] text-white text-xs font-bold uppercase tracking-wider rounded-lg transition duration-250 cursor-pointer shadow-md font-mono"
              >
                {authIsRegister ? "Confirm Registration" : "Enter Studio Workspace"}
              </button>
            </form>

            <div className="pt-4 border-t border-zinc-800/60 flex items-center justify-between text-xs">
              <span className="text-zinc-400">
                {authIsRegister ? "Already registered?" : "New tenant business?"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setAuthIsRegister(!authIsRegister);
                  setAuthError(null);
                  setAuthSuccess(null);
                }}
                className="text-emerald-400 hover:underline font-bold"
              >
                {authIsRegister ? "Sign In Instead" : "Create Account"}
              </button>
            </div>

            {/* Quick pre-configured accounts list for easy local testing/evaluation */}
            {registeredUsers.length > 0 && (
              <div className="pt-2 text-[10px] text-zinc-500">
                <span className="font-semibold block uppercase font-mono mb-1.5">Registered accounts (Click to fill):</span>
                <div className="flex flex-wrap gap-2">
                  {registeredUsers.map((u, i) => (
                    <span
                      key={i}
                      onClick={() => {
                        setAuthUsername(u.username);
                        setAuthPassword('');
                        setAuthIsRegister(false);
                      }}
                      className="px-2 py-1 bg-zinc-950 hover:bg-zinc-800 text-zinc-300 rounded border border-zinc-800 cursor-pointer transition font-mono"
                    >
                      {u.username} ({u.fullName})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F4F5] flex flex-col md:flex-row font-sans" id="studio-app-root">
      
      {/* Sidebar for Desktop */}
      <aside className="hidden md:block w-64 shrink-0 h-screen sticky top-0 z-30">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Header */}
      <header className="md:hidden bg-zinc-950 text-white border-b border-zinc-800 px-4 py-3 sticky top-0 z-40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded transition cursor-pointer"
            id="mobile-hamburger-btn"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div>
            <span className="font-extrabold tracking-tight text-white text-sm">Listify AI</span>
            <span className="text-[9px] text-zinc-400 block -mt-0.5 font-medium tracking-wider">Image-to-Listing Studio</span>
          </div>
        </div>
        <div className="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-1 rounded font-semibold uppercase tracking-wider">
          {activeTab}
        </div>
      </header>

      {/* Mobile Drawer Slide-out menu */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/60 transition-opacity"
            onClick={() => setIsSidebarOpen(false)}
          />
          {/* Menu Drawer */}
          <div className="relative w-64 max-w-xs bg-zinc-950 h-full shadow-2xl flex flex-col z-10 transition-transform duration-300 animate-slide-in">
            <div className="absolute top-3 right-3">
              <button 
                onClick={() => setIsSidebarOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-white rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {renderSidebarContent()}
          </div>
        </div>
      )}

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {/* Global Error Banner */}
          {errorMessage && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-800 text-xs shadow-xs">
              <AlertCircle className="w-4.5 h-4.5 text-rose-600 flex-shrink-0" />
              <div>
                <span className="font-bold uppercase tracking-wider text-rose-950 text-[10px]">Execution Error</span>
                <p className="text-rose-700 mt-0.5 font-semibold">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Dynamic Views based on tab selection */}
          {activeTab === 'DASHBOARD' && (
            <div className="space-y-4">
              {/* If published successfully, show rich receipt banner */}
              {publishedLink ? (
                <div className="bg-white border border-zinc-300 rounded p-6 max-w-xl mx-auto shadow-xs text-center space-y-4">
                  <div className="p-3 bg-green-50 text-brand-green rounded-full w-fit mx-auto border border-green-100">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-zinc-900 uppercase tracking-tight">Shopify Product Draft Published</h3>
                    <p className="text-xs text-zinc-500">
                      Your draft has been created in the Listify AI Shopify catalog.
                    </p>
                  </div>
                  <div className="p-4 bg-[#FAFAFA] rounded border border-zinc-300 font-mono text-xs text-left text-zinc-600 space-y-1.5">
                    <div>Status contract: <strong className="text-brand-green">DRAFT (Locked)</strong></div>
                    <div className="truncate">Product ID: <strong>{publishedLink.id}</strong></div>
                    <div>GraphQL Version: <strong>2026-07 (Configurable API)</strong></div>
                  </div>
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={() => {
                        setViews([]);
                        setActiveViewId(null);
                        setAIResult(null);
                        setPublishedLink(null);
                      }}
                      className="px-4 py-2 border border-zinc-300 text-zinc-700 rounded text-xs font-semibold uppercase tracking-wider hover:bg-zinc-50 transition cursor-pointer font-sans"
                    >
                      Reset Studio
                    </button>
                    <a
                      href={publishedLink.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-[#008060] text-white rounded text-xs font-semibold uppercase tracking-wider hover:bg-[#006e52] transition shadow-xs inline-flex items-center gap-1.5 font-sans"
                    >
                      Open in Shopify Admin
                    </a>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Trigger AI trigger button when raw images are uploaded but listing is empty */}
                  {views.length > 0 && !aiResult && (
                    <div className="bg-white border border-zinc-300 rounded p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-green-50 text-brand-green rounded border border-green-100">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Garment Registry Compiled</span>
                          <p className="text-[11px] text-zinc-600">
                            {views.length} photos uploaded. Ready to run Multimodal AI Appraise logic.
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                        <div className="flex items-center gap-2 border border-zinc-300 rounded px-3 py-2 bg-[#FAFAFA]">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Model Engine:</span>
                          <select
                            value={config.geminiModel || 'smart-routing'}
                            onChange={(e) => handleUpdateConfig({ geminiModel: e.target.value })}
                            className="text-xs font-semibold text-zinc-700 bg-transparent border-none focus:outline-none focus:ring-0 pr-6 py-0.5 cursor-pointer"
                          >
                            <option value="smart-routing">Smart Routing (Auto-Switch)</option>
                            <option value="gemini-3.6-flash">Gemini 3.6 Flash</option>
                            <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
                            <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash Lite</option>
                            <option value="gpt-4o-mini">OpenAI ChatGPT 4o Mini</option>
                            <option value="gpt-4o">OpenAI ChatGPT 4o</option>
                            <option value="moonshot-v1-8k">Kimi Moonshot v1</option>
                          </select>
                        </div>

                        <button
                          onClick={handleTriggerAIVision}
                          disabled={isCompiling}
                          id="trigger-ai-btn"
                          className="px-5 py-2.5 bg-[#008060] hover:bg-[#006e52] text-white rounded text-xs font-bold uppercase tracking-wider transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 font-sans"
                        >
                          {isCompiling ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Compiling Listing fields...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5 fill-current" /> Trigger AI Vision Appraise
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Main Split Screen */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <div className="lg:col-span-5">
                      <LeftPanel
                        views={views}
                        activeViewId={activeViewId}
                        config={imgConfig}
                        aiResult={aiResult}
                        onAddViews={handleAddViews}
                        onSelectView={setActiveViewId}
                        onUpdateViewLabel={handleUpdateViewLabel}
                        onRemoveView={handleRemoveView}
                        onChangeConfig={(newCfg) => setImgConfig(prev => ({ ...prev, ...newCfg }))}
                        onRerunSegmentation={handleRerunSegmentation}
                        currentUser={currentUser}
                        onRefreshCredits={refreshCurrentUserCredits}
                        onAddGeneratedView={handleAddGeneratedView}
                        onProcessedImageChange={handleProcessedViewChange}
                      />
                    </div>

                    <div className="lg:col-span-7">
                      <RightPanel
                        aiData={aiResult}
                        config={config}
                        existingProducts={shopifyProducts}
                        isSubmitting={isPublishing}
                        onUpdateAIData={setAIResult}
                        onPublish={handlePublishDraft}
                        currentUser={currentUser}
                        onRefreshCredits={refreshCurrentUserCredits}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'BATCH' && (
            <BatchStudio
              config={config}
              existingProducts={shopifyProducts}
              onRefreshProducts={loadConfigAndAudits}
              onUpdateConfig={handleUpdateConfig}
              currentUser={currentUser}
              onRefreshCredits={refreshCurrentUserCredits}
            />
          )}

          {activeTab === 'COMPLETED_BATCHES' && (
            <CompletedBatches />
          )}

          {activeTab === 'EBAY_SUGGESTIONS' && (
            <EbaySuggestions 
              shopifyProducts={shopifyProducts}
              onRefreshProducts={loadConfigAndAudits}
            />
          )}

          {activeTab === 'TEST_SUITE' && (
            <TestSuite mappings={mappings} />
          )}

          {activeTab === 'ADMIN' && (
            <AdminConfig
              mappings={mappings}
              config={config}
              auditLogs={auditLogs}
              onUpdateMappings={handleUpdateMappings}
              onUpdateConfig={handleUpdateConfig}
              onClearLogs={handleClearLogs}
            />
          )}

          {activeTab === 'MASTER_ADMIN' && (
            <MasterAdmin currentUser={currentUser} />
          )}

          {activeTab === 'COMPANY_ADMIN' && (
            <CompanyAdmin currentUser={currentUser} />
          )}

          {activeTab === 'CLIENT_CREDITS' && (
            <ClientCredits currentUser={currentUser} />
          )}
        </main>
      </div>
    </div>
  );
}
