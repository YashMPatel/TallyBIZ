import QRCode from 'qrcode';
import { API_BASE } from './erpHelpers';

export interface CompanyBrandingData {
  id?: number;
  name: string;
  tagline: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  gstin: string;
  pan: string;
  state: string;
  currency_symbol: string;
  upi_id: string;
  bank_name: string;
  bank_branch: string;
  bank_account_name: string;
  bank_account_no: string;
  bank_ifsc: string;
  bank_details: string;
  logo_data_url: string;
  invoice_terms: string;
}

export function getInitialCompanyBranding(companyProp?: any): CompanyBrandingData {
  let stored: any = {};
  try {
    stored = JSON.parse(localStorage.getItem('active_company') || '{}');
  } catch {}
  const c = { ...stored, ...(companyProp || {}) };
  const gstin = String(c.gstin || c.tax_id || '');
  const derivedPan = gstin.length >= 12 ? gstin.substring(2, 12) : '';
  return {
    id: c.id,
    name: c.name || 'TallyBIZ Pvt Ltd',
    tagline: c.tagline || '',
    contact_person: c.contact_person || '',
    phone: c.phone || '',
    email: c.email || '',
    address: c.address || '',
    gstin,
    pan: c.pan || derivedPan,
    state: c.state || 'Gujarat (24)',
    currency_symbol: c.symbol || c.currency_symbol || '₹',
    upi_id: c.upi_id || '',
    bank_name: c.bank_name || '',
    bank_branch: c.bank_branch || '',
    bank_account_name: c.bank_account_name || c.name || '',
    bank_account_no: c.bank_account_no || '',
    bank_ifsc: c.bank_ifsc || '',
    bank_details: c.bank_details || '',
    logo_data_url: c.logo_data_url || '',
    invoice_terms:
      c.invoice_terms ||
      '1. Subject to local Jurisdiction.\n2. Goods once sold will not be taken back.\n3. Interest @18% p.a. will be charged if payment is delayed.',
  };
}

export async function fetchFreshCompanyBranding(companyProp?: any): Promise<CompanyBrandingData> {
  const base = getInitialCompanyBranding(companyProp);
  const cid = base.id || localStorage.getItem('active_company_id') || '';
  try {
    const q = cid ? `?company_id=${cid}` : '';
    const res = await fetch(`${API_BASE}/accounts/company-branding/${q}`);
    if (res.ok) {
      const data = await res.json();
      return getInitialCompanyBranding({ ...base, ...data });
    }
  } catch {}
  return base;
}

export function getCompanyMonogram(name: string): string {
  const words = (name || 'TB').trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export async function generateUpiQrDataUrl(
  upiId: string,
  payeeName: string,
  amount: number,
  invoiceNo?: string
): Promise<string> {
  if (!upiId || !upiId.trim()) return '';
  const pa = encodeURIComponent(upiId.trim());
  const pn = encodeURIComponent((payeeName || 'Merchant').trim());
  const am = amount > 0 ? `&am=${amount.toFixed(2)}` : '';
  const tn = invoiceNo ? `&tn=${encodeURIComponent('Inv ' + invoiceNo)}` : '';
  const upiUri = `upi://pay?pa=${pa}&pn=${pn}${am}&cu=INR${tn}`;
  try {
    return await QRCode.toDataURL(upiUri, { width: 160, margin: 1 });
  } catch {
    return '';
  }
}

const UNIT_WORDS: Record<number, string> = {
  1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five',
  6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten',
  11: 'Eleven', 12: 'Twelve', 13: 'Thirteen', 14: 'Fourteen', 15: 'Fifteen',
  16: 'Sixteen', 17: 'Seventeen', 18: 'Eighteen', 19: 'Nineteen',
};

const DECADE_WORDS: Record<number, string> = {
  2: 'Twenty', 3: 'Thirty', 4: 'Forty', 5: 'Fifty',
  6: 'Sixty', 7: 'Seventy', 8: 'Eighty', 9: 'Ninety',
};

function spellBelowThousand(val: number): string {
  const n = Math.floor(val);
  if (n <= 0) return '';
  if (n < 20) return UNIT_WORDS[n] || '';
  if (n < 100) {
    const d = Math.floor(n / 10);
    const r = n % 10;
    return `${DECADE_WORDS[d]}${r ? ' ' + UNIT_WORDS[r] : ''}`;
  }
  const h = Math.floor(n / 100);
  const rem = n % 100;
  return `${UNIT_WORDS[h]} Hundred${rem ? ' ' + spellBelowThousand(rem) : ''}`;
}

export function formatAmountInWords(amount: number, currencySymbol = '₹'): string {
  const safeVal = Number.isFinite(amount) ? Math.abs(amount) : 0;
  const whole = Math.floor(safeVal);
  const paise = Math.round((safeVal - whole) * 100);

  const isInr = currencySymbol === '₹' || currencySymbol.toUpperCase() === 'INR';
  const majorLabel = isInr ? 'Rupees' : 'Dollars';
  const minorLabel = isInr ? 'Paise' : 'Cents';

  if (whole === 0 && paise === 0) {
    return `Zero ${majorLabel} Only`;
  }

  const segments: string[] = [];
  const crores = Math.floor(whole / 10000000);
  const lakhs = Math.floor((whole % 10000000) / 100000);
  const thousands = Math.floor((whole % 100000) / 1000);
  const rest = whole % 1000;

  if (crores > 0) segments.push(`${spellBelowThousand(crores)} Crore`);
  if (lakhs > 0) segments.push(`${spellBelowThousand(lakhs)} Lakh`);
  if (thousands > 0) segments.push(`${spellBelowThousand(thousands)} Thousand`);
  if (rest > 0) segments.push(spellBelowThousand(rest));

  const mainText = segments.length > 0 ? `${segments.join(' ')} ${majorLabel}` : '';
  const subText = paise > 0 ? `${spellBelowThousand(paise)} ${minorLabel}` : '';

  if (mainText && subText) return `${mainText} and ${subText} Only`;
  return `${mainText || subText} Only`;
}
