import React from 'react';
import { X, Printer } from 'lucide-react';

interface GSTPrintModalProps {
  data: any[];
  onClose: () => void;
  companyName?: string;
  company?: any;
}

export const GSTPrintModal: React.FC<GSTPrintModalProps> = ({
  data = [],
  onClose,
  companyName = 'TallyBIZ Enterprise',
  company,
}) => {
  const safeData = Array.isArray(data) ? data : [];
  const symbol = company?.currency_symbol || safeData[0]?.currency_symbol || localStorage.getItem('active_company_symbol') || '₹';
  const displayCompany = company?.name || companyName;
  const gstin = company?.gstin || company?.tax_id || safeData[0]?.company_gstin || 'N/A';
  const state = company?.state || safeData[0]?.company_state || '';
  const address = company?.address || '';

  const allB2B = safeData.flatMap((r) => (Array.isArray(r.b2b_invoices) ? r.b2b_invoices : []));
  const allHsn = safeData.flatMap((r) => (Array.isArray(r.hsn_summary) ? r.hsn_summary : []));

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '20px',
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '10px',
          width: '100%',
          maxWidth: '920px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
          overflow: 'hidden',
        }}
      >
        <div
          className="no-print"
          style={{
            padding: '14px 20px',
            backgroundColor: '#090d16',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #1e293b',
          }}
        >
          <span style={{ color: '#f8fafc', fontWeight: 600, fontSize: '14px' }}>
            GSTR-1 &amp; GSTR-3B Compliance Report — Print Preview
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={handlePrint}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                backgroundColor: '#0284c7',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '12px',
              }}
            >
              <Printer size={15} /> Print / Save PDF
            </button>
            <button
              onClick={onClose}
              style={{
                backgroundColor: '#334155',
                color: '#f8fafc',
                border: 'none',
                borderRadius: '6px',
                padding: '6px',
                cursor: 'pointer',
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div style={{ padding: '28px 32px', overflowY: 'auto', color: '#0f172a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0f172a', paddingBottom: '14px', marginBottom: '20px' }}>
            <div>
              <h2 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: 800 }}>{displayCompany}</h2>
              {address && <div style={{ fontSize: '12px', color: '#475569', maxWidth: '460px' }}>{address}</div>}
              <div style={{ fontSize: '12px', color: '#334155', marginTop: '4px' }}>
                <strong>GSTIN:</strong> {gstin} {state ? `| State: ${state}` : ''}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0284c7' }}>GST RETURN WORKING SUMMARY</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>GSTR-1 (Outward) &amp; GSTR-3B (Tax Offset)</div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Generated: {new Date().toLocaleDateString('en-IN')}</div>
            </div>
          </div>

          <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', color: '#1e293b' }}>
            1. GSTR-3B Monthly Output Tax, Input Tax Credit (ITC) &amp; Net Payable
          </h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '22px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9', borderTop: '1px solid #94a3b8', borderBottom: '1px solid #94a3b8' }}>
                <th style={{ padding: '8px', textAlign: 'left' }}>Month</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Taxable Sales</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>CGST</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>SGST</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>IGST</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Total Output</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Taxable Pur.</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Eligible ITC</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Net Payable</th>
              </tr>
            </thead>
            <tbody>
              {safeData.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '18px', textAlign: 'center', color: '#94a3b8' }}>
                    No GST return records available to display.
                  </td>
                </tr>
              ) : (
                safeData.map((row, index) => {
                  const tSales = Number(row.sales ?? row.taxable_sales ?? 0);
                  const outGst = Number(row.output_gst ?? 0);
                  const tPur = Number(row.purchases ?? row.taxable_purchases ?? 0);
                  const inGst = Number(row.input_gst ?? 0);
                  const net = Number(row.net_payable ?? Math.max(0, Number(row.net_gst ?? (outGst - inGst))));
                  return (
                    <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px', fontWeight: 700 }}>{row.month}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{symbol}{tSales.toFixed(2)}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{symbol}{Number(row.output_cgst || 0).toFixed(2)}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{symbol}{Number(row.output_sgst || 0).toFixed(2)}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{symbol}{Number(row.output_igst || 0).toFixed(2)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', color: '#dc2626', fontWeight: 700 }}>{symbol}{outGst.toFixed(2)}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{symbol}{tPur.toFixed(2)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', color: '#16a34a', fontWeight: 700 }}>{symbol}{inGst.toFixed(2)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800, color: '#0369a1' }}>{symbol}{net.toFixed(2)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {allB2B.length > 0 && (
            <>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', color: '#1e293b' }}>
                2. GSTR-1 Table 4A — B2B Outward Supplies (Registered Customers)
              </h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', marginBottom: '22px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', borderTop: '1px solid #94a3b8', borderBottom: '1px solid #94a3b8' }}>
                    <th style={{ padding: '7px', textAlign: 'left' }}>Invoice #</th>
                    <th style={{ padding: '7px', textAlign: 'left' }}>Date</th>
                    <th style={{ padding: '7px', textAlign: 'left' }}>Customer Name</th>
                    <th style={{ padding: '7px', textAlign: 'left' }}>GSTIN</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>Taxable</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>Total Tax</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>Invoice Total</th>
                  </tr>
                </thead>
                <tbody>
                  {allB2B.map((inv: any, idx: number) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '7px', fontWeight: 600 }}>{inv.invoice_number}</td>
                      <td style={{ padding: '7px' }}>{inv.posting_date}</td>
                      <td style={{ padding: '7px' }}>{inv.customer_name}</td>
                      <td style={{ padding: '7px', fontFamily: 'monospace' }}>{inv.gstin}</td>
                      <td style={{ padding: '7px', textAlign: 'right' }}>{symbol}{Number(inv.taxable_value || 0).toFixed(2)}</td>
                      <td style={{ padding: '7px', textAlign: 'right' }}>{symbol}{Number(inv.total_tax || 0).toFixed(2)}</td>
                      <td style={{ padding: '7px', textAlign: 'right', fontWeight: 700 }}>{symbol}{Number(inv.grand_total || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {allHsn.length > 0 && (
            <>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', color: '#1e293b' }}>
                3. GSTR-1 Table 12 — HSN-Wise Summary of Outward Supplies
              </h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', marginBottom: '24px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', borderTop: '1px solid #94a3b8', borderBottom: '1px solid #94a3b8' }}>
                    <th style={{ padding: '7px', textAlign: 'left' }}>HSN</th>
                    <th style={{ padding: '7px', textAlign: 'left' }}>Description</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>Qty</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>Rate</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>Taxable</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>Total Tax</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>Total Value</th>
                  </tr>
                </thead>
                <tbody>
                  {allHsn.map((h: any, idx: number) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '7px', fontFamily: 'monospace', fontWeight: 700 }}>{h.hsn_code}</td>
                      <td style={{ padding: '7px' }}>{h.description}</td>
                      <td style={{ padding: '7px', textAlign: 'right' }}>{Number(h.total_qty || 0).toFixed(2)} {h.uqc}</td>
                      <td style={{ padding: '7px', textAlign: 'right' }}>{Number(h.gst_rate || 0).toFixed(0)}%</td>
                      <td style={{ padding: '7px', textAlign: 'right' }}>{symbol}{Number(h.taxable_value || 0).toFixed(2)}</td>
                      <td style={{ padding: '7px', textAlign: 'right' }}>{symbol}{Number(h.total_tax || 0).toFixed(2)}</td>
                      <td style={{ padding: '7px', textAlign: 'right', fontWeight: 700 }}>{symbol}{Number(h.total_value || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '32px', paddingTop: '12px', borderTop: '1px dashed #cbd5e1', fontSize: '11px', color: '#64748b' }}>
            <span>Computer-generated GST Compliance Working Statement — TallyBIZ ERP</span>
            <span>For <strong>{displayCompany}</strong> — Authorized Signatory / CA</span>
          </div>
        </div>
      </div>
    </div>
  );
};
