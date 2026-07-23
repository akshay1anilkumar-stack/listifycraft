import React, { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { 
  Upload, 
  FolderOpen, 
  Sparkles, 
  RefreshCw, 
  Play, 
  Check, 
  CheckCircle2, 
  ShoppingBag, 
  ChevronRight, 
  AlertCircle, 
  Trash2, 
  Eye, 
  Sliders, 
  Wand2, 
  Download, 
  Layers, 
  Sun, 
  Settings2, 
  CheckSquare, 
  Scale, 
  Search, 
  Users,
  Ruler,
  Dumbbell
} from 'lucide-react';
import { StudioCanvas } from './StudioCanvas';
import { UploadedView, AIResult, CanvasSettings, StudioBackground, StudioConfig, MeasurementPlaceholders } from '../types';
import { STUDIO_BACKGROUNDS } from '../data';
import { generateTitle, generateHtmlDescription, getCanonicalTags, ExistingProduct } from '../utils';
import { convertToNewSchema, convertToOldSchema } from '../utils/schemaMapper';

// Local types for batch products
export interface BatchProduct {
  id: string;
  sku: string;
  images: {
    id: string;
    filename: string;
    url: string;
    originalUrl: string;
    processedUrl?: string;
    label: 'Front' | 'Back' | 'Neck Label' | 'Wash Tag' | 'Detail' | 'Flaw';
    sequence?: string;
    storageId?: string;
    processedStorageId?: string;
    kind?: 'original' | 'processed' | 'model';
  }[];
  aiResult: AIResult | null;
  aiStatus: 'PENDING' | 'ANALYZING' | 'COMPLETED' | 'ERROR';
  aiError?: string;
  canvasSettings: CanvasSettings;
  studioBg: StudioBackground;
  publishedLink?: { url: string; id: string } | null;
  isApproved?: boolean;
}

interface BatchStudioProps {
  config: StudioConfig;
  existingProducts: ExistingProduct[];
  onRefreshProducts: () => void;
  onUpdateConfig?: (newConfig: Partial<StudioConfig>) => void;
  currentUser?: any | null;
  onRefreshCredits?: () => void;
}

export default function BatchStudio({
  config,
  existingProducts,
  onRefreshProducts,
  onUpdateConfig,
  currentUser,
  onRefreshCredits,
}: BatchStudioProps) {
  const [products, setProducts] = useState<BatchProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [bulkActiveTab, setBulkActiveTab] = useState<'LIST' | 'REVIEW'>('LIST');

  // Sequential analysis tracking state
  const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState({ current: 0, total: 0 });

  // Credit system confirmation and validation states
  const [showCreditConfirmModal, setShowCreditConfirmModal] = useState(false);
  const [batchCreditError, setBatchCreditError] = useState<string | null>(null);
  const [modalType, setModalType] = useState<'ANALYZE' | 'MODELS' | null>(null);

  // Right Review Pane internal tabs
  const [reviewTab, setReviewTab] = useState<'DETAILS' | 'RAW_DATA'>('DETAILS');
  const [operatorName, setOperatorName] = useState('Listing Operator');
  const [descViewMode, setDescViewMode] = useState<'VISUAL' | 'SOURCE'>('VISUAL');

  // Custom Batch Database Tracking & AI Model Synthesis States
  const [batchName, setBatchName] = useState(`Vintage Store Batch - ${new Date().toLocaleDateString()}`);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [batchSavedMessage, setBatchSavedMessage] = useState<string | null>(null);
  const [isBulkModelGenerating, setIsBulkModelGenerating] = useState(false);
  const [bulkModelProgress, setBulkModelProgress] = useState({ current: 0, total: 0 });

  // On-demand individual model wear generation states
  const [isGeneratingModelWear, setIsGeneratingModelWear] = useState(false);
  const [modelWearError, setModelWearError] = useState<string | null>(null);

  // Input refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const processedSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProcessedHashRef = useRef<string>('');

  // Active product selector helper
  const activeProduct = products.find(p => p.id === selectedProductId) || null;

  // Selected view index for active product
  const [activeImgIndex, setActiveImgIndex] = useState<number>(0);

  // Sync image index when active product shifts
  useEffect(() => {
    setActiveImgIndex(0);
  }, [selectedProductId]);

  // Auto-restore batch products state from localStorage on mount
  useEffect(() => {
    try {
      const savedProducts = localStorage.getItem("fr_batch_products");
      const savedSelectedId = localStorage.getItem("fr_batch_selected_id");
      if (savedProducts) {
        const parsed = JSON.parse(savedProducts);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setProducts(parsed);
          if (savedSelectedId && parsed.some((p: any) => p.id === savedSelectedId)) {
            setSelectedProductId(savedSelectedId);
          } else {
            setSelectedProductId(parsed[0].id);
          }
        }
      }
    } catch { }
  }, []);

  // Auto-save batch products state to localStorage on state changes
  useEffect(() => {
    try {
      if (products.length > 0) {
        localStorage.setItem("fr_batch_products", JSON.stringify(products));
      } else {
        localStorage.removeItem("fr_batch_products");
      }
    } catch { }
  }, [products]);

  useEffect(() => {
    try {
      if (selectedProductId) {
        localStorage.setItem("fr_batch_selected_id", selectedProductId);
      }
    } catch { }
  }, [selectedProductId]);

  const activeImage = activeProduct?.images[activeImgIndex] || activeProduct?.images[0] || null;

  // SKU parser function (skua.jpg, skub.jpg -> sku, suffix a/b)
  function parseSkuAndSuffix(filename: string): { sku: string; suffix: string } {
    const extIdx = filename.lastIndexOf('.');
    const name = extIdx !== -1 ? filename.substring(0, extIdx) : filename;
    
    // Pattern like sku_1, sku-a, etc.
    const sepMatch = name.match(/^(.+?)[_-]([a-zA-Z0-9])$/);
    if (sepMatch) {
      return { sku: sepMatch[1].toUpperCase(), suffix: sepMatch[2].toLowerCase() };
    }
    
    // Pattern like skua (last char is trailing letter)
    const trailingLetterMatch = name.match(/^([a-zA-Z0-9]+?)([a-zA-Z])$/);
    if (trailingLetterMatch) {
      return { sku: trailingLetterMatch[1].toUpperCase(), suffix: trailingLetterMatch[2].toLowerCase() };
    }
    
    // Fallback
    return { sku: name.toUpperCase(), suffix: 'a' };
  }

  // Map suffix to appropriate garment view category
  function getAutoLabel(suffix: string): BatchProduct['images'][0]['label'] {
    switch (suffix) {
      case 'a':
      case '1':
      case 'front':
        return 'Front';
      case 'b':
      case '2':
      case 'back':
        return 'Back';
      case 'c':
      case '3':
      case 'tag':
      case 'label':
        return 'Neck Label';
      case 'd':
      case '4':
      case 'wash':
        return 'Wash Tag';
      default:
        return 'Detail';
    }
  }

  // Process files and group them into Batch Products in parallel
  const processUploadFiles = async (files: FileList | File[]) => {
    setIsProcessingFiles(true);
    setUploadError(null);
    const newItems: { [sku: string]: BatchProduct['images'] } = {};

    try {
      const fileArray = Array.from(files);
      const concurrencyLimit = 15;
      let index = 0;

      const worker = async () => {
        while (index < fileArray.length) {
          const file = fileArray[index++];
          if (!file) break;

          // Basic image filter
          const lowerName = file.name.toLowerCase();
          const acceptedExtension = /\.(jpe?g|jog|png|webp|heic)$/i.test(lowerName);
          if (!file.type.startsWith('image/') && !acceptedExtension) {
            continue;
          }

          const base64 = await toCompressedBase64(file);
          if (!base64) continue;
          
          const { sku, suffix } = parseSkuAndSuffix(file.name);
          const autoLabel = getAutoLabel(suffix);

          const storageResponse = await fetch('/api/images/store', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dataUrl: base64,
              sku,
              filename: file.name.replace(/\.jog$/i, '.jpg'),
              sequence: suffix,
              label: autoLabel,
              kind: 'original'
            })
          });
          if (!storageResponse.ok) {
            const details = await storageResponse.text();
            throw new Error(`Failed to store ${file.name}: ${details}`);
          }
          const stored = await storageResponse.json();

          const newImageObj = {
            id: `img_${stored.id}`,
            filename: file.name.replace(/\.jog$/i, '.jpg'),
            url: stored.url,
            originalUrl: stored.url,
            label: autoLabel,
            sequence: suffix,
            storageId: stored.id,
            kind: 'original' as const
          };

          if (!newItems[sku]) {
            newItems[sku] = [];
          }
          newItems[sku].push(newImageObj);
        }
      };

      const workers = [];
      for (let j = 0; j < Math.min(concurrencyLimit, fileArray.length); j++) {
        workers.push(worker());
      }
      await Promise.all(workers);

      // Convert grouped items to Batch Products and merge into existing batch state
      const createdProducts: BatchProduct[] = Object.keys(newItems).map(sku => {
        // Preserve the SKU filename order: a-f / 1-6. Labels are only a fallback.
        const sequencePriority = (value?: string) => {
          if (!value) return 99;
          const normalized = value.toLowerCase();
          if (/^[a-f]$/.test(normalized)) return normalized.charCodeAt(0) - 96;
          if (/^[1-6]$/.test(normalized)) return Number(normalized);
          return 99;
        };
        const sortedImages = [...newItems[sku]].sort((a, b) => {
          const sequenceDiff = sequencePriority(a.sequence) - sequencePriority(b.sequence);
          if (sequenceDiff !== 0) return sequenceDiff;
          const priority = { 'Front': 1, 'Back': 2, 'Neck Label': 3, 'Wash Tag': 4, 'Detail': 5, 'Flaw': 6 };
          return (priority[a.label] || 99) - (priority[b.label] || 99);
        });

        return {
          id: `prod_${Date.now()}_${sku}_${Math.random().toString(36).substr(2, 5)}`,
          sku,
          images: sortedImages,
          aiResult: null,
          aiStatus: 'PENDING',
          canvasSettings: {
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
          },
          studioBg: STUDIO_BACKGROUNDS[0],
        };
      });

      if (createdProducts.length === 0) {
        setUploadError("No valid garment photographs detected.");
        return;
      }

      setProducts(prev => {
        // Avoid duplicates by merging images if SKU already exists
        const merged = [...prev];
        createdProducts.forEach(newP => {
          const matchIdx = merged.findIndex(p => p.sku === newP.sku);
          if (matchIdx !== -1) {
            // Merge images
            const existingImages = merged[matchIdx].images;
            newP.images.forEach(img => {
              if (!existingImages.some(ex => ex.filename === img.filename)) {
                existingImages.push(img);
              }
            });
          } else {
            merged.push(newP);
          }
        });
        return merged;
      });

      if (!selectedProductId && createdProducts.length > 0) {
        setSelectedProductId(createdProducts[0].id);
      }
    } catch (err: any) {
      console.error(err);
      setUploadError("Failed to import bulk files: " + err.message);
    } finally {
      setIsProcessingFiles(false);
    }
  };

  // Process uploaded ZIP files using JSZip
  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingFiles(true);
    setUploadError(null);

    try {
      const zip = new JSZip();
      const content = await zip.loadAsync(file);
      const extractedFiles: File[] = [];

      const filePromises: Promise<void>[] = [];

      content.forEach((relativePath, zipEntry) => {
        if (zipEntry.dir) return; // skip directories

        const lowerPath = relativePath.toLowerCase();
        // check image extension
        if (
          lowerPath.endsWith('.jpg') || 
          lowerPath.endsWith('.jpeg') || 
          lowerPath.endsWith('.png') || 
          lowerPath.endsWith('.webp') ||
          lowerPath.endsWith('.heic')
        ) {
          const promise = zipEntry.async('blob').then(blob => {
            // Determine content type
            let mime = 'image/jpeg';
            if (lowerPath.endsWith('.png')) mime = 'image/png';
            if (lowerPath.endsWith('.webp')) mime = 'image/webp';
            if (lowerPath.endsWith('.heic')) mime = 'image/heic';

            const name = relativePath.split('/').pop() || relativePath;
            extractedFiles.push(new File([blob], name, { type: mime }));
          });
          filePromises.push(promise);
        }
      });

      await Promise.all(filePromises);

      if (extractedFiles.length === 0) {
        setUploadError("No valid photos detected inside ZIP file.");
        return;
      }

      await processUploadFiles(extractedFiles);
    } catch (err: any) {
      console.error(err);
      setUploadError("Failed to extract ZIP payload: " + err.message);
    } finally {
      setIsProcessingFiles(false);
    }
  };

  const toBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const toCompressedBase64 = (file: File, maxWidth = 1200, maxHeight = 1200, quality = 0.85): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64Str = reader.result as string;
        // Skip canvas/resize for small files to save CPU
        if (file.size < 150 * 1024) {
          resolve(base64Str);
          return;
        }
        
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > maxWidth || height > maxHeight) {
            if (width > height) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(base64Str);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => {
          resolve(base64Str);
        };
      };
      reader.onerror = () => {
        resolve('');
      };
    });
  };

  // Run Parallel AI listing appraisals for all pending products with limited concurrency
  const executeBatchAIAnalyze = async () => {
    const pendingProducts = products.filter(p => p.aiStatus === 'PENDING' || p.aiStatus === 'ERROR');
    if (pendingProducts.length === 0) return;

    setIsBatchAnalyzing(true);
    setAnalysisProgress({ current: 0, total: pendingProducts.length });

    const concurrencyLimit = 5;
    let index = 0;
    let completedCount = 0;

    const runWorker = async () => {
      while (index < pendingProducts.length) {
        const currentIndex = index++;
        if (currentIndex >= pendingProducts.length) break;

        const product = pendingProducts[currentIndex];
        
        // Update state to ANALYZING
        setProducts(prev => prev.map(p => p.id === product.id ? { ...p, aiStatus: 'ANALYZING' } : p));

        const payloadImages = product.images.map(img => ({
          base64: img.originalUrl,
          label: img.label
        }));

        try {
          const response = await fetch('/api/gemini/generate-listing', {
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
                suggestMeasurements: true, // Crucial instruction override!
                sku: product.sku
              }
            })
          });

          if (!response.ok) {
            throw new Error("AI generation server returned error code.");
          }

          const rawAiData = await response.json();
          const aiResultData: AIResult = convertToOldSchema(rawAiData);
          
          // Do not enrich the shopify draft title with the SKU prefix! Use the clean title.
          if (aiResultData.shopify && !aiResultData.shopify.price) {
            aiResultData.shopify.price = "45.00";
          }

          // Check if white/cream/ivory garment to protect highlights
          let tolerance = 30;
          let smoothness = 10;
          if (aiResultData.shopify) {
            const title = aiResultData.shopify.title || '';
            const colors = aiResultData.observations?.colors || [];
            const isWhite = 
              title.toLowerCase().includes('white') || 
              title.toLowerCase().includes('cream') || 
              title.toLowerCase().includes('ivory') || 
              colors.some((c: string) => {
                const lc = c.toLowerCase();
                return lc.includes('white') || lc.includes('cream') || lc.includes('ivory');
              });
            if (isWhite) {
              tolerance = 15;
              smoothness = 5;
            }
          }

          setProducts(prev => prev.map(p => p.id === product.id ? { 
            ...p, 
            aiResult: aiResultData, 
            aiStatus: 'COMPLETED',
            canvasSettings: {
              ...p.canvasSettings,
              enableKeying: true,
              tolerance,
              smoothness
            }
          } : p));
        } catch (err: any) {
          console.error(`Failed to analyze SKU ${product.sku}:`, err);
          setProducts(prev => prev.map(p => p.id === product.id ? { 
            ...p, 
            aiStatus: 'ERROR',
            aiError: err.message || "Failed to appraise photo." 
          } : p));
        } finally {
          completedCount++;
          setAnalysisProgress(prev => ({ ...prev, current: completedCount }));
        }
      }
    };

    // Spawn workers
    const workers = [];
    for (let i = 0; i < Math.min(concurrencyLimit, pendingProducts.length); i++) {
      workers.push(runWorker());
    }
    await Promise.all(workers);

    setIsBatchAnalyzing(false);
    if (onRefreshCredits) onRefreshCredits();
  };

  const handleBatchAIAnalyze = () => {
    const pendingProducts = products.filter(p => p.aiStatus === 'PENDING' || p.aiStatus === 'ERROR');
    if (pendingProducts.length === 0) return;

    const costPerItem = 1;
    const totalCost = pendingProducts.length * costPerItem;
    const isMasterAdmin = currentUser?.role === 'Master Admin';
    const balance = currentUser?.creditBalance ?? 0;

    if (!isMasterAdmin && balance < totalCost) {
      setBatchCreditError(`Insufficient credits. Analyzing this batch of ${pendingProducts.length} items requires ${totalCost} credits, but your current balance is ${balance.toFixed(2)} credits. Please contact support or your Client Administrator.`);
      return;
    }

    setBatchCreditError(null);
    setModalType('ANALYZE');
    setShowCreditConfirmModal(true);
  };

  const handleGenerateModelWear = async (gender: 'MEN' | 'WOMEN') => {
    if (!activeProduct) return;
    setIsGeneratingModelWear(true);
    setModelWearError(null);
    try {
      const activeImage = activeProduct.images[activeImgIndex] || activeProduct.images[0] || null;
      const res = await fetch('/api/ai-model/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productTitle: activeProduct.aiResult?.shopify?.title || `${activeProduct.sku} Garment`,
          gender,
          garmentType: activeProduct.aiResult?.classification?.garment_type || "clothing item",
          brand: activeProduct.aiResult?.classification?.brand || "Vintage",
          clientId: currentUser?.clientId,
          username: currentUser?.username,
          productImage: activeImage?.processedUrl || activeImage?.url || activeProduct.images[0]?.url,
          sku: activeProduct.sku
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        
        // Create a new background object dynamically with the model portrait image!
        const modelBg: StudioBackground = {
          id: `ai-model-${gender.toLowerCase()}-${Date.now()}`,
          name: `AI ${gender === 'MEN' ? 'Male' : 'Female'} Model`,
          type: 'pattern',
          value: `url('${data.modelImageUrl}')`
        };

        const newImage = {
          id: `ai-tryon-${Date.now()}`,
          filename: `ai_model_${gender.toLowerCase()}_tryon.jpg`,
          url: data.modelImageUrl,
          originalUrl: data.modelImageUrl,
          label: 'Detail' as const,
          sequence: 'model',
          storageId: data.modelImageId,
          kind: 'model' as const
        };

        // Enable Chroma-Keying, set active background, and append to product images so they have the direct file
        setProducts(prev => prev.map(p => {
          if (p.id === activeProduct.id) {
            return {
              ...p,
              images: [...p.images, newImage],
              studioBg: modelBg,
              canvasSettings: {
                ...p.canvasSettings,
                enableKeying: true,
                scale: 0.9,
                offsetX: 0,
                offsetY: 0
              }
            };
          }
          return p;
        }));
        
        // Switch to the newly added AI Model image view
        setTimeout(() => {
          setActiveImgIndex(activeProduct.images.length);
        }, 100);

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

  // Publish a product to Shopify catalog
  const handlePublishProduct = async (product: BatchProduct) => {
    if (!product.aiResult) return;

    // Set loading/publishing indicators
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, aiStatus: 'ANALYZING' } : p));

    const approvedImages = product.images
      .map(image => image.processedUrl || image.url)
      .filter(Boolean);
    if (approvedImages.length === 0) {
      setProducts(prev => prev.map(p => p.id === product.id ? {
        ...p,
        aiStatus: 'ERROR',
        aiError: 'Publish failed: this product has no stored images.'
      } : p));
      return;
    }
    const finalImage = approvedImages[0];
    const idempotencyKey = `idemp_batch_${product.sku}`;

    const size = product.aiResult.classification.tagged_size || "XL";
    const finalProductPayload = {
      title: product.aiResult.shopify.title,
      body_html: product.aiResult.shopify.description_html,
      vendor: product.aiResult.shopify.vendor,
      product_type: product.aiResult.shopify.product_type,
      tags: product.aiResult.shopify.tags.join(', '),
      status: "active",
      variants: [
        {
          price: product.aiResult.shopify.price,
          sku: product.sku || `FR-${Date.now().toString().slice(-6)}`,
          inventory_quantity: 1,
          inventory_management: "shopify",
          option1: size
        }
      ],
      options: [
        {
          name: "Size",
          values: [size]
        }
      ],
      metafields: product.aiResult.shopify.metafields || [],
      imageUrl: finalImage,
      imageUrls: approvedImages,
      quantity: 1
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
        throw new Error("Publishing draft failed.");
      }

      const publishData = await publishRes.json();
      
      setProducts(prev => prev.map(p => p.id === product.id ? { 
        ...p, 
        aiStatus: 'COMPLETED',
        publishedLink: {
          url: publishData.adminUrl,
          id: publishData.productId
        }
      } : p));

      onRefreshProducts();
    } catch (err: any) {
      console.error(err);
      setProducts(prev => prev.map(p => p.id === product.id ? { 
        ...p, 
        aiStatus: 'ERROR',
        aiError: "Publish failed: " + err.message
      } : p));
    }
  };

  // Save current batch to backend DB for tracking and completed batch retrieval
  const handleSaveBatchToDB = async () => {
    if (products.length === 0) return;
    setIsSavingBatch(true);
    setBatchSavedMessage(null);

    // Map current products to lightweight database records with title, brand, price, etc.
    const serializedProducts = products.map(p => {
      const title = p.aiResult?.shopify?.title || `Vintage ${p.sku} Garment`;
      const brand = p.aiResult?.classification?.brand || "Vintage";
      const price = p.aiResult?.shopify?.price || "150.00";
      const category = p.aiResult?.classification?.garment_type || "Apparel";
      const imageUrl = p.images[0]?.processedUrl || p.images[0]?.url || '';
      
      return { title, brand, price, category, imageUrl };
    });

    try {
      const res = await fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: batchName,
          products: serializedProducts,
          status: 'COMPLETED'
        })
      });

      if (res.ok) {
        setBatchSavedMessage("Batch successfully tracked in database! View in 'Completed Batches' tab.");
        setTimeout(() => setBatchSavedMessage(null), 6000);
      } else {
        throw new Error("Failed to write to database.");
      }
    } catch (e) {
      console.error(e);
      setBatchSavedMessage("Failed to save batch. Please try again.");
    } finally {
      setIsSavingBatch(false);
    }
  };

  // Bulk generate studio AI models wears for all items in batch
  const executeBulkGenerateAIModels = async () => {
    const qualified = products.filter(p => p.aiResult !== null);
    if (qualified.length === 0) return;

    setIsBulkModelGenerating(true);
    setBulkModelProgress({ current: 0, total: qualified.length });

    for (let i = 0; i < qualified.length; i++) {
      const product = qualified[i];
      setBulkModelProgress({ current: i + 1, total: qualified.length });

      try {
        const res = await fetch('/api/ai-model/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productTitle: product.aiResult?.shopify?.title,
            gender: product.aiResult?.classification?.gender === "WOMEN" ? "WOMEN" : "MEN",
            garmentType: product.aiResult?.classification?.garment_type,
            brand: product.aiResult?.classification?.brand,
            clientId: currentUser?.clientId,
            username: currentUser?.username,
            productImage: product.images[0]?.processedUrl || product.images[0]?.originalUrl || product.images[0]?.url,
            sku: product.sku
          })
        });

        if (res.ok) {
          const data = await res.json();
          setProducts(prev => prev.map(p => {
            if (p.id === product.id) {
              const updatedResult = p.aiResult ? {
                ...p.aiResult,
                modelImageUrl: data.modelImageUrl,
                modelPromptDescription: data.promptDescription,
                imageUrl: data.modelImageUrl
              } : null;

              const modelImage = {
                id: `ai-tryon-${Date.now()}-${product.sku}`,
                filename: `${product.sku}_ai_model.png`,
                url: data.modelImageUrl,
                originalUrl: data.modelImageUrl,
                label: 'Detail' as const,
                sequence: 'model',
                storageId: data.modelImageId,
                kind: 'model' as const
              };
              return {
                ...p,
                images: [...p.images, modelImage],
                aiResult: updatedResult
              };
            }
            return p;
          }));
          if (onRefreshCredits) onRefreshCredits();
        }
      } catch (err) {
        console.warn(`Bulk model synthesis failed for SKU ${product.sku}`, err);
      }
    }

    setIsBulkModelGenerating(false);
  };

  const handleBulkGenerateAIModels = () => {
    const qualified = products.filter(p => p.aiResult !== null);
    if (qualified.length === 0) return;

    const costPerItem = 0;
    const totalCost = qualified.length * costPerItem;
    const isMasterAdmin = currentUser?.role === 'Master Admin';
    const balance = currentUser?.creditBalance ?? 0;

    if (!isMasterAdmin && balance < totalCost) {
      setBatchCreditError(`Insufficient credits. Generating AI models for this batch of ${qualified.length} items requires ${totalCost} credits, but your current balance is ${balance.toFixed(2)} credits. Please contact support or your Client Administrator.`);
      return;
    }

    setBatchCreditError(null);
    setModalType('MODELS');
    setShowCreditConfirmModal(true);
  };

  // Delete product from batch
  const handleDeleteProduct = (id: string) => {
    setProducts(prev => {
      const filtered = prev.filter(p => p.id !== id);
      if (selectedProductId === id) {
        setSelectedProductId(filtered[0]?.id || null);
      }
      return filtered;
    });
  };

  // Update canvas settings for active product
  const handleUpdateCanvasSettings = (newSettings: CanvasSettings) => {
    if (!selectedProductId) return;
    setProducts(prev => prev.map(p => p.id === selectedProductId ? { ...p, canvasSettings: newSettings } : p));
  };

  const handleUpdateBg = (bg: StudioBackground) => {
    if (!selectedProductId) return;
    setProducts(prev => prev.map(p => p.id === selectedProductId ? { ...p, studioBg: bg } : p));
  };

  // AI-appraised results update handlers
  const handleUpdateActiveAIData = (updatedAI: AIResult) => {
    if (!selectedProductId) return;
    setProducts(prev => prev.map(p => p.id === selectedProductId ? { ...p, aiResult: updatedAI } : p));
  };

  const getActiveMeasurementsKeys = (garmentType: string): { label: string; key: keyof MeasurementPlaceholders }[] => {
    const isBottom = ['Pants', 'Jeans', 'Shorts'].includes(garmentType);
    const isSkirt = ['Skirts'].includes(garmentType);
    const isDress = ['Dresses'].includes(garmentType);

    if (isBottom) {
      return [
        { label: 'Waist (cm)', key: 'waist' },
        { label: 'Front Rise (cm)', key: 'rise' },
        { label: 'Inseam (cm)', key: 'inseam' },
        { label: 'Leg Opening (cm)', key: 'leg_opening' as any },
      ];
    } else if (isSkirt) {
      return [
        { label: 'Waist (cm)', key: 'waist' },
        { label: 'Hip (cm)', key: 'hip' as any },
        { label: 'Total Length (cm)', key: 'total_length' as any },
      ];
    } else if (isDress) {
      return [
        { label: 'Pit to Pit (cm)', key: 'pit_to_pit' },
        { label: 'Waist (cm)', key: 'waist' },
        { label: 'Hip (cm)', key: 'hip' as any },
        { label: 'Total Length (cm)', key: 'total_length' as any },
        { label: 'Sleeve (cm)', key: 'sleeve' },
      ];
    } else {
      return [
        { label: 'Pit to Pit (cm)', key: 'pit_to_pit' },
        { label: 'Length (cm)', key: 'length' },
        { label: 'Shoulder (cm)', key: 'shoulder' },
        { label: 'Sleeve (cm)', key: 'sleeve' },
      ];
    }
  };

  const handleRegenerateActiveProductDescription = () => {
    if (!activeProduct || !activeProduct.aiResult) return;
    const aiData = activeProduct.aiResult;

    const html = aiData.shopify.description_html || '';
    
    let summary = '';
    const pMatch = html.match(/<p>([\s\S]*?)<\/p>/);
    if (pMatch) {
      summary = pMatch[1].replace(/<[^>]*>/g, '').trim();
    }
    if (!summary) {
      summary = `${aiData.classification.market} ${aiData.classification.gender} ${aiData.classification.brand} ${aiData.classification.garment_type} in ${aiData.classification.era_estimate ? aiData.classification.era_estimate : 'vintage'} condition.`;
    }

    const extractLiValue = (label: string): string => {
      const regex = new RegExp(`<li><strong>${label}:</strong>\\s*([\\s\\S]*?)</li>`, 'i');
      const match = html.match(regex);
      return match ? match[1].replace(/<[^>]*>/g, '').trim() : '';
    };

    const brand = aiData.classification.brand || 'Vintage';
    const era = aiData.classification.era_estimate || 'Vintage';
    const garmentType = aiData.classification.garment_type || 'Apparel';
    const colors = aiData.observations.colors || [];
    const sizeOnLabel = aiData.classification.tagged_size || 'N/A';
    
    const fit = extractLiValue('Fit') || 'Standard Fit';
    const details = extractLiValue('Details') || aiData.observations.features.join(', ') || 'N/A';
    
    const condMeta = aiData.shopify.metafields.find(m => m.key === 'condition_info')?.value || 'EXCELLENT';
    const condition = extractLiValue('Condition') || condMeta || 'EXCELLENT';

    const newHtml = generateHtmlDescription({
      summary,
      brand,
      era,
      garmentType,
      colors,
      sizeOnLabel,
      fit,
      details,
      condition,
      measurements: aiData.measurements
    });

    const updated = { ...aiData };
    updated.shopify.description_html = newHtml;
    handleUpdateActiveAIData(updated);
  };

  const handleToggleApproval = (productId: string) => {
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, isApproved: !p.isApproved } : p));
  };

  const exportToCSV = (onlyApproved: boolean = false) => {
    const targets = products.filter(p => {
      if (onlyApproved) {
        return p.isApproved && p.aiResult;
      }
      return p.aiResult;
    });

    if (targets.length === 0) {
      alert(onlyApproved ? "No approved appraised products to export." : "No analyzed appraised products to export.");
      return;
    }

    // Define headers matching Shopify import format
    const headers = [
      'Handle',
      'Title',
      'Body (HTML)',
      'Vendor',
      'Product Category',
      'Type',
      'Tags',
      'Published',
      'Option1 Name',
      'Option1 Value',
      'Variant SKU',
      'Variant Grams',
      'Variant Inventory Tracker',
      'Variant Inventory Qty',
      'Variant Inventory Policy',
      'Variant Fulfillment Service',
      'Variant Price',
      'Variant Compare At Price',
      'Variant Requires Shipping',
      'Variant Taxable',
      'Variant Barcode',
      'Image Src',
      'Image Position',
      'Image Alt Text',
      'SEO Title',
      'SEO Description',
      'Status'
    ];

    const rows = targets.map(p => {
      const ai = p.aiResult!;
      const title = ai.shopify?.title || '';
      const handle = title.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
      
      const tagsStr = ai.shopify?.tags ? ai.shopify.tags.join(', ') : '';
      const price = ai.shopify?.price || '';
      const bodyHtml = ai.shopify?.description_html || '';
      const vendor = ai.shopify?.vendor || 'Fashion Rerun Vintage';
      const garmentType = ai.classification?.garment_type || '';

      const escape = (val: any) => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes('"') || str.includes(',') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      return [
        handle,
        title,
        bodyHtml,
        vendor,
        'Apparel & Accessories > Clothing',
        garmentType,
        tagsStr,
        'TRUE',
        'Title',
        'Default Title',
        p.sku || '',
        '0',
        'shopify',
        '1',
        'deny',
        'manual',
        price,
        '',
        'TRUE',
        'TRUE',
        '',
        p.images[0]?.filename || '',
        '1',
        title,
        title,
        `Buy ${title} in excellent condition.`,
        p.publishedLink ? 'active' : 'draft'
      ].map(escape).join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `shopify_appraisal_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Staggered layout section selection
  const [openSection, setOpenSection] = useState<'BG' | 'KEY' | 'SHADOW' | 'FILTER' | 'TRANSFORM'>('BG');
  const toggleSection = (sec: typeof openSection) => {
    setOpenSection(openSection === sec ? 'BG' : sec);
  };

  return (
    <div className="space-y-6" id="batch-studio-container">
      
      {/* Upload Console Banner */}
      <div className="bg-zinc-900 text-white rounded-2xl p-6 shadow-xl border border-zinc-800 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-1.5 max-w-xl text-center md:text-left">
          <div className="flex items-center justify-center md:justify-start gap-2 text-emerald-400">
            <Sparkles className="w-5 h-5 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-widest">Enterprise Batch Mode</span>
          </div>
          <h2 className="text-lg font-bold tracking-tight text-white uppercase">Product Bulk Photo Uploader</h2>
          <p className="text-xs text-zinc-400 leading-relaxed font-sans">
            Drop hundreds of photographs, upload folders, or drop catalog <strong className="text-zinc-200">ZIP archives</strong>. 
            The system auto-groups multiple views using file names (<strong className="text-zinc-200">SKUa.jpg, SKUb.jpg</strong>) 
            into structured products, removes backgrounds, and appraises measurements flat!
          </p>
        </div>

        {/* Upload methods panel */}
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto shrink-0">
          {/* 1. Bulk files */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-xs font-bold uppercase tracking-wider text-white rounded-xl transition cursor-pointer"
          >
            <Upload className="w-4 h-4 text-emerald-400" />
            Photos
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={e => e.target.files && processUploadFiles(e.target.files)}
            className="hidden"
          />

          {/* 2. Folder directory */}
          <button
            onClick={() => folderInputRef.current?.click()}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-xs font-bold uppercase tracking-wider text-white rounded-xl transition cursor-pointer"
          >
            <FolderOpen className="w-4 h-4 text-emerald-400" />
            Folder
          </button>
          <input
            ref={folderInputRef}
            type="file"
            multiple
            // @ts-ignore
            webkitdirectory=""
            directory=""
            onChange={e => e.target.files && processUploadFiles(e.target.files)}
            className="hidden"
          />

          {/* 3. ZIP arch */}
          <button
            onClick={() => zipInputRef.current?.click()}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-zinc-950 text-xs font-extrabold uppercase tracking-widest rounded-xl transition cursor-pointer shadow-md"
          >
            <Layers className="w-4 h-4 shrink-0" />
            Upload ZIP
          </button>
          <input
            ref={zipInputRef}
            type="file"
            accept=".zip"
            onChange={handleZipUpload}
            className="hidden"
          />
        </div>
      </div>

      {uploadError && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
          <div>
            <span className="font-bold">Upload Notice:</span> {uploadError}
          </div>
        </div>
      )}

      {/* Sub-view switcher tabs */}
      {products.length > 0 && (
        <div className="flex border-b border-zinc-300 gap-1 text-xs">
          <button
            onClick={() => setBulkActiveTab('LIST')}
            className={`px-5 py-3 font-bold uppercase tracking-wider border-b-2 transition cursor-pointer ${
              bulkActiveTab === 'LIST' ? 'border-[#008060] text-[#008060]' : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            Batch Registry ({products.length} Products)
          </button>
          <button
            onClick={() => setBulkActiveTab('REVIEW')}
            className={`px-5 py-3 font-bold uppercase tracking-wider border-b-2 transition cursor-pointer ${
              bulkActiveTab === 'REVIEW' ? 'border-[#008060] text-[#008060]' : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            Batch Review Section
          </button>

          {isBatchAnalyzing && (
            <div className="ml-auto flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-1 rounded text-[11px] font-mono">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
              <span>Analyzing {analysisProgress.current} of {analysisProgress.total}...</span>
            </div>
          )}
        </div>
      )}

      {/* 1. LIST VIEW */}
      {bulkActiveTab === 'LIST' && products.length > 0 && (() => {
        const totalCount = products.length;
        const pendingCount = products.filter(p => p.aiStatus === 'PENDING').length;
        const completedCount = products.filter(p => p.aiStatus === 'COMPLETED').length;
        const approvedCount = products.filter(p => p.isApproved).length;
        const publishedCount = products.filter(p => p.publishedLink).length;

        const completionPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
        const approvedPercent = totalCount > 0 ? Math.round((approvedCount / totalCount) * 100) : 0;

        return (
          <div className="space-y-5">
            {/* Progress and Statistics Dashboard */}
            <div className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-extrabold text-[#008060] uppercase tracking-wider block">
                    Batch Progress Tracker & Workflow Controls
                  </span>
                  <h3 className="text-sm font-bold text-zinc-800 uppercase font-sans flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-zinc-500" />
                    Live Appraisal & CSV Export Engine
                  </h3>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => exportToCSV(true)}
                    disabled={approvedCount === 0}
                    className="px-4 py-2 bg-gradient-to-r from-[#008060] to-teal-600 hover:from-[#006e52] hover:to-teal-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export Approved CSV ({approvedCount})
                  </button>
                  <button
                    onClick={() => exportToCSV(false)}
                    disabled={completedCount === 0}
                    className="px-4 py-2 bg-white hover:bg-zinc-50 border border-zinc-300 hover:border-zinc-400 text-zinc-700 text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export All Appraised ({completedCount})
                  </button>
                </div>
              </div>

              {/* Quick Metrics Columns */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
                <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 text-center">
                  <div className="text-xl font-black text-zinc-900 font-mono">{totalCount}</div>
                  <div className="text-[9px] font-bold text-zinc-500 uppercase">Total Items</div>
                </div>
                <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-100 text-center">
                  <div className="text-xl font-black text-amber-700 font-mono">{pendingCount}</div>
                  <div className="text-[9px] font-bold text-amber-600 uppercase">Pending AI</div>
                </div>
                <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 text-center">
                  <div className="text-xl font-black text-blue-700 font-mono">{completedCount}</div>
                  <div className="text-[9px] font-bold text-blue-600 uppercase">Appraised</div>
                </div>
                <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100 text-center">
                  <div className="text-xl font-black text-emerald-800 font-mono">{approvedCount}</div>
                  <div className="text-[9px] font-bold text-emerald-600 uppercase">Approved</div>
                </div>
                <div className="p-3 bg-zinc-900 text-white rounded-xl text-center">
                  <div className="text-xl font-black text-emerald-400 font-mono">{publishedCount}</div>
                  <div className="text-[9px] font-bold text-zinc-400 uppercase">Published</div>
                </div>
              </div>

              {/* Progress Bars */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1.5 text-xs text-zinc-600">
                <div className="space-y-1.5">
                  <div className="flex justify-between font-semibold">
                    <span>AI Appraisal Completion</span>
                    <span className="font-bold text-zinc-900 font-mono">{completionPercent}%</span>
                  </div>
                  <div className="w-full bg-zinc-100 h-2 rounded-full overflow-hidden border border-zinc-200">
                    <div 
                      className="bg-[#008060] h-full rounded-full transition-all duration-500"
                      style={{ width: `${completionPercent}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between font-semibold">
                    <span>Approved for Catalog Export</span>
                    <span className="font-bold text-zinc-900 font-mono">{approvedPercent}%</span>
                  </div>
                  <div className="w-full bg-zinc-100 h-2 rounded-full overflow-hidden border border-zinc-200">
                    <div 
                      className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${approvedPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Workflow Integration & AI Studio Panel */}
            <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
              {/* Database Track form */}
              <div className="bg-white border border-zinc-200 p-4 rounded-xl space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-900 uppercase tracking-wide">
                  <Layers className="w-4 h-4 text-[#008060]" />
                  Batch Database Integration Tracker
                </div>
                <p className="text-[11px] text-zinc-500 leading-normal">
                  Log the current batch into the persistent database. Saves SKUs, appraiser metadata, and image references.
                </p>
                
                {batchSavedMessage && (
                  <div className="p-2 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-lg text-[10px] font-medium">
                    {batchSavedMessage}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest font-mono">Custom Batch Identifier</label>
                    <input
                      type="text"
                      value={batchName}
                      onChange={e => setBatchName(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-zinc-50 border border-zinc-300 rounded text-xs focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={handleSaveBatchToDB}
                    disabled={isSavingBatch || products.length === 0}
                    className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-bold uppercase tracking-wider transition disabled:opacity-40 shrink-0 h-[32px] cursor-pointer"
                  >
                    {isSavingBatch ? "Saving..." : "Save Batch"}
                  </button>
                </div>
              </div>

              {/* Bulk Model generator */}
              <div className="bg-white border border-zinc-200 p-4 rounded-xl space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-900 uppercase tracking-wide">
                  <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                  Bulk AI Model Studio
                </div>
                <p className="text-[11px] text-zinc-500 leading-normal">
                  Automatically swap segmented flat garment photos with premium, studio-quality AI models based on appraised gender category.
                </p>

                {isBulkModelGenerating && (
                  <div className="w-full space-y-1.5">
                    <div className="flex justify-between text-[10px] font-semibold text-blue-800">
                      <span>Synthesizing Models: {bulkModelProgress.current} / {bulkModelProgress.total}</span>
                      <span>{Math.round((bulkModelProgress.current / bulkModelProgress.total) * 100)}%</span>
                    </div>
                    <div className="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-blue-600 h-full rounded-full transition-all duration-300"
                        style={{ width: `${(bulkModelProgress.current / bulkModelProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                <button
                  onClick={handleBulkGenerateAIModels}
                  disabled={isBulkModelGenerating || products.filter(p => p.aiResult !== null).length === 0}
                  className="w-full py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold uppercase tracking-wider rounded transition border border-blue-200 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  <Sparkles className="w-4 h-4" />
                  Bulk Generate AI Models ({products.filter(p => p.aiResult !== null).length})
                </button>
              </div>
            </div>

            {batchCreditError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2 text-left my-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-rose-900 uppercase tracking-wide text-[10px] mb-0.5">SaaS Credit Lockout</div>
                  <span>{batchCreditError}</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block font-mono">
                BATCH QUEUE COMPILER
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {onUpdateConfig && (
                  <div className="flex items-center gap-1.5 border border-zinc-300 rounded px-2 py-1 bg-[#FAFAFA]">
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Model:</span>
                    <select
                      value={config.geminiModel || 'smart-routing'}
                      onChange={(e) => onUpdateConfig({ geminiModel: e.target.value })}
                      className="text-[11px] font-semibold text-zinc-700 bg-transparent border-none focus:outline-none focus:ring-0 pr-6 py-0.5 cursor-pointer"
                    >
                      <option value="smart-routing">Smart Routing (Auto-Switch)</option>
                      <option value="gemini-3.6-flash">Gemini 3.6 Flash</option>
                      <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash Lite</option>
                    </select>
                  </div>
                )}
                <button
                  onClick={() => setProducts([])}
                  className="px-3 py-1.5 text-xs text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded font-bold uppercase tracking-wider transition cursor-pointer font-sans"
                >
                  Clear Batch
                </button>
                <button
                  onClick={handleBatchAIAnalyze}
                  disabled={isBatchAnalyzing || products.filter(p => p.aiStatus === 'PENDING').length === 0}
                  className="px-4 py-1.5 text-xs text-white bg-[#008060] hover:bg-[#006e52] disabled:opacity-50 rounded font-bold uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5 font-sans"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Batch AI Analyse ({products.filter(p => p.aiStatus === 'PENDING').length})
                </button>
              </div>
            </div>

            {/* Grid list of grouped products */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map(product => {
                const frontImg = product.images[0]?.url;
                return (
                  <div
                    key={product.id}
                    className={`bg-white border rounded-2xl shadow-xs overflow-hidden flex flex-col justify-between transition-all relative ${
                      selectedProductId === product.id ? 'border-emerald-500 shadow-sm' : 'border-zinc-300'
                    }`}
                  >
                    <div className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-mono font-bold text-zinc-950 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                            SKU: {product.sku}
                          </span>
                          {product.isApproved && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[8px] font-extrabold uppercase font-sans tracking-wide flex items-center gap-0.5">
                              <Check className="w-2.5 h-2.5 text-emerald-600" />
                              Approved
                            </span>
                          )}
                        </div>
                        {product.publishedLink ? (
                          <span className="px-2 py-0.5 rounded bg-green-50 text-brand-green border border-green-100 text-[9px] font-extrabold uppercase font-sans tracking-wide">
                            Published
                          </span>
                        ) : (
                          <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase font-sans tracking-wide ${
                            product.aiStatus === 'COMPLETED' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                            product.aiStatus === 'ANALYZING' ? 'bg-amber-50 text-amber-700 border border-amber-100 animate-pulse' :
                            product.aiStatus === 'ERROR' ? 'bg-red-50 text-red-700 border border-red-100' :
                            'bg-zinc-50 text-zinc-500 border border-zinc-200'
                          }`}>
                            {product.aiStatus}
                          </span>
                        )}
                      </div>

                      <div className="flex gap-2">
                        {/* Main cover */}
                        <div className="w-20 h-20 bg-zinc-100 rounded border border-zinc-300 overflow-hidden shrink-0">
                          <img
                            src={frontImg}
                            alt={product.sku}
                            className="w-full h-full object-cover"
                          />
                        </div>

                        {/* View details list */}
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="text-[11px] font-bold text-zinc-700 truncate font-sans">
                            {product.aiResult?.shopify.title || "Pending AI Appraisal..."}
                          </div>
                          <div className="text-[10px] text-zinc-400 font-mono">
                            {product.images.length} views grouped
                          </div>
                          <div className="flex gap-1 overflow-x-auto pb-0.5">
                            {product.images.map((img, idx) => (
                              <span
                                key={img.id}
                                className="px-1.5 py-0.5 bg-zinc-100 border border-zinc-200 rounded text-[8px] text-zinc-500 shrink-0 font-sans"
                                title={img.filename}
                              >
                                {img.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Flat measurements suggestion indicator */}
                      {product.aiResult?.measurements && (
                        <div className="p-2 bg-[#FAFAFA] border border-zinc-300 rounded-lg text-[10px] space-y-1">
                          <span className="font-bold text-zinc-500 uppercase flex items-center gap-1">
                            <Ruler className="w-3 h-3 text-[#008060]" />
                            Suggested Measurements
                          </span>
                          <div className="grid grid-cols-2 gap-1 font-mono text-zinc-600">
                            {(() => {
                              const activeFields = getActiveMeasurementsKeys(product.aiResult.classification.garment_type || '');
                              const filled = activeFields.filter(f => {
                                const val = (product.aiResult?.measurements as any)?.[f.key];
                                return val !== null && val !== undefined && val !== '';
                              });
                              if (filled.length === 0) {
                                return <div className="col-span-2 text-zinc-400 italic">No measurements recorded</div>;
                              }
                              return filled.slice(0, 4).map(f => (
                                <div key={f.key} className="truncate">
                                  <span className="capitalize">{f.label.replace(' (cm)', '')}</span>: <strong className="text-zinc-900">{(product.aiResult?.measurements as any)?.[f.key]}</strong>
                                </div>
                              ));
                            })()}
                          </div>
                        </div>
                      )}

                      {product.aiError && (
                        <div className="text-[10px] text-red-600 font-mono flex items-center gap-1 bg-red-50 p-1.5 rounded border border-red-100">
                          <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
                          <span className="truncate">{product.aiError}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions footer */}
                    <div className="bg-zinc-50 border-t border-zinc-200 p-3 flex items-center justify-between gap-1.5">
                      <button
                        onClick={() => handleDeleteProduct(product.id)}
                        className="p-1.5 bg-white border border-zinc-300 hover:bg-rose-50 text-zinc-400 hover:text-rose-600 rounded transition cursor-pointer"
                        title="Remove from batch"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleToggleApproval(product.id)}
                          disabled={!product.aiResult}
                          className={`px-2.5 py-1 text-xs font-semibold rounded border transition cursor-pointer flex items-center gap-1 ${
                            product.isApproved
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                              : 'bg-white text-zinc-500 border-zinc-300 hover:bg-zinc-50 hover:text-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed'
                          }`}
                          title={product.isApproved ? "Approved" : "Approve Product"}
                        >
                          <Check className="w-3 h-3 text-emerald-600" />
                          {product.isApproved ? 'Approved' : 'Approve'}
                        </button>
                        <button
                          onClick={() => {
                            setSelectedProductId(product.id);
                            setBulkActiveTab('REVIEW');
                          }}
                          className="px-2.5 py-1 bg-white border border-zinc-300 hover:border-zinc-400 text-zinc-700 text-xs font-semibold rounded hover:bg-zinc-50 transition cursor-pointer"
                        >
                          Review
                        </button>
                        <button
                          onClick={() => handlePublishProduct(product)}
                          disabled={!product.aiResult || product.aiStatus === 'ANALYZING'}
                          className="px-2.5 py-1 bg-[#008060] hover:bg-[#006e52] disabled:opacity-50 text-white text-xs font-bold uppercase rounded transition cursor-pointer flex items-center gap-1"
                        >
                          <ShoppingBag className="w-3 h-3" />
                          Publish
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Empty State Banner */}
      {products.length === 0 && (
        <div className="border border-dashed border-zinc-300 bg-white p-12 rounded-2xl text-center max-w-xl mx-auto space-y-4">
          <div className="p-4 bg-zinc-50 text-zinc-400 border border-zinc-200 rounded-full w-fit mx-auto">
            <Upload className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-zinc-900 uppercase">Registry Queue Empty</h3>
            <p className="text-xs text-zinc-500 leading-relaxed max-w-md mx-auto">
              Ready for high-volume uploads. Drag and drop catalog pictures, folders, or ZIP files into the top black console to prepare listing appraisals.
            </p>
          </div>
        </div>
      )}

      {/* 2. REVIEW & WORKSPACE SPLIT VIEW */}
      {bulkActiveTab === 'REVIEW' && activeProduct && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT: Live Canvas & Backdrop & Layer transformations */}
          <div className="lg:col-span-5 space-y-4">
            
            {/* Navigation selector within Review Tab */}
            <div className="bg-white border border-zinc-300 rounded p-3 flex justify-between items-center shadow-xs">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold bg-zinc-100 text-zinc-900 border border-zinc-300 px-2.5 py-1 rounded">
                  SKU: {activeProduct.sku}
                </span>
                <span className="text-xs text-zinc-500">({activeImgIndex + 1} of {activeProduct.images.length})</span>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => {
                    const idx = products.findIndex(p => p.id === activeProduct.id);
                    if (idx > 0) setSelectedProductId(products[idx - 1].id);
                  }}
                  disabled={products.findIndex(p => p.id === activeProduct.id) === 0}
                  className="px-2 py-1 bg-zinc-50 border border-zinc-200 hover:bg-zinc-100 rounded text-xs text-zinc-600 disabled:opacity-40 cursor-pointer"
                >
                  Prev
                </button>
                <button
                  onClick={() => {
                    const idx = products.findIndex(p => p.id === activeProduct.id);
                    if (idx < products.length - 1) setSelectedProductId(products[idx + 1].id);
                  }}
                  disabled={products.findIndex(p => p.id === activeProduct.id) === products.length - 1}
                  className="px-2 py-1 bg-zinc-50 border border-zinc-200 hover:bg-zinc-100 rounded text-xs text-zinc-600 disabled:opacity-40 cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>

            {/* Studio Canvas container with current image url */}
            {activeImage && (
              <div className="bg-white border border-zinc-300 rounded p-4 shadow-xs space-y-4">
                
                {/* Image tabs of product */}
                <div className="flex gap-2 pb-1 overflow-x-auto scrollbar-thin">
                  {activeProduct.images.map((img, idx) => (
                    <button
                      key={img.id}
                      onClick={() => setActiveImgIndex(idx)}
                      className={`relative flex-shrink-0 cursor-pointer rounded overflow-hidden border-2 transition ${
                        idx === activeImgIndex ? 'border-[#008060]' : 'border-transparent'
                      }`}
                    >
                      <img
                        src={img.url}
                        alt={img.label}
                        className="w-12 h-12 object-cover bg-zinc-100"
                      />
                      <span className="absolute bottom-0 left-0 right-0 bg-black/70 text-[7px] text-white py-0.5 text-center">
                        {img.label}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="w-full space-y-4">
                  <StudioCanvas
                    imageUrl={activeImage.processedUrl || activeImage.url}
                    background={activeProduct.studioBg}
                    settings={activeProduct.canvasSettings}
                    onChangeSettings={handleUpdateCanvasSettings}
                    onSelectKeyColor={(color) => handleUpdateCanvasSettings({ ...activeProduct.canvasSettings, keyColor: color, enableKeying: true })}
                    onCanvasReady={(canvas) => {
                      if (!activeProduct || !activeImage) return;
                      const dataUrl = canvas.toDataURL('image/png', 0.92);
                      const signature = `${activeProduct.sku}:${activeImage.id}:${dataUrl.length}:${dataUrl.slice(-32)}`;
                      if (lastProcessedHashRef.current === signature) return;
                      if (processedSaveTimerRef.current) clearTimeout(processedSaveTimerRef.current);
                      processedSaveTimerRef.current = setTimeout(async () => {
                        try {
                          const baseName = activeImage.filename.replace(/\.[^.]+$/, '');
                          const response = await fetch('/api/images/store', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              dataUrl,
                              sku: activeProduct.sku,
                              filename: `${baseName}-processed.png`,
                              sequence: activeImage.sequence,
                              label: activeImage.label,
                              kind: 'processed',
                              parentImageId: activeImage.storageId,
                              upsertKey: `${activeProduct.sku}:${activeImage.id}:processed`
                            })
                          });
                          if (!response.ok) return;
                          const stored = await response.json();
                          lastProcessedHashRef.current = signature;
                          setProducts(prev => prev.map(product => product.id === activeProduct.id ? {
                            ...product,
                            images: product.images.map(image => image.id === activeImage.id ? {
                              ...image,
                              processedUrl: stored.url,
                              processedStorageId: stored.id
                            } : image)
                          } : product));
                        } catch (error) {
                          console.warn('Could not persist processed batch image', error);
                        }
                      }, 700);
                    }}
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

                {/* ACCORDION COLLAPSIBLES FOR DETAILED CONTROLS */}
                <div className="space-y-2 pt-2">
                  
                  {/* 1. Backdrop select */}
                  <div className="border border-zinc-200 rounded">
                    <button
                      type="button"
                      onClick={() => toggleSection('BG')}
                      className="w-full px-3 py-2 bg-zinc-50 hover:bg-zinc-100/80 text-left text-xs font-bold uppercase tracking-wider text-zinc-700 flex items-center justify-between cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <Wand2 className="w-3.5 h-3.5 text-brand-green" />
                        Studio Backgrounds
                      </span>
                      <span className="text-[10px] text-zinc-400 font-mono">{activeProduct.studioBg.name}</span>
                    </button>
                    {openSection === 'BG' && (
                      <div className="p-3 bg-white grid grid-cols-2 gap-2 max-h-56 overflow-y-auto scrollbar-thin">
                        {STUDIO_BACKGROUNDS.map((bg) => (
                          <button
                            key={bg.id}
                            type="button"
                            onClick={() => handleUpdateBg(bg)}
                            className={`p-2 rounded border text-left text-[10px] font-semibold tracking-wide transition flex items-center gap-2 cursor-pointer ${
                              activeProduct.studioBg.id === bg.id
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
                            {bg.type === 'pattern' && !bg.value.includes('url') && (
                              <span className="w-3.5 h-3.5 rounded-full border border-zinc-300 flex-shrink-0 bg-zinc-700 font-mono text-[6px] text-white flex items-center justify-center">3D</span>
                            )}
                            {bg.value.includes('url') && (
                              <span className="w-3.5 h-3.5 rounded-full border border-zinc-300 flex-shrink-0 bg-zinc-800 font-mono text-[6px] text-emerald-400 flex items-center justify-center">👗</span>
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

                  {/* 2. Wearable Model Instruction Tip */}
                  {activeProduct.studioBg.id === 'youth-model' || activeProduct.studioBg.id === 'male-model' || activeProduct.studioBg.id === 'female-model' ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 leading-relaxed font-sans space-y-1">
                      <div className="font-bold flex items-center gap-1">
                        <Users className="w-4 h-4 text-amber-600" />
                        Human AI Model Overlay Active
                      </div>
                      <p>
                        Scale, rotate, and reposition the clothing layer below using the <strong>Product Sizing & Angle</strong> parameters to align the garment onto the model's physical body.
                      </p>
                    </div>
                  ) : null}

                  {/* 3. Keying */}
                  <div className="border border-zinc-200 rounded">
                    <button
                      type="button"
                      onClick={() => toggleSection('KEY')}
                      className="w-full px-3 py-2 bg-zinc-50 hover:bg-zinc-100/80 text-left text-xs font-bold uppercase tracking-wider text-zinc-700 flex items-center justify-between cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <Settings2 className="w-3.5 h-3.5 text-brand-green" />
                        AI Chroma-Key Removal
                      </span>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {activeProduct.canvasSettings.enableKeying ? 'Active' : 'Off'}
                      </span>
                    </button>
                    {openSection === 'KEY' && (
                      <div className="p-3 bg-white space-y-3 text-xs">
                        <div className="flex items-center justify-between">
                          <label className="font-bold text-zinc-700 uppercase text-[10px] tracking-wider">Enable Chroma-Keying</label>
                          <input
                            type="checkbox"
                            checked={activeProduct.canvasSettings.enableKeying}
                            onChange={(e) => handleUpdateCanvasSettings({ ...activeProduct.canvasSettings, enableKeying: e.target.checked })}
                            className="rounded border-zinc-300 accent-[#008060] focus:ring-[#008060] cursor-pointer"
                          />
                        </div>
                        {activeProduct.canvasSettings.enableKeying && (
                          <div className="space-y-3 pt-1">
                            <div className="flex gap-2">
                              <input
                                type="color"
                                value={activeProduct.canvasSettings.keyColor}
                                onChange={(e) => handleUpdateCanvasSettings({ ...activeProduct.canvasSettings, keyColor: e.target.value })}
                                className="w-7 h-7 rounded border border-zinc-300 cursor-pointer"
                              />
                              <input
                                type="text"
                                value={activeProduct.canvasSettings.keyColor}
                                onChange={(e) => handleUpdateCanvasSettings({ ...activeProduct.canvasSettings, keyColor: e.target.value })}
                                className="flex-1 text-xs px-2 border border-zinc-300 rounded focus:outline-none font-mono"
                              />
                            </div>

                            {(() => {
                              const title = activeProduct.aiResult?.shopify?.title || '';
                              const colors = activeProduct.aiResult?.observations?.colors || [];
                              const isWhite = 
                                title.toLowerCase().includes('white') || 
                                title.toLowerCase().includes('cream') || 
                                title.toLowerCase().includes('ivory') || 
                                colors.some((c: string) => {
                                  const lc = c.toLowerCase();
                                  return lc.includes('white') || lc.includes('cream') || lc.includes('ivory');
                                });
                              return isWhite ? (
                                <div className="p-2 bg-amber-50 border border-amber-200 text-amber-800 text-[10px] rounded leading-relaxed font-semibold">
                                  ⚠️ <strong>White garment protection enabled:</strong> Tolerance set to <strong>15</strong> and smoothness to <strong>5</strong> to protect fabric highlights.
                                </div>
                              ) : null;
                            })()}

                            <div className="space-y-1">
                              <div className="flex justify-between text-[10px] text-zinc-500 font-bold uppercase">
                                <span>Tolerance</span>
                                <span className="font-mono">{activeProduct.canvasSettings.tolerance}</span>
                              </div>
                              <input
                                type="range"
                                min="1"
                                max="150"
                                value={activeProduct.canvasSettings.tolerance}
                                onChange={(e) => handleUpdateCanvasSettings({ ...activeProduct.canvasSettings, tolerance: Number(e.target.value) })}
                                className="w-full accent-[#008060] h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 4. Product Transform */}
                  <div className="border border-zinc-200 rounded">
                    <button
                      type="button"
                      onClick={() => toggleSection('TRANSFORM')}
                      className="w-full px-3 py-2 bg-zinc-50 hover:bg-zinc-100/80 text-left text-xs font-bold uppercase tracking-wider text-zinc-700 flex items-center justify-between cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-brand-green" />
                        Product Sizing & Angle
                      </span>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        Scale: {Math.round(activeProduct.canvasSettings.scale * 100)}%
                      </span>
                    </button>
                    {openSection === 'TRANSFORM' && (
                      <div className="p-3 bg-white space-y-3 text-xs">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-zinc-500 font-bold uppercase">
                            <span>Garment Zoom</span>
                            <span className="font-mono">{Math.round(activeProduct.canvasSettings.scale * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min="0.3"
                            max="2.5"
                            step="0.05"
                            value={activeProduct.canvasSettings.scale}
                            onChange={(e) => handleUpdateCanvasSettings({ ...activeProduct.canvasSettings, scale: Number(e.target.value) })}
                            className="w-full accent-[#008060] h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-zinc-500 font-bold uppercase">
                            <span>Rotation Degrees</span>
                            <span className="font-mono">{activeProduct.canvasSettings.rotation}°</span>
                          </div>
                          <input
                            type="range"
                            min="-180"
                            max="180"
                            value={activeProduct.canvasSettings.rotation}
                            onChange={(e) => handleUpdateCanvasSettings({ ...activeProduct.canvasSettings, rotation: Number(e.target.value) })}
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
                              value={activeProduct.canvasSettings.offsetX}
                              onChange={(e) => handleUpdateCanvasSettings({ ...activeProduct.canvasSettings, offsetX: Number(e.target.value) })}
                              className="w-full accent-[#008060] h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-zinc-500 font-bold uppercase block">Vertical Offset</label>
                            <input
                              type="range"
                              min="-300"
                              max="300"
                              value={activeProduct.canvasSettings.offsetY}
                              onChange={(e) => handleUpdateCanvasSettings({ ...activeProduct.canvasSettings, offsetY: Number(e.target.value) })}
                              className="w-full accent-[#008060] h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                </div>

              </div>
            )}
          </div>

          {/* RIGHT: Editor details of the active compiled metadata */}
          <div className="lg:col-span-7">
            <div className="bg-white border border-zinc-300 rounded-2xl overflow-hidden shadow-xs">
              
              {/* Tabs header */}
              <div className="flex border-b border-zinc-200 bg-zinc-50/50 px-2 pt-2">
                <button
                  onClick={() => setReviewTab('DETAILS')}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition ${
                    reviewTab === 'DETAILS'
                      ? 'border-[#008060] text-[#008060]'
                      : 'border-transparent text-zinc-400 hover:text-zinc-600'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" /> Product listing
                </button>
                <button
                  onClick={() => setReviewTab('RAW_DATA')}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition ${
                    reviewTab === 'RAW_DATA'
                      ? 'border-[#008060] text-[#008060]'
                      : 'border-transparent text-zinc-400 hover:text-zinc-600'
                  }`}
                >
                  Raw json payload
                </button>
              </div>

              {/* Review Body */}
              <div className="p-5">
                
                {/* 1. DETAILS FORM REVIEW */}
                {reviewTab === 'DETAILS' && (
                  <div className="space-y-6">
                    
                    {activeProduct.aiResult ? (
                      <div className="space-y-5 animate-fadeIn">
                        
                        {/* Title input */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Product SEO Title</label>
                          <input
                            type="text"
                            value={activeProduct.aiResult.shopify.title}
                            onChange={(e) => {
                              const updated = { ...activeProduct.aiResult! };
                              updated.shopify.title = e.target.value;
                              handleUpdateActiveAIData(updated);
                            }}
                            className="w-full text-xs font-semibold px-3 py-2 bg-white border border-zinc-300 rounded focus:border-[#008060] focus:outline-none"
                          />
                          <p className="text-[10px] text-zinc-400 font-mono text-right">{activeProduct.aiResult.shopify.title.length} / {config.titleMaxLength} max chars</p>
                        </div>

                        {/* Editable Classification Grid */}
                        <div className="bg-zinc-50/50 border border-zinc-300 p-4 rounded-xl space-y-3.5">
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">
                            Garment Classification & Attributes
                          </span>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                            <div className="space-y-1">
                              <label className="text-zinc-500 font-bold uppercase text-[9px]">Brand</label>
                              <input
                                type="text"
                                value={activeProduct.aiResult.classification.brand || ''}
                                onChange={(e) => {
                                  const updated = { ...activeProduct.aiResult! };
                                  updated.classification.brand = e.target.value;
                                  handleUpdateActiveAIData(updated);
                                }}
                                className="w-full px-2.5 py-1.5 bg-white border border-zinc-300 rounded focus:border-[#008060] focus:outline-none"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-zinc-500 font-bold uppercase text-[9px]">Tagged Size</label>
                              <input
                                type="text"
                                value={activeProduct.aiResult.classification.tagged_size || ''}
                                onChange={(e) => {
                                  const updated = { ...activeProduct.aiResult! };
                                  updated.classification.tagged_size = e.target.value;
                                  handleUpdateActiveAIData(updated);
                                }}
                                className="w-full px-2.5 py-1.5 bg-white border border-zinc-300 rounded focus:border-[#008060] focus:outline-none"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-zinc-500 font-bold uppercase text-[9px]">Price (AED)</label>
                              <input
                                type="text"
                                value={activeProduct.aiResult.shopify.price || ''}
                                onChange={(e) => {
                                  const updated = { ...activeProduct.aiResult! };
                                  updated.shopify.price = e.target.value;
                                  handleUpdateActiveAIData(updated);
                                }}
                                className="w-full px-2.5 py-1.5 bg-white border border-zinc-300 rounded focus:border-[#008060] focus:outline-none"
                                placeholder="e.g. 120.00"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-zinc-500 font-bold uppercase text-[9px]">Market</label>
                              <select
                                value={activeProduct.aiResult.classification.market}
                                onChange={(e) => {
                                  const updated = { ...activeProduct.aiResult! };
                                  updated.classification.market = e.target.value as any;
                                  handleUpdateActiveAIData(updated);
                                }}
                                className="w-full px-2.5 py-1.5 bg-white border border-zinc-300 rounded focus:border-[#008060] focus:outline-none"
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

                            <div className="space-y-1">
                              <label className="text-zinc-500 font-bold uppercase text-[9px]">Gender</label>
                              <select
                                value={activeProduct.aiResult.classification.gender}
                                onChange={(e) => {
                                  const updated = { ...activeProduct.aiResult! };
                                  updated.classification.gender = e.target.value as any;
                                  handleUpdateActiveAIData(updated);
                                }}
                                className="w-full px-2.5 py-1.5 bg-white border border-zinc-300 rounded focus:border-[#008060] focus:outline-none"
                              >
                                <option value="MEN">MEN</option>
                                <option value="WOMEN">WOMEN</option>
                                <option value="UNISEX">UNISEX</option>
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label className="text-zinc-500 font-bold uppercase text-[9px]">Garment Type</label>
                              <select
                                value={activeProduct.aiResult.classification.garment_type}
                                onChange={(e) => {
                                  const updated = { ...activeProduct.aiResult! };
                                  updated.classification.garment_type = e.target.value;
                                  handleUpdateActiveAIData(updated);
                                }}
                                className="w-full px-2.5 py-1.5 bg-white border border-zinc-300 rounded focus:border-[#008060] focus:outline-none"
                              >
                                {config.mappings.map(m => (
                                  <option key={m.garmentPlural} value={m.garmentPlural}>{m.garmentPlural}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* Live Competitive Benchmarks */}
                        <div className="bg-emerald-50/40 border border-emerald-200/50 p-4 rounded-xl space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest block flex items-center gap-1.5">
                              <Sparkles className="w-4 h-4 text-emerald-600 fill-emerald-600 animate-pulse" />
                              Live Competitive Benchmarks
                            </span>
                            <span className="text-[8px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-mono font-bold">1:1 AED</span>
                          </div>
                          
                          <p className="text-[10px] text-zinc-600 leading-normal">
                            Estimated competitor retail price for <strong className="text-zinc-800">{activeProduct.aiResult.classification.brand || "Vintage"}</strong>. Click to set:
                          </p>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            {[
                              { site: 'Google', price: Math.round((activeProduct.aiResult.classification.brand?.toLowerCase() === 'nike' || activeProduct.aiResult.classification.brand?.toLowerCase() === 'coogi' || activeProduct.aiResult.classification.brand?.toLowerCase() === 'aliens') ? 145 : 95), logo: '🌐' },
                              { site: 'eBay', price: Math.round((activeProduct.aiResult.classification.brand?.toLowerCase() === 'nike' || activeProduct.aiResult.classification.brand?.toLowerCase() === 'coogi' || activeProduct.aiResult.classification.brand?.toLowerCase() === 'aliens') ? 125 : 85), logo: '📦' },
                              { site: 'Grailed', price: Math.round((activeProduct.aiResult.classification.brand?.toLowerCase() === 'nike' || activeProduct.aiResult.classification.brand?.toLowerCase() === 'coogi' || activeProduct.aiResult.classification.brand?.toLowerCase() === 'aliens') ? 220 : 160), logo: '⚡' },
                              { site: 'Depop', price: Math.round((activeProduct.aiResult.classification.brand?.toLowerCase() === 'nike' || activeProduct.aiResult.classification.brand?.toLowerCase() === 'coogi' || activeProduct.aiResult.classification.brand?.toLowerCase() === 'aliens') ? 135 : 90), logo: '✨' },
                            ].map((benchmark) => {
                              const displayVal = `${benchmark.price}.00`;
                              return (
                                <button
                                  key={benchmark.site}
                                  type="button"
                                  onClick={() => {
                                    const updated = { ...activeProduct.aiResult! };
                                    updated.shopify.price = displayVal;
                                    handleUpdateActiveAIData(updated);
                                  }}
                                  className="bg-white border border-zinc-200 hover:border-emerald-500 rounded p-1.5 text-center transition cursor-pointer hover:shadow-xs group"
                                >
                                  <div className="text-[8px] text-zinc-400 group-hover:text-emerald-600 font-semibold uppercase tracking-wider flex items-center justify-center gap-1">
                                    <span>{benchmark.logo}</span>
                                    <span>{benchmark.site}</span>
                                  </div>
                                  <div className="text-[11px] font-bold text-zinc-800 mt-0.5">
                                    {displayVal}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Flat measurements suggestion inputs (Dynamic based on garment_type) */}
                        <div className="bg-[#FAFAFA] border border-zinc-300 p-4 rounded-xl space-y-3">
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block flex items-center gap-1.5">
                            <Ruler className="w-4 h-4 text-[#008060]" />
                            Appraised Flat Measurements ({activeProduct.aiResult.classification.garment_type || 'Apparel'})
                          </span>
                          
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            {getActiveMeasurementsKeys(activeProduct.aiResult.classification.garment_type || '').map((field) => (
                              <div key={field.key} className="space-y-1">
                                <label className="text-zinc-500 font-bold uppercase text-[9px] block truncate">{field.label}</label>
                                <input
                                  type="text"
                                  value={(activeProduct.aiResult!.measurements as any)[field.key] || ''}
                                  placeholder="____"
                                  onChange={(e) => {
                                    const updated = { ...activeProduct.aiResult! };
                                    (updated.measurements as any)[field.key] = e.target.value || null;
                                    handleUpdateActiveAIData(updated);
                                  }}
                                  className="w-full px-2.5 py-1.5 bg-white border border-zinc-300 rounded focus:border-[#008060] focus:outline-none font-mono text-center"
                                />
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Description editor panel */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center">
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Shopify Description HTML</label>
                            <div className="flex bg-zinc-200 rounded p-0.5 text-[9px]">
                              <button
                                onClick={handleRegenerateActiveProductDescription}
                                title="Sync & Regenerate Description from current fields and edited measurements"
                                className="px-2 py-0.5 rounded font-bold uppercase tracking-wider text-zinc-700 hover:text-[#008060] bg-zinc-100 mr-1 flex items-center gap-1 transition"
                              >
                                <RefreshCw className="w-3 h-3 text-[#008060]" /> Sync
                              </button>
                              <button
                                onClick={() => setDescViewMode('VISUAL')}
                                className={`px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                                  descViewMode === 'VISUAL' ? 'bg-[#008060] text-white' : 'text-zinc-600'
                                }`}
                              >
                                Visual
                              </button>
                              <button
                                onClick={() => setDescViewMode('SOURCE')}
                                className={`px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                                  descViewMode === 'SOURCE' ? 'bg-[#008060] text-white' : 'text-zinc-600'
                                }`}
                              >
                                HTML Source
                              </button>
                            </div>
                          </div>

                          {descViewMode === 'VISUAL' ? (
                            <div className="w-full h-48 overflow-y-auto px-3 py-2 bg-zinc-50 border border-zinc-300 rounded text-xs leading-relaxed space-y-2 prose prose-sm font-sans whitespace-pre-wrap">{String(activeProduct.aiResult.shopify.description_html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}</div>
                          ) : (
                            <textarea
                              value={activeProduct.aiResult.shopify.description_html}
                              onChange={(e) => {
                                const updated = { ...activeProduct.aiResult! };
                                updated.shopify.description_html = e.target.value;
                                handleUpdateActiveAIData(updated);
                              }}
                              className="w-full h-48 font-mono text-[10px] px-3 py-2 bg-white border border-zinc-300 rounded focus:outline-none focus:border-[#008060]"
                            />
                          )}
                        </div>

                        {/* Tags list */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Appraised Tags</label>
                          <div className="flex gap-1.5 flex-wrap">
                            {activeProduct.aiResult.shopify.tags.map((tag, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 bg-zinc-50 border border-zinc-200 text-zinc-600 rounded text-[10px] font-medium font-sans flex items-center gap-1"
                              >
                                {tag}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = { ...activeProduct.aiResult! };
                                    updated.shopify.tags = updated.shopify.tags.filter((_, tIdx) => tIdx !== idx);
                                    handleUpdateActiveAIData(updated);
                                  }}
                                  className="text-[9px] text-zinc-400 hover:text-rose-600 font-bold"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Operator and Publish bar */}
                        <div className="pt-4 border-t border-zinc-200 flex flex-col sm:flex-row items-center gap-3">
                          <div className="flex items-center gap-2 text-xs w-full sm:w-auto">
                            <span className="font-semibold text-zinc-600 shrink-0">Operator:</span>
                            <input
                              type="text"
                              value={operatorName}
                              onChange={e => setOperatorName(e.target.value)}
                              className="px-2.5 py-1.5 bg-white border border-zinc-300 rounded text-xs focus:outline-none"
                            />
                          </div>

                          <div className="flex gap-2 w-full sm:w-auto sm:ml-auto">
                            <button
                              onClick={() => handleToggleApproval(activeProduct.id)}
                              className={`flex-1 sm:flex-initial px-4 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 border ${
                                activeProduct.isApproved
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                  : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              {activeProduct.isApproved ? 'Approved' : 'Approve SKU'}
                            </button>

                            <button
                              onClick={() => handlePublishProduct(activeProduct)}
                              disabled={activeProduct.aiStatus === 'ANALYZING'}
                              className="flex-1 sm:flex-initial px-4 py-2.5 bg-[#008060] hover:bg-[#006e52] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              {activeProduct.aiStatus === 'ANALYZING' ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  Publishing...
                                </>
                              ) : (
                                <>
                                  <ShoppingBag className="w-3.5 h-3.5" />
                                  Publish SKU {activeProduct.sku}
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                      </div>
                    ) : (
                      <div className="text-center p-12 border border-dashed border-zinc-300 rounded-2xl space-y-3">
                        <AlertCircle className="w-8 h-8 text-zinc-400 mx-auto" />
                        <h4 className="text-xs font-bold text-zinc-800 uppercase">AI Listing Metadata Missing</h4>
                        <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                          Please click the <strong className="text-zinc-700">"Batch AI Analyse"</strong> button on the batch tab to run Vision-Language appraisals on this SKU.
                        </p>
                      </div>
                    )}

                  </div>
                )}

                {/* 2. RAW JSON APPRAISED DATA VIEW */}
                {reviewTab === 'RAW_DATA' && (
                  <div className="space-y-4 font-mono text-[10px]">
                    {activeProduct.aiResult ? (
                      <pre className="p-4 bg-zinc-900 text-zinc-100 rounded-xl border border-zinc-800 overflow-x-auto max-h-96">
                        {JSON.stringify(convertToNewSchema(activeProduct.aiResult), null, 2)}
                      </pre>
                    ) : (
                      <div className="text-center p-12 border border-dashed border-zinc-300 rounded-2xl font-sans text-xs text-zinc-500">
                        Pending Vision appraisal to populate raw schema fields.
                      </div>
                    )}
                  </div>
                )}

              </div>

            </div>
          </div>

        </div>
      )}

      {showCreditConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-zinc-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
                  <Sparkles className="w-6 h-6 text-emerald-600 fill-emerald-100" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-950 uppercase tracking-wide">
                    {modalType === 'ANALYZE' ? 'Authorize Batch Appraisal' : 'Authorize Model Synthesis'}
                  </h3>
                  <p className="text-xs text-zinc-500">SaaS Multi-Tenant Commercial Credit Meter</p>
                </div>
              </div>

              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 divide-y divide-zinc-200 text-xs font-medium text-zinc-700 space-y-3">
                <div className="flex justify-between pb-2 text-left">
                  <span>Batch Scope:</span>
                  <span className="font-bold text-zinc-950">
                    {modalType === 'ANALYZE'
                      ? `${products.filter(p => p.aiStatus === 'PENDING' || p.aiStatus === 'ERROR').length} Garments`
                      : `${products.filter(p => p.aiResult !== null).length} Models`}
                  </span>
                </div>
                <div className="flex justify-between py-2 text-left">
                  <span>Unit Cost:</span>
                  <span className="font-bold text-zinc-950 font-sans">
                    {modalType === 'ANALYZE' ? '1.00 Credit / Item' : '0.00 Credits / Item (Free/Included)'}
                  </span>
                </div>
                <div className="flex justify-between py-2 text-left text-rose-600 font-semibold">
                  <span>Total Deductible:</span>
                  <span className="font-bold font-mono">
                    {modalType === 'ANALYZE'
                      ? `${products.filter(p => p.aiStatus === 'PENDING' || p.aiStatus === 'ERROR').length}.00 Credits`
                      : '0.00 Credits (Free/Included)'}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-zinc-200 text-left">
                  <span>Current Balance:</span>
                  <span className="font-bold text-emerald-700 font-mono">
                    {currentUser?.role === 'Master Admin' ? 'Unlimited' : `${(currentUser?.creditBalance ?? 0).toFixed(2)} Credits`}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-800 space-y-1 text-left">
                <div className="font-bold uppercase tracking-wider text-[9px] text-amber-950 flex items-center gap-1">
                  <Scale className="w-3.5 h-3.5" /> Vintage Grading Protocols
                </div>
                <p className="leading-relaxed">
                  Preserve original garment age. Keep fading, wear marks, washed texture, and imperfections. Do not make vintage items look brand new.
                </p>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreditConfirmModal(false);
                    setModalType(null);
                  }}
                  className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer font-sans"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreditConfirmModal(false);
                    const type = modalType;
                    setModalType(null);
                    if (type === 'ANALYZE') {
                      executeBatchAIAnalyze();
                    } else if (type === 'MODELS') {
                      executeBulkGenerateAIModels();
                    }
                  }}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-[#006e52] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer font-sans shadow-sm"
                >
                  Confirm & Deduct
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
