import React, { useRef, useEffect, useState } from "react";
import { CanvasSettings, StudioBackground } from "../types";
import { Move, RefreshCw, ZoomIn, Pipette, Sliders, Check, Sparkles } from "lucide-react";

interface StudioCanvasProps {
  imageUrl: string;
  background: StudioBackground;
  settings: CanvasSettings;
  onChangeSettings: (settings: CanvasSettings) => void;
  onSelectKeyColor?: (hex: string) => void;
  onCanvasReady: (canvas: HTMLCanvasElement) => void;
}

export const StudioCanvas: React.FC<StudioCanvasProps> = ({
  imageUrl,
  background,
  settings,
  onChangeSettings,
  onSelectKeyColor,
  onCanvasReady,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [processedImageCanvas, setProcessedImageCanvas] = useState<HTMLCanvasElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isPickingColor, setIsPickingColor] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);

  // Load background image
  useEffect(() => {
    if (!background || (background.type !== "image" && !background.value.includes("url("))) {
      setBgImage(null);
      return;
    }

    const urlMatch = background.value.match(/url\(['"]?([^'"]+?)['"]?\)/);
    const bgUrl = urlMatch ? urlMatch[1] : background.value;

    if (!bgUrl) {
      setBgImage(null);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    img.src = bgUrl;
    img.onload = () => {
      setBgImage(img);
    };
    img.onerror = () => {
      console.error("Failed to load background image:", bgUrl);
      setBgImage(null);
    };
  }, [background]);

  // Load image
  useEffect(() => {
    if (!imageUrl) return;
    setLoading(true);
    setError(null);
    setImage(null);
    setProcessedImageCanvas(null);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    img.src = imageUrl;

    img.onload = () => {
      setImage(img);
      setLoading(false);
    };

    img.onerror = (e) => {
      console.error("Image loading error:", e);
      setError("Failed to load image. If it is an external link, CORS restrictions may apply. Try downloading and uploading the file directly!");
      setLoading(false);
    };
  }, [imageUrl]);

  // Process chroma-keying (background removal) on an offscreen canvas
  // We run this when image, keyColor, tolerance, smoothness, or enableKeying changes
  useEffect(() => {
    if (!image) return;

    const offscreen = document.createElement("canvas");
    offscreen.width = image.naturalWidth || image.width;
    offscreen.height = image.naturalHeight || image.height;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(image, 0, 0);

    if (settings.enableKeying && settings.keyColor) {
      const imgData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
      const data = imgData.data;

      // Parse key color hex
      const hex = settings.keyColor.replace("#", "");
      const keyR = parseInt(hex.substring(0, 2), 16);
      const keyG = parseInt(hex.substring(2, 4), 16);
      const keyB = parseInt(hex.substring(4, 6), 16);

      const tolerance = settings.tolerance;
      const smoothness = settings.smoothness;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        if (a === 0) continue;

        // Calculate Euclidean distance in RGB space
        const distance = Math.sqrt(
          Math.pow(r - keyR, 2) + Math.pow(g - keyG, 2) + Math.pow(b - keyB, 2)
        );

        if (distance < tolerance) {
          // Inside tolerance: completely transparent
          data[i + 3] = settings.invertKeying ? 255 : 0;
        } else if (distance < tolerance + smoothness && smoothness > 0) {
          // Feathered edge zone
          const ratio = (distance - tolerance) / smoothness;
          if (settings.invertKeying) {
            data[i + 3] = Math.round(ratio * 255);
          } else {
            data[i + 3] = Math.round((1 - ratio) * a);
          }
        } else {
          // Outside tolerance
          data[i + 3] = settings.invertKeying ? 0 : a;
        }
      }

      ctx.putImageData(imgData, 0, 0);
    }

    setProcessedImageCanvas(offscreen);
  }, [image, settings.enableKeying, settings.keyColor, settings.tolerance, settings.smoothness, settings.invertKeying]);

  // Redraw Workspace Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Use current element bounds as display size, set canvas internal resolution
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 800; // Standard high-res e-commerce square canvas (800x800)
    canvas.height = 800;

    // 1. Draw Studio Background
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (background.type === "solid") {
      ctx.fillStyle = background.value;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (background.type === "gradient") {
      // Setup simple diagonal gradient
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      // For simplicity, parse the hex codes from CSS gradient or use a nice preset gradient
      if (background.id === "pastel-peach") {
        gradient.addColorStop(0, "#ffecd2");
        gradient.addColorStop(1, "#fcb69f");
      } else {
        gradient.addColorStop(0, "#ffffff");
        gradient.addColorStop(1, "#e2e8f0");
      }
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (background.type === "transparent") {
      // Keep canvas background cleared for professional transparent png listings
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else {
      // Pattern or Image backgrounds
      // We can draw background images on the canvas
      if (background.id === "luxury-marble") {
        // Draw marble gradient background
        const grad = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 50, canvas.width/2, canvas.height/2, canvas.width);
        grad.addColorStop(0, "#1e293b");
        grad.addColorStop(1, "#020617");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw modern subtle grid accent for premium luxury contrast
        ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
        ctx.lineWidth = 1;
        for (let i = 0; i < canvas.width; i += 50) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i, canvas.height);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, i);
          ctx.lineTo(canvas.width, i);
          ctx.stroke();
        }
      } else if (background.id === "textured-concrete") {
        const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        grad.addColorStop(0, "#f1f5f9");
        grad.addColorStop(1, "#cbd5e1");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else if (background.id === "rustic-wood") {
        const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        grad.addColorStop(0, "#fef08a");
        grad.addColorStop(1, "#ca8a04");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else if (background.id === "modern-pedestal") {
        // Draw premium studio gradient with high-end spotlight effect
        const grad = ctx.createRadialGradient(canvas.width/2, 300, 100, canvas.width/2, 400, 600);
        grad.addColorStop(0, "#f8fafc");
        grad.addColorStop(1, "#94a3b8");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw an elegant circular presentation block pedestal
        ctx.save();
        ctx.translate(canvas.width / 2, 580);
        
        // Pedestal shadow
        ctx.shadowColor = "rgba(15, 23, 42, 0.15)";
        ctx.shadowBlur = 25;
        ctx.shadowOffsetY = 15;
        
        // Render 3D Pedestal Top Ellipse
        ctx.fillStyle = "#e2e8f0";
        ctx.beginPath();
        ctx.ellipse(0, 0, 220, 45, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowColor = "transparent"; // Reset shadow

        // Render Pedestal side cylinder body
        ctx.fillStyle = "#cbd5e1";
        ctx.fillRect(-220, 0, 440, 50);

        // Render Bottom Pedestal curve
        ctx.beginPath();
        ctx.ellipse(0, 50, 220, 45, 0, 0, Math.PI);
        ctx.fill();

        // Highlight Pedestal rim light
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, 220, 45, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
      } else if ((background.type === "image" || background.value.includes("url(")) && bgImage) {
        // Draw fitting the canvas (aspect ratio cover)
        const scale = Math.max(canvas.width / bgImage.width, canvas.height / bgImage.height);
        const x = (canvas.width - bgImage.width * scale) / 2;
        const y = (canvas.height - bgImage.height * scale) / 2;
        ctx.drawImage(bgImage, x, y, bgImage.width * scale, bgImage.height * scale);
      } else {
        // Fallback or custom image url
        ctx.fillStyle = background.type === "image" ? "#171717" : "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }

    // Prepare product rendering
    const imgSource = processedImageCanvas || image;
    if (!imgSource) {
      // Just background rendered, trigger callback
      onCanvasReady(canvas);
      return;
    }

    // Determine product drawing coordinates
    const productW = imgSource.width;
    const productH = imgSource.height;
    
    // Calculate best fit sizing inside the 800x800 square (say, bounding box 450px)
    const fitBox = 450;
    const ratio = Math.min(fitBox / productW, fitBox / productH);
    const drawW = productW * ratio * settings.scale;
    const drawH = productH * ratio * settings.scale;

    // Default centered position + offsets
    const posX = (canvas.width / 2) + settings.offsetX;
    // If Pedestal background is active, slightly offset product height to stand perfectly on the pedestal top
    const pedestalAdj = background.id === "modern-pedestal" ? 120 : 0;
    const posY = (canvas.height / 2) + settings.offsetY - pedestalAdj;

    // 2. Draw Soft 3D Floor Shadow
    if (settings.enableShadow) {
      ctx.save();
      
      // Position shadow at the base of the product
      const shadowX = posX;
      const shadowY = posY + (drawH / 2) + settings.shadowOffsetY;
      const radiusX = (drawW / 2) * settings.shadowScaleX;
      const radiusY = radiusX * 0.18; // Flat shadow ellipse

      ctx.translate(shadowX, shadowY);
      
      const shadowGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, radiusX);
      shadowGrad.addColorStop(0, `rgba(0, 0, 0, ${settings.shadowOpacity})`);
      shadowGrad.addColorStop(0.3, `rgba(0, 0, 0, ${settings.shadowOpacity * 0.6})`);
      shadowGrad.addColorStop(0.7, `rgba(0, 0, 0, ${settings.shadowOpacity * 0.15})`);
      shadowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");

      ctx.fillStyle = shadowGrad;
      
      // Apply blur using canvas filters if supported
      if (settings.shadowBlur > 0) {
        ctx.filter = `blur(${settings.shadowBlur}px)`;
      }

      ctx.beginPath();
      ctx.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // 3. Draw Product Image
    ctx.save();
    
    // Position, rotate, and scale product
    ctx.translate(posX, posY);
    ctx.rotate((settings.rotation * Math.PI) / 180);

    // Apply color filters to product
    const filters = [];
    if (settings.brightness !== 100) filters.push(`brightness(${settings.brightness}%)`);
    if (settings.contrast !== 100) filters.push(`contrast(${settings.contrast}%)`);
    if (settings.saturation !== 100) filters.push(`saturate(${settings.saturation}%)`);
    if (filters.length > 0) {
      ctx.filter = filters.join(" ");
    }

    // Draw centered on translate coordinate
    ctx.drawImage(imgSource, -drawW / 2, -drawH / 2, drawW, drawH);

    ctx.restore();

    // Trigger canvas ready callback for exports
    onCanvasReady(canvas);

  }, [image, processedImageCanvas, background, bgImage, settings, onCanvasReady]);

  // Color selection eyedropper click handler
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPickingColor || !canvasRef.current || !onSelectKeyColor) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    // Map click coordinate back to canvas coordinate scale
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = Math.round((e.clientX - rect.left) * scaleX);
    const clickY = Math.round((e.clientY - rect.top) * scaleY);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const pixel = ctx.getImageData(clickX, clickY, 1, 1).data;
    const hex = "#" + [pixel[0], pixel[1], pixel[2]].map(x => {
      const h = x.toString(16);
      return h.length === 1 ? "0" + h : h;
    }).join("");

    onSelectKeyColor(hex);
    setIsPickingColor(false);
  };

  // Mouse Interaction handlers for dragging the product
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPickingColor) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || isPickingColor) return;

    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;

    // Apply scaling factor (drag ratio speed adjustments)
    onChangeSettings({
      ...settings,
      offsetX: settings.offsetX + deltaX * 1.5,
      offsetY: settings.offsetY + deltaY * 1.5,
    });

    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  const handleResetPlacement = () => {
    onChangeSettings({
      ...settings,
      scale: 1,
      rotation: 0,
      offsetX: 0,
      offsetY: 0,
    });
  };

  return (
    <div className="relative flex flex-col items-center justify-center w-full bg-neutral-950 rounded-2xl border border-neutral-800 p-4 shadow-2xl">
      {/* Top action bar */}
      <div className="flex items-center justify-between w-full mb-3 pb-3 border-b border-neutral-800 text-xs text-neutral-400">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="font-medium tracking-wide">Studio Workspace (800×800 Square)</span>
        </div>
        <div className="flex items-center gap-2">
          {onSelectKeyColor && (
            <button
              onClick={() => setIsPickingColor(!isPickingColor)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all ${
                isPickingColor
                  ? "bg-amber-500/20 border-amber-500 text-amber-300 font-medium"
                  : "bg-neutral-900 border-neutral-800 hover:border-neutral-700 text-neutral-300"
              }`}
              title="Click on the background of the image to remove that color"
              id="eyedropper-btn"
            >
              <Pipette className="w-3.5 h-3.5" />
              {isPickingColor ? "Click Raw Color..." : "Pick Color To Remove"}
            </button>
          )}
          <button
            onClick={handleResetPlacement}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 rounded-lg text-neutral-300 transition-all"
            title="Reset position and size"
            id="reset-canvas-btn"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset Base
          </button>
        </div>
      </div>

      {/* Main viewport canvas container */}
      <div
        ref={containerRef}
        className="relative w-full aspect-square max-w-[500px] bg-neutral-900 rounded-xl overflow-hidden border border-neutral-800/80 shadow-inner flex items-center justify-center"
      >
        {loading && (
          <div className="absolute inset-0 bg-neutral-950/80 flex flex-col items-center justify-center z-10 gap-3 backdrop-blur-sm">
            <div className="relative flex items-center justify-center">
              <div className="w-12 h-12 rounded-full border-4 border-t-emerald-500 border-neutral-800 animate-spin"></div>
              <Sparkles className="absolute w-5 h-5 text-emerald-400 animate-pulse" />
            </div>
            <p className="text-sm font-medium text-neutral-200">Loading Product Photo...</p>
            <p className="text-xs text-neutral-500">Preparing high-definition studio assets</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 bg-neutral-950/95 flex flex-col items-center justify-center p-6 text-center z-10 gap-4">
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 font-bold text-xl">
              !
            </div>
            <p className="text-sm font-medium text-neutral-100">{error}</p>
            <button
              onClick={() => {
                setImage(null);
                setError(null);
                const currentUrl = imageUrl;
                // Trigger reload
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.referrerPolicy = "no-referrer";
                img.src = currentUrl;
                img.onload = () => setImage(img);
              }}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold rounded-lg border border-neutral-700"
            >
              Retry Loading Image
            </button>
          </div>
        )}

        {isPickingColor && (
          <div className="absolute top-3 left-1/2 transform -translate-x-1/2 bg-amber-500 text-neutral-950 font-bold text-xs px-3 py-1.5 rounded-full shadow-lg z-20 flex items-center gap-1.5 animate-bounce">
            <Pipette className="w-3.5 h-3.5" />
            Click Anywhere on the Product Image to Remove Color
          </div>
        )}

        {/* The visual canvas */}
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUpOrLeave}
          onMouseLeave={handleMouseUpOrLeave}
          className={`w-full h-full object-contain cursor-grab active:cursor-grabbing transition-all ${
            isPickingColor ? "cursor-crosshair!" : ""
          }`}
          style={{ maxWidth: "100%", maxHeight: "100%" }}
        />

        {/* Hover drag indicator overlays */}
        {!loading && !error && !isDragging && (
          <div className="absolute bottom-3 right-3 bg-neutral-950/60 hover:bg-neutral-950/85 text-neutral-400 hover:text-neutral-200 p-2 rounded-lg text-xs flex items-center gap-1 pointer-events-none transition-all border border-neutral-800/50 backdrop-blur-sm">
            <Move className="w-3.5 h-3.5" />
            Drag product to reposition
          </div>
        )}
      </div>

      {/* Visual info label */}
      <div className="flex items-center justify-between w-full mt-3 text-[11px] text-neutral-500 font-mono">
        <span>DRAG TO REPOSITION</span>
        <span>SCROLL/ZOOM TO RESIZE</span>
        <span>ROTATION ROTATES</span>
      </div>
    </div>
  );
};
