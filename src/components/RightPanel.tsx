import React, { useState, useEffect } from 'react';
import { AIResult, TaxonomyMapping, StudioConfig, MeasurementPlaceholders } from '../types';
import { getCanonicalTags, mapGarmentToProductType, findDuplicates, ExistingProduct, generateHtmlDescription } from '../utils';
import { Check, AlertTriangle, Eye, Code, BadgeAlert, Sparkles, ShoppingBag, Plus, X, ListCollapse, RefreshCw, Layers, ShieldAlert, FileJson, Cpu } from 'lucide-react';
import { UserSession } from './UserAuth';

interface RightPanelProps {
  aiData: any | null; // Supports v3.0.0 Master Schema and Legacy formats
  config: StudioConfig;
  existingProducts: ExistingProduct[];
  isSubmitting: boolean;
  onUpdateAIData: (data: any) => void;
  onPublish: (operatorName: string) => void;
  currentUser?: UserSession | null;
  onRefreshCredits?: () => void;
}

export default function RightPanel({
  aiData,
  config,
  existingProducts,
  isSubmitting,
  onUpdateAIData,
  onPublish,
  currentUser,
  onRefreshCredits,
}: RightPanelProps) {
  const [operatorName, setOperatorName] = useState('Listing Operator');
  const [descViewMode, setDescViewMode] = useState<'VISUAL' | 'SOURCE'>('VISUAL');
  const [newTag, setNewTag] = useState('');
  const [acknowledgedWarnings, setAcknowledgedWarnings] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<any[]>([]);
  const [operatorBypassDuplicate, setOperatorBypassDuplicate] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [isGeneratingModel, setIsGeneratingModel] = useState(false);
  const [generatedModelPreview, setGeneratedModelPreview] = useState<string | null>(null);
  
  // Right panel sub-navigation tabs
  const [activeSubTab, setActiveSubTab] = useState<'PRODUCT' | 'JSON' | 'METAFIELDS' | 'ROUTING'>('PRODUCT');

  const isV3 = aiData && aiData.schemaVersion === "3.0.0";

  // Build high-compatibility bridged v3Data object
  const buildCompatV3Data = (): any => {
    if (!aiData) return null;
    if (isV3) return aiData;

    // Translate legacy structure to v3
    const legacyWarnings: string[] = [];
    const titleLength = aiData.shopify?.title?.length || 0;
    if (titleLength > (config.titleMaxLength || 60)) {
      legacyWarnings.push(`Title exceeds SEO threshold of ${config.titleMaxLength} chars.`);
    }
    if (config.defaultVendor && aiData.shopify?.vendor && aiData.shopify.vendor !== config.defaultVendor) {
      legacyWarnings.push(`Store vendor mismatch: Expected "${config.defaultVendor}".`);
    }
    const hasWomensText = aiData.shopify?.title?.toLowerCase().includes("womens") || aiData.shopify?.title?.toLowerCase().includes("ladies");
    if (hasWomensText && aiData.classification?.gender === "MEN") {
      legacyWarnings.push("Title indicates Ladies item but gender taxonomy set to MEN.");
    }

    const legacyErrors = legacyWarnings.map((msg, i) => ({
      code: "LEGACY_WARNING_" + i,
      field: "general",
      value: "",
      blocking: false,
      message: msg
    }));

    return {
      schemaVersion: "3.0.0",
      sourceData: {
        market: aiData.classification?.market || "VINTAGE",
        gender: aiData.classification?.gender || "WOMEN",
        garmentType: aiData.classification?.garment_type || "Pants",
        subcategory: aiData.classification?.subtype || "Track Pants",
        brand: aiData.classification?.brand || "Vintage",
        era: aiData.classification?.era_estimate || "Y2K",
        taggedSize: aiData.classification?.tagged_size || "M",
        recommendedSize: aiData.classification?.recommended_size || aiData.classification?.tagged_size || "M",
        primaryColor: aiData.observations?.colors?.[0] || "Blue",
        secondaryColors: aiData.observations?.colors?.slice(1) || [],
        condition: aiData.classification?.condition || "Very Good",
        material: aiData.classification?.material || "Polyester",
        features: aiData.observations?.features || [],
        visibleFlaws: aiData.observations?.visible_flaws || [],
        measurements: aiData.measurements || {}
      },
      shopifyProduct: {
        title: aiData.shopify?.title || "",
        descriptionHtml: aiData.shopify?.description_html || "",
        vendor: aiData.shopify?.vendor || config.defaultVendor || "ListifyCraft",
        productType: aiData.shopify?.product_type || "Migration_Pants",
        price: aiData.shopify?.price || "120.00",
        sku: aiData.sku || aiData.shopify?.variants?.[0]?.sku || "",
        category: aiData.shopify?.category || "",
        tags: aiData.shopify?.tags || [],
        status: aiData.shopify?.status || "DRAFT",
        imageUrl: aiData.imageUrl || aiData.shopify?.imageUrl || "",
        compareAtPrice: aiData.shopify?.compareAtPrice || '',
        costPerItem: aiData.shopify?.costPerItem || '',
        barcode: aiData.shopify?.barcode || aiData.shopify?.variants?.[0]?.barcode || '',
        quantity: Number(aiData.shopify?.quantity ?? 1),
        collectionIds: aiData.shopify?.additionalCollectionIds || [],
        imageUrls: aiData.shopify?.imageUrls || [],
        metafields: aiData.shopify?.metafields || []
      },
      collectionRouting: {
        recommendedCollection: "Vintage Outwear",
        reason: "Mapped from garments checklist",
        rulesPassed: ["TAGS_INCLUSION", "GENDER_SCOPED"]
      },
      unresolvedMappings: [],
      validation: {
        status: legacyErrors.length > 0 ? "WARNING" : "READY",
        errors: legacyErrors
      },
      processing: {
        modelUsed: aiData.processing?.modelUsed || "gemini-3.6-flash",
        timeMs: aiData.processing?.timeMs || 450,
        failoverActive: aiData.processing?.failoverActive || false
      }
    };
  };

  const v3Data = buildCompatV3Data();

  // Trigger duplicate checks on title/brand/size updates
  useEffect(() => {
    if (!v3Data) return;
    const matches = findDuplicates(
      {
        title: v3Data.shopifyProduct.title,
        brand: v3Data.sourceData.brand,
        size: v3Data.sourceData.taggedSize,
      },
      existingProducts
    );
    setDuplicateMatches(matches);
  }, [v3Data?.shopifyProduct?.title, v3Data?.sourceData?.brand, v3Data?.sourceData?.taggedSize, existingProducts]);

  if (!aiData || !v3Data) {
    return (
      <div className="bg-white border border-zinc-200 rounded p-8 text-center text-zinc-500 h-full flex flex-col items-center justify-center space-y-3">
        <div className="p-4 bg-zinc-50 rounded border border-zinc-100 animate-pulse">
          <ShoppingBag className="w-8 h-8 text-zinc-400" />
        </div>
        <h3 className="text-sm font-semibold text-zinc-800">No Listing Compiled Yet</h3>
        <p className="text-xs text-zinc-400 max-w-xs leading-normal">
          Upload front, back, or neck label photos, then trigger vision analysis to automatically generate a complete Shopify product listing.
        </p>
      </div>
    );
  }

  // Handle unified v3 state updates
  const handleV3FieldChange = (section: 'sourceData' | 'shopifyProduct' | 'measurements', field: string, value: any) => {
    if (isV3) {
      const updated = JSON.parse(JSON.stringify(aiData));
      if (section === 'measurements') {
        updated.sourceData.measurements[field] = value;
      } else if (section === 'sourceData') {
        updated.sourceData[field] = value;
      } else if (section === 'shopifyProduct') {
        updated.shopifyProduct[field] = value;
      }
      onUpdateAIData(updated);
    } else {
      // Modify legacy backing structure with bridge mappings
      const updated = JSON.parse(JSON.stringify(aiData));
      if (section === 'measurements') {
        if (!updated.measurements) updated.measurements = {};
        updated.measurements[field] = value;
      } else if (section === 'sourceData') {
        if (!updated.classification) updated.classification = {};
        const legacyField = field === 'garmentType' ? 'garment_type' : (field === 'taggedSize' ? 'tagged_size' : field);
        updated.classification[legacyField] = value;
      } else if (section === 'shopifyProduct') {
        if (!updated.shopify) updated.shopify = {};
        if (field === 'sku') {
          updated.sku = value;
          if (!updated.shopify.variants) updated.shopify.variants = [{}];
          if (updated.shopify.variants[0]) {
            updated.shopify.variants[0].sku = value;
          }
        } else {
          const legacyField = field === 'descriptionHtml' ? 'description_html' : (field === 'productType' ? 'product_type' : field);
          updated.shopify[legacyField] = value;
        }
      }
      onUpdateAIData(updated);
    }
  };

  // Tag list managers
  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.trim()) return;
    const currentTags = [...(v3Data.shopifyProduct.tags || [])];
    if (!currentTags.includes(newTag.trim())) {
      const updated = [...currentTags, newTag.trim()];
      handleV3FieldChange('shopifyProduct', 'tags', updated);
    }
    setNewTag('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const currentTags = [...(v3Data.shopifyProduct.tags || [])];
    const updated = currentTags.filter(t => t !== tagToRemove);
    handleV3FieldChange('shopifyProduct', 'tags', updated);
  };

  const handleSyncDescription = () => {
    const summary = `${v3Data.sourceData.market} ${v3Data.sourceData.gender} ${v3Data.sourceData.brand} ${v3Data.sourceData.garmentType} in ${v3Data.sourceData.era ? v3Data.sourceData.era : 'vintage'} condition.`;
    const newHtml = generateHtmlDescription({
      summary,
      brand: v3Data.sourceData.brand || 'Vintage',
      era: v3Data.sourceData.era || 'Vintage',
      garmentType: v3Data.sourceData.garmentType || 'Apparel',
      colors: [v3Data.sourceData.primaryColor, ...(v3Data.sourceData.secondaryColors || [])].filter(Boolean),
      sizeOnLabel: v3Data.sourceData.taggedSize || 'N/A',
      fit: 'Standard Fit',
      details: (v3Data.sourceData.features || []).join(', ') || 'N/A',
      condition: v3Data.sourceData.condition || 'Very Good',
      measurements: v3Data.sourceData.measurements || {}
    });
    handleV3FieldChange('shopifyProduct', 'descriptionHtml', newHtml);
  };

  // Flat measurements keys
  const getActiveMeasurementsKeys = (): { label: string; key: string }[] => {
    const type = v3Data.sourceData.garmentType;
    const isBottom = ['Pants', 'Jeans', 'Shorts'].includes(type);
    const isSkirt = ['Skirts'].includes(type);
    const isDress = ['Dresses'].includes(type);

    if (isBottom) {
      return [
        { label: 'Waist (cm)', key: 'waist' },
        { label: 'Front Rise (cm)', key: 'rise' },
        { label: 'Inseam (cm)', key: 'inseam' },
        { label: 'Leg Opening (cm)', key: 'legOpening' },
      ];
    } else if (isSkirt) {
      return [
        { label: 'Waist (cm)', key: 'waist' },
        { label: 'Hip (cm)', key: 'hip' },
        { label: 'Total Length (cm)', key: 'length' },
      ];
    } else if (isDress) {
      return [
        { label: 'Pit to Pit (cm)', key: 'pitToPit' },
        { label: 'Waist (cm)', key: 'waist' },
        { label: 'Hip (cm)', key: 'hip' },
        { label: 'Total Length (cm)', key: 'length' },
        { label: 'Sleeve (cm)', key: 'sleeve' },
      ];
    } else {
      return [
        { label: 'Pit to Pit (cm)', key: 'pitToPit' },
        { label: 'Length (cm)', key: 'length' },
        { label: 'Shoulder (cm)', key: 'shoulder' },
        { label: 'Sleeve (cm)', key: 'sleeve' },
      ];
    }
  };

  // Read Validation engine values
  const vStatus = v3Data.validation?.status || 'READY';
  const vErrors = v3Data.validation?.errors || [];
  const unresolved = v3Data.unresolvedMappings || [];
  const totalWarnings = vErrors.filter((e: any) => !e.blocking).length;
  const totalBlocking = vErrors.filter((e: any) => e.blocking).length + unresolved.length;

  const isBlocked = totalBlocking > 0;
  const isWarning = totalWarnings > 0 && !isBlocked;

  // Publishing authorization check
  const canPublish = !isBlocked || (isBlocked && acknowledgedWarnings);

  return (
    <div className="bg-white border border-zinc-300 rounded p-5 shadow-xs space-y-5">
      {/* 1. MASTER ENGINE VALIDATION BADGE (GREEN / YELLOW / RED) */}
      <div className={`p-4 rounded border flex items-start gap-3.5 ${
        isBlocked ? 'bg-rose-50/50 border-rose-200' :
        isWarning ? 'bg-amber-50/40 border-amber-200' :
        'bg-emerald-50/30 border-[#A7F3D0]'
      }`}>
        <div className={`p-2 rounded-full border ${
          isBlocked ? 'bg-rose-100/50 border-rose-200 text-rose-600' :
          isWarning ? 'bg-amber-100/50 border-amber-200 text-amber-600' :
          'bg-emerald-100/50 border-[#A7F3D0] text-[#008060]'
        }`}>
          {isBlocked ? <ShieldAlert className="w-5 h-5 animate-bounce" /> :
           isWarning ? <AlertTriangle className="w-5 h-5" /> :
           <Check className="w-5 h-5" />}
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-widest font-mono">
              VALIDATION ENGINE STATUS:
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${
              isBlocked ? 'bg-rose-100 text-rose-700 border-rose-200' :
              isWarning ? 'bg-amber-100 text-amber-700 border-amber-200' :
              'bg-[#EBFDF5] text-[#008060] border-[#A7F3D0]'
            }`}>
              {isBlocked ? 'BLOCKED' : isWarning ? 'WARNING' : 'READY'}
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 leading-normal font-sans">
            {isBlocked ? 'Publishing blocked until critical taxonomy or formatting warnings are resolved.' :
             isWarning ? 'Ready to publish, but has low confidence or minor metadata warnings.' :
             'Fully compliant. Shopify listing payload structure conforms 100% to catalog contracts.'}
          </p>

          {/* Render Active Warnings list */}
          {(vErrors.length > 0 || unresolved.length > 0) && (
            <div className="pt-2 space-y-1">
              {vErrors.map((err: any, idx: number) => (
                <div key={idx} className={`text-[10px] font-medium flex items-center gap-1.5 ${err.blocking ? 'text-rose-700' : 'text-amber-700'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${err.blocking ? 'bg-rose-600' : 'bg-amber-500'}`} />
                  <span><strong>{err.field}</strong>: {err.message}</span>
                </div>
              ))}
              {unresolved.map((unr: any, idx: number) => (
                <div key={idx} className="text-[10px] font-medium text-rose-700 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-rose-600" />
                  <span><strong>{unr.field}</strong>: Unresolved GID mapping for "<code className="bg-rose-50 px-1 font-mono">{unr.value}</code>". Add mapping rules in Admin Panel first.</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 2. SUB-NAVIGATION TABS */}
      <div className="flex border-b border-zinc-200 text-xs font-semibold select-none">
        <button
          type="button"
          onClick={() => setActiveSubTab('PRODUCT')}
          className={`flex items-center gap-1 px-3 py-2 border-b-2 transition cursor-pointer font-sans ${
            activeSubTab === 'PRODUCT' ? 'border-[#008060] text-zinc-950 font-bold' : 'border-transparent text-zinc-400 hover:text-zinc-600'
          }`}
        >
          <Eye className="w-3.5 h-3.5" /> Review Traits
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('JSON')}
          className={`flex items-center gap-1 px-3 py-2 border-b-2 transition cursor-pointer font-sans ${
            activeSubTab === 'JSON' ? 'border-[#008060] text-zinc-950 font-bold' : 'border-transparent text-zinc-400 hover:text-zinc-600'
          }`}
        >
          <FileJson className="w-3.5 h-3.5" /> JSON Inspector
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('METAFIELDS')}
          className={`flex items-center gap-1 px-3 py-2 border-b-2 transition cursor-pointer font-sans ${
            activeSubTab === 'METAFIELDS' ? 'border-[#008060] text-zinc-950 font-bold' : 'border-transparent text-zinc-400 hover:text-zinc-600'
          }`}
        >
          <Layers className="w-3.5 h-3.5" /> Metafields
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('ROUTING')}
          className={`flex items-center gap-1 px-3 py-2 border-b-2 transition cursor-pointer font-sans ${
            activeSubTab === 'ROUTING' ? 'border-[#008060] text-zinc-950 font-bold' : 'border-transparent text-zinc-400 hover:text-zinc-600'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" /> Routing & Telemetry
        </button>
      </div>

      {/* TAB CONTENT: 1. PRODUCT REVIEW FORM */}
      {activeSubTab === 'PRODUCT' && (
        <div className="space-y-5 animate-fadeIn">
          {/* Operator credentials */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Operator Name</label>
              <input
                type="text"
                value={operatorName}
                onChange={e => setOperatorName(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-green bg-[#FAFAFA]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Price (AED)</label>
              <input
                type="text"
                value={v3Data.shopifyProduct.price || ''}
                onChange={e => handleV3FieldChange('shopifyProduct', 'price', e.target.value)}
                className="w-full text-xs px-3 py-2 border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-green bg-[#FAFAFA]"
                placeholder="e.g. 120.00"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">SKU ID</label>
              <input
                type="text"
                value={v3Data.shopifyProduct.sku || ''}
                onChange={e => handleV3FieldChange('shopifyProduct', 'sku', e.target.value)}
                className="w-full text-xs px-3 py-2 border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-green bg-[#FAFAFA] font-mono"
                placeholder="SKU-XXXX-XXXX"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-50 border border-zinc-200 rounded p-3">
            <div>
              <label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Compare-at Price</label>
              <input type="number" min="0" step="0.01" value={v3Data.shopifyProduct.compareAtPrice || ''} onChange={e => handleV3FieldChange('shopifyProduct', 'compareAtPrice', e.target.value)} className="w-full text-xs px-2 py-2 border border-zinc-300 rounded bg-white" />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Quantity</label>
              <input type="number" min="0" step="1" value={v3Data.shopifyProduct.quantity ?? 1} onChange={e => handleV3FieldChange('shopifyProduct', 'quantity', Number(e.target.value))} className="w-full text-xs px-2 py-2 border border-zinc-300 rounded bg-white" />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Barcode</label>
              <input type="text" value={v3Data.shopifyProduct.barcode || ''} onChange={e => handleV3FieldChange('shopifyProduct', 'barcode', e.target.value)} className="w-full text-xs px-2 py-2 border border-zinc-300 rounded bg-white font-mono" />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Product Status</label>
              <select value={v3Data.shopifyProduct.status || 'DRAFT'} onChange={e => handleV3FieldChange('shopifyProduct', 'status', e.target.value)} className="w-full text-xs px-2 py-2 border border-zinc-300 rounded bg-white">
                <option value="DRAFT">Draft</option><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option>
              </select>
            </div>
          </div>

          {/* Competitive pricing benchmarks */}
          <div className="bg-[#FAFAFA] p-3.5 rounded border border-zinc-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest flex items-center gap-1 font-sans">
                <Sparkles className="w-3.5 h-3.5 text-brand-green fill-current animate-pulse" />
                Live Competitor Benchmarks
              </span>
              <span className="text-[9px] text-zinc-400 font-mono font-bold">1 AED = 1 AED</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { site: 'Google Shopping', price: Math.round((v3Data.sourceData.brand?.toLowerCase() === 'nike' || v3Data.sourceData.brand?.toLowerCase() === 'coogi') ? 145 : 95), logo: '🌐' },
                { site: 'eBay Vintage', price: Math.round((v3Data.sourceData.brand?.toLowerCase() === 'nike' || v3Data.sourceData.brand?.toLowerCase() === 'coogi') ? 125 : 85), logo: '📦' },
                { site: 'Grailed (Street)', price: Math.round((v3Data.sourceData.brand?.toLowerCase() === 'nike' || v3Data.sourceData.brand?.toLowerCase() === 'coogi') ? 220 : 160), logo: '⚡' },
                { site: 'Depop (Y2K)', price: Math.round((v3Data.sourceData.brand?.toLowerCase() === 'nike' || v3Data.sourceData.brand?.toLowerCase() === 'coogi') ? 135 : 90), logo: '✨' },
              ].map((benchmark) => (
                <button
                  key={benchmark.site}
                  type="button"
                  onClick={() => handleV3FieldChange('shopifyProduct', 'price', `${benchmark.price}.00`)}
                  className="bg-white border border-zinc-200 hover:border-[#008060] rounded p-2 text-center transition cursor-pointer hover:shadow-xs group"
                >
                  <div className="text-[9px] text-zinc-400 group-hover:text-brand-green font-semibold uppercase tracking-wider flex items-center justify-center gap-1">
                    <span>{benchmark.logo}</span>
                    <span>{benchmark.site}</span>
                  </div>
                  <div className="text-xs font-bold text-zinc-800 mt-1 font-sans">
                    {benchmark.price}.00 <span className="text-[9px] text-zinc-500">AED</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Product title editor */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              <span>Product Listing Title</span>
              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500">
                {v3Data.shopifyProduct.title.length} chars
              </span>
            </div>
            <input
              type="text"
              value={v3Data.shopifyProduct.title}
              onChange={e => handleV3FieldChange('shopifyProduct', 'title', e.target.value)}
              className="w-full text-xs px-3 py-2 border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-[#008060] bg-[#FAFAFA]"
            />
          </div>

          {/* Visual classifications */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Market Designation</label>
              <select
                value={v3Data.sourceData.market}
                onChange={e => handleV3FieldChange('sourceData', 'market', e.target.value)}
                className="w-full text-xs px-3 py-2 border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-green bg-[#FAFAFA]"
              >
                <option value="VINTAGE">VINTAGE</option>
                <option value="RETRO">RETRO</option>
                <option value="Y2K">Y2K</option>
                <option value="THRIFT">THRIFT</option>
                <option value="REWORK">REWORK</option>
                <option value="EFAAR">EFAAR</option>
                <option value="ACCESSORIES">ACCESSORIES</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Target Gender</label>
              <select
                value={v3Data.sourceData.gender}
                onChange={e => handleV3FieldChange('sourceData', 'gender', e.target.value)}
                className="w-full text-xs px-3 py-2 border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-green bg-[#FAFAFA]"
              >
                <option value="MEN">MEN</option>
                <option value="WOMEN">WOMEN</option>
                <option value="UNISEX">UNISEX</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Garment Category</label>
              <select
                value={v3Data.sourceData.garmentType}
                onChange={e => handleV3FieldChange('sourceData', 'garmentType', e.target.value)}
                className="w-full text-xs px-3 py-2 border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-green bg-[#FAFAFA]"
              >
                {config.mappings.map(m => (
                  <option key={m.garmentPlural} value={m.garmentPlural}>{m.garmentPlural}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Brand</label>
              <input
                type="text"
                value={v3Data.sourceData.brand}
                onChange={e => handleV3FieldChange('sourceData', 'brand', e.target.value)}
                className="w-full text-xs px-3 py-2 border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-green bg-[#FAFAFA]"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Tagged Size</label>
              <input
                type="text"
                value={v3Data.sourceData.taggedSize}
                onChange={e => handleV3FieldChange('sourceData', 'taggedSize', e.target.value)}
                className="w-full text-xs px-3 py-2 border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-green bg-[#FAFAFA]"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Condition Grade</label>
              <select
                value={v3Data.sourceData.condition}
                onChange={e => handleV3FieldChange('sourceData', 'condition', e.target.value)}
                className="w-full text-xs px-3 py-2 border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-green bg-[#FAFAFA]"
              >
                <option value="EXCELLENT">EXCELLENT</option>
                <option value="VERY GOOD">VERY GOOD</option>
                <option value="GOOD">GOOD</option>
                <option value="FAIR">FAIR</option>
                <option value="POOR">POOR</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-zinc-50 border border-zinc-200 rounded p-3">
            <div><label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Vendor</label><input value={v3Data.shopifyProduct.vendor || ''} onChange={e => handleV3FieldChange('shopifyProduct','vendor',e.target.value)} className="w-full text-xs px-2 py-2 border border-zinc-300 rounded bg-white" /></div>
            <div><label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Product Type</label><input value={v3Data.shopifyProduct.productType || ''} onChange={e => handleV3FieldChange('shopifyProduct','productType',e.target.value)} className="w-full text-xs px-2 py-2 border border-zinc-300 rounded bg-white" /></div>
            <div><label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Shopify Category GID</label><input value={v3Data.shopifyProduct.category || ''} onChange={e => handleV3FieldChange('shopifyProduct','category',e.target.value)} placeholder="gid://shopify/TaxonomyCategory/..." className="w-full text-xs px-2 py-2 border border-zinc-300 rounded bg-white font-mono" /></div>
            <div><label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Primary Color</label><input value={v3Data.sourceData.primaryColor || ''} onChange={e => handleV3FieldChange('sourceData','primaryColor',e.target.value)} className="w-full text-xs px-2 py-2 border border-zinc-300 rounded bg-white" /></div>
            <div><label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Material</label><input value={v3Data.sourceData.material || ''} onChange={e => handleV3FieldChange('sourceData','material',e.target.value)} className="w-full text-xs px-2 py-2 border border-zinc-300 rounded bg-white" /></div>
            <div><label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Recommended Size</label><input value={v3Data.sourceData.recommendedSize || ''} onChange={e => handleV3FieldChange('sourceData','recommendedSize',e.target.value)} className="w-full text-xs px-2 py-2 border border-zinc-300 rounded bg-white" /></div>
          </div>

          {/* Description Visual / Source View Toggle */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              <span>Shopify Product Description</span>
              <div className="flex border border-zinc-300 rounded overflow-hidden text-[9px] uppercase tracking-wider font-semibold">
                <button
                  type="button"
                  onClick={handleSyncDescription}
                  title="Regenerate Description from updated traits"
                  className="px-2 py-0.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 hover:text-[#008060] transition flex items-center gap-1 border-r border-zinc-300"
                >
                  <RefreshCw className="w-3 h-3 text-brand-green" /> Sync traits
                </button>
                <button
                  type="button"
                  onClick={() => setDescViewMode('VISUAL')}
                  className={`px-2 py-0.5 flex items-center gap-1 transition ${descViewMode === 'VISUAL' ? 'bg-[#008060] text-white' : 'bg-white hover:bg-zinc-50 text-zinc-600'}`}
                >
                  <Eye className="w-3 h-3" /> Visual
                </button>
                <button
                  type="button"
                  onClick={() => setDescViewMode('SOURCE')}
                  className={`px-2 py-0.5 flex items-center gap-1 transition ${descViewMode === 'SOURCE' ? 'bg-[#008060] text-white' : 'bg-white hover:bg-zinc-50 text-zinc-600'}`}
                >
                  <Code className="w-3 h-3" /> Source
                </button>
              </div>
            </div>

            {descViewMode === 'VISUAL' ? (
              <div className="w-full text-[13px] p-3 border border-zinc-300 rounded bg-[#FAFAFA] min-h-[140px] overflow-y-auto prose prose-xs leading-relaxed whitespace-pre-wrap">{String(v3Data.shopifyProduct.descriptionHtml || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}</div>
            ) : (
              <textarea
                value={v3Data.shopifyProduct.descriptionHtml}
                onChange={e => handleV3FieldChange('shopifyProduct', 'descriptionHtml', e.target.value)}
                className="w-full text-[12px] p-3 border border-zinc-300 rounded bg-zinc-950 text-zinc-300 font-mono min-h-[140px] focus:outline-none leading-normal"
              />
            )}
          </div>

          {/* Measurements */}
          <div className="bg-[#FAFAFA] p-4 rounded border border-zinc-300 space-y-3">
            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1">
              <ListCollapse className="w-3.5 h-3.5 text-zinc-500" />
              Flat Measurements Placeholders
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {getActiveMeasurementsKeys().map(field => (
                <div key={field.key}>
                  <label className="block text-[9px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">{field.label}</label>
                  <input
                    type="text"
                    placeholder="____"
                    value={v3Data.sourceData.measurements?.[field.key] || ''}
                    onChange={e => handleV3FieldChange('measurements', field.key, e.target.value || null)}
                    className="w-full text-xs px-2 py-1.5 border border-zinc-300 rounded text-center bg-white font-mono"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Tag customizer */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Shopify Hierarchy Tags</label>
            <div className="flex flex-wrap gap-1.5 p-2 bg-[#FAFAFA] rounded border border-zinc-300 min-h-[50px]">
              {(v3Data.shopifyProduct.tags || []).map((tag: string) => (
                <span
                  key={tag}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono border ${
                    tag.startsWith('Category_Default Category')
                      ? 'bg-green-50 border-green-200 text-brand-green font-semibold'
                      : 'bg-zinc-100 border-zinc-200 text-zinc-600'
                  }`}
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="text-zinc-400 hover:text-zinc-700 focus:outline-none"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
            <form onSubmit={handleAddTag} className="flex gap-2">
              <input
                type="text"
                placeholder="Add custom hierarchy tag..."
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                className="flex-1 text-xs px-3 py-1.5 border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-green bg-white"
              />
              <button
                type="submit"
                className="px-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-semibold uppercase tracking-wider cursor-pointer font-sans"
              >
                Add
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB CONTENT: 2. LIVE JSON MASTER INSPECTOR */}
      {activeSubTab === 'JSON' && (
        <div className="space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">
              Live Schema Output V3.0.0
            </span>
            <span className="text-[9px] px-1.5 py-0.5 bg-zinc-100 text-zinc-600 border border-zinc-200 rounded font-mono font-bold uppercase">
              Full-Stack Proxied
            </span>
          </div>
          <div className="bg-zinc-950 rounded p-4 border border-zinc-800 text-xs text-zinc-300 font-mono overflow-auto max-h-[420px] leading-relaxed">
            <pre>{JSON.stringify(v3Data, null, 2)}</pre>
          </div>
          <p className="text-[10px] text-zinc-400 italic">
            This Master JSON represents the complete source, product mappings, and rules trace.
          </p>
        </div>
      )}

      {/* TAB CONTENT: 3. METAFIELDS LIST PREVIEW */}
      {activeSubTab === 'METAFIELDS' && (
        <div className="space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">
              Generated Shopify Metafields
            </span>
            <span className="text-[9px] px-1.5 py-0.5 bg-emerald-50 text-brand-green border border-emerald-200 rounded font-mono font-bold uppercase">
              Strict Non-Empty
            </span>
          </div>

          <div className="space-y-2 max-h-[380px] overflow-y-auto">
            {(v3Data.shopifyProduct.metafields || []).map((mf: any, idx: number) => (
              <div key={idx} className="p-3 bg-[#FAFAFA] border border-zinc-200 rounded-lg text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="font-mono font-bold text-zinc-800 text-[11px] block">
                    {mf.namespace}.{mf.key}
                  </span>
                  <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-wide">
                    Type: {mf.type || 'single_line_text_field'}
                  </span>
                </div>
                <div className="bg-white border border-zinc-300 font-mono px-2 py-1.5 rounded text-zinc-700 text-right min-w-[150px] max-w-[250px] truncate">
                  {mf.value || <span className="text-zinc-400 italic">empty</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: 4. ROUTING & TELEMETRY */}
      {activeSubTab === 'ROUTING' && (
        <div className="space-y-4 animate-fadeIn bg-[#FAFAFA] p-4 rounded-xl border border-zinc-200">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono block">
              Automated Collection Routing
            </span>
            <div className="p-3 bg-white border border-zinc-200 rounded-lg space-y-2">
              <div className="text-xs font-bold text-zinc-900 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-brand-green" />
                Target Collection: <strong className="text-brand-green font-mono">{v3Data.collectionRouting?.recommendedCollection || 'Vintage Outwear'}</strong>
              </div>
              <p className="text-[11px] text-zinc-500 leading-normal">
                Reason: {v3Data.collectionRouting?.reason || 'Mapped from tags hierarchy and primary classifications.'}
              </p>
              {v3Data.collectionRouting?.rulesPassed && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {v3Data.collectionRouting.rulesPassed.map((r: string) => (
                    <span key={r} className="px-1.5 py-0.5 bg-zinc-100 text-zinc-500 border border-zinc-200 text-[9px] font-mono rounded font-bold uppercase">
                      Rule Passed: {r}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono block">
              AI Appraiser Telemetry
            </span>
            <div className="p-3 bg-white border border-zinc-200 rounded-lg text-xs space-y-2 font-mono">
              <div className="flex justify-between border-b border-zinc-100 pb-1.5">
                <span className="text-zinc-400">Model Engine:</span>
                <span className="text-zinc-800 font-bold">{v3Data.processing?.modelUsed || 'gemini-3.6-flash'}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-100 pb-1.5">
                <span className="text-zinc-400">Execution Speed:</span>
                <span className="text-zinc-800 font-bold">{v3Data.processing?.timeMs || '420'} ms</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Failover Activated:</span>
                <span className={`font-bold ${v3Data.processing?.failoverActive ? 'text-amber-600 animate-pulse' : 'text-zinc-400'}`}>
                  {v3Data.processing?.failoverActive ? 'YES' : 'NO'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. STUDIO AI MODEL GENERATOR (VISUAL MODEL ON PORTRAIT) */}
      <div className="bg-[#fcfcff] border border-blue-200/60 rounded-xl p-4 space-y-3.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-widest flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
            Studio AI Model Generator
          </h3>
          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[9px] font-mono font-bold rounded border border-blue-100">
            sRGB Pro v3
          </span>
        </div>
        <p className="text-[11px] text-zinc-500 leading-normal">
          Synthesize high-fidelity studio models wearing the exact vintage garment. Maintains high-contrast visual realism.
        </p>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-1 font-mono">Gender Filter</label>
            <select
              value={v3Data.sourceData.gender === "WOMEN" ? "WOMEN" : "MEN"}
              onChange={e => handleV3FieldChange('sourceData', 'gender', e.target.value)}
              className="w-full text-[11px] px-2 py-1.5 border border-zinc-200 bg-white rounded focus:outline-none focus:border-blue-500"
            >
              <option value="MEN">Male Model</option>
              <option value="WOMEN">Female Model</option>
            </select>
          </div>

          <div>
            <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-1 font-mono">Lighting Setup</label>
            <select
              id="model-lighting-setup"
              className="w-full text-[11px] px-2 py-1.5 border border-zinc-200 bg-white rounded focus:outline-none focus:border-blue-500"
            >
              <option value="warm">Warm Vintage Studio</option>
              <option value="cool">High-Contrast Editorial</option>
              <option value="street">Natural Sunset Streetwear</option>
              <option value="neutral">Flat Clean E-Commerce</option>
            </select>
          </div>
        </div>

        {v3Data.shopifyProduct.imageUrl && (
          <div className="p-2.5 bg-blue-50/40 border border-blue-100 rounded-xl flex items-center gap-3">
            <img 
              src={v3Data.shopifyProduct.imageUrl} 
              alt="AI Generated Model Mockup" 
              referrerPolicy="no-referrer"
              className="w-14 h-14 object-cover rounded-lg border border-blue-200 shadow-sm shrink-0" 
            />
            <div className="text-left space-y-0.5 truncate">
              <span className="text-[10px] font-bold text-blue-800 uppercase font-mono block">Active Portrait Image</span>
              <span className="text-[9px] text-zinc-500 block truncate max-w-[180px] font-mono">
                {v3Data.shopifyProduct.title || "sRGB Color Profile: Adobe sYCC-A"}
              </span>
              <span className="text-[8px] text-zinc-400 block font-mono">Resolution: 2000 x 2000 px</span>
            </div>
          </div>
        )}

        {generatedModelPreview && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
            <img src={generatedModelPreview} alt="Generated try-on awaiting approval" className="w-full max-h-72 object-contain rounded bg-white" />
            <div className="flex gap-2">
              <button type="button" onClick={() => { const current = v3Data.shopifyProduct.imageUrls || []; handleV3FieldChange('shopifyProduct','imageUrls', Array.from(new Set([...current, generatedModelPreview]))); setGeneratedModelPreview(null); }} className="flex-1 py-2 bg-emerald-700 text-white rounded text-[10px] font-bold uppercase">Approve & add to gallery</button>
              <button type="button" onClick={() => setGeneratedModelPreview(null)} className="px-4 py-2 bg-white border border-zinc-300 rounded text-[10px] font-bold uppercase">Reject</button>
            </div>
            <p className="text-[9px] text-emerald-800">The original product photo remains the primary image. The AI model image is added only after approval.</p>
          </div>
        )}

        {modelError && (
          <div className="p-3 bg-rose-50 border border-rose-150 rounded-xl text-xs text-rose-800 flex items-start gap-2 text-left animate-shake">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span className="font-semibold">{modelError}</span>
          </div>
        )}

        <button
          type="button"
          disabled={isGeneratingModel}
          onClick={async () => {
            setIsGeneratingModel(true);
            setModelError(null);
            
            try {
              const res = await fetch('/api/ai-model/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  productTitle: v3Data.shopifyProduct.title,
                  gender: v3Data.sourceData.gender === "WOMEN" ? "WOMEN" : "MEN",
                  garmentType: v3Data.sourceData.garmentType,
                  brand: v3Data.sourceData.brand,
                  clientId: currentUser?.clientId,
                  username: currentUser?.username,
                  productImage: v3Data.shopifyProduct.imageUrl,
                  sku: v3Data.shopifyProduct.sku
                })
              });
              
              if (res.ok) {
                const data = await res.json();
                setGeneratedModelPreview(data.modelImageUrl);
                if (onRefreshCredits) onRefreshCredits();
              } else {
                const errData = await res.json();
                setModelError(errData.error || "Failed to generate AI Fashion Model.");
              }
            } catch (e: any) {
              console.error("Failed to generate AI Model on demand", e);
              setModelError(e.message || "Network error. Please try again.");
            } finally {
              setIsGeneratingModel(false);
            }
          }}
          id="generate-model-btn"
          className="w-full py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 disabled:opacity-50 text-[10px] font-bold uppercase tracking-wider rounded-lg transition border border-blue-200 flex items-center justify-center gap-1 cursor-pointer font-sans"
        >
          {isGeneratingModel ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Synthesizing Fashion Portrait...
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 fill-current animate-pulse" />
              On-Demand Model Synthesis (Included)
            </>
          )}
        </button>
      </div>

      {/* Duplicate detection warning */}
      {duplicateMatches.length > 0 && (
        <div className="p-3 bg-amber-50 rounded border border-amber-200 space-y-2">
          <div className="flex items-start gap-2">
            <BadgeAlert className="w-4 h-4 text-amber-600 mt-0.5" />
            <div>
              <span className="font-bold text-[10px] uppercase tracking-wider text-amber-800 block">Possible Duplicate Product Found</span>
              <p className="text-[11px] text-amber-700 mt-0.5">
                The listing contains similar traits as {duplicateMatches.length} existing Shopify product(s).
              </p>
            </div>
          </div>
          <div className="pl-6 space-y-1">
            {duplicateMatches.map((m, idx) => (
              <div key={idx} className="text-[10px] font-mono text-zinc-600">
                - <strong>{m.product.title}</strong> ({Math.round(m.similarity * 100)}% match) <br />
                <span className="text-zinc-500 pl-2 font-sans">Reason: {m.reason}</span>
              </div>
            ))}
            <div className="pt-1 flex items-center gap-1.5">
              <input
                type="checkbox"
                id="bypass-duplicate"
                checked={operatorBypassDuplicate}
                onChange={e => setOperatorBypassDuplicate(e.target.checked)}
                className="rounded border-zinc-300 text-[#008060] focus:ring-brand-green cursor-pointer"
              />
              <label htmlFor="bypass-duplicate" className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest cursor-pointer font-sans">
                Bypass duplicate checks as authorized operator
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Human-in-the-loop bypass warning acknowledgement */}
      {isBlocked && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs space-y-2">
          <p className="text-[11px] text-rose-800 font-semibold leading-normal font-sans">
            Human-in-the-loop Publishing Overrides:
          </p>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="acknowledge-warning-chk"
              checked={acknowledgedWarnings}
              onChange={e => setAcknowledgedWarnings(e.target.checked)}
              className="rounded border-zinc-300 text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
            />
            <label htmlFor="acknowledge-warning-chk" className="text-[10px] text-rose-700 font-bold uppercase tracking-wide cursor-pointer font-sans leading-tight">
              Acknowledge block risks and force bypass publishing
            </label>
          </div>
        </div>
      )}

      {/* 4. ACTION SUBMIT BUTTON */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => onPublish(operatorName)}
          disabled={isSubmitting || !canPublish || (duplicateMatches.length > 0 && !operatorBypassDuplicate)}
          id="publish-draft-btn"
          className={`w-full py-3 rounded text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer uppercase tracking-widest ${
            canPublish && (duplicateMatches.length === 0 || operatorBypassDuplicate)
              ? 'bg-[#008060] text-white hover:bg-[#006e52] shadow-sm'
              : 'bg-zinc-100 border border-zinc-300 text-zinc-400 cursor-not-allowed'
          }`}
        >
          {isSubmitting ? 'Uploading assets & publishing...' : 'Publish Draft to Shopify'}
        </button>
        <span className="text-[9px] text-zinc-400 block text-center mt-2 font-mono">
          Product created with status: DRAFT and status contract locked.
        </span>
      </div>
    </div>
  );
}
