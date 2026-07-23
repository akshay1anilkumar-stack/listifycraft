export type MarketType = 'VINTAGE' | 'RETRO' | 'Y2K' | 'THRIFT' | 'REWORK' | 'EFAAR' | 'ACCESSORIES';

export type GenderType = 'MEN' | 'WOMEN' | 'UNISEX';

export type ConditionGradeType = 'EXCELLENT' | 'VERY GOOD' | 'GOOD' | 'FAIR' | 'POOR';

export interface GarmentClassification {
  market: MarketType;
  gender: GenderType;
  garment_type: string;
  brand: string;
  era_estimate: string;
  tagged_size: string;
}

export interface GarmentObservations {
  colors: string[];
  features: string[];
  visible_flaws: string[];
}

export interface MeasurementPlaceholders {
  pit_to_pit: string | null;
  length: string | null;
  shoulder: string | null;
  sleeve: string | null;
  waist: string | null;
  rise: string | null;
  inseam: string | null;
  leg_opening?: string | null;
  total_length?: string | null;
  hip?: string | null;
}

export interface ShopifyMetafield {
  namespace: string;
  key: string;
  value: string;
  type: string;
}

export interface ValidationError {
  code: string;
  path: string;
  message: string;
  blocking: boolean;
}

export interface MasterSchemaOutput {
  schemaVersion: "3.0.0";
  sourceData: {
    market: string;
    gender: string;
    garmentType: string;
    subcategory: string;
    brand: string;
    era: string;
    taggedSize: string;
    recommendedSize: string;
    primaryColor: string;
    secondaryColors: string[];
    condition: string;
    material: string;
    features: string[];
    visibleFlaws: string[];
    measurements: {
      pitToPit: string | null;
      length: string | null;
      shoulder: string | null;
      sleeve: string | null;
      waist: string | null;
      chest: string | null;
      inseam?: string | null;
      rise?: string | null;
    };
  };
  shopifyProduct: {
    title: string;
    descriptionHtml: string;
    vendor: string;
    productType: string;
    price: string;
    compareAtPrice?: string;
    costPerItem?: string;
    sku: string;
    barcode?: string;
    quantity?: number;
    category: string; // standard category GID
    tags: string[];
    status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
    imageUrl: string;
    imageUrls?: string[];
    collectionIds?: string[];
    metafields: ShopifyMetafield[];
  };
  collectionRouting: {
    market: string;
    gender: string;
    category: string;
    additionalCollectionIds: string[];
  };
  unresolvedMappings: ValidationError[];
  validation: {
    status: 'READY' | 'WARNING' | 'BLOCKED' | 'PENDING_REVIEW';
    items: ValidationError[];
  };
  processing: {
    modelUsed: string;
    failoverActive: boolean;
    requiresHumanReview: boolean;
    modelImageUrl?: string;
    modelPromptDescription?: string;
    imageUrl?: string;
    updatedCreditBalance?: number;
  };
}

export interface ShopifyDraftFields {
  title: string;
  description_html: string;
  price: string;
  vendor: string;
  product_type: string;
  tags: string[];
  metafields: ShopifyMetafield[];
}

export interface AIResult {
  classification: GarmentClassification;
  observations: GarmentObservations;
  shopify: ShopifyDraftFields;
  measurements: MeasurementPlaceholders;
  confidence: Record<string, number>;
  warnings: string[];
  modelImageUrl?: string;
  modelPromptDescription?: string;
  imageUrl?: string;
  evidence_sources?: Record<string, {
    value: string;
    confidence: number;
    source: string;
    directly_observed: boolean;
  }>;
}

export interface ImageProcessingConfig {
  bgColor: string;
  scale: number; // 0.1 - 1.0 (garment occupancy)
  shadowEnabled: boolean;
  shadowIntensity: number; // 0.1 - 1.0
  rotation: number;
  maskData?: string; // Brush edits / mask state in canvas format
}

export interface UploadedView {
  id: string;
  url: string;
  filename?: string;
  sku?: string;
  sequence?: string;
  storageId?: string;
  processedStorageId?: string;
  label: 'Front' | 'Back' | 'Neck Label' | 'Wash Tag' | 'Detail' | 'Flaw';
  originalUrl: string;
  processedUrl?: string;
  processing?: boolean;
  error?: string;
}

export interface AuditRecord {
  id: string;
  timestamp: string;
  operator: string;
  images: string[];
  payload: any;
  shopifyResponse: any;
  status: 'SUCCESS' | 'FAILED';
  errorMessage?: string;
}

export interface ShopifyConfig {
  shopName: string;
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  isConnected: boolean;
}

export interface TaxonomyMapping {
  garmentPlural: string;
  productType: string;
}

export interface StudioConfig {
  mappings: TaxonomyMapping[];
  titleMaxLength: number;
  vintageEraMigrationEnabled: boolean;
  colorTolerance: number; // For color-integrity checks
  geminiModel?: string;
  shopName?: string;
  accessToken?: string;
  defaultVendor?: string;
}

export interface StudioBackground {
  id: string;
  name: string;
  type: 'solid' | 'gradient' | 'transparent' | 'pattern';
  value: string;
}

export interface CanvasSettings {
  scale: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
  enableKeying: boolean;
  keyColor: string;
  tolerance: number;
  smoothness: number;
  invertKeying: boolean;
  enableShadow: boolean;
  shadowOffsetY: number;
  shadowScaleX: number;
  shadowOpacity: number;
  shadowBlur: number;
  brightness: number;
  contrast: number;
  saturation: number;
}
