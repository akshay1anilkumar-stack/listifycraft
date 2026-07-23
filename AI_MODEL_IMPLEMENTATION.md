# Reference-image AI model generation

The model-generation endpoint now sends the selected garment image directly to Gemini's image generation/editing API as a reference image.

## Environment

```env
GEMINI_API_KEY=your_key
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image
GEMINI_IMAGE_SIZE=2K
AI_MODEL_CREDIT_COST=1
```

## Workflow

1. Select the clearest front-facing garment photo.
2. Generate the model image.
3. Review the result for logo, print, color, distressing, cut and proportions.
4. Keep or regenerate it.
5. Publish the approved model image and the original product photos to Shopify.

## Important quality rule

Generative image models can preserve product references with high fidelity, but no model can guarantee pixel-perfect identity on every generation. Human approval remains mandatory before publishing, particularly for branded graphics, small labels, text, and rare collectible details.

The endpoint no longer returns random stock-model images or paid text fallbacks when image generation fails. It returns a clear error instead.
