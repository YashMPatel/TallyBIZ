import React, { useEffect, useState } from 'react';
import { X, Printer, Download } from 'lucide-react';
import type { SalesInvoice, Customer, Item } from '../types/erp';
import html2pdf from 'html2pdf.js';
import {
  type CompanyBrandingData,
  getInitialCompanyBranding,
  fetchFreshCompanyBranding,
  getCompanyMonogram,
  generateUpiQrDataUrl,
  formatAmountInWords,
} from '../utils/invoiceBranding';

interface InvoicePrintModalProps {
  invoice: SalesInvoice | null;
  customer?: Customer;
  itemsMaster: Item[];
  company?: any;
  onClose: () => void;
}

type CopyMode = 'ORIGINAL' | 'DUPLICATE' | 'TRIPLICATE' | 'ALL';

const COPY_LABELS: Record<Exclude<CopyMode, 'ALL'>, string> = {
  ORIGINAL: '(Original for Recipient)',
  DUPLICATE: '(Duplicate for Transporter)',
  TRIPLICATE: '(Triplicate for Supplier)',
};

export const InvoicePrintModal: React.FC<InvoicePrintModalProps> = ({
  invoice,
  customer,
  itemsMaster,
  company,
  onClose,
}) => {
  const [isProforma, setIsProforma] = useState<boolean>(
    invoice ? (String(invoice.invoice_number || '').toUpperCase().startsWith('PI-') || invoice.status !== 'Approved') : false
  );
  const [copyMode, setCopyMode] = useState<CopyMode>('ORIGINAL');

  const [branding, setBranding] = useState<CompanyBrandingData>(() =>
    getInitialCompanyBranding(company)
  );
  const [upiQrUrl, setUpiQrUrl] = useState<string>('');

  useEffect(() => {
    setBranding(getInitialCompanyBranding(company));
    fetchFreshCompanyBranding(company).then(setBranding);
  }, [company, invoice?.id]);

  useEffect(() => {
    if (!invoice || !branding.upi_id) {
      setUpiQrUrl('');
      return;
    }
    const amt = parseFloat(invoice.grand_total.toString()) || 0;
    const docNo = isProforma
      ? invoice.invoice_number.replace(/^INV-/i, 'PI-')
      : invoice.invoice_number;
    generateUpiQrDataUrl(branding.upi_id, branding.name, amt, docNo).then(setUpiQrUrl);
  }, [branding.upi_id, branding.name, invoice, isProforma]);

  useEffect(() => {
    if (invoice) {
      setIsProforma(String(invoice.invoice_number || '').toUpperCase().startsWith('PI-') || invoice.status !== 'Approved');
      setCopyMode('ORIGINAL');
    }
  }, [invoice]);

  const formattedParty = (invoice?.customer_name || 'Customer').replace(/[^a-zA-Z0-9]/g, '_');
  const docPrefix = isProforma ? 'Proforma_Invoice' : 'Invoice';
  const copySuffix = !isProforma && copyMode !== 'ORIGINAL' ? `_${copyMode}` : '';
  const targetFileName = invoice
    ? `${docPrefix}_${invoice.invoice_number}_${formattedParty}${copySuffix}`
    : '';

  useEffect(() => {
    const originalTitle = document.title;
    if (targetFileName) document.title = targetFileName;
    return () => {
      document.title = originalTitle;
    };
  }, [targetFileName]);

  if (!invoice) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    const element = document.getElementById('printable-invoice-wrapper');
    if (!element) return;

    const opt: any = {
      margin: [8, 8, 8, 8],
      filename: `${docPrefix}_${invoice.invoice_number}${copySuffix}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    };

    (html2pdf as any)().set(opt).from(element).save();
  };

  const netTotal = parseFloat(invoice.net_total.toString()) || 0;
  const taxTotal = parseFloat(invoice.tax_amount.toString()) || 0;
  const grandTotal = parseFloat(invoice.grand_total.toString()) || 0;
  const halfTax = taxTotal / 2;

  const sym =
    company?.symbol ||
    company?.currency_symbol ||
    (company?.currency === 'CAD' || company?.currency === 'USD' ? '$' : 'Rs.');

  const roundOff =
    (invoice as any).round_off !== undefined && (invoice as any).round_off !== null
      ? parseFloat((invoice as any).round_off.toString()) || 0
      : parseFloat((grandTotal - (netTotal + taxTotal)).toFixed(2));

  const companyStateCode = branding.gstin ? branding.gstin.substring(0, 2) : '24';
  const isInterState = customer?.gstin && !customer.gstin.startsWith(companyStateCode);
  // Rule 46: print the invoice's own rate, place of supply and reverse-charge status.
  const taxRate = parseFloat(String((invoice as any).tax_rate ?? 18)) || 0;
  const placeOfSupply = (customer?.gstin || '').trim().substring(0, 2) || companyStateCode;

  const customerGstCategory = customer?.gst_category
    ? customer.gst_category
    : customer?.gstin && customer.gstin.trim() !== ''
    ? 'Registered Regular'
    : 'Unregistered';

  const displayDocNo = isProforma
    ? invoice.invoice_number.replace(/^INV-/i, 'PI-')
    : invoice.invoice_number;

  const invoiceItems = invoice.items || [];

  const copiesToRender: Exclude<CopyMode, 'ALL'>[] = isProforma
    ? ['ORIGINAL']
    : copyMode === 'ALL'
    ? ['ORIGINAL', 'DUPLICATE', 'TRIPLICATE']
    : [copyMode];

  const renderSingleInvoiceSheet = (
    copyKey: Exclude<CopyMode, 'ALL'>,
    sheetIndex: number,
    totalSheets: number
  ) => {
    const isLastSheet = sheetIndex === totalSheets - 1;

    return (
      <div
        key={copyKey}
        className="invoice-sheet"
        style={{
          padding: '20px 26px',
          fontFamily: 'Arial, sans-serif',
          color: '#0f172a',
          boxSizing: 'border-box',
          width: '100%',
          minHeight: '250mm',
          background: '#fff',
          fontSize: '12px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxShadow: '0 4px 16px rgba(15, 23, 42, 0.08)',
          marginBottom: !isLastSheet ? '20px' : '0',
          pageBreakAfter: !isLastSheet ? 'always' : 'auto',
          breakAfter: !isLastSheet ? 'page' : 'auto',
        }}
      >
        {/* TOP SECTION: HEADER + CUSTOMER + CLEAN ITEMS TABLE */}
        <div>
          {/* 1. DYNAMIC COMPANY HEADER */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              borderBottom: '2px solid #0284c7',
              paddingBottom: '12px',
              marginBottom: '12px',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center', width: '100%' }}>
              {branding.logo_data_url ? (
                <img
                  src={branding.logo_data_url}
                  alt={branding.name}
                  style={{
                    width: 'auto', maxWidth: '210px', height: '92px', objectFit: 'contain', flexShrink: 0,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '50px',
                    height: '50px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: '18px',
                    letterSpacing: '0.5px',
                    flexShrink: 0,
                  }}
                >
                  {getCompanyMonogram(branding.name)}
                </div>
              )}
              <div>
                <h1 style={{ margin: '0 0 2px 0', fontSize: '20px', fontWeight: 'bold', color: '#0284c7' }}>
                  {branding.name}
                </h1>
                {branding.tagline ? (
                  <div style={{ fontSize: '10.5px', color: '#64748b', fontStyle: 'italic', marginBottom: '4px' }}>
                    {branding.tagline}
                  </div>
                ) : null}
                <p style={{ margin: 0, fontSize: '11px', color: '#475569', lineHeight: '1.42' }}>
                  {branding.address ? (
                    <>
                      {branding.address}
                      <br />
                    </>
                  ) : null}
                  {branding.phone || branding.email ? (
                    <>
                      {branding.phone ? (
                        <>
                          <strong>Ph:</strong> {branding.phone}
                        </>
                      ) : null}
                      {branding.phone && branding.email ? ' | ' : null}
                      {branding.email ? (
                        <>
                          <strong>Email:</strong> {branding.email}
                        </>
                      ) : null}
                      <br />
                    </>
                  ) : null}
                  {branding.gstin ? (
                    <>
                      <strong>GSTIN:</strong> {branding.gstin}
                    </>
                  ) : null}
                  {branding.pan ? (
                    <>
                      {branding.gstin ? ' | ' : ''}
                      <strong>PAN:</strong> {branding.pan}
                    </>
                  ) : null}
                  {branding.state ? (
                    <>
                      {branding.gstin || branding.pan ? ' | ' : ''}
                      <strong>State:</strong> {branding.state}
                    </>
                  ) : null}
                </p>
              </div>
            </div></div>

      {/* 2. BILLED TO & INVOICE META (SIDE-BY-SIDE) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'stretch', gap: '12px', marginBottom: '14px' }}>
        <div
          style={{
            flex: 1,
            padding: '9px 14px',
            background: '#f8fafc',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
          }}
        >
            <span
              style={{
                fontSize: '10px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#64748b',
                fontWeight: 'bold',
              }}
            >
              BILLED TO (CUSTOMER DETAILS)
            </span>
            <h3 style={{ margin: '3px 0 2px 0', fontSize: '15px', color: '#0f172a' }}>
              {invoice.customer_name}
            </h3>
            <p style={{ margin: 0, fontSize: '11px', color: '#475569', lineHeight: '1.4' }}>
              {customer?.address && (
                <>
                  {customer.address}
                  <br />
                </>
              )}
              {[customer?.city, customer?.postal_code].filter(Boolean).join(' - ') || 'Address Not Provided'}
              <br />
              <strong>GSTIN / Tax ID:</strong> {customer?.gstin || 'Unregistered'} |{' '}
              <strong>Category:</strong> {customerGstCategory}
              <br />
              <strong>Place of Supply:</strong> State Code {placeOfSupply} |{' '}
              <strong>Reverse Charge:</strong> No
              {(invoice as any).party_challan_no ? (
                <>
                  {' '}| <strong>Party Challan No:</strong> {(invoice as any).party_challan_no}
                </>
              ) : null}
            </p>
          </div>
        <div
          style={{
            minWidth: '215px',
            padding: '9px 14px',
            background: '#f8fafc',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            textAlign: 'right',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'flex-end',
          }}
        >
              <span
                style={{
                  display: 'inline-block',
                  background: isProforma ? '#fef3c7' : '#e0f2fe',
                  color: isProforma ? '#b45309' : '#0369a1',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontWeight: 'bold',
                  fontSize: '12px',
                  marginBottom: '4px',
                }}
              >
                {isProforma ? 'PROFORMA INVOICE' : 'TAX INVOICE'}
              </span>
              {!isProforma ? (
                <div
                  style={{
                    fontSize: '10.5px',
                    color: '#334155',
                    fontWeight: '600',
                    fontStyle: 'italic',
                    marginBottom: '4px',
                  }}
                >
                  {COPY_LABELS[copyKey]}
                </div>
              ) : null}
              <p style={{ margin: 0, fontSize: '11px', color: '#334155', lineHeight: '1.45' }}>
                <strong>{isProforma ? 'Proforma No:' : 'Invoice No:'}</strong> {displayDocNo}
                <br />
                <strong>Date:</strong> {invoice.posting_date}
              </p>
            
        </div>
      </div>

      {/* 3. CLEAN ITEMS TABLE (NO EXTRA GRID LINES, 5-6 ITEMS SPACE) */}
          <div style={{ minHeight: '225px', marginBottom: '14px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderTop: '1px solid #cbd5e1', borderBottom: '2px solid #cbd5e1' }}>
                  <th style={{ padding: '8px 8px', textAlign: 'left', width: '32px' }}>#</th>
                  <th style={{ padding: '8px 8px', textAlign: 'left' }}>Item Description</th>
                  <th style={{ padding: '8px 8px', textAlign: 'right', width: '65px' }}>Qty</th>
                  <th style={{ padding: '8px 8px', textAlign: 'right', width: '90px' }}>Rate ({sym})</th>
                  <th style={{ padding: '8px 8px', textAlign: 'center', width: '55px' }}>Disc %</th>
                  <th style={{ padding: '8px 8px', textAlign: 'right', width: '110px' }}>Amount ({sym})</th>
                </tr>
              </thead>
              <tbody>
                {invoiceItems.length > 0
                  ? invoiceItems.map((itemRow, idx) => {
                      const masterItem = itemsMaster.find((m) => m.id === itemRow.item);
                      const isFoc = (itemRow as any).is_foc;
                      const discPct = parseFloat((itemRow as any).discount_percentage || '0');

                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '10px 8px', verticalAlign: 'top' }}>{idx + 1}</td>
                          <td style={{ padding: '10px 8px', verticalAlign: 'top' }}>
                            <strong style={{ fontSize: '12px', color: '#0f172a' }}>
                              {masterItem ? masterItem.item_name : `Item #${itemRow.item}`}
                            </strong>
                            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                              Code: {masterItem?.item_code || '-'} | {(invoice as any).invoice_type === 'JOB_WORK' ? 'SAC' : 'HSN'}: {(itemRow as any).hsn_code || ((invoice as any).invoice_type === 'JOB_WORK' ? '9988' : (masterItem as any)?.hsn_code || '-')} | Unit:{' '}
                              {(itemRow as any).billed_unit || masterItem?.unit || 'Nos'}
                            </div>
                            {(itemRow as any).description && String((itemRow as any).description).includes('Dispatch') ? (
                              <div style={{ fontSize: '10px', color: '#0369a1', fontWeight: 600, marginTop: '4px', whiteSpace: 'pre-line', background: '#f0f9ff', padding: '4px 6px', borderRadius: '4px', borderLeft: '2px solid #0284c7' }}>
                                {String((itemRow as any).description)
                                  .split('\n')
                                  .filter((ln: string) => ln.includes('Dispatch'))
                                  .join('\n')}
                              </div>
                            ) : null}
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'right', verticalAlign: 'top' }}>
                            {(() => {
                              const bQty = Number((itemRow as any).billed_qty || 0);
                              const pQty = Number(itemRow.quantity || 0);
                              const bUnit = (itemRow as any).billed_unit || masterItem?.unit || '';
                              const isAltBilled = bQty > 0 && Math.abs(bQty - pQty) > 0.0001;
                              const conv = Number((masterItem as any)?.conversion_factor || 0);
                              if (isAltBilled) {
                                return (
                                  <div>
                                    <div>{bQty} {bUnit}</div>
                                    <div style={{ fontSize: '10px', color: '#64748b' }}>({pQty} {masterItem?.unit})</div>
                                  </div>
                                );
                              }
                              return (
                                <div>
                                  <div>{itemRow.quantity}</div>
                                  {(masterItem as any)?.alt_unit && conv > 0 ? (
                                    <div style={{ fontSize: '10px', color: '#64748b' }}>({(pQty * conv).toFixed(0)} {(masterItem as any).alt_unit})</div>
                                  ) : null}
                                </div>
                              );
                            })()}
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'right', verticalAlign: 'top' }}>
                            {(() => {
                              if (isFoc) return '0.00';
                              const bQty = Number((itemRow as any).billed_qty || 0);
                              const pQty = Number(itemRow.quantity || 0);
                              const isAltBilled = bQty > 0 && Math.abs(bQty - pQty) > 0.0001;
                              const dispRate = isAltBilled ? Number(itemRow.rate) * (pQty / bQty) : Number(itemRow.rate);
                              return dispRate.toFixed(2);
                            })()}
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'center', verticalAlign: 'top' }}>
                            {discPct > 0 ? `${discPct}%` : '-'}
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 'bold', verticalAlign: 'top' }}>
                            {sym} {parseFloat(itemRow.amount.toString()).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })
                  : null}
              </tbody>
            </table>
          </div>
        </div>

        {/* BOTTOM SECTION: BANK DETAILS, TAX BREAKDOWN & RIGHT-SIDE STAMP BOX */}
        <div>
          {/* 4. DYNAMIC BANK DETAILS & TAX BREAKDOWN */}
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', borderTop: '1px solid #cbd5e1', paddingTop: '10px' }}>
            <tbody>
              <tr>
                <td style={{ verticalAlign: 'top', width: '52%', paddingRight: '18px', paddingTop: '10px' }}>
                  <div
                    style={{
                      background: '#f8fafc',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      border: '1px solid #e2e8f0',
                      marginBottom: '10px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '10px',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: '0 0 4px 0', fontWeight: 'bold', color: '#334155', fontSize: '11px' }}>
                        BANK PAYMENT DETAILS:
                      </p>
                      <div style={{ fontSize: '10.5px', color: '#475569', lineHeight: '1.45' }}>
                        {branding.bank_name || branding.bank_account_no || branding.bank_ifsc || branding.upi_id ? (
                          <>
                            {branding.bank_name ? (
                              <div>
                                <strong>Bank:</strong> {branding.bank_name}
                                {branding.bank_branch ? ` (${branding.bank_branch})` : ''}
                              </div>
                            ) : null}
                            {branding.bank_account_name ? (
                              <div>
                                <strong>A/c Name:</strong> {branding.bank_account_name}
                              </div>
                            ) : null}
                            {branding.bank_account_no ? (
                              <div>
                                <strong>A/c No:</strong> {branding.bank_account_no}
                              </div>
                            ) : null}
                            {branding.bank_ifsc ? (
                              <div>
                                <strong>IFSC:</strong> {branding.bank_ifsc}
                              </div>
                            ) : null}
                            {branding.upi_id ? (
                              <div>
                                <strong>UPI ID:</strong> {branding.upi_id}
                              </div>
                            ) : null}
                          </>
                        ) : branding.bank_details ? (
                          <div>
                            {branding.bank_details.split(' | ').map((line: string, i: number) => (
                              <div key={i}>{line}</div>
                            ))}
                          </div>
                        ) : (
                          <div>Bank details not configured</div>
                        )}
                      </div>
                    </div>
                    {upiQrUrl ? (
                      <div
                        style={{
                          textAlign: 'center',
                          background: '#fff',
                          padding: '5px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          flexShrink: 0,
                        }}
                      >
                        <img src={upiQrUrl} alt="UPI QR" style={{ width: '74px', height: '74px', display: 'block' }} />
                        <div style={{ fontSize: '8.5px', fontWeight: 'bold', color: '#0369a1', marginTop: '2px' }}>
                          Scan & Pay (UPI)
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div style={{ fontSize: '10px', color: '#64748b', lineHeight: '1.4' }}>
                    <strong style={{ color: '#334155' }}>Terms & Conditions:</strong>
                    <br />
                    {branding.invoice_terms
                      .split('\n')
                      .filter(Boolean)
                      .map((termLine: string, idx: number) => (
                        <div key={idx}>{termLine}</div>
                      ))}
                  </div>

                  {isProforma && (
                    <div
                      style={{
                        marginTop: '8px',
                        padding: '6px 8px',
                        background: '#fffbeb',
                        border: '1px solid #fde68a',
                        borderRadius: '4px',
                        fontSize: '10px',
                        color: '#92400e',
                      }}
                    >
                      <strong>Note:</strong> This is a Proforma Invoice / Estimate issued for order confirmation and
                      advance payment only. Official Tax Invoice will be issued upon final approval.
                    </div>
                  )}
                </td>

                <td style={{ verticalAlign: 'top', width: '48%', paddingTop: '10px' }}>
                  <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                    <tbody>
                      <tr>
                        <td style={{ padding: '4px 0', color: '#475569' }}>Taxable Value (Net):</td>
                        <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: '600' }}>
                          {sym} {netTotal.toFixed(2)}
                        </td>
                      </tr>
                      {isInterState ? (
                        <tr>
                          <td style={{ padding: '4px 0', color: '#475569' }}>IGST ({taxRate.toFixed(2)}%):</td>
                          <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: '600' }}>
                            {sym} {taxTotal.toFixed(2)}
                          </td>
                        </tr>
                      ) : (
                        <>
                          <tr>
                            <td style={{ padding: '4px 0', color: '#475569' }}>CGST ({(taxRate / 2).toFixed(2)}%):</td>
                            <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: '600' }}>
                              {sym} {halfTax.toFixed(2)}
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: '4px 0', color: '#475569' }}>SGST ({(taxRate / 2).toFixed(2)}%):</td>
                            <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: '600' }}>
                              {sym} {halfTax.toFixed(2)}
                            </td>
                          </tr>
                        </>
                      )}
                      <tr>
                        <td style={{ padding: '4px 0', color: '#0369a1', fontWeight: 'bold' }}>
                          Total Tax ({taxRate.toFixed(2)}%):
                        </td>
                        <td style={{ padding: '4px 0', textAlign: 'right', color: '#0369a1', fontWeight: 'bold' }}>
                          {sym} {taxTotal.toFixed(2)}
                        </td>
                      </tr>
                      {Math.abs(roundOff) > 0.001 && (
                        <tr>
                          <td style={{ padding: '4px 0', color: '#475569' }}>Round Off:</td>
                          <td style={{ padding: '4px 0', textAlign: 'right' }}>
                            {roundOff > 0 ? `+${sym} ${roundOff.toFixed(2)}` : `-${sym} ${Math.abs(roundOff).toFixed(2)}`}
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td colSpan={2} style={{ borderTop: '2px solid #0284c7', paddingTop: '6px' }}></td>
                      </tr>
                      <tr style={{ fontSize: '14px', fontWeight: 'bold' }}>
                        <td style={{ color: '#0f172a' }}>Grand Total:</td>
                        <td style={{ textAlign: 'right', color: '#0284c7' }}>
                          {sym} {grandTotal.toFixed(2)}
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={2} style={{ paddingTop: '8px' }}>
                          <div
                            style={{
                              background: '#f0f9ff',
                              border: '1px solid #bae6fd',
                              borderRadius: '4px',
                              padding: '6px 8px',
                              fontSize: '10px',
                              color: '#0369a1',
                              lineHeight: '1.35',
                            }}
                          >
                            <strong>Amount in Words:</strong>
                            <br />
                            <span style={{ fontWeight: '600', color: '#0f172a' }}>
                              {formatAmountInWords(grandTotal, sym)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>

          {/* 5. RIGHT-SIDE STAMP & AUTHORISED SIGNATORY BOX */}
          <div
            style={{
              marginTop: '14px',
              borderTop: '1px solid #cbd5e1',
              paddingTop: '10px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
            }}
          >
            <div style={{ fontSize: '10px', color: '#94a3b8' }}>
              This is a computer-generated invoice.
            </div>

            <div
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                padding: '8px 18px 10px 18px',
                width: '235px',
                textAlign: 'center',
                background: '#fff',
              }}
            >
              <p style={{ margin: 0, fontWeight: 'bold', color: '#334155', fontSize: '11.5px' }}>
                For, {branding.name || 'Authorised Signatory'}
              </p>
              {/* 65px Clear Space for Physical Rubber Stamp & Signature */}
              <div style={{ height: '65px' }} />
              <span
                style={{
                  borderTop: '1px dashed #94a3b8',
                  paddingTop: '4px',
                  display: 'inline-block',
                  width: '185px',
                  fontSize: '10.5px',
                  fontWeight: '600',
                  color: '#475569',
                }}
              >
                Authorised Signatory &amp; Stamp
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: '16px',
      }}
    >
      <style>{`
        @page {
          size: A4 portrait;
          margin: 8mm;
        }
        @media print {
          table thead {
            display: table-header-group !important;
          }
          table tr {
            page-break-inside: avoid !important;
          }
          html, body {
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * {
            visibility: hidden !important;
          }
          .no-print {
            display: none !important;
          }
          .preview-scroll-wrapper {
            overflow: visible !important;
            padding: 0 !important;
            background: #fff !important;
            display: block !important;
          }
          #printable-invoice-wrapper, #printable-invoice-wrapper * {
            visibility: visible !important;
          }
          #printable-invoice-wrapper {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }
          .invoice-sheet {
            width: 100% !important;
            min-height: 250mm !important;
            margin: 0 !important;
            padding: 4mm 5mm !important;
            box-shadow: none !important;
            border: none !important;
            background: #fff !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
          }
        }
      `}</style>

      <div
        style={{
          background: '#fff',
          borderRadius: '12px',
          width: '920px',
          maxWidth: '100%',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '95vh',
          overflow: 'hidden',
        }}
      >
        {/* Controls Header */}
        <div
          className="no-print"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 20px',
            borderBottom: '1px solid #e2e8f0',
            background: '#fff',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: '600', color: '#334155', fontSize: '15px' }}>
              {isProforma ? 'Proforma Preview' : 'Tax Invoice'} - {displayDocNo}
            </span>

            {/* Copy Selector Pills (Original / Duplicate / Triplicate / All 3) */}
            {!isProforma && (
              <div
                style={{
                  display: 'inline-flex',
                  background: '#f1f5f9',
                  padding: '3px',
                  borderRadius: '7px',
                  border: '1px solid #cbd5e1',
                  gap: '2px',
                }}
              >
                {(
                  [
                    { id: 'ORIGINAL', label: 'Original' },
                    { id: 'DUPLICATE', label: 'Duplicate' },
                    { id: 'TRIPLICATE', label: 'Triplicate' },
                    { id: 'ALL', label: 'All 3 Copies' },
                  ] as { id: CopyMode; label: string }[]
                ).map((tab) => {
                  const active = copyMode === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setCopyMode(tab.id)}
                      style={{
                        background: active ? '#0284c7' : 'transparent',
                        color: active ? '#fff' : '#475569',
                        border: 'none',
                        padding: '5px 10px',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '12px',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => setIsProforma((prev) => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: isProforma ? '#f59e0b' : '#475569',
                color: '#fff',
                border: 'none',
                padding: '7px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '12.5px',
              }}
            >
              {isProforma ? 'Switch to Tax Invoice' : 'View as Proforma'}
            </button>
            <button
              onClick={handlePrint}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: '#0284c7',
                color: '#fff',
                border: 'none',
                padding: '7px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '13px',
              }}
            >
              <Printer size={15} /> Print / Save PDF
            </button>
            <button
              onClick={handleDownloadPDF}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: '#10b981',
                color: '#fff',
                border: 'none',
                padding: '7px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '12.5px',
              }}
            >
              <Download size={15} /> Download PDF
            </button>
            <button
              onClick={onClose}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: '#ef4444',
                color: '#fff',
                border: 'none',
                padding: '7px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '13px',
              }}
            >
              <X size={15} /> Close
            </button>
          </div>
        </div>

        {/* Scrollable A4 Preview Container */}
        <div
          className="preview-scroll-wrapper"
          style={{
            overflowY: 'auto',
            flex: 1,
            background: '#f1f5f9',
            padding: '16px',
          }}
        >
          <div id="printable-invoice-wrapper">
            {copiesToRender.map((copyKey, idx) =>
              renderSingleInvoiceSheet(copyKey, idx, copiesToRender.length)
            )}
          </div>
        </div>
      </div>
    </div>
  );
};