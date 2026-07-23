import React, { useState, useEffect } from 'react';
import { TaxonomyMapping, AuditRecord, StudioConfig } from '../types';
import { Settings2, Trash2, Plus, Database, ShieldAlert, History, FileCode, CheckCircle, RefreshCcw, Search, Eye, Brain, Key, Layers, CheckSquare, Save } from 'lucide-react';

interface AdminConfigProps {
  mappings: TaxonomyMapping[];
  config: StudioConfig;
  auditLogs: AuditRecord[];
  onUpdateMappings: (newMappings: TaxonomyMapping[]) => void;
  onUpdateConfig: (newConfig: Partial<StudioConfig>) => void;
  onClearLogs: () => void;
}

export default function AdminConfig({
  mappings,
  config,
  auditLogs,
  onUpdateMappings,
  onUpdateConfig,
  onClearLogs,
}: AdminConfigProps) {
  const [newGarment, setNewGarment] = useState('');
  const [newProdType, setNewProdType] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showMigrationModal, setShowMigrationModal] = useState(false);
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditRecord | null>(null);

  // Advanced configurations states
  const [validationRules, setValidationRules] = useState<any>({
    requiredFields: ["title", "sku", "price", "imageUrl", "garmentType", "category"],
    blockedFields: [],
    allowedValues: {
      condition: ["EXCELLENT", "VERY GOOD", "GOOD", "FAIR", "POOR"],
      gender: ["MEN", "WOMEN", "UNISEX"]
    }
  });
  const [metafieldsConfig, setMetafieldsConfig] = useState<any[]>([]);
  const [taxonomyMappings, setTaxonomyMappings] = useState<Record<string, any>>({});
  
  const [newTaxonomyKey, setNewTaxonomyKey] = useState('');
  const [newTaxonomyGid, setNewTaxonomyGid] = useState('');
  const [newTaxonomyName, setNewTaxonomyName] = useState('');
  
  const [newMetaNamespace, setNewMetaNamespace] = useState('magento');
  const [newMetaKey, setNewMetaKey] = useState('');
  const [newMetaType, setNewMetaType] = useState('single_line_text_field');
  const [newMetaRules, setNewMetaRules] = useState('');
  
  const [saveStatus, setSaveStatus] = useState<'IDLE' | 'SAVING' | 'SUCCESS' | 'ERROR'>('IDLE');

  const [localShopName, setLocalShopName] = useState(config?.shopName || '');
  const [localAccessToken, setLocalAccessToken] = useState(config?.accessToken || '');
  const [localDefaultVendor, setLocalDefaultVendor] = useState(config?.defaultVendor || '');

  useEffect(() => {
    setLocalShopName(config?.shopName || '');
    setLocalAccessToken(config?.accessToken || '');
    setLocalDefaultVendor(config?.defaultVendor || '');
  }, [config?.shopName, config?.accessToken, config?.defaultVendor]);

  const fetchAdvancedConfig = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (data.validationRules) setValidationRules(data.validationRules);
      if (data.metafieldsConfig) setMetafieldsConfig(data.metafieldsConfig);
      if (data.taxonomyMappings) setTaxonomyMappings(data.taxonomyMappings);
    } catch (err) {
      console.error("Failed to load advanced config:", err);
    }
  };

  useEffect(() => {
    fetchAdvancedConfig();
  }, []);

  const saveAdvancedConfig = async (updatedFields: {
    validationRules?: any;
    metafieldsConfig?: any[];
    taxonomyMappings?: any;
  }) => {
    setSaveStatus('SAVING');
    try {
      const payload: any = {};
      if (updatedFields.validationRules !== undefined) payload.validationRules = updatedFields.validationRules;
      if (updatedFields.metafieldsConfig !== undefined) payload.metafieldsConfig = updatedFields.metafieldsConfig;
      if (updatedFields.taxonomyMappings !== undefined) payload.taxonomyMappings = updatedFields.taxonomyMappings;
      
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setSaveStatus('SUCCESS');
        setTimeout(() => setSaveStatus('IDLE'), 2000);
        fetchAdvancedConfig();
      } else {
        setSaveStatus('ERROR');
      }
    } catch (err) {
      setSaveStatus('ERROR');
    }
  };

  // Add/Delete handlers for Taxonomy Mappings
  const handleAddTaxonomyMapping = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaxonomyKey || !newTaxonomyName) return;
    const gidValue = newTaxonomyGid.trim() || null;
    const updated = {
      ...taxonomyMappings,
      [newTaxonomyKey.trim()]: {
        gid: gidValue,
        displayName: newTaxonomyName.trim(),
        status: gidValue ? "MAPPED" : "UNMAPPED"
      }
    };
    setTaxonomyMappings(updated);
    saveAdvancedConfig({ taxonomyMappings: updated });
    setNewTaxonomyKey('');
    setNewTaxonomyGid('');
    setNewTaxonomyName('');
  };

  const handleDeleteTaxonomyMapping = (key: string) => {
    const updated = { ...taxonomyMappings };
    delete updated[key];
    setTaxonomyMappings(updated);
    saveAdvancedConfig({ taxonomyMappings: updated });
  };

  // Add/Delete handlers for Metafield Definition schemas
  const handleAddMetafieldConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMetaKey) return;
    const exists = metafieldsConfig.some(m => m.namespace === newMetaNamespace && m.key === newMetaKey);
    if (exists) {
      alert("This metafield namespace & key combination already exists.");
      return;
    }
    const updated = [
      ...metafieldsConfig,
      {
        namespace: newMetaNamespace,
        key: newMetaKey.trim(),
        type: newMetaType,
        rules: newMetaRules.trim() || "No specific rules designated"
      }
    ];
    setMetafieldsConfig(updated);
    saveAdvancedConfig({ metafieldsConfig: updated });
    setNewMetaKey('');
    setNewMetaRules('');
  };

  const handleDeleteMetafieldConfig = (namespace: string, key: string) => {
    const updated = metafieldsConfig.filter(m => !(m.namespace === namespace && m.key === key));
    setMetafieldsConfig(updated);
    saveAdvancedConfig({ metafieldsConfig: updated });
  };

  // Validation Rules Toggler
  const handleToggleRequiredField = (field: string) => {
    const current = [...(validationRules.requiredFields || [])];
    const updated = current.includes(field)
      ? current.filter(f => f !== field)
      : [...current, field];
    
    const newRules = { ...validationRules, requiredFields: updated };
    setValidationRules(newRules);
    saveAdvancedConfig({ validationRules: newRules });
  };

  // Map edit controls
  const handleAddMapping = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGarment || !newProdType) return;
    const exists = mappings.some(m => m.garmentPlural.toLowerCase() === newGarment.trim().toLowerCase());
    if (exists) {
      alert("Garment plural category already exists.");
      return;
    }
    const updated = [...mappings, { garmentPlural: newGarment.trim(), productType: newProdType.trim() }];
    onUpdateMappings(updated);
    setNewGarment('');
    setNewProdType('');
  };

  const handleDeleteMapping = (garment: string) => {
    const updated = mappings.filter(m => m.garmentPlural !== garment);
    onUpdateMappings(updated);
  };

  const toggleMigrationMode = () => {
    if (!config.vintageEraMigrationEnabled) {
      setShowMigrationModal(true);
    } else {
      onUpdateConfig({ vintageEraMigrationEnabled: false });
    }
  };

  const confirmMigrationMode = () => {
    onUpdateConfig({ vintageEraMigrationEnabled: true });
    setShowMigrationModal(false);
  };

  const filteredLogs = auditLogs.filter(log => {
    const searchLower = searchTerm.toLowerCase();
    return (
      log.operator.toLowerCase().includes(searchLower) ||
      (log.payload?.title || '').toLowerCase().includes(searchLower) ||
      (log.shopifyResponse?.productId || '').toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-4 py-2">
      {/* Save Status Notification Banner */}
      {saveStatus !== 'IDLE' && (
        <div className={`fixed top-4 right-4 z-50 p-3 rounded shadow-lg text-xs font-semibold flex items-center gap-2 ${
          saveStatus === 'SAVING' ? 'bg-zinc-100 text-zinc-800 border border-zinc-300' :
          saveStatus === 'SUCCESS' ? 'bg-[#EBFDF5] text-[#008060] border border-[#A7F3D0]' :
          'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          <RefreshCcw className={`w-3.5 h-3.5 ${saveStatus === 'SAVING' ? 'animate-spin' : ''}`} />
          {saveStatus === 'SAVING' && 'Saving configuration...'}
          {saveStatus === 'SUCCESS' && 'Configuration saved successfully!'}
          {saveStatus === 'ERROR' && 'Failed to save configuration.'}
        </div>
      )}

      {/* 1. Validation Rules Engine Controller */}
      <div className="bg-white border border-zinc-300 rounded shadow-xs p-5" id="validation-rules-control">
        <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2 uppercase tracking-tight">
          <CheckSquare className="w-4 h-4 text-brand-green" />
          Publishing Validation Rules Engine
        </h3>
        <p className="text-xs text-zinc-500 mt-1 mb-4">
          Control which Shopify traits must be fully resolved and validated prior to pushing draft listings. Blocked publishes keep drafts safely contained.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-zinc-200 rounded p-4 bg-[#FAFAFA]">
            <h4 className="text-xs font-bold text-zinc-700 uppercase tracking-widest mb-3">Required Standard Fields</h4>
            <div className="space-y-2">
              {[
                { key: 'title', label: 'Product Title' },
                { key: 'sku', label: 'SKU Code' },
                { key: 'price', label: 'Valid Price Value' },
                { key: 'imageUrl', label: 'Primary Product Image' },
                { key: 'garmentType', label: 'Garment Category Type' },
                { key: 'category', label: 'Shopify Taxonomy Category GID' }
              ].map(f => {
                const isReq = (validationRules.requiredFields || []).includes(f.key);
                return (
                  <label key={f.key} className="flex items-center gap-2.5 p-2 rounded hover:bg-zinc-100 transition cursor-pointer text-xs font-sans">
                    <input
                      type="checkbox"
                      checked={isReq}
                      onChange={() => handleToggleRequiredField(f.key)}
                      className="rounded border-zinc-300 text-[#008060] focus:ring-brand-green w-4 h-4"
                    />
                    <div>
                      <span className="font-semibold text-zinc-800">{f.label}</span>
                      <span className="text-[10px] text-zinc-400 block font-mono">key: {f.key}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="border border-zinc-200 rounded p-4 bg-[#FAFAFA] flex flex-col justify-between">
            <div>
              <h4 className="text-xs font-bold text-zinc-700 uppercase tracking-widest mb-2">Banned Input Mismatches</h4>
              <p className="text-xs text-zinc-500 mb-3 leading-relaxed">
                The validator actively blocks publishes containing gender-to-title mismatches, invalid numerical measurements, and unapproved category subcategories.
              </p>
              <div className="space-y-2 text-[11px] font-sans text-zinc-600 bg-white p-3 rounded border border-zinc-200 leading-normal">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  <span>Title mismatch (e.g. title has "womens" but gender metafield is "men")</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  <span>Subcategory mismatch (e.g. Jackets → Track Pants)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  <span>Non-numerical measurements in numeric-only attributes</span>
                </div>
              </div>
            </div>
            <div className="pt-3 border-t border-zinc-200 mt-4 text-[10px] text-zinc-400 font-mono">
              Validation engine is synchronized across Client & Express Server.
            </div>
          </div>
        </div>
      </div>

      {/* 2. Taxonomy Mapping Database Editor */}
      <div className="bg-white border border-zinc-300 rounded shadow-xs p-5" id="taxonomy-mappings-editor">
        <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2 uppercase tracking-tight">
          <Key className="w-4 h-4 text-[#008060]" />
          Verified Shopify Taxonomy Mapping Database
        </h3>
        <p className="text-xs text-zinc-500 mt-1 mb-4">
          Add or maintain standardized Shopify Metaobject IDs for values. Missing mappings will be flagged as <code className="text-amber-700">MISSING_TAXONOMY_MAPPING</code>.
        </p>

        <form onSubmit={handleAddTaxonomyMapping} className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-5 bg-[#FAFAFA] p-4 rounded border border-zinc-200">
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Key Value (e.g., Brand/Color)</label>
            <input
              type="text"
              placeholder="e.g. Nike, Red"
              value={newTaxonomyKey}
              onChange={e => setNewTaxonomyKey(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-green"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Shopify Metaobject GID</label>
            <input
              type="text"
              placeholder="gid://shopify/Metaobject/... (Optional)"
              value={newTaxonomyGid}
              onChange={e => setNewTaxonomyGid(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-green font-mono"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Display Name</label>
            <input
              type="text"
              placeholder="e.g. Nike"
              value={newTaxonomyName}
              onChange={e => setNewTaxonomyName(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-green"
              required
            />
          </div>
          <div className="sm:col-span-4 flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 bg-[#008060] hover:bg-[#006e52] text-white rounded text-xs font-bold uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer font-sans"
            >
              <Plus className="w-3.5 h-3.5" /> Save Mapping Entry
            </button>
          </div>
        </form>

        <div className="overflow-x-auto border border-zinc-300 rounded max-h-72 overflow-y-auto">
          <table className="min-w-full divide-y divide-zinc-200 text-xs">
            <thead className="bg-[#FAFAFA] sticky top-0">
              <tr>
                <th className="px-4 py-2.5 text-left font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Value Key</th>
                <th className="px-4 py-2.5 text-left font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Shopify Metaobject GID</th>
                <th className="px-4 py-2.5 text-left font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Display Name</th>
                <th className="px-4 py-2.5 text-right font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 bg-white">
              {Object.entries(taxonomyMappings).map(([key, value]: [string, any]) => (
                <tr key={key} className="hover:bg-zinc-50/50 transition-colors">
                  <td className="px-4 py-2.5 font-bold text-zinc-800">{key}</td>
                  <td className="px-4 py-2.5 font-mono text-zinc-500 text-[11px] bg-[#FAFAFA]">{value.gid}</td>
                  <td className="px-4 py-2.5 font-medium text-zinc-700">{value.displayName}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleDeleteTaxonomyMapping(key)}
                      className="text-zinc-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition"
                      title="Remove Mapping Entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Metafield Schema Definition Manager */}
      <div className="bg-white border border-zinc-300 rounded shadow-xs p-5" id="metafield-schema-manager">
        <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2 uppercase tracking-tight">
          <Layers className="w-4 h-4 text-brand-green" />
          Fashion Rerun AI Studio Metafields Manager
        </h3>
        <p className="text-xs text-zinc-500 mt-1 mb-4">
          Define strict payload generation schemas. Each metafield definition guarantees correct target namespaces and key mapping rules for the Shopify API.
        </p>

        <form onSubmit={handleAddMetafieldConfig} className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-5 bg-[#FAFAFA] p-4 rounded border border-zinc-200">
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Namespace</label>
            <select
              value={newMetaNamespace}
              onChange={e => setNewMetaNamespace(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white border border-zinc-300 rounded focus:outline-none"
            >
              <option value="magento">magento</option>
              <option value="custom">custom</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Metafield Key</label>
            <input
              type="text"
              placeholder="e.g. brand_new, color1"
              value={newMetaKey}
              onChange={e => setNewMetaKey(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-green"
              required
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Field Type</label>
            <select
              value={newMetaType}
              onChange={e => setNewMetaType(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white border border-zinc-300 rounded focus:outline-none"
            >
              <option value="single_line_text_field">single_line_text_field</option>
              <option value="multi_line_text_field">multi_line_text_field</option>
              <option value="number_integer">number_integer</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Validation Rules / Guidance</label>
            <input
              type="text"
              placeholder="e.g. Maps primary color"
              value={newMetaRules}
              onChange={e => setNewMetaRules(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white border border-[#D4D4D8] rounded focus:outline-none"
            />
          </div>
          <div className="sm:col-span-4 flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 bg-[#008060] hover:bg-[#006e52] text-white rounded text-xs font-bold uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer font-sans"
            >
              <Plus className="w-3.5 h-3.5" /> Define Custom Metafield
            </button>
          </div>
        </form>

        <div className="overflow-x-auto border border-[#E4E4E7] rounded">
          <table className="min-w-full divide-y divide-zinc-200 text-xs">
            <thead className="bg-[#FAFAFA]">
              <tr>
                <th className="px-4 py-2.5 text-left font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Namespace</th>
                <th className="px-4 py-2.5 text-left font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Key Name</th>
                <th className="px-4 py-2.5 text-left font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Type Attribute</th>
                <th className="px-4 py-2.5 text-left font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Description/Contract Rules</th>
                <th className="px-4 py-2.5 text-right font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 bg-white">
              {metafieldsConfig.map((item, idx) => (
                <tr key={idx} className="hover:bg-zinc-50/50 transition-colors">
                  <td className="px-4 py-3 font-bold text-zinc-800">{item.namespace}</td>
                  <td className="px-4 py-3 font-mono text-zinc-700 font-semibold">{item.key}</td>
                  <td className="px-4 py-3 text-zinc-500 font-mono text-[10px] bg-[#FAFAFA]">{item.type}</td>
                  <td className="px-4 py-3 text-zinc-600 font-medium">{item.rules}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleDeleteMetafieldConfig(item.namespace, item.key)}
                      className="text-zinc-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition"
                      title="Delete Definition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Product Type Mapping Configuration */}
      <div className="bg-white border border-zinc-300 rounded shadow-xs p-5" id="product-type-mapping">
        <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2 uppercase tracking-tight">
          <Settings2 className="w-4 h-4 text-[#008060]" />
          Deterministic Product Type Taxonomy
        </h3>
        <p className="text-xs text-zinc-500 mt-1 mb-4">
          Maintain exact mappings between the vision classifier's plural garment names and Shopify migration product types.
        </p>

        <form onSubmit={handleAddMapping} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5 bg-[#FAFAFA] p-4 rounded border border-zinc-200">
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Canonical Garment (Plural)</label>
            <input
              type="text"
              placeholder="e.g. Knitwear & Sweaters"
              value={newGarment}
              onChange={e => setNewGarment(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-green"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Shopify Product Type Prefix</label>
            <input
              type="text"
              placeholder="e.g. Migration_Knitwear & Sweaters"
              value={newProdType}
              onChange={e => setNewProdType(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-green"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="w-full py-2 bg-[#008060] hover:bg-[#006e52] text-white rounded text-xs font-bold uppercase tracking-wider transition flex items-center justify-center gap-1.5 cursor-pointer font-sans"
            >
              <Plus className="w-3.5 h-3.5" /> Add Mapping Rule
            </button>
          </div>
        </form>

        <div className="overflow-x-auto border border-zinc-300 rounded">
          <table className="min-w-full divide-y divide-zinc-200 text-xs">
            <thead className="bg-[#FAFAFA]">
              <tr>
                <th className="px-4 py-2.5 text-left font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Garment Category</th>
                <th className="px-4 py-2.5 text-left font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Target Shopify Product Type</th>
                <th className="px-4 py-2.5 text-right font-bold text-zinc-500 uppercase tracking-wider text-[10px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 bg-white">
              {mappings.map((mapping, idx) => (
                <tr key={idx} className="hover:bg-zinc-50/50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-zinc-800">{mapping.garmentPlural}</td>
                  <td className="px-4 py-3 font-mono text-zinc-600 bg-[#FAFAFA]">{mapping.productType}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleDeleteMapping(mapping.garmentPlural)}
                      className="text-zinc-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition"
                      title="Delete Mapping"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Metafield Schema Migration Guard */}
      <div className="bg-white border border-zinc-300 rounded shadow-xs p-5" id="metafield-schema-migration">
        <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2 uppercase tracking-tight">
          <Database className="w-4 h-4 text-zinc-500" />
          Product Metafield Definition Schemas
        </h3>
        <p className="text-xs text-zinc-500 mt-1">
          Review and execute schema migrations for custom product properties. Toggling triggers Shopify metadata backfills.
        </p>

        <div className="mt-4 p-4 border border-zinc-300 rounded flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-[#FAFAFA]">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${config.vintageEraMigrationEnabled ? 'bg-amber-500 animate-pulse' : 'bg-brand-green'}`} />
              <h4 className="text-xs font-bold text-zinc-800 uppercase tracking-wide">
                Mode: {config.vintageEraMigrationEnabled ? 'Approved Migration Mode (Active)' : 'Current-Schema Mode (Active)'}
              </h4>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1 max-w-2xl">
              {config.vintageEraMigrationEnabled
                ? 'Vintage Era properties (custom.vintage_era) will be submitted to Shopify. Ensure vocabulary mapping values are validated.'
                : 'Vintage Era estimate (era_estimate) remains local in application database. No custom.vintage_era metafield will be submitted to Shopify.'}
            </p>
          </div>
          <div>
            <button
              onClick={toggleMigrationMode}
              className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-wider cursor-pointer transition font-sans ${
                config.vintageEraMigrationEnabled
                  ? 'bg-[#E4E4E7] border border-zinc-300 text-zinc-700 hover:bg-zinc-100'
                  : 'bg-zinc-900 text-white hover:bg-zinc-800'
              }`}
            >
              {config.vintageEraMigrationEnabled ? 'Deactivate Migration' : 'Enable Vintage Era Migration'}
            </button>
          </div>
        </div>
      </div>

      {/* Gemini AI Model Selection */}
      {/* Shopify API Connection */}
      <div className="bg-white border border-zinc-300 rounded shadow-xs p-5" id="shopify-api-connection">
        <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2 uppercase tracking-tight">
          <Key className="w-4 h-4 text-brand-green" />
          Shopify API Connection
        </h3>
        <p className="text-xs text-zinc-500 mt-1 mb-4">
          Connect your Shopify store using an Admin API access token to enable direct product publishing.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Store Domain</label>
            <input 
              type="text" 
              value={localShopName}
              onChange={(e) => setLocalShopName(e.target.value)}
              placeholder="your-store.myshopify.com"
              className="w-full px-3 py-2 border border-zinc-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 font-sans"
            />
            <p className="text-[10px] text-zinc-500 mt-1">e.g., store.myshopify.com</p>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Admin API Access Token</label>
            <input 
              type="password" 
              value={localAccessToken}
              onChange={(e) => setLocalAccessToken(e.target.value)}
              placeholder="shpat_..."
              className="w-full px-3 py-2 border border-zinc-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 font-mono"
            />
            <p className="text-[10px] text-zinc-500 mt-1">Must have write_products permission</p>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Default Store Vendor</label>
            <input 
              type="text" 
              value={localDefaultVendor}
              onChange={(e) => setLocalDefaultVendor(e.target.value)}
              placeholder="e.g. ListifyCraft / Brand"
              className="w-full px-3 py-2 border border-zinc-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 font-sans"
            />
            <p className="text-[10px] text-zinc-500 mt-1">Default vendor name for draft publishing</p>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => onUpdateConfig({ shopName: localShopName, accessToken: localAccessToken, defaultVendor: localDefaultVendor })}
            className="px-4 py-2 bg-[#008060] hover:bg-[#006e52] text-white rounded text-xs font-bold uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer shadow-xs font-sans"
          >
            <Save className="w-3.5 h-3.5" />
            Save Shopify Settings
          </button>
        </div>
      </div>

      <div className="bg-white border border-zinc-300 rounded shadow-xs p-5" id="gemini-model-selection">
        <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2 uppercase tracking-tight">
          <Brain className="w-4 h-4 text-brand-green" />
          Multimodal Gemini AI Model Engine
        </h3>
        <p className="text-xs text-zinc-500 mt-1">
          Select the active multimodal model to drive visual apparel appraisal, tags taxonomy, and geo-rich title generation. Switching models is recommended if you hit free-tier quota limits.
        </p>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              id: 'gemini-3.6-flash',
              name: 'Gemini 3.6 Flash',
              desc: 'Standard default model. Exceptional speed and accurate garment appraisal on free-tier limits.',
              badge: 'Default / Free Tier',
              badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            },
            {
              id: 'gemini-3.1-pro-preview',
              name: 'Gemini 3.1 Pro',
              desc: 'Advanced reasoning model. Deep appraisal precision & complex fabric understanding.',
              badge: 'High Precision / Pro',
              badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
            },
            {
              id: 'gemini-3.5-flash-lite',
              name: 'Gemini 3.5 Flash Lite',
              desc: 'Lightweight & extremely responsive model. Optimized to conserve high-volume request quotas.',
              badge: 'Fast / High Quota',
              badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
            }
          ].map((m) => {
            const isSelected = (config.geminiModel || 'gemini-3.6-flash') === m.id;
            return (
              <div
                key={m.id}
                onClick={() => onUpdateConfig({ geminiModel: m.id })}
                className={`p-4 border rounded-lg cursor-pointer transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'border-[#008060] bg-emerald-50/10 ring-1 ring-[#008060]'
                    : 'border-zinc-200 bg-white hover:border-zinc-400'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-zinc-900 font-sans">{m.name}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${m.badgeColor} font-mono font-bold uppercase`}>
                      {m.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed font-sans">{m.desc}</p>
                </div>
                {isSelected && (
                  <div className="text-[10px] text-[#008060] font-bold mt-3 flex items-center gap-1 font-sans">
                    <CheckCircle className="w-3.5 h-3.5" /> Active Model Engine
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Audit Log Panel */}
      <div className="bg-white border border-zinc-300 rounded shadow-xs p-5" id="listing-audit-history">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 pb-4 mb-4">
          <div>
            <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2 uppercase tracking-tight">
              <History className="w-4 h-4 text-brand-green" />
              Listing Operator Audit Records
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              Complete logs showing payload, Shopify response, active operator, and millisecond timestamps for compliance audits.
            </p>
          </div>
          <button
            onClick={onClearLogs}
            className="text-xs text-zinc-400 hover:text-rose-600 px-3 py-1.5 hover:bg-zinc-50 rounded transition"
          >
            Clear History
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by operator, title, or shopify product ID..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-green bg-[#FAFAFA]"
            />
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="text-center py-10 text-zinc-400 text-xs">
            No audit records found matching search queries.
          </div>
        ) : (
          <div className="space-y-2">
            {filteredLogs.map(log => (
              <div
                key={log.id}
                className="p-3.5 rounded border border-zinc-200 bg-[#FAFAFA] hover:bg-zinc-50/50 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 bg-green-50 text-[#008060] text-[9px] font-bold rounded border border-green-200 uppercase tracking-wider">
                      {log.shopifyResponse?.graphqlVersion || 'GraphQL PINNED'}
                    </span>
                    <span className="text-xs font-semibold text-zinc-800">{log.payload?.title || 'Draft Product'}</span>
                  </div>
                  <div className="text-[11px] text-zinc-500 font-mono space-x-3">
                    <span>Operator: <strong className="text-zinc-700">{log.operator}</strong></span>
                    <span>•</span>
                    <span>Timestamp: <strong>{new Date(log.timestamp).toLocaleString()}</strong></span>
                  </div>
                  {log.shopifyResponse?.productId && (
                    <div className="text-[11px] font-mono text-zinc-600 flex items-center gap-1">
                      <span>Shopify ID:</span>
                      <strong className="text-zinc-900">{log.shopifyResponse.productId}</strong>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedAuditLog(log)}
                    className="p-1.5 text-zinc-700 hover:text-zinc-900 bg-white hover:bg-zinc-100 border border-zinc-300 rounded transition flex items-center gap-1 text-xs font-semibold cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" /> View JSON Audit
                  </button>
                  {log.shopifyResponse?.adminUrl && (
                    <a
                      href={log.shopifyResponse.adminUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-[#008060] text-white hover:bg-[#006e52] text-xs font-bold uppercase tracking-wider rounded transition"
                    >
                      Shopify Link
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation modal for Vintage Era schema activation */}
      {showMigrationModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded border border-zinc-300 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-50 text-amber-600 rounded border border-amber-200">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">Approve Schema Migration?</h4>
                <p className="text-xs text-zinc-500 mt-1">
                  You are activating <strong>Vintage Era Metafield Migration Mode</strong>.
                  This modifies active payloads submitted to Shopify and creates/verifies the custom field definition <code>custom.vintage_era</code>.
                </p>
              </div>
            </div>
            <div className="bg-[#FAFAFA] p-3 rounded text-[11px] text-zinc-700 border border-zinc-300 font-mono space-y-1">
              <div>Proposed namespace: custom</div>
              <div>Proposed key: vintage_era</div>
              <div>Type: single_line_text_field</div>
            </div>
            <div className="flex justify-end gap-2 text-xs">
              <button
                onClick={() => setShowMigrationModal(false)}
                className="px-3.5 py-2 border border-zinc-300 text-zinc-700 hover:bg-[#FAFAFA] font-medium rounded transition"
              >
                Decline
              </button>
              <button
                onClick={confirmMigrationMode}
                className="px-3.5 py-2 bg-[#008060] hover:bg-[#006e52] text-white font-semibold rounded transition shadow-sm"
              >
                Approve & Migrate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* JSON Viewer Modal */}
      {selectedAuditLog && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded border border-zinc-300 shadow-xl max-w-2xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <h4 className="text-xs font-bold text-zinc-900 flex items-center gap-1.5 uppercase tracking-wider">
                <FileCode className="w-4 h-4 text-brand-green" />
                Audit Log Record JSON
              </h4>
              <button
                onClick={() => setSelectedAuditLog(null)}
                className="text-xs text-zinc-400 hover:text-zinc-600 font-semibold uppercase tracking-wider"
              >
                Close
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto bg-zinc-900 text-zinc-300 font-mono text-[11px] p-4 rounded border border-zinc-800 leading-relaxed">
              <pre>{JSON.stringify(selectedAuditLog, null, 2)}</pre>
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedAuditLog(null)}
                className="px-4 py-2 bg-[#008060] hover:bg-[#006e52] text-white rounded text-xs font-bold uppercase tracking-wider transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
