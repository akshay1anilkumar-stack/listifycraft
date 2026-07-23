import React, { useState, useRef, useEffect } from 'react';
import { UploadedView, ImageProcessingConfig, CanvasSettings, StudioBackground } from '../types';
import { StudioCanvas } from './StudioCanvas';
import { 
  Upload, 
  Image as ImageIcon, 
  Sliders, 
  RefreshCw, 
  Eraser, 
  Paintbrush, 
  Download, 
  Check, 
  HelpCircle, 
  Eye, 
  EyeOff,
  Sparkles,
  Pipette,
  Layers,
  Wand2,
  Trash2,
  Settings2,
  Sun,
  Palette,
  Users
} from 'lucide-react';

interface LeftPanelProps {
  views: UploadedView[];
  activeViewId: string | null;
  config: ImageProcessingConfig;
  aiResult?: any;
  onAddViews: (files: FileList) => void;
  onSelectView: (id: string) => void;
  onUpdateViewLabel: (id: string, label: UploadedView['label']) => void;
  onRemoveView: (id: string) => void;
  onChangeConfig: (newConfig: Partial<ImageProcessingConfig>) => void;
  onRerunSegmentation: () => void;
  currentUser?: any;
  onRefreshCredits?: () => void;
  onAddGeneratedView?: (base64: string, label: string) => void;
  onProcessedImageChange?: (viewId: string, dataUrl: string) => void;
}

import { STUDIO_BACKGROUNDS } from '../data';

export default function LeftPanel({
  views,
  activeViewId,
  config,
  aiResult,
  onAddViews,
  onSelectView,
  onUpdateViewLabel,
  onRemoveView,
  onChangeConfig,
  onRerunSegmentation,
  currentUser,
  onRefreshCredits,
  onAddGeneratedView,
  onProcessedImageChange,
}: LeftPanelProps) {
  const [dragActive, setDragActive] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [brushMode, setBrushMode] = useState<'ADD' | 'REMOVE' | null>(null);
  const [brushSize, setBrushSize] = useState(25);
  const [isDrawing, setIsDrawing] = useState(false);
  
  // Workstation Tab state
  const [workspaceTab, setWorkspaceTab] = useState<'STUDIO' | 'BRUSH'>('STUDIO');

  // Advanced Canvas Settings State
  const [canvasSettings, setCanvasSettings] = useState<CanvasSettings>({
    scale: 1.0,
    rotation: 0,
    offsetX: 0,
    offsetY: 0,
    enableKeying: true,
    keyColor: '#ffffff',
    tolerance: 30,
    smoothness: 10,
    invertKeying: false,
    enableShadow: true,
    shadowOffsetY: 10,
    shadowScaleX: 0.8,
    shadowOpacity: 0.3,
    shadowBlur: 10,
    brightness: 100,
    contrast: 100,
    saturation: 100,
  });

  // Auto-protect white dress highlights
  const [isWhiteGarmentProtected, setIsWhiteGarmentProtected] = useState(false);

  useEffect(() => {
    if (!aiResult) {
      setIsWhiteGarmentProtected(false);
      return;
    }
    const title = aiResult.shopify?.title || '';
    const colors = aiResult.observations?.colors || [];
    const isWhite = 
      title.toLowerCase().includes('white') || 
      title.toLowerCase().includes('cream') || 
      title.toLowerCase().includes('ivory') || 
      colors.some((c: string) => {
        const lc = c.toLowerCase();
        return lc.includes('white') || lc.includes('cream') || lc.includes('ivory');
      });

    if (isWhite) {
      setCanvasSettings(prev => ({
        ...prev,
        enableKeying: true,
        tolerance: 15,
        smoothness: 5
      }));
      setIsWhiteGarmentProtected(true);
    } else {
      setIsWhiteGarmentProtected(false);
    }
  }, [aiResult]);

  // Advanced Studio Background State
  const [studioBg, setStudioBg] = useState<StudioBackground>(STUDIO_BACKGROUNDS[0]);

  const [isGeneratingModelWear, setIsGeneratingModelWear] = useState(false);
  const [modelWearError, setModelWearError] = useState<string | null>(null);

  const handleGenerateModelWear = async (gender: 'MEN' | 'WOMEN') => {
    setIsGeneratingModelWear(true);
    setModelWearError(null);
    try {
      const activeView = views.find(v => v.id === activeViewId) || views[0] || null;
      const res = await fetch('/api/ai-model/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productTitle: aiResult?.shopify?.title || "Vintage Apparel",
          gender,
          garmentType: aiResult?.classification?.garment_type || "clothing item",
          brand: aiResult?.classification?.brand || "Vintage",
          clientId: currentUser?.clientId,
          username: currentUser?.username,
          productImage: activeView?.processedUrl || activeView?.url,
          sku: activeView?.sku
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        
        // Set custom background
        const modelBg: StudioBackground = {
          id: `ai-model-${gender.toLowerCase()}-${Date.now()}`,
          name: `AI ${gender === 'MEN' ? 'Male' : 'Female'} Model`,
          type: 'pattern' as const,
          value: `url('${data.modelImageUrl}')`
        };

        setStudioBg(modelBg);
        setCanvasSettings(prev => ({
          ...prev,
          enableKeying: true,
          scale: 0.9,
          offsetX: 0,
          offsetY: 0
        }));

        if (onAddGeneratedView && data.modelImageUrl) {
          onAddGeneratedView(data.modelImageUrl, `AI ${gender === 'MEN' ? 'Male' : 'Female'} Try-On`);
        }

        if (onRefreshCredits) onRefreshCredits();
      } else {
        const errData = await res.json();
        setModelWearError(errData.error || "Failed to generate AI Fashion Model.");
      }
    } catch (e: any) {
      console.error(e);
      setModelWearError("Network error. Please try again.");
    } finally {
      setIsGeneratingModelWear(false);
    }
  };

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const processedPersistTimerRef = useRef<number | null>(null);
  const lastPersistedPreviewRef = useRef<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeView = views.find(v => v.id === activeViewId) || views[0] || null;

  // Collapsible control sections state
  const [openSection, setOpenSection] = useState<'BG' | 'KEY' | 'SHADOW' | 'FILTER' | 'TRANSFORM'>('BG');

  // Handle drawing on manual mask canvas (Brush mode)
  useEffect(() => {
    if (workspaceTab !== 'BRUSH' || !canvasRef.current || !activeView) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = activeView.url;
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw background
      ctx.fillStyle = config.bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Save state for shadows
      if (config.shadowEnabled) {
        ctx.save();
        ctx.shadowColor = `rgba(0, 0, 0, ${config.shadowIntensity})`;
        ctx.shadowBlur = 24 * (config.scale || 0.82);
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 12 * (config.scale || 0.82);
      }

      // Draw original image scaled & centered
      const size = 2000 * config.scale;
      const x = (2000 - size) / 2;
      const y = (2000 - size) / 2;
      
      ctx.drawImage(img, x, y, size, size);

      if (config.shadowEnabled) {
        ctx.restore();
      }

      // If user drew anything, overlay the mask brush strokes
      if (config.maskData) {
        const maskImg = new Image();
        maskImg.src = config.maskData;
        maskImg.onload = () => {
          ctx.globalAlpha = 0.4;
          ctx.drawImage(maskImg, 0, 0);
          ctx.globalAlpha = 1.0;
        };
      }
    };
  }, [activeView, config, workspaceTab]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onAddViews(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onAddViews(e.target.files);
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!brushMode || !canvasRef.current) return;
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL();
      onChangeConfig({ maskData: dataUrl });
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !brushMode || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;

    ctx.fillStyle = brushMode === 'ADD' ? 'rgba(34, 197, 94, 0.6)' : 'rgba(239, 68, 68, 0.6)';
    ctx.beginPath();
    ctx.arc(x, y, brushSize * 4, 0, Math.PI * 2);
    ctx.fill();
  };

  const handleCanvasReady = (canvas: HTMLCanvasElement) => {
    activeCanvasRef.current = canvas;
    if (!onProcessedImageChange || !activeView?.id) return;
    if (processedPersistTimerRef.current) window.clearTimeout(processedPersistTimerRef.current);
    processedPersistTimerRef.current = window.setTimeout(() => {
      try {
        const dataUrl = canvas.toDataURL('image/png');
        if (dataUrl === lastPersistedPreviewRef.current) return;
        lastPersistedPreviewRef.current = dataUrl;
        onProcessedImageChange(activeView.id, dataUrl);
      } catch { }
    }, 650);
  };

  const downloadPreview = () => {
    const canvas = workspaceTab === 'BRUSH' ? canvasRef.current : activeCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `fashion-rerun-studio-${activeView?.label || 'processed'}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  const toggleSection = (section: typeof openSection) => {
    setOpenSection(openSection === section ? 'BG' : section);
  };

  return (
    <div className="space-y-4" id="image-editing-workspace">
      {/* Upload Zone */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`relative border border-dashed rounded p-5 text-center transition-all ${
          dragActive
            ? 'border-brand-green bg-zinc-50'
            : 'border-zinc-300 bg-[#FAFAFA] hover:border-zinc-400'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
          id="file-uploader"
        />
        <div className="flex flex-col items-center justify-center space-y-2">
          <div className="p-2.5 bg-white rounded-full border border-zinc-200 shadow-xs">
            <Upload className="w-4 h-4 text-zinc-600" />
          </div>
          <div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs font-semibold text-zinc-900 hover:underline cursor-pointer"
            >
              Click to upload garment photo
            </button>
            <span className="text-xs text-zinc-400"> or drag and drop</span>
          </div>
          <p className="text-[10px] text-zinc-400 font-mono">Supports JPEG, PNG, WEBP, HEIC up to 50MB</p>
        </div>
      </div>

      {/* Thumbnails Container */}
      {views.length > 0 && (
        <div className="bg-white border border-zinc-300 rounded p-4 shadow-xs space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Garment View Registry</span>
            <span className="text-[9px] text-zinc-400 font-mono">{views.length} views</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {views.map(v => (
              <div
                key={v.id}
                className={`relative flex-shrink-0 group cursor-pointer rounded overflow-hidden border-2 transition ${
                  v.id === activeViewId ? 'border-brand-green' : 'border-transparent'
                }`}
                onClick={() => onSelectView(v.id)}
              >
                <img
                  src={v.url}
                  alt={v.label}
                  className="w-14 h-14 object-cover"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveView(v.id);
                  }}
                  className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-zinc-900/80 hover:bg-rose-600 text-white rounded-full text-[9px] flex items-center justify-center shadow-xs transition"
                >
                  ×
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 py-0.5">
                  <select
                    value={v.label}
                    onChange={(e) => {
                      e.stopPropagation();
                      onUpdateViewLabel(v.id, e.target.value as UploadedView['label']);
                    }}
                    className="w-full text-[8px] bg-transparent text-white text-center focus:outline-none border-none cursor-pointer font-sans"
                  >
                    <option className="text-zinc-900" value="Front">Front</option>
                    <option className="text-zinc-900" value="Back">Back</option>
                    <option className="text-zinc-900" value="Neck Label">Label</option>
                    <option className="text-zinc-900" value="Wash Tag">Tag</option>
                    <option className="text-zinc-900" value="Detail">Detail</option>
                    <option className="text-zinc-900" value="Flaw">Flaw</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Studio Canvas Area */}
      {activeView && (
        <div className="bg-white border border-zinc-300 rounded p-4 shadow-xs space-y-4">
          
          {/* Workspace mode tabs */}
          <div className="flex border-b border-zinc-200">
            <button
              onClick={() => setWorkspaceTab('STUDIO')}
              className={`flex-1 py-2 text-center text-xs font-bold uppercase tracking-wider transition border-b-2 cursor-pointer ${
                workspaceTab === 'STUDIO'
                  ? 'border-[#008060] text-[#008060]'
                  : 'border-transparent text-zinc-400 hover:text-zinc-600'
              }`}
            >
              Advanced Studio Workstation
            </button>
            <button
              onClick={() => setWorkspaceTab('BRUSH')}
              className={`flex-1 py-2 text-center text-xs font-bold uppercase tracking-wider transition border-b-2 cursor-pointer ${
                workspaceTab === 'BRUSH'
                  ? 'border-[#008060] text-[#008060]'
                  : 'border-transparent text-zinc-400 hover:text-zinc-600'
              }`}
            >
              Classic Brush Editor
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="px-2 py-0.5 bg-brand-green text-white text-[10px] font-bold rounded uppercase tracking-wider">
                {activeView.label} view
              </span>
              <span className="text-[10px] text-zinc-400 font-mono">• sRGB Pro Studio</span>
            </div>

            {workspaceTab === 'BRUSH' && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowOriginal(!showOriginal)}
                  className="text-[11px] text-zinc-600 bg-zinc-50 border border-zinc-200 px-2 py-1 rounded hover:bg-zinc-100 transition flex items-center gap-1 cursor-pointer font-sans"
                >
                  {showOriginal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showOriginal ? 'Hide original' : 'Compare original'}
                </button>
              </div>
            )}
          </div>

          {/* Interactive Workspace Area */}
          {workspaceTab === 'STUDIO' ? (
            <div className="w-full space-y-4">
              <StudioCanvas
                imageUrl={activeView.url}
                background={studioBg}
                settings={canvasSettings}
                onChangeSettings={setCanvasSettings}
                onSelectKeyColor={(color) => setCanvasSettings(prev => ({ ...prev, keyColor: color, enableKeying: true }))}
                onCanvasReady={handleCanvasReady}
              />

              {/* AI Model Try-on Panel */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-3 flex flex-col gap-2 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5 font-sans">
                    <Sparkles className="w-4 h-4 text-blue-600 animate-pulse fill-blue-600" />
                    AI Model Virtual Try-On
                  </span>
                  <span className="text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full font-mono font-bold uppercase">Strict Fit Mode</span>
                </div>
                <p className="text-[11px] text-zinc-600 leading-relaxed font-sans">
                  Generate an AI model portrait. The model will strictly wear your uploaded product! Enable Chroma-Keying below to remove the clothing background, and adjust scale/position to fit it perfectly onto the model.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleGenerateModelWear('WOMEN')}
                    disabled={isGeneratingModelWear}
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer font-sans"
                  >
                    {isGeneratingModelWear ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
                    Wear on Female Model
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGenerateModelWear('MEN')}
                    disabled={isGeneratingModelWear}
                    className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer font-sans"
                  >
                    {isGeneratingModelWear ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
                    Wear on Male Model
                  </button>
                </div>
                {modelWearError && (
                  <span className="text-[10px] text-rose-600 font-bold font-sans mt-1">⚠️ {modelWearError}</span>
                )}
              </div>
            </div>
          ) : (
            /* Interactive Slider comparison / canvas container (Classic Brush Mode) */
            <div className="relative aspect-square w-full bg-[#FAFAFA] rounded border border-zinc-300 overflow-hidden shadow-inner">
              {showOriginal ? (
                <img
                  src={activeView.url}
                  alt="Original"
                  className="w-full h-full object-contain bg-zinc-200"
                />
              ) : (
                <div className="relative w-full h-full">
                  {/* 2000x2000 Output Preview Canvas */}
                  <canvas
                    ref={canvasRef}
                    width={2000}
                    height={2000}
                    onMouseDown={startDrawing}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onMouseMove={draw}
                    className="w-full h-full object-contain cursor-crosshair"
                  />

                  {/* 82% Alignment box overlay */}
                  <div className="absolute inset-[9%] border border-dashed border-zinc-300 pointer-events-none rounded flex items-center justify-center">
                    <span className="text-[9px] text-zinc-400 bg-white/90 px-1.5 py-0.5 rounded border border-zinc-200 font-mono tracking-wider">
                      82% Occ. Bounds
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Controls Panel */}
          {workspaceTab === 'STUDIO' ? (
            /* COLLAPSIBLE ACCORDION PANELS FOR ADVANCED OPTIONS */
            <div className="space-y-2">
              
              {/* 1. Background Category */}
              <div className="border border-zinc-200 rounded">
                <button
                  type="button"
                  onClick={() => toggleSection('BG')}
                  className="w-full px-3 py-2 bg-zinc-50 hover:bg-zinc-100/80 text-left text-xs font-bold uppercase tracking-wider text-zinc-700 flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-brand-green" />
                    Studio Backgrounds
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">{studioBg.name}</span>
                </button>
                {openSection === 'BG' && (
                  <div className="p-3 bg-white grid grid-cols-2 gap-2 max-h-56 overflow-y-auto scrollbar-thin">
                    {STUDIO_BACKGROUNDS.map((bg) => (
                      <button
                        key={bg.id}
                        type="button"
                        onClick={() => setStudioBg(bg)}
                        className={`p-2 rounded border text-left text-[10px] font-semibold tracking-wide transition flex items-center gap-2 cursor-pointer ${
                          studioBg.id === bg.id
                            ? 'border-[#008060] bg-green-50/40 text-zinc-950 font-bold'
                            : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                        }`}
                      >
                        {bg.type === 'solid' && (
                          <span className="w-3.5 h-3.5 rounded-full border border-zinc-300 flex-shrink-0" style={{ backgroundColor: bg.value }} />
                        )}
                        {bg.type === 'gradient' && (
                          <span className="w-3.5 h-3.5 rounded-full border border-zinc-300 flex-shrink-0 bg-gradient-to-tr from-[#ffecd2] to-[#fcb69f]" />
                        )}
                        {bg.type === 'pattern' && (
                          <span className="w-3.5 h-3.5 rounded-full border border-zinc-300 flex-shrink-0 bg-zinc-700 font-mono text-[6px] text-white flex items-center justify-center">3D</span>
                        )}
                        {bg.type === 'transparent' && (
                          <span className="w-3.5 h-3.5 rounded border border-zinc-300 flex-shrink-0 bg-white bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:4px_4px]" />
                        )}
                        <span className="truncate">{bg.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. Chroma Key Background Removal */}
              <div className="border border-zinc-200 rounded">
                <button
                  type="button"
                  onClick={() => toggleSection('KEY')}
                  className="w-full px-3 py-2 bg-zinc-50 hover:bg-zinc-100/80 text-left text-xs font-bold uppercase tracking-wider text-zinc-700 flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Wand2 className="w-3.5 h-3.5 text-brand-green" />
                    AI Chroma-Key Removal
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    {canvasSettings.enableKeying ? 'Active' : 'Disabled'}
                  </span>
                </button>
                {openSection === 'KEY' && (
                  <div className="p-3 bg-white space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <label className="font-semibold text-zinc-700 uppercase text-[10px] tracking-wider">Enable Chroma-Keying</label>
                      <input
                        type="checkbox"
                        checked={canvasSettings.enableKeying}
                        onChange={(e) => setCanvasSettings(prev => ({ ...prev, enableKeying: e.target.checked }))}
                        className="rounded border-zinc-300 accent-[#008060] focus:ring-[#008060] cursor-pointer"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] text-zinc-500 font-bold uppercase mb-1">Remove Target Color</label>
                        <div className="flex gap-1.5">
                          <input
                            type="color"
                            value={canvasSettings.keyColor}
                            onChange={(e) => setCanvasSettings(prev => ({ ...prev, keyColor: e.target.value }))}
                            className="w-7 h-7 rounded border border-zinc-300 cursor-pointer"
                          />
                          <input
                            type="text"
                            value={canvasSettings.keyColor}
                            onChange={(e) => setCanvasSettings(prev => ({ ...prev, keyColor: e.target.value }))}
                            className="flex-1 text-xs px-2 border border-zinc-300 rounded focus:outline-none font-mono"
                          />
                        </div>
                      </div>
                      
                      <div className="flex items-end">
                        <span className="text-[10px] text-zinc-400 leading-tight">
                          💡 Or use the <strong className="text-zinc-600">"Pick Color"</strong> eyedropper on the top right of the canvas workspace!
                        </span>
                      </div>
                    </div>

                    {isWhiteGarmentProtected && (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-800 text-[10px] rounded-lg leading-relaxed font-semibold">
                        ⚠️ <strong>White/Cream dress protection enabled:</strong> Auto-adjusted tolerance to <strong>15</strong> and smoothness to <strong>5</strong> to protect garment highlights against background removal.
                      </div>
                    )}

                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-zinc-500 font-bold uppercase">
                        <span>Tolerance Limit</span>
                        <span className="font-mono">{canvasSettings.tolerance}</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="150"
                        value={canvasSettings.tolerance}
                        onChange={(e) => setCanvasSettings(prev => ({ ...prev, tolerance: Number(e.target.value) }))}
                        className="w-full accent-[#008060] h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-zinc-500 font-bold uppercase">
                        <span>Feather Smoothness</span>
                        <span className="font-mono">{canvasSettings.smoothness}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={canvasSettings.smoothness}
                        onChange={(e) => setCanvasSettings(prev => ({ ...prev, smoothness: Number(e.target.value) }))}
                        className="w-full accent-[#008060] h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <label className="font-semibold text-zinc-700 uppercase text-[10px] tracking-wider">Invert Selected Mask Zone</label>
                      <input
                        type="checkbox"
                        checked={canvasSettings.invertKeying}
                        onChange={(e) => setCanvasSettings(prev => ({ ...prev, invertKeying: e.target.checked }))}
                        className="rounded border-zinc-300 accent-[#008060] focus:ring-[#008060] cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 3. 3D Soft Floor Shadows */}
              <div className="border border-zinc-200 rounded">
                <button
                  type="button"
                  onClick={() => toggleSection('SHADOW')}
                  className="w-full px-3 py-2 bg-zinc-50 hover:bg-zinc-100/80 text-left text-xs font-bold uppercase tracking-wider text-zinc-700 flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-brand-green" />
                    3D Soft Floor Shadow
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    {canvasSettings.enableShadow ? 'Active' : 'Off'}
                  </span>
                </button>
                {openSection === 'SHADOW' && (
                  <div className="p-3 bg-white space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <label className="font-semibold text-zinc-700 uppercase text-[10px] tracking-wider">Enable Floor Shadow</label>
                      <input
                        type="checkbox"
                        checked={canvasSettings.enableShadow}
                        onChange={(e) => setCanvasSettings(prev => ({ ...prev, enableShadow: e.target.checked }))}
                        className="rounded border-zinc-300 accent-[#008060] focus:ring-[#008060] cursor-pointer"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-zinc-500 font-bold uppercase">
                        <span>Shadow Opacity</span>
                        <span className="font-mono">{Math.round(canvasSettings.shadowOpacity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        disabled={!canvasSettings.enableShadow}
                        value={canvasSettings.shadowOpacity}
                        onChange={(e) => setCanvasSettings(prev => ({ ...prev, shadowOpacity: Number(e.target.value) }))}
                        className="w-full accent-[#008060] h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer disabled:opacity-40"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-zinc-500 font-bold uppercase">
                        <span>Vertical Position Offset</span>
                        <span className="font-mono">{canvasSettings.shadowOffsetY}px</span>
                      </div>
                      <input
                        type="range"
                        min="-50"
                        max="150"
                        disabled={!canvasSettings.enableShadow}
                        value={canvasSettings.shadowOffsetY}
                        onChange={(e) => setCanvasSettings(prev => ({ ...prev, shadowOffsetY: Number(e.target.value) }))}
                        className="w-full accent-[#008060] h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer disabled:opacity-40"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-zinc-500 font-bold uppercase">
                        <span>Horizontal Width Scale</span>
                        <span className="font-mono">{Math.round(canvasSettings.shadowScaleX * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.2"
                        max="2"
                        step="0.05"
                        disabled={!canvasSettings.enableShadow}
                        value={canvasSettings.shadowScaleX}
                        onChange={(e) => setCanvasSettings(prev => ({ ...prev, shadowScaleX: Number(e.target.value) }))}
                        className="w-full accent-[#008060] h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer disabled:opacity-40"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-zinc-500 font-bold uppercase">
                        <span>Blur Softness Filter</span>
                        <span className="font-mono">{canvasSettings.shadowBlur}px</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="30"
                        disabled={!canvasSettings.enableShadow}
                        value={canvasSettings.shadowBlur}
                        onChange={(e) => setCanvasSettings(prev => ({ ...prev, shadowBlur: Number(e.target.value) }))}
                        className="w-full accent-[#008060] h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer disabled:opacity-40"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 4. Color Filters & Lighting */}
              <div className="border border-zinc-200 rounded">
                <button
                  type="button"
                  onClick={() => toggleSection('FILTER')}
                  className="w-full px-3 py-2 bg-zinc-50 hover:bg-zinc-100/80 text-left text-xs font-bold uppercase tracking-wider text-zinc-700 flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Sun className="w-3.5 h-3.5 text-brand-green" />
                    Lighting & Filters
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    B:{canvasSettings.brightness}% C:{canvasSettings.contrast}%
                  </span>
                </button>
                {openSection === 'FILTER' && (
                  <div className="p-3 bg-white space-y-3 text-xs">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-zinc-500 font-bold uppercase">
                        <span>Brightness Contrast</span>
                        <span className="font-mono">{canvasSettings.brightness}%</span>
                      </div>
                      <input
                        type="range"
                        min="50"
                        max="150"
                        value={canvasSettings.brightness}
                        onChange={(e) => setCanvasSettings(prev => ({ ...prev, brightness: Number(e.target.value) }))}
                        className="w-full accent-[#008060] h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-zinc-500 font-bold uppercase">
                        <span>Image Contrast</span>
                        <span className="font-mono">{canvasSettings.contrast}%</span>
                      </div>
                      <input
                        type="range"
                        min="50"
                        max="150"
                        value={canvasSettings.contrast}
                        onChange={(e) => setCanvasSettings(prev => ({ ...prev, contrast: Number(e.target.value) }))}
                        className="w-full accent-[#008060] h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-zinc-500 font-bold uppercase">
                        <span>Vibrancy Saturation</span>
                        <span className="font-mono">{canvasSettings.saturation}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="200"
                        value={canvasSettings.saturation}
                        onChange={(e) => setCanvasSettings(prev => ({ ...prev, saturation: Number(e.target.value) }))}
                        className="w-full accent-[#008060] h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 5. Precision Transformation */}
              <div className="border border-zinc-200 rounded">
                <button
                  type="button"
                  onClick={() => toggleSection('TRANSFORM')}
                  className="w-full px-3 py-2 bg-zinc-50 hover:bg-zinc-100/80 text-left text-xs font-bold uppercase tracking-wider text-zinc-700 flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Settings2 className="w-3.5 h-3.5 text-brand-green" />
                    Product Transformation
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    Scale: {Math.round(canvasSettings.scale * 100)}%
                  </span>
                </button>
                {openSection === 'TRANSFORM' && (
                  <div className="p-3 bg-white space-y-3 text-xs">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-zinc-500 font-bold uppercase">
                        <span>Garment Zoom</span>
                        <span className="font-mono">{Math.round(canvasSettings.scale * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.3"
                        max="2.0"
                        step="0.05"
                        value={canvasSettings.scale}
                        onChange={(e) => setCanvasSettings(prev => ({ ...prev, scale: Number(e.target.value) }))}
                        className="w-full accent-[#008060] h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-zinc-500 font-bold uppercase">
                        <span>Rotation Degrees</span>
                        <span className="font-mono">{canvasSettings.rotation}°</span>
                      </div>
                      <input
                        type="range"
                        min="-180"
                        max="180"
                        value={canvasSettings.rotation}
                        onChange={(e) => setCanvasSettings(prev => ({ ...prev, rotation: Number(e.target.value) }))}
                        className="w-full accent-[#008060] h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 font-bold uppercase block">Horizontal Offset</label>
                        <input
                          type="range"
                          min="-300"
                          max="300"
                          value={canvasSettings.offsetX}
                          onChange={(e) => setCanvasSettings(prev => ({ ...prev, offsetX: Number(e.target.value) }))}
                          className="w-full accent-[#008060] h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 font-bold uppercase block">Vertical Offset</label>
                        <input
                          type="range"
                          min="-300"
                          max="300"
                          value={canvasSettings.offsetY}
                          onChange={(e) => setCanvasSettings(prev => ({ ...prev, offsetY: Number(e.target.value) }))}
                          className="w-full accent-[#008060] h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

            </div>
          ) : (
            /* Classic Brush Mask adjustment brush controls */
            <div className="space-y-4">
              <div className="p-3 bg-[#FAFAFA] rounded border border-zinc-200 space-y-2.5">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block flex items-center gap-1">
                  <Sliders className="w-3.5 h-3.5 text-zinc-500" />
                  Manual Mask Correction Brush
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setBrushMode(brushMode === 'ADD' ? null : 'ADD')}
                    className={`px-2.5 py-1 text-xs font-medium rounded flex items-center gap-1 cursor-pointer transition ${
                      brushMode === 'ADD'
                        ? 'bg-brand-green text-white shadow-xs'
                        : 'bg-white border border-zinc-300 text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    <Paintbrush className="w-3 h-3" /> Add Mask
                  </button>
                  <button
                    type="button"
                    onClick={() => setBrushMode(brushMode === 'REMOVE' ? null : 'REMOVE')}
                    className={`px-2.5 py-1 text-xs font-medium rounded flex items-center gap-1 cursor-pointer transition ${
                      brushMode === 'REMOVE'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-white border border-zinc-300 text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    <Eraser className="w-3 h-3" /> Remove Mask
                  </button>
                  {brushMode && (
                    <div className="flex items-center gap-2 flex-1 min-w-[120px]">
                      <span className="text-[9px] text-zinc-400 font-semibold uppercase font-sans">Size</span>
                      <input
                        type="range"
                        min="5"
                        max="100"
                        value={brushSize}
                        onChange={e => setBrushSize(Number(e.target.value))}
                        className="flex-1 accent-brand-green h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer"
                      />
                      <span className="text-[10px] text-zinc-600 font-mono">{brushSize}px</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Classic Studio background and scaling controls */}
              <div className="space-y-4 pt-1">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Studio Background</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {STUDIO_BACKGROUNDS.filter(b => b.type === 'solid').map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => onChangeConfig({ bgColor: p.value })}
                        className={`px-2 py-1.5 rounded border text-[10px] font-medium transition flex items-center gap-1.5 cursor-pointer ${
                          config.bgColor === p.value
                            ? 'border-brand-green bg-zinc-50 text-zinc-950 font-semibold'
                            : 'border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-zinc-300"
                          style={{ backgroundColor: p.value }}
                        />
                        {p.name.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Slider configuration values */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                      <span>Garment Occupancy</span>
                      <span className="font-mono text-zinc-600">{Math.round(config.scale * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.3"
                      max="1.0"
                      step="0.01"
                      value={config.scale}
                      onChange={e => onChangeConfig({ scale: Number(e.target.value) })}
                      className="w-full accent-brand-green h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                      <span>Drop Shadow Opacity</span>
                      <span className="font-mono text-zinc-600">{Math.round(config.shadowIntensity * 100)}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={config.shadowEnabled}
                        onChange={e => onChangeConfig({ shadowEnabled: e.target.checked })}
                        className="rounded border-zinc-300 accent-brand-green focus:ring-brand-green cursor-pointer"
                      />
                      <input
                        type="range"
                        min="0"
                        max="1.0"
                        step="0.05"
                        disabled={!config.shadowEnabled}
                        value={config.shadowIntensity}
                        onChange={e => onChangeConfig({ shadowIntensity: Number(e.target.value) })}
                        className="flex-1 accent-brand-green h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer disabled:opacity-40"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Active actions button rail */}
          <div className="flex gap-2 pt-2 border-t border-zinc-100">
            <button
              type="button"
              onClick={onRerunSegmentation}
              className="flex-1 py-2 border border-zinc-300 hover:bg-zinc-50 text-zinc-700 rounded text-xs font-semibold uppercase tracking-wider transition flex items-center justify-center gap-1.5 cursor-pointer font-sans"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Re-run Segmentation
            </button>
            <button
              type="button"
              onClick={downloadPreview}
              className="py-2 px-3 bg-[#008060] hover:bg-[#006e52] text-white rounded text-xs font-semibold uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer font-sans"
            >
              <Download className="w-3.5 h-3.5" /> Download Studio
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
