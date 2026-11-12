import React, { useEffect, useState } from 'react';
import { X, Printer, Download } from 'lucide-react';
import type { SalesInvoice, Customer, Item } from '../types/erp';
import html2pdf from 'html2pdf.js';

interface InvoicePrintModalProps {
  invoice: SalesInvoice | null;
  customer?: Customer;
  itemsMaster: Item[];
  company?: any;
  onClose: () => void;
}

export const InvoicePrintModal: React.FC<InvoicePrintModalProps> = ({
  invoice,
  customer,
  itemsMaster,
  company,
  onClose,
}) => {
  const [isProforma, setIsProforma] = useState<boolean>(
    invoice ? invoice.status !== 'Approved' : false
  );

  useEffect(() => {
    if (invoice) {
      setIsProforma(invoice.status !== 'Approved');
    }
  }, [invoice]);

  const formattedParty = (invoice?.customer_name || 'Customer').replace(/[^a-zA-Z0-9]/g, '_');
  const docPrefix = isProforma ? 'Proforma_Invoice' : 'Invoice';
  const targetFileName = invoice ? `${docPrefix}_${invoice.invoice_number}_${formattedParty}` : '';

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
    const element = document.getElementById('printable-invoice');
    if (!element) return;

    const opt: any = {
      margin: [10, 10, 10, 10],
      filename: `${docPrefix}_${invoice.invoice_number}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    (html2pdf as any)().set(opt).from(element).save();
  };

  const netTotal = parseFloat(invoice.net_total.toString()) || 0;
  const taxTotal = parseFloat(invoice.tax_amount.toString()) || 0;
  const grandTotal = parseFloat(invoice.grand_total.toString()) || 0;
  const halfTax = taxTotal / 2;

  const sym = company?.symbol || company?.currency_symbol || (company?.currency === 'CAD' || company?.currency === 'USD' ? '$' : 'Rs.');

  const roundOff = (invoice as any).round_off !== undefined && (invoice as any).round_off !== null
    ? parseFloat((invoice as any).round_off.toString()) || 0
    : parseFloat((grandTotal - (netTotal + taxTotal)).toFixed(2));

  const companyStateCode = company?.gstin ? company.gstin.substring(0, 2) : '24';
  const isInterState = customer?.gstin && !customer.gstin.startsWith(companyStateCode);

  const customerGstCategory = customer?.gst_category 
    ? customer.gst_category 
    : (customer?.gstin && customer.gstin.trim() !== '' ? 'Registered Regular' : 'Unregistered');

  const displayDocNo = isProforma
    ? invoice.invoice_number.replace(/^INV-/i, 'PI-')
    : invoice.invoice_number;

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
        overflowY: 'auto',
        padding: '20px',
      }}
    >
      <style>{`
        @page {
          size: A4 portrait;
          margin: 10mm;
        }
        @media print {
          table thead {
            display: table-row-group !important;
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
          #printable-invoice, #printable-invoice * {
            visibility: visible !important;
          }
          #printable-invoice {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
            background: #fff !important;
          }
        }
      `}</style>

      <div
        style={{
          background: '#fff',
          borderRadius: '12px',
          width: '850px',
          maxWidth: '100%',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '94vh',
        }}
      >
        {/* Controls Header */}
        <div
          className="no-print"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 24px',
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          <span style={{ fontWeight: '600', color: '#334155', fontSize: '16px' }}>
            {isProforma ? 'Proforma Invoice Preview' : 'Tax Invoice Preview'} - {displayDocNo}
          </span>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              onClick={() => setIsProforma(prev => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: isProforma ? '#f59e0b' : '#475569',
                color: '#fff',
                border: 'none',
                padding: '8px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '13px'
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
                padding: '8px 16px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600',
              }}
            >
              <Printer size={16} /> Print / Save PDF
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
                padding: '8px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '13px'
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
                padding: '8px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600',
              }}
            >
              <X size={16} /> Close
            </button>
          </div>
        </div>

        {/* Invoice Printable Sheet */}
        <div
          id="printable-invoice"
          style={{
            padding: '24px 30px',
            fontFamily: 'Arial, sans-serif',
            color: '#0f172a',
            boxSizing: 'border-box',
            width: '100%',
            background: '#fff',
            fontSize: '12px'
          }}
        >
          {/* 1. DYNAMIC COMPANY HEADER */}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #0284c7', paddingBottom: '14px', marginBottom: '14px' }}>
            <div>
              <h1 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: 'bold', color: '#0284c7' }}>
                {company?.name || 'TallyBIZ Pvt Ltd'}
              </h1>
              <p style={{ margin: 0, fontSize: '11px', color: '#475569', lineHeight: '1.4' }}>
                {company?.address || ''}<br />
                {company?.gstin ? (
                  <><strong>GSTIN / Tax ID:</strong> {company.gstin}</>
                ) : null}
                {company?.state ? <> | <strong>State:</strong> {company.state}</> : null}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span
                style={{
                  display: 'inline-block',
                  background: isProforma ? '#fef3c7' : '#e0f2fe',
                  color: isProforma ? '#b45309' : '#0369a1',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontWeight: 'bold',
                  fontSize: '12px',
                  marginBottom: '6px',
                }}
              >
                {isProforma ? 'PROFORMA INVOICE' : 'TAX INVOICE'}
              </span>
              <p style={{ margin: 0, fontSize: '11px', color: '#334155', lineHeight: '1.4' }}>
                <strong>{isProforma ? 'Proforma No:' : 'Invoice No:'}</strong> {displayDocNo}<br />
                <strong>Date:</strong> {invoice.posting_date}
              </p>
            </div>
          </div>

          {/* 2. BILLED TO CUSTOMER */}
          <div style={{ marginBottom: '14px', padding: '10px 14px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 'bold' }}>
              BILLED TO (CUSTOMER DETAILS)
            </span>
            <h3 style={{ margin: '4px 0 2px 0', fontSize: '15px', color: '#0f172a' }}>
              {invoice.customer_name}
            </h3>
            <p style={{ margin: 0, fontSize: '11px', color: '#475569', lineHeight: '1.4' }}>
              {customer?.address && <>{customer.address}<br /></>}
              {[customer?.city, customer?.postal_code].filter(Boolean).join(' - ') || 'Address Not Provided'}<br />
              <strong>GSTIN / Tax ID:</strong> {customer?.gstin || 'Unregistered'} | <strong>Category:</strong> {customerGstCategory}
            </p>
          </div>

          {/* 3. ITEMS TABLE */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', fontSize: '11px' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderTop: '1px solid #cbd5e1', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '6px 8px', textAlign: 'left', width: '28px' }}>#</th>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Item Description</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', width: '50px' }}>Qty</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', width: '85px' }}>Rate ({sym})</th>
                <th style={{ padding: '6px 8px', textAlign: 'center', width: '50px' }}>Disc %</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', width: '100px' }}>Amount ({sym})</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items && invoice.items.length > 0 ? (
                invoice.items.map((itemRow, idx) => {
                  const masterItem = itemsMaster.find(m => m.id === itemRow.item);
                  const isFoc = (itemRow as any).is_foc;
                  const discPct = parseFloat((itemRow as any).discount_percentage || '0');

                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '6px 8px' }}>{idx + 1}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <strong>{masterItem ? masterItem.item_name : `Item #${itemRow.item}`}</strong>
                        <div style={{ fontSize: '10px', color: '#64748b' }}>Code: {masterItem?.item_code || '-'} | Unit: {masterItem?.unit || 'Nos'}</div>
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{itemRow.quantity}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                        {isFoc ? '0.00' : parseFloat(itemRow.rate.toString()).toFixed(2)}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        {discPct > 0 ? `${discPct}%` : '-'}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>
                        {sym} {parseFloat(itemRow.amount.toString()).toFixed(2)}
                      </td>
                    </tr>
                  );
                })
              ) : null}
            </tbody>
          </table>

          {/* 4. DYNAMIC BANK DETAILS & TAX BREAKDOWN */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px', tableLayout: 'fixed' }}>
            <tbody>
              <tr>
                <td style={{ verticalAlign: 'top', width: '52%', paddingRight: '20px' }}>
                  <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '10px' }}>
                    <p style={{ margin: '0 0 4px 0', fontWeight: 'bold', color: '#334155', fontSize: '11px' }}>BANK PAYMENT DETAILS:</p>
                    <div style={{ fontSize: '11px', color: '#475569', lineHeight: '1.4' }}>
                      {company?.bank_details ? (
                        <div>
                          {company.bank_details.split(' | ').map((line: string, i: number) => (
                            <div key={i}>{line}</div>
                          ))}
                        </div>
                      ) : (
                        <div>Bank details not configured</div>
                      )}
                    </div>
                  </div>

                  <div style={{ fontSize: '10px', color: '#64748b', lineHeight: '1.4' }}>
                    <strong style={{ color: '#334155' }}>Terms & Conditions:</strong><br />
                    1. Goods once sold will not be taken back.<br />
                    2. Interest @18% p.a. will be charged if payment is delayed.<br />
                    3. Subject to {company?.state ? company.state.split(',')[0].replace(/\s*\(\d+\)/, '') : 'local'} jurisdiction only.
                  </div>

                  {isProforma && (
                    <div style={{ marginTop: '8px', padding: '6px 8px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '4px', fontSize: '10px', color: '#92400e' }}>
                      <strong>Note:</strong> This is a Proforma Invoice / Estimate issued for order confirmation and advance payment only. Official Tax Invoice will be issued upon final approval.
                    </div>
                  )}
                </td>

                <td style={{ verticalAlign: 'top', width: '48%' }}>
                  <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                    <tbody>
                      <tr>
                        <td style={{ padding: '3px 0', color: '#475569' }}>Taxable Value (Net):</td>
                        <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: '600' }}>{sym} {netTotal.toFixed(2)}</td>
                      </tr>
                      {isInterState ? (
                        <tr>
                          <td style={{ padding: '3px 0', color: '#475569' }}>IGST (18.00%):</td>
                          <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: '600' }}>{sym} {taxTotal.toFixed(2)}</td>
                        </tr>
                      ) : (
                        <>
                          <tr>
                            <td style={{ padding: '3px 0', color: '#475569' }}>CGST (9.00%):</td>
                            <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: '600' }}>{sym} {halfTax.toFixed(2)}</td>
                          </tr>
                          <tr>
                            <td style={{ padding: '3px 0', color: '#475569' }}>SGST (9.00%):</td>
                            <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: '600' }}>{sym} {halfTax.toFixed(2)}</td>
                          </tr>
                        </>
                      )}
                      <tr>
                        <td style={{ padding: '3px 0', color: '#0369a1', fontWeight: 'bold' }}>Total Tax (18.00%):</td>
                        <td style={{ padding: '3px 0', textAlign: 'right', color: '#0369a1', fontWeight: 'bold' }}>{sym} {taxTotal.toFixed(2)}</td>
                      </tr>
                      {Math.abs(roundOff) > 0.001 && (
                        <tr>
                          <td style={{ padding: '3px 0', color: '#475569' }}>Round Off:</td>
                          <td style={{ padding: '3px 0', textAlign: 'right' }}>
                            {roundOff > 0 ? `+${sym} ${roundOff.toFixed(2)}` : `-${sym} ${Math.abs(roundOff).toFixed(2)}`}
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td colSpan={2} style={{ borderTop: '2px solid #0284c7', paddingTop: '6px' }}></td>
                      </tr>
                      <tr style={{ fontSize: '14px', fontWeight: 'bold' }}>
                        <td style={{ color: '#0f172a' }}>Grand Total:</td>
                        <td style={{ textAlign: 'right', color: '#0284c7' }}>{sym} {grandTotal.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>

          {/* 5. DYNAMIC SIGNATURE */}
          <table style={{ width: '100%', marginTop: '28px', borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
            <tbody>
              <tr>
                <td style={{ width: '60%' }}></td>
                <td style={{ textAlign: 'center', width: '40%' }}>
                  <p style={{ margin: '0 0 30px 0', fontWeight: 'bold', color: '#334155', fontSize: '11px' }}>
                    For, {company?.name || 'Authorised Signatory'}
                  </p>
                  <span style={{ borderTop: '1px dashed #94a3b8', paddingTop: '4px', display: 'inline-block', width: '160px', fontSize: '10px', color: '#64748b' }}>
                    Authorised Signatory
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};