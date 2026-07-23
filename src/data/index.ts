import { StudioBackground } from '../types';

export const STUDIO_BACKGROUNDS: StudioBackground[] = [
  { id: 'studio-light', name: 'Studio Light', type: 'solid', value: '#f4f4f5' },
  { id: 'pure-white', name: 'Pure White', type: 'solid', value: '#ffffff' },
  { id: 'warm-cream', name: 'Warm Cream', type: 'solid', value: '#fafaf6' },
  { id: 'cosmic-slate', name: 'Cosmic Slate', type: 'solid', value: '#1e1e24' },
  { id: 'pastel-peach', name: 'Pastel Peach', type: 'gradient', value: 'pastel-peach' },
  { id: 'luxury-marble', name: 'Luxury Marble', type: 'pattern', value: 'luxury-marble' },
  { id: 'textured-concrete', name: 'Textured Concrete', type: 'pattern', value: 'textured-concrete' },
  { id: 'rustic-wood', name: 'Rustic Wood', type: 'pattern', value: 'rustic-wood' },
  { id: 'modern-pedestal', name: 'Modern Pedestal', type: 'pattern', value: 'modern-pedestal' },
  { id: 'transparent', name: 'Transparent', type: 'transparent', value: 'transparent' },
  
  // Human Wearable Models
  { 
    id: 'youth-model', 
    name: 'Youth Model', 
    type: 'pattern', 
    value: "url('https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?w=800&auto=format&fit=crop&q=80')" 
  },
  { 
    id: 'male-model', 
    name: 'Male Model', 
    type: 'pattern', 
    value: "url('https://images.unsplash.com/photo-1618886614638-80e3c103d31a?w=800&auto=format&fit=crop&q=80')" 
  },
  { 
    id: 'female-model', 
    name: 'Female Model', 
    type: 'pattern', 
    value: "url('https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?w=800&auto=format&fit=crop&q=80')" 
  }
];
