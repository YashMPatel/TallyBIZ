import React, { useEffect, useState } from 'react';
import { X, Printer, Download } from 'lucide-react';
import type { PaymentEntry } from '../types/erp';
import html2pdf from 'html2pdf.js';
import {
  type CompanyBrandingData,
  getInitialCompanyBranding,
  fetchFreshCompanyBranding,
  getCompanyMonogram,
  formatAmountInWords,
} from '../utils/invoiceBranding';

interface PaymentPrintModalProps {
  payment: PaymentEntry | null;
  company?: any;
  onClose: () => void;
}

export const PaymentPrintModal: React.FC<PaymentPrintModalProps> = ({
  payment,
  company,
  onClose,
}) => {
  const [branding, setBranding] = useState<CompanyBrandingData>(() =>
    getInitialCompanyBranding(company)
  );

  useEffect(() => {
    setBranding(getInitialCompanyBranding(company));
    fetchFreshCompanyBranding(company).then(setBranding);
  }, [company, payment?.id]);

  const formattedParty = (payment?.party_name || 'Party').replace(/[^a-zA-Z0-9]/g, '_');
  const targetFileName = payment ? `Payment_${payment.voucher_no}_${formattedParty}` : '';

  useEffect(() => {
    const originalTitle = document.title;
    if (targetFileName) document.title = targetFileName;
    return () => {
      document.title = originalTitle;
    };
  }, [targetFileName]);

  if (!payment) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    const element = document.getElementById('printable-payment-voucher');
    if (!element) return;

    const opt: any = {
      margin: [10, 10, 10, 10],
      filename: `${targetFileName || payment.voucher_no}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    };

    (html2pdf as any)().set(opt).from(element).save();
  };

  const amount = parseFloat(payment.paid_amount.toString()) || 0;
  const isReceive = payment.payment_type === 'Receive';
  const sym = branding.currency_symbol || '₹';

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
          margin: 10mm;
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
          #printable-payment-voucher, #printable-payment-voucher * {
            visibility: visible !important;
          }
          #printable-payment-voucher {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 8mm !important;
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
          width: '820px',
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
            {isReceive ? 'Official Money Receipt' : 'Payment Voucher'} Preview — {payment.voucher_no}
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

        {/* Printable Voucher Sheet */}
        <div
          id="printable-payment-voucher"
          style={{
            padding: '28px 34px',
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
              <span
                style={{
                  display: 'inline-block',
                  background: isReceive ? '#dcfce7' : '#fee2e2',
                  color: isReceive ? '#15803d' : '#b91c1c',
                  border: `1px solid ${isReceive ? '#16a34a' : '#ef4444'}`,
                  padding: '4px 12px',
                  borderRadius: '4px',
                  fontWeight: 800,
                  fontSize: '12px',
                  letterSpacing: '0.05em',
                  marginBottom: '6px',
                }}
              >
                {isReceive ? 'OFFICIAL MONEY RECEIPT' : 'PAYMENT VOUCHER'}
              </span>
              <p style={{ margin: 0, fontSize: '12px', color: '#1e293b', lineHeight: '1.5' }}>
                <strong>Voucher No:</strong> {payment.voucher_no}<br />
                <strong>Posting Date:</strong> {payment.posting_date}
              </p>
            </div>
          </div>

          {/* Details Table */}
          <div style={{ margin: '20px 0', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  <td style={{ padding: '11px 16px', width: '210px', fontWeight: 700, color: '#475569' }}>
                    {isReceive ? 'Received With Thanks From:' : 'Paid To Party:'}
                  </td>
                  <td style={{ padding: '11px 16px', fontWeight: 800, fontSize: '15px', color: '#0f172a' }}>
                    {payment.party_name}{' '}
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>({payment.party_type})</span>
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '11px 16px', fontWeight: 700, color: '#475569' }}>Payment Mode:</td>
                  <td style={{ padding: '11px 16px', color: '#0f172a' }}>
                    <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '3px 10px', borderRadius: '4px', fontWeight: 700 }}>
                      {payment.mode_of_payment}
                    </span>
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  <td style={{ padding: '11px 16px', fontWeight: 700, color: '#475569' }}>Reference / UTR / Cheque No:</td>
                  <td style={{ padding: '11px 16px', color: '#0f172a', fontFamily: 'monospace', fontWeight: 600 }}>
                    {payment.reference_no || 'N/A'}
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '11px 16px', fontWeight: 700, color: '#475569' }}>Narration / Remarks:</td>
                  <td style={{ padding: '11px 16px', color: '#334155' }}>
                    {payment.remarks ||
                      (isReceive
                        ? 'Settlement received against customer outstanding ledger.'
                        : `Vendor payment released via ${payment.mode_of_payment}.`)}
                  </td>
                </tr>
                <tr style={{ background: isReceive ? '#f0fdf4' : '#fef2f2', borderBottom: '1px solid #cbd5e1' }}>
                  <td style={{ padding: '14px 16px', fontWeight: 800, fontSize: '14px', color: isReceive ? '#166534' : '#991b1b' }}>
                    Amount Transacted:
                  </td>
                  <td style={{ padding: '14px 16px', fontWeight: 800, fontSize: '20px', color: isReceive ? '#15803d' : '#b91c1c' }}>
                    {sym} {amount.toFixed(2)}
                  </td>
                </tr>
                <tr style={{ background: '#f8fafc' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 700, color: '#475569', fontSize: '12px' }}>
                    Amount in Words:
                  </td>
                  <td style={{ padding: '10px 16px', fontWeight: 700, color: '#0f172a', fontSize: '12.5px' }}>
                    {formatAmountInWords(amount, sym)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Company Bank Details & Double-entry Impact */}
          <div style={{ display: 'grid', gridTemplateColumns: branding.bank_account_no ? '1fr 1fr' : '1fr', gap: '12px', margin: '16px 0' }}>
            {branding.bank_account_no && (
              <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '11.5px', color: '#334155' }}>
                <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '3px' }}>Company Bank Account Details:</div>
                <div><strong>Bank:</strong> {branding.bank_name} {branding.bank_branch ? `(${branding.bank_branch})` : ''}</div>
                <div><strong>A/c Name:</strong> {branding.bank_account_name} | <strong>A/c No:</strong> {branding.bank_account_no}</div>
                {branding.bank_ifsc && <div><strong>IFSC Code:</strong> {branding.bank_ifsc}</div>}
              </div>
            )}

            <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '11.5px', color: '#334155' }}>
              <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '3px' }}>Accounting Impact (General Ledger):</div>
              {isReceive ? (
                <p style={{ margin: 0, lineHeight: '1.45' }}>
                  <strong>Debit:</strong> Bank / Cash Account ({sym} {amount.toFixed(2)})<br />
                  <strong>Credit:</strong> Debtors — {payment.party_name} ({sym} {amount.toFixed(2)})
                </p>
              ) : (
                <p style={{ margin: 0, lineHeight: '1.45' }}>
                  <strong>Debit:</strong> Creditors — {payment.party_name} ({sym} {amount.toFixed(2)})<br />
                  <strong>Credit:</strong> Bank / Cash Account ({sym} {amount.toFixed(2)})
                </p>
              )}
            </div>
          </div>

          {/* Signature Box */}
          <div style={{ marginTop: '42px', paddingTop: '14px', borderTop: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: '11px', color: '#475569' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ height: '44px' }} />
              <span style={{ borderTop: '1px dashed #94a3b8', paddingTop: '4px', display: 'inline-block', width: '175px' }}>
                Party / Receiver Signature
              </span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>For, {branding.name}</p>
              <div style={{ height: '44px' }} />
              <span style={{ borderTop: '1px dashed #94a3b8', paddingTop: '4px', display: 'inline-block', width: '185px' }}>
                Authorised Signatory / Cashier
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
