export interface HsnSuggestion {
  hsn: string;
  gst: string;
  label: string;
  keywords: string[];
}

export const COMMON_HSN_LIST: HsnSuggestion[] = [
  { hsn: '3907', gst: '18', label: '3907 - Polyacetals, Epoxide Resins & Base Resins', keywords: ['resin', 'epoxy resin', 'base resin', 'polymer', 'polyol'] },
  { hsn: '3208', gst: '18', label: '3208 - Paints, Varnishes & Epoxy Coatings', keywords: ['paint', 'varnish', 'enamel', 'coating', 'primer', 'epoxy shield', 'distemper'] },
  { hsn: '3814', gst: '18', label: '3814 - Organic Composite Solvents & Thinners', keywords: ['thinner', 'solvent', 'hardener', 'chemical'] },
  { hsn: '7214', gst: '18', label: '7214 - Iron & Steel Bars, Rods & TMT', keywords: ['iron rod', 'steel rod', 'tmt', 'bar', 'ms rod', 'finished rod'] },
  { hsn: '7206', gst: '18', label: '7206 - Raw Iron, Ingots & Primary Iron', keywords: ['rowiron', 'raw iron', 'pig iron', 'ingot', 'billet', 'iron'] },
  { hsn: '7204', gst: '18', label: '7204 - Ferrous Waste & Iron Scrap', keywords: ['scrap', 'iron scrap', 'steel scrap', 'waste'] },
  { hsn: '7326', gst: '18', label: '7326 - Hardware, Fasteners & Iron Articles', keywords: ['bolt', 'nut', 'screw', 'hinge', 'bracket', 'hardware', 'balked'] },
  { hsn: '7408', gst: '18', label: '7408 - Copper Wire & Brass Rods', keywords: ['copper', 'brass', 'winding wire'] },
  { hsn: '8544', gst: '18', label: '8544 - Insulated Electric Wires & Cables', keywords: ['cable', 'wire', 'electric wire', 'conductor'] },
  { hsn: '8471', gst: '18', label: '8471 - Laptops, Computers & Processing Units', keywords: ['laptop', 'computer', 'desktop', 'pc', 'server'] },
  { hsn: '8528', gst: '18', label: '8528 - Projectors, Monitors & Display Units', keywords: ['projector', 'monitor', 'screen', 'tv', 'display'] },
  { hsn: '8504', gst: '18', label: '8504 - Power Adapters, Transformers & Chargers', keywords: ['adapter', 'adopter', 'charger', 'transformer', 'ups', 'inverter'] },
  { hsn: '9304', gst: '18', label: '9304 - Airguns & Spring/Gas Devices', keywords: ['airgun', 'air gun', 'pneumatic'] },
  { hsn: '5208', gst: '5', label: '5208 - Woven Cotton Fabrics', keywords: ['cotton', 'fabric', 'cloth', 'textile', 'kapad', 'grey cloth'] },
  { hsn: '5407', gst: '5', label: '5407 - Synthetic & Polyester Fabrics', keywords: ['polyester', 'synthetic', 'nylon', 'yarn', 'saree', 'suiting'] },
  { hsn: '4819', gst: '18', label: '4819 - Corrugated Boxes, Cartons & Packaging', keywords: ['box', 'carton', 'packaging', 'corrugated', 'bag'] },
  { hsn: '3923', gst: '18', label: '3923 - Plastic Containers, Bottles & Drums', keywords: ['bottle', 'drum', 'jar', 'container', 'plastic', 'pouch'] },
  { hsn: '3917', gst: '18', label: '3917 - PVC Pipes, Tubes & Hoses', keywords: ['pipe', 'pvc', 'tube', 'hose'] },
  { hsn: '2523', gst: '28', label: '2523 - Portland Cement & White Cement', keywords: ['cement', 'concrete'] },
  { hsn: '3004', gst: '12', label: '3004 - Medicaments & Pharmaceuticals', keywords: ['medicine', 'tablet', 'capsule', 'syrup', 'pharma'] },
  { hsn: '0910', gst: '5', label: '0910 - Spices, Turmeric & Masala', keywords: ['turmeric', 'haldi', 'masala', 'chili', 'spice', 'jeera'] },
  { hsn: '8483', gst: '18', label: '8483 - Bearings, Gears & Machine Parts', keywords: ['bearing', 'gear', 'shaft', 'valve', 'pump', 'motor'] },
];

const CATEGORY_DEFAULT_HSN: Record<string, { hsn: string; gst: string }> = {
  Chemicals: { hsn: '3907', gst: '18' },
  Textiles: { hsn: '5208', gst: '5' },
  Hardware: { hsn: '7326', gst: '18' },
  Packaging: { hsn: '4819', gst: '18' },
  'Raw Material': { hsn: '3907', gst: '18' },
  'Finished Goods': { hsn: '3208', gst: '18' },
};

export function suggestHsnFromNameOrCategory(
  itemName: string,
  category?: string
): { hsn: string; gst: string } | null {
  const q = (itemName || '').trim().toLowerCase();
  if (q.length >= 2) {
    for (const entry of COMMON_HSN_LIST) {
      if (entry.keywords.some((kw) => q.includes(kw) || kw.includes(q))) {
        return { hsn: entry.hsn, gst: entry.gst };
      }
    }
  }
  if (category && CATEGORY_DEFAULT_HSN[category]) {
    return CATEGORY_DEFAULT_HSN[category];
  }
  return null;
}
