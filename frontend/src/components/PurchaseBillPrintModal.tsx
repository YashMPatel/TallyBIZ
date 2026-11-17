import React, { useEffect, useState } from 'react';
import { X, Printer, Download } from 'lucide-react';
import type { PurchaseInvoice, Supplier, Item } from '../types/erp';
import html2pdf from 'html2pdf.js';
import {
  type CompanyBrandingData,
  getInitialCompanyBranding,
  fetchFreshCompanyBranding,
  getCompanyMonogram,
  formatAmountInWords,
} from '../utils/invoiceBranding';

interface PurchaseBillPrintModalProps {
  bill: PurchaseInvoice | null;
  supplier?: Supplier;
  itemsMaster: Item[];
  company?: any;
  onClose: () => void;
}

export const PurchaseBillPrintModal: React.FC<PurchaseBillPrintModalProps> = ({
  bill,
  supplier,
  itemsMaster,
  company,
  onClose,
}) => {
  const [branding, setBranding] = useState<CompanyBrandingData>(() =>
    getInitialCompanyBranding(company)
  );

  useEffect(() => {
    setBranding(getInitialCompanyBranding(company));
    fetchFreshCompanyBranding(company).then(setBranding);
  }, [company, bill?.id]);

  const formattedParty = (bill?.supplier_name || 'Supplier').replace(/[^a-zA-Z0-9]/g, '_');
  const targetFileName = bill ? `PurchaseBill_${bill.bill_number}_${formattedParty}` : '';

  useEffect(() => {
    const originalTitle = document.title;
    if (targetFileName) document.title = targetFileName;
    return () => {
      document.title = originalTitle;
    };
  }, [targetFileName]);

  if (!bill) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    const element = document.getElementById('printable-purchase-bill');
    if (!element) return;

    const opt: any = {
      margin: [8, 8, 8, 8],
      filename: `${targetFileName || bill.bill_number}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    };

    (html2pdf as any)().set(opt).from(element).save();
  };

  const netTotal = parseFloat(bill.net_total.toString()) || 0;
  const taxTotal = parseFloat(bill.tax_amount.toString()) || 0;
  const grandTotal = parseFloat(bill.grand_total.toString()) || 0;
  const halfTax = taxTotal / 2;
  const taxRate = parseFloat((bill as any).tax_rate?.toString() || '18') || 18;
  const halfRateLabel = (taxRate / 2).toFixed(taxRate % 2 === 0 ? 0 : 2);
  const fullRateLabel = taxRate.toFixed(taxRate % 1 === 0 ? 0 : 2);

  const sym = branding.currency_symbol || '₹';
  const companyStateCode = branding.gstin ? branding.gstin.substring(0, 2) : '24';
  const isInterState = Boolean(
    supplier?.gstin && supplier.gstin.trim().length >= 2 && !supplier.gstin.startsWith(companyStateCode)
  );
  const roundOff = parseFloat((grandTotal - (netTotal + taxTotal)).toFixed(2));

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        overflowY: 'auto',
        padding: '16px',
      }}
    >
      <style>{`
        @page {
          size: A4 portrait;
          margin: 8mm;
        }
        @media print {
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
          #printable-purchase-bill, #printable-purchase-bill * {
            visibility: visible !important;
          }
          #printable-purchase-bill {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 6mm !important;
            box-shadow: none !important;
            border: none !important;
            box-sizing: border-box !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div
        style={{
          background: '#fff',
          borderRadius: '12px',
          width: '880px',
          maxWidth: '100%',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '94vh',
          overflow: 'hidden',
        }}
      >
        {/* Controls Header */}
        <div
          className="no-print"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 22px',
            borderBottom: '1px solid #e2e8f0',
            background: '#fff',
          }}
        >
          <span style={{ fontWeight: '600', color: '#334155', fontSize: '15px' }}>
            Purchase Voucher &amp; ITC Bill Preview — {bill.bill_number}
          </span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
                padding: '7px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '13px',
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

        {/* Printable Purchase Sheet */}
        <div
          id="printable-purchase-bill"
          style={{
            padding: '26px 32px',
            overflowY: 'auto',
            fontFamily: 'Arial, system-ui, sans-serif',
            color: '#0f172a',
            boxSizing: 'border-box',
            width: '100%',
          }}
        >
          {/* Branded Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0f172a', paddingBottom: '14px' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', maxWidth: '62%' }}>
              {branding.logo_data_url ? (
                <img
                  src={branding.logo_data_url}
                  alt={branding.name}
                  style={{ width: '48px', height: '48px', objectFit: 'contain', borderRadius: '6px', border: '1px solid #e2e8f0' }}
                />
              ) : (
                <div
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '8px',
                    background: '#0f172a',
                    color: '#38bdf8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '16px',
                    flexShrink: 0,
                  }}
                >
                  {getCompanyMonogram(branding.name)}
                </div>
              )}
              <div>
                <h1 style={{ margin: '0 0 3px 0', fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>
                  {branding.name}
                </h1>
                {branding.tagline && (
                  <div style={{ fontSize: '11px', color: '#0284c7', fontWeight: 600, marginBottom: '2px' }}>{branding.tagline}</div>
                )}
                <p style={{ margin: 0, fontSize: '11.5px', color: '#475569', lineHeight: '1.45' }}>
                  {branding.address && <>{branding.address}<br /></>}
                  {branding.gstin && <><strong>GSTIN:</strong> {branding.gstin} </>}
                  {branding.pan && <>| <strong>PAN:</strong> {branding.pan} </>}
                  {branding.state && <>| <strong>State:</strong> {branding.state}</>}
                  {(branding.phone || branding.email) && (
                    <><br />{[branding.phone, branding.email].filter(Boolean).join(' | ')}</>
                  )}
                </p>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <span style={{ display: 'inline-block', background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b', padding: '4px 10px', borderRadius: '4px', fontWeight: 800, fontSize: '12px', letterSpacing: '0.05em', marginBottom: '6px' }}>
                PURCHASE BILL / INWARD VOUCHER
              </span>
              <p style={{ margin: 0, fontSize: '12px', color: '#1e293b', lineHeight: '1.5' }}>
                <strong>Bill Ref #:</strong> {bill.bill_number}<br />
                <strong>Bill Date:</strong> {bill.posting_date}<br />
                {(bill as any).due_date && <><strong>Due Date:</strong> {(bill as any).due_date}<br /></>}
                <strong>Status:</strong> <span style={{ color: '#15803d', fontWeight: 700 }}>{bill.status}</span>
              </p>
            </div>
          </div>

          {/* Supplier Details Box */}
          <div style={{ margin: '16px 0', padding: '12px 16px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
            <div>
              <span style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700 }}>
                Supplier / Vendor (Billed From)
              </span>
              <h3 style={{ margin: '3px 0 3px 0', fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                {bill.supplier_name}
              </h3>
              <p style={{ margin: 0, fontSize: '11.5px', color: '#475569', lineHeight: '1.45' }}>
                {supplier?.address && <>{supplier.address}<br /></>}
                {[supplier?.city, supplier?.postal_code].filter(Boolean).join(' - ') || 'Registered Vendor Address'}<br />
                <strong>Supplier GSTIN:</strong> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{supplier?.gstin || 'Unregistered'}</span> |{' '}
                <strong>GST Category:</strong> {supplier?.gst_category || 'Registered Regular'}
              </p>
            </div>
            <div style={{ textAlign: 'right', fontSize: '11.5px', color: '#334155' }}>
              <span style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700 }}>
                Place of Supply &amp; ITC
              </span>
              <div style={{ marginTop: '4px', fontWeight: 700 }}>
                {isInterState ? 'Inter-State Supply (IGST)' : `Intra-State (${branding.state})`}
              </div>
              <div style={{ color: '#15803d', fontWeight: 600, marginTop: '2px' }}>
                {supplier?.gstin ? 'Eligible for GSTR-2B ITC' : 'Unregistered Purchase'}
              </div>
            </div>
          </div>

          {/* Items Table with HSN/SAC */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#0f172a', color: '#f8fafc' }}>
                <th style={{ padding: '8px 8px', textAlign: 'left', width: '28px' }}>#</th>
                <th style={{ padding: '8px 8px', textAlign: 'left' }}>Item / Inward Description</th>
                <th style={{ padding: '8px 8px', textAlign: 'center', width: '78px' }}>HSN/SAC</th>
                <th style={{ padding: '8px 8px', textAlign: 'right', width: '68px' }}>Qty</th>
                <th style={{ padding: '8px 8px', textAlign: 'right', width: '85px' }}>Rate ({sym})</th>
                <th style={{ padding: '8px 8px', textAlign: 'center', width: '54px' }}>Disc %</th>
                <th style={{ padding: '8px 8px', textAlign: 'right', width: '105px' }}>Taxable ({sym})</th>
              </tr>
            </thead>
            <tbody>
              {bill.items && bill.items.length > 0 ? (
                bill.items.map((itemRow, idx) => {
                  const masterItem = itemsMaster.find((m) => m.id === itemRow.item);
                  const isFoc = (itemRow as any).is_foc;
                  const discPct = parseFloat((itemRow as any).discount_percentage || '0');
                  const hsnCode = (masterItem as any)?.hsn_code || '-';

                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #cbd5e1' }}>
                      <td style={{ padding: '8px 8px' }}>{idx + 1}</td>
                      <td style={{ padding: '8px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <strong>{masterItem ? masterItem.item_name : (itemRow as any).description || `Item #${itemRow.item}`}</strong>
                          {isFoc && (
                            <span style={{ background: '#fef3c7', color: '#b45309', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>
                              FOC / Sample
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '10.5px', color: '#64748b' }}>
                          Code: {masterItem?.item_code || '-'} | Unit: {masterItem?.unit || 'Nos'}
                        </div>
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{hsnCode}</td>
                      <td style={{ padding: '8px 8px', textAlign: 'right' }}>{itemRow.quantity}</td>
                      <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                        {isFoc ? '0.00' : parseFloat(itemRow.rate.toString()).toFixed(2)}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                        {discPct > 0 ? `${discPct}%` : '-'}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700 }}>
                        {sym} {parseFloat(itemRow.amount.toString()).toFixed(2)}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} style={{ padding: '12px', textAlign: 'center', color: '#64748b' }}>
                    No line items found
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Amount in Words + Tax Breakdown */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', marginTop: '8px' }}>
            <div style={{ flex: 1, background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px 14px', fontSize: '11.5px' }}>
              <div style={{ fontWeight: 700, color: '#475569', textTransform: 'uppercase', fontSize: '10px' }}>
                Bill Total Amount (In Words)
              </div>
              <div style={{ fontWeight: 700, color: '#0f172a', marginTop: '3px', fontSize: '12px' }}>
                {formatAmountInWords(grandTotal, sym)}
              </div>
              <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1', color: '#475569', fontSize: '11px', lineHeight: '1.45' }}>
                <strong>Internal Verification &amp; Audit Note:</strong><br />
                1. Goods inspected and inwarded into warehouse stock ledger.<br />
                2. Input Tax Credit (ITC) reconciled under GST Section 16.<br />
                3. Posted to Supplier Creditors &amp; Input GST Ledgers.
              </div>
            </div>

            <div style={{ width: '310px', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px 14px', fontSize: '12px', background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569', marginBottom: '5px' }}>
                <span>Taxable Subtotal:</span>
                <span>{sym} {netTotal.toFixed(2)}</span>
              </div>
              {isInterState ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569', marginBottom: '5px' }}>
                  <span>Input IGST ITC ({fullRateLabel}%):</span>
                  <span>{sym} {taxTotal.toFixed(2)}</span>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569', marginBottom: '5px' }}>
                    <span>Input CGST ITC ({halfRateLabel}%):</span>
                    <span>{sym} {halfTax.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569', marginBottom: '5px' }}>
                    <span>Input SGST ITC ({halfRateLabel}%):</span>
                    <span>{sym} {halfTax.toFixed(2)}</span>
                  </div>
                </>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#15803d', fontWeight: 700, marginBottom: '5px' }}>
                <span>Total Input Tax Credit:</span>
                <span>{sym} {taxTotal.toFixed(2)}</span>
              </div>
              {Math.abs(roundOff) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', marginBottom: '5px' }}>
                  <span>Round Off:</span>
                  <span>{roundOff >= 0 ? '+' : ''}{sym} {roundOff.toFixed(2)}</span>
                </div>
              )}
              <hr style={{ border: 'none', borderTop: '2px solid #0f172a', margin: '6px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                <span>Grand Total Payable:</span>
                <span style={{ color: '#0284c7' }}>{sym} {grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Signature Footer */}
          <div style={{ marginTop: '34px', paddingTop: '14px', borderTop: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: '11px', color: '#475569' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ height: '42px' }} />
              <span style={{ borderTop: '1px dashed #94a3b8', paddingTop: '4px', display: 'inline-block', width: '170px' }}>
                Store / Inward Receiver
              </span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>For, {branding.name}</p>
              <div style={{ height: '42px' }} />
              <span style={{ borderTop: '1px dashed #94a3b8', paddingTop: '4px', display: 'inline-block', width: '185px' }}>
                Verified &amp; Authorised Signatory
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
