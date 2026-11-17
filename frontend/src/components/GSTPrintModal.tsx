import React, { useState, useEffect } from 'react';
import { X, Printer } from 'lucide-react';

export type GSTReportType = 'gstr3b' | 'gstr1_sales' | 'gstr1_hsn' | 'gstr2_itc' | 'all';

interface GSTPrintModalProps {
  data: any[];
  onClose: () => void;
  companyName?: string;
  company?: any;
  initialReportType?: GSTReportType;
  selectedMonth?: string;
}

const REPORT_META: Record<GSTReportType, { title: string; subtitle: string; code: string }> = {
  gstr3b: {
    code: 'GSTR-3B',
    title: 'GSTR-3B MONTHLY TAX LIABILITY & ITC OFFSET SUMMARY',
    subtitle: 'Summary of Outward Supplies, Eligible Input Tax Credit (ITC) & Net Cash Payable',
  },
  gstr1_sales: {
    code: 'GSTR-1 (B2B / B2C)',
    title: 'GSTR-1 OUTWARD SUPPLIES REGISTER (B2B & B2C INVOICES)',
    subtitle: 'Invoice-Wise Tax Breakup (CGST / SGST / IGST) for Registered & Unregistered Customers',
  },
  gstr1_hsn: {
    code: 'GSTR-1 HSN (Table-12)',
    title: 'GSTR-1 TABLE-12 — HSN-WISE SUMMARY OF OUTWARD SUPPLIES',
    subtitle: 'HSN Code, UQC Quantity, Taxable Value & Rate-Wise Tax Summary',
  },
  gstr2_itc: {
    code: 'GSTR-2B ITC Register',
    title: 'GSTR-2B INWARD SUPPLIES & ELIGIBLE ITC REGISTER',
    subtitle: 'Supplier-Wise Purchase Bills & Claimable Input Tax Credit (CGST / SGST / IGST)',
  },
  all: {
    code: 'Consolidated GST',
    title: 'COMPLETE GST RETURN WORKING SUMMARY (GSTR-1 / 2B / 3B)',
    subtitle: 'Consolidated Monthly Liability, Outward Register, HSN Summary & Purchase ITC',
  },
};

export const GSTPrintModal: React.FC<GSTPrintModalProps> = ({
  data = [],
  onClose,
  companyName = 'TallyBIZ Enterprise',
  company,
  initialReportType = 'gstr3b',
  selectedMonth = 'ALL',
}) => {
  const [reportType, setReportType] = useState<GSTReportType>(initialReportType);

  useEffect(() => {
    setReportType(initialReportType);
  }, [initialReportType]);

  const safeData = Array.isArray(data) ? data : [];
  const activeRows =
    selectedMonth && selectedMonth !== 'ALL'
      ? safeData.filter((r) => r.month === selectedMonth)
      : safeData;

  const symbol =
    company?.currency_symbol ||
    safeData[0]?.currency_symbol ||
    localStorage.getItem('active_company_symbol') ||
    '₹';
  const displayCompany = company?.name || companyName;
  const gstin = company?.gstin || company?.tax_id || safeData[0]?.company_gstin || 'N/A';
  const state = company?.state || safeData[0]?.company_state || '';
  const address = company?.address || '';

  const allInvoices = activeRows.flatMap((r) => [
    ...(Array.isArray(r.b2b_invoices) ? r.b2b_invoices : []),
    ...(Array.isArray(r.b2c_invoices) ? r.b2c_invoices : []),
  ]);

  const allPurchases = activeRows.flatMap((r) =>
    Array.isArray(r.purchase_bills) ? r.purchase_bills : []
  );

  const mergedHsnMap: Record<string, any> = {};
  for (const r of activeRows) {
    for (const h of r.hsn_summary || []) {
      const k = `${h.hsn_code}::${h.gst_rate}`;
      if (!mergedHsnMap[k]) {
        mergedHsnMap[k] = { ...h };
      } else {
        mergedHsnMap[k].total_qty += Number(h.total_qty || 0);
        mergedHsnMap[k].taxable_value += Number(h.taxable_value || 0);
        mergedHsnMap[k].cgst += Number(h.cgst || 0);
        mergedHsnMap[k].sgst += Number(h.sgst || 0);
        mergedHsnMap[k].igst += Number(h.igst || 0);
        mergedHsnMap[k].total_tax += Number(h.total_tax || 0);
        mergedHsnMap[k].total_value += Number(h.total_value || 0);
      }
    }
  }
  const allHsn = Object.values(mergedHsnMap);

  const meta = REPORT_META[reportType] || REPORT_META.gstr3b;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '16px',
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '10px',
          width: '100%',
          maxWidth: '960px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Top Control Bar (Hidden on Print) */}
        <div
          className="no-print"
          style={{
            padding: '12px 18px',
            backgroundColor: '#090d16',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            borderBottom: '1px solid #1e293b',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {(
              [
                ['gstr3b', 'GSTR-3B Summary'],
                ['gstr1_sales', 'GSTR-1 B2B/B2C'],
                ['gstr1_hsn', 'HSN Table-12'],
                ['gstr2_itc', 'GSTR-2B ITC'],
                ['all', 'All Combined'],
              ] as [GSTReportType, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setReportType(key)}
                style={{
                  padding: '5px 10px',
                  borderRadius: '5px',
                  border: reportType === key ? '1px solid #38bdf8' : '1px solid #334155',
                  backgroundColor: reportType === key ? '#0284c7' : '#1e293b',
                  color: '#f8fafc',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handlePrint}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                backgroundColor: '#16a34a',
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
              type="button"
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

        {/* Printable A4 Sheet */}
        <div style={{ padding: '28px 32px', overflowY: 'auto', color: '#0f172a' }}>
          {/* Company & Return Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              borderBottom: '2px solid #0f172a',
              paddingBottom: '14px',
              marginBottom: '20px',
            }}
          >
            <div>
              <h2 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: 800 }}>{displayCompany}</h2>
              {address && (
                <div style={{ fontSize: '12px', color: '#475569', maxWidth: '460px' }}>{address}</div>
              )}
              <div style={{ fontSize: '12px', color: '#334155', marginTop: '4px' }}>
                <strong>GSTIN:</strong> {gstin} {state ? `| State: ${state}` : ''}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#0284c7' }}>{meta.title}</div>
              <div style={{ fontSize: '11.5px', color: '#475569', marginTop: '2px' }}>{meta.subtitle}</div>
              <div style={{ fontSize: '11.5px', color: '#0f172a', marginTop: '6px', fontWeight: 600 }}>
                Return Period: {selectedMonth === 'ALL' ? 'All Available Periods' : selectedMonth} | Date:{' '}
                {new Date().toLocaleDateString('en-IN')}
              </div>
            </div>
          </div>

          {/* 1. GSTR-3B SUMMARY */}
          {(reportType === 'gstr3b' || reportType === 'all') && (
            <div style={{ marginBottom: '24px' }}>
              {reportType === 'all' && (
                <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase' }}>
                  1. GSTR-3B Monthly Output Tax, Input Tax Credit (ITC) &amp; Net Payable
                </h4>
              )}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', borderTop: '1px solid #94a3b8', borderBottom: '1px solid #94a3b8' }}>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Month</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Taxable Sales</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Out CGST</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Out SGST</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Out IGST</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Total Output</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Taxable Pur.</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Eligible ITC</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Net Payable</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>ITC C/F</th>
                  </tr>
                </thead>
                <tbody>
                  {activeRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ padding: '18px', textAlign: 'center', color: '#94a3b8' }}>
                        No GSTR-3B records available for this period.
                      </td>
                    </tr>
                  ) : (
                    activeRows.map((row, idx) => {
                      const tSales = Number(row.sales ?? row.taxable_sales ?? 0);
                      const outGst = Number(row.output_gst ?? 0);
                      const tPur = Number(row.purchases ?? row.taxable_purchases ?? 0);
                      const inGst = Number(row.input_gst ?? 0);
                      const net = Number(row.net_payable ?? Math.max(0, outGst - inGst));
                      const cf = Number(row.itc_carry_forward ?? Math.max(0, inGst - outGst));
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '8px', fontWeight: 700 }}>{row.month}</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>{symbol}{tSales.toFixed(2)}</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>{symbol}{Number(row.output_cgst || 0).toFixed(2)}</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>{symbol}{Number(row.output_sgst || 0).toFixed(2)}</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>{symbol}{Number(row.output_igst || 0).toFixed(2)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#dc2626', fontWeight: 700 }}>{symbol}{outGst.toFixed(2)}</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>{symbol}{tPur.toFixed(2)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#16a34a', fontWeight: 700 }}>{symbol}{inGst.toFixed(2)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800, color: '#0369a1' }}>{symbol}{net.toFixed(2)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600, color: '#7c3aed' }}>{symbol}{cf.toFixed(2)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* 2. GSTR-1 B2B & B2C OUTWARD INVOICES */}
          {(reportType === 'gstr1_sales' || reportType === 'all') && (
            <div style={{ marginBottom: '24px' }}>
              {reportType === 'all' && (
                <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase' }}>
                  2. GSTR-1 Outward Supplies Register (B2B &amp; B2C Invoices)
                </h4>
              )}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', borderTop: '1px solid #94a3b8', borderBottom: '1px solid #94a3b8' }}>
                    <th style={{ padding: '7px', textAlign: 'left' }}>Type</th>
                    <th style={{ padding: '7px', textAlign: 'left' }}>Invoice #</th>
                    <th style={{ padding: '7px', textAlign: 'left' }}>Date</th>
                    <th style={{ padding: '7px', textAlign: 'left' }}>Customer Name</th>
                    <th style={{ padding: '7px', textAlign: 'left' }}>GSTIN</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>Taxable</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>CGST</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>SGST</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>IGST</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>Invoice Total</th>
                  </tr>
                </thead>
                <tbody>
                  {allInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ padding: '18px', textAlign: 'center', color: '#94a3b8' }}>
                        No outward sales invoices available for this period.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {allInvoices.map((inv: any, idx: number) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '7px', fontWeight: 700 }}>{inv.supply_type}</td>
                          <td style={{ padding: '7px', fontWeight: 600 }}>{inv.invoice_number}</td>
                          <td style={{ padding: '7px' }}>{inv.posting_date}</td>
                          <td style={{ padding: '7px' }}>{inv.customer_name}</td>
                          <td style={{ padding: '7px', fontFamily: 'monospace' }}>{inv.gstin}</td>
                          <td style={{ padding: '7px', textAlign: 'right' }}>{symbol}{Number(inv.taxable_value || 0).toFixed(2)}</td>
                          <td style={{ padding: '7px', textAlign: 'right' }}>{symbol}{Number(inv.cgst || 0).toFixed(2)}</td>
                          <td style={{ padding: '7px', textAlign: 'right' }}>{symbol}{Number(inv.sgst || 0).toFixed(2)}</td>
                          <td style={{ padding: '7px', textAlign: 'right' }}>{symbol}{Number(inv.igst || 0).toFixed(2)}</td>
                          <td style={{ padding: '7px', textAlign: 'right', fontWeight: 700 }}>{symbol}{Number(inv.grand_total || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                      <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #94a3b8', fontWeight: 800 }}>
                        <td colSpan={5} style={{ padding: '8px' }}>Total Outward Supplies ({allInvoices.length} Invoices)</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          {symbol}{allInvoices.reduce((s, r) => s + Number(r.taxable_value || 0), 0).toFixed(2)}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          {symbol}{allInvoices.reduce((s, r) => s + Number(r.cgst || 0), 0).toFixed(2)}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          {symbol}{allInvoices.reduce((s, r) => s + Number(r.sgst || 0), 0).toFixed(2)}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          {symbol}{allInvoices.reduce((s, r) => s + Number(r.igst || 0), 0).toFixed(2)}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          {symbol}{allInvoices.reduce((s, r) => s + Number(r.grand_total || 0), 0).toFixed(2)}
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* 3. GSTR-1 TABLE 12 HSN SUMMARY */}
          {(reportType === 'gstr1_hsn' || reportType === 'all') && (
            <div style={{ marginBottom: '24px' }}>
              {reportType === 'all' && (
                <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase' }}>
                  3. GSTR-1 Table 12 — HSN-Wise Summary of Outward Supplies
                </h4>
              )}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', borderTop: '1px solid #94a3b8', borderBottom: '1px solid #94a3b8' }}>
                    <th style={{ padding: '7px', textAlign: 'left' }}>HSN Code</th>
                    <th style={{ padding: '7px', textAlign: 'left' }}>Description</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>Total Qty</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>Rate</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>Taxable</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>CGST</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>SGST</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>IGST</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>Total Value</th>
                  </tr>
                </thead>
                <tbody>
                  {allHsn.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ padding: '18px', textAlign: 'center', color: '#94a3b8' }}>
                        No HSN summary records available for this period.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {allHsn.map((h: any, idx: number) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '7px', fontFamily: 'monospace', fontWeight: 700 }}>{h.hsn_code}</td>
                          <td style={{ padding: '7px' }}>{h.description}</td>
                          <td style={{ padding: '7px', textAlign: 'right' }}>{Number(h.total_qty || 0).toFixed(2)} {h.uqc}</td>
                          <td style={{ padding: '7px', textAlign: 'right' }}>{Number(h.gst_rate || 0).toFixed(0)}%</td>
                          <td style={{ padding: '7px', textAlign: 'right' }}>{symbol}{Number(h.taxable_value || 0).toFixed(2)}</td>
                          <td style={{ padding: '7px', textAlign: 'right' }}>{symbol}{Number(h.cgst || 0).toFixed(2)}</td>
                          <td style={{ padding: '7px', textAlign: 'right' }}>{symbol}{Number(h.sgst || 0).toFixed(2)}</td>
                          <td style={{ padding: '7px', textAlign: 'right' }}>{symbol}{Number(h.igst || 0).toFixed(2)}</td>
                          <td style={{ padding: '7px', textAlign: 'right', fontWeight: 700 }}>{symbol}{Number(h.total_value || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                      <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #94a3b8', fontWeight: 800 }}>
                        <td colSpan={4} style={{ padding: '8px' }}>Total HSN Summary ({allHsn.length} HSN Codes)</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          {symbol}{allHsn.reduce((s, r) => s + Number(r.taxable_value || 0), 0).toFixed(2)}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          {symbol}{allHsn.reduce((s, r) => s + Number(r.cgst || 0), 0).toFixed(2)}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          {symbol}{allHsn.reduce((s, r) => s + Number(r.sgst || 0), 0).toFixed(2)}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          {symbol}{allHsn.reduce((s, r) => s + Number(r.igst || 0), 0).toFixed(2)}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          {symbol}{allHsn.reduce((s, r) => s + Number(r.total_value || 0), 0).toFixed(2)}
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* 4. GSTR-2B PURCHASE ITC REGISTER */}
          {(reportType === 'gstr2_itc' || reportType === 'all') && (
            <div style={{ marginBottom: '24px' }}>
              {reportType === 'all' && (
                <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase' }}>
                  4. GSTR-2B Purchase ITC Register (Eligible Input Tax Credit)
                </h4>
              )}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', borderTop: '1px solid #94a3b8', borderBottom: '1px solid #94a3b8' }}>
                    <th style={{ padding: '7px', textAlign: 'left' }}>Bill #</th>
                    <th style={{ padding: '7px', textAlign: 'left' }}>Date</th>
                    <th style={{ padding: '7px', textAlign: 'left' }}>Supplier Name</th>
                    <th style={{ padding: '7px', textAlign: 'left' }}>Supplier GSTIN</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>Taxable</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>CGST ITC</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>SGST ITC</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>IGST ITC</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>Total ITC</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>Bill Total</th>
                  </tr>
                </thead>
                <tbody>
                  {allPurchases.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ padding: '18px', textAlign: 'center', color: '#94a3b8' }}>
                        No inward purchase bills available for this period.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {allPurchases.map((pur: any, idx: number) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '7px', fontWeight: 700 }}>{pur.bill_number}</td>
                          <td style={{ padding: '7px' }}>{pur.posting_date}</td>
                          <td style={{ padding: '7px' }}>{pur.supplier_name}</td>
                          <td style={{ padding: '7px', fontFamily: 'monospace' }}>{pur.gstin}</td>
                          <td style={{ padding: '7px', textAlign: 'right' }}>{symbol}{Number(pur.taxable_value || 0).toFixed(2)}</td>
                          <td style={{ padding: '7px', textAlign: 'right' }}>{symbol}{Number(pur.cgst || 0).toFixed(2)}</td>
                          <td style={{ padding: '7px', textAlign: 'right' }}>{symbol}{Number(pur.sgst || 0).toFixed(2)}</td>
                          <td style={{ padding: '7px', textAlign: 'right' }}>{symbol}{Number(pur.igst || 0).toFixed(2)}</td>
                          <td style={{ padding: '7px', textAlign: 'right', color: '#15803d', fontWeight: 700 }}>{symbol}{Number(pur.total_tax || 0).toFixed(2)}</td>
                          <td style={{ padding: '7px', textAlign: 'right', fontWeight: 700 }}>{symbol}{Number(pur.grand_total || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                      <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #94a3b8', fontWeight: 800 }}>
                        <td colSpan={4} style={{ padding: '8px' }}>Total Inward ITC ({allPurchases.length} Bills)</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          {symbol}{allPurchases.reduce((s, r) => s + Number(r.taxable_value || 0), 0).toFixed(2)}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          {symbol}{allPurchases.reduce((s, r) => s + Number(r.cgst || 0), 0).toFixed(2)}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          {symbol}{allPurchases.reduce((s, r) => s + Number(r.sgst || 0), 0).toFixed(2)}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          {symbol}{allPurchases.reduce((s, r) => s + Number(r.igst || 0), 0).toFixed(2)}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#15803d' }}>
                          {symbol}{allPurchases.reduce((s, r) => s + Number(r.total_tax || 0), 0).toFixed(2)}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          {symbol}{allPurchases.reduce((s, r) => s + Number(r.grand_total || 0), 0).toFixed(2)}
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer Signatory */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: '28px',
              paddingTop: '12px',
              borderTop: '1px dashed #cbd5e1',
              fontSize: '11px',
              color: '#64748b',
            }}
          >
            <span>Computer-generated {meta.code} Compliance Statement — TallyBIZ ERP</span>
            <span>
              For <strong>{displayCompany}</strong> — Authorized Signatory / CA
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
