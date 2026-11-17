import { useState, type FC } from 'react';
import { Printer, Download, CheckCircle2, AlertTriangle } from 'lucide-react';
import { GSTPrintModal, type GSTReportType } from '../GSTPrintModal';
import { getInitialCompanyBranding } from '../../utils/invoiceBranding';

interface GSTTabProps {
  gstData: any[];
  setShowGSTPrintModal?: (show: boolean) => void;
}

const PRINT_BTN_LABELS: Record<Exclude<GSTReportType, 'all'>, string> = {
  gstr3b: 'Print GSTR-3B Report',
  gstr1_sales: 'Print GSTR-1 B2B/B2C',
  gstr1_hsn: 'Print HSN Table-12',
  gstr2_itc: 'Print GSTR-2B ITC',
};

export const GSTTab: FC<GSTTabProps> = ({ gstData = [] }) => {
  const safeData = Array.isArray(gstData) ? gstData : [];
  const symbol = safeData[0]?.currency_symbol || localStorage.getItem('active_company_symbol') || '₹';
  let activeCompObj: any = null;
  try {
    activeCompObj = JSON.parse(localStorage.getItem('active_company') || 'null');
  } catch {}
  const companyBranding = getInitialCompanyBranding(activeCompObj);
  const companyName = companyBranding.name || 'TallyBIZ Pvt Ltd';

  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [subView, setSubView] = useState<Exclude<GSTReportType, 'all'>>('gstr3b');
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);

  const activeRows = selectedMonth === 'ALL'
    ? safeData
    : safeData.filter((r) => r.month === selectedMonth);

  const sumField = (key: string) =>
    activeRows.reduce((acc, r) => acc + (Number(r?.[key]) || 0), 0);

  const totalSales = sumField('sales');
  const totalOutCgst = sumField('output_cgst');
  const totalOutSgst = sumField('output_sgst');
  const totalOutIgst = sumField('output_igst');
  const totalOutput = sumField('output_gst');

  const totalPurchases = sumField('purchases');
  const totalInCgst = sumField('input_cgst');
  const totalInSgst = sumField('input_sgst');
  const totalInIgst = sumField('input_igst');
  const totalInput = sumField('input_gst');

  const netPayable = Math.max(0, totalOutput - totalInput);
  const itcCarryForward = Math.max(0, totalInput - totalOutput);

  const allSalesInvoices = activeRows.flatMap((r) => [
    ...(Array.isArray(r.b2b_invoices) ? r.b2b_invoices : []),
    ...(Array.isArray(r.b2c_invoices) ? r.b2c_invoices : []),
  ]);

  const allPurchaseBills = activeRows.flatMap((r) =>
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
  const mergedHsnList = Object.values(mergedHsnMap);

  const handleExportGSTR1CSV = () => {
    const headers = [
      'Supply Type', 'Invoice No', 'Date', 'Customer Name', 'Customer GSTIN',
      'Place of Supply', 'GST Rate %', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Total Tax', 'Invoice Total', 'Status'
    ];
    const rows = allSalesInvoices.map((inv: any) => [
      inv.supply_type,
      inv.invoice_number,
      inv.posting_date,
      `"${String(inv.customer_name || '').replace(/"/g, '""')}"`,
      inv.gstin,
      inv.place_of_supply,
      inv.tax_rate,
      Number(inv.taxable_value || 0).toFixed(2),
      Number(inv.cgst || 0).toFixed(2),
      Number(inv.sgst || 0).toFixed(2),
      Number(inv.igst || 0).toFixed(2),
      Number(inv.total_tax || 0).toFixed(2),
      Number(inv.grand_total || 0).toFixed(2),
      inv.status,
    ]);
    const csv = [headers.join(','), ...rows.map((r: any[]) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GSTR1_Register_${selectedMonth === 'ALL' ? 'All_Months' : selectedMonth}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '22px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 6px 0' }}>GST Returns &amp; Tax Compliance (GSTR-1 / 3B)</h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>
            CA-Ready Outward B2B/B2C Register, HSN Table-12 Summary, Eligible ITC &amp; CGST/SGST/IGST Liability
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600, fontSize: '13px' }}
          >
            <option value="ALL">Period: All Months ({safeData.length})</option>
            {safeData.map((m) => (
              <option key={m.month} value={m.month}>Period: {m.month}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleExportGSTR1CSV}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#0f766e', color: '#fff', border: 'none', padding: '10px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
          >
            <Download size={15} /> Export GSTR-1 CSV
          </button>

          <button
            type="button"
            onClick={() => setShowPrintModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#0284c7', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
          >
            <Printer size={16} /> {PRINT_BTN_LABELS[subView]}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '22px' }}>
        <div style={{ background: '#fff', padding: '18px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>OUTPUT GST (GSTR-1)</span>
          <h3 style={{ margin: '6px 0 4px 0', fontSize: '21px', color: '#dc2626' }}>
            {symbol} {totalOutput.toFixed(2)}
          </h3>
          <div style={{ fontSize: '11px', color: '#475569' }}>
            Taxable: {symbol}{totalSales.toFixed(0)} | CGST {symbol}{totalOutCgst.toFixed(0)} • SGST {symbol}{totalOutSgst.toFixed(0)} • IGST {symbol}{totalOutIgst.toFixed(0)}
          </div>
        </div>

        <div style={{ background: '#fff', padding: '18px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>ELIGIBLE ITC (GSTR-2B)</span>
          <h3 style={{ margin: '6px 0 4px 0', fontSize: '21px', color: '#15803d' }}>
            {symbol} {totalInput.toFixed(2)}
          </h3>
          <div style={{ fontSize: '11px', color: '#475569' }}>
            Purchases: {symbol}{totalPurchases.toFixed(0)} | CGST {symbol}{totalInCgst.toFixed(0)} • SGST {symbol}{totalInSgst.toFixed(0)} • IGST {symbol}{totalInIgst.toFixed(0)}
          </div>
        </div>

        <div style={{ background: '#fff', padding: '18px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>NET GST CASH PAYABLE (3B)</span>
          <h3 style={{ margin: '6px 0 4px 0', fontSize: '21px', color: '#0369a1' }}>
            {symbol} {netPayable.toFixed(2)}
          </h3>
          <div style={{ fontSize: '11px', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {netPayable > 0 ? <><AlertTriangle size={12} color="#d97706" /> Challan PMT-06 payable</> : <><CheckCircle2 size={12} color="#16a34a" /> Fully offset by ITC</>}
          </div>
        </div>

        <div style={{ background: '#fff', padding: '18px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>CLOSING ITC CREDIT</span>
          <h3 style={{ margin: '6px 0 4px 0', fontSize: '21px', color: '#7c3aed' }}>
            {symbol} {itcCarryForward.toFixed(2)}
          </h3>
          <div style={{ fontSize: '11px', color: '#475569' }}>
            B2B Invoices: {activeRows.reduce((s, r) => s + (r.b2b_count || 0), 0)} | B2C: {activeRows.reduce((s, r) => s + (r.b2c_count || 0), 0)}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', flexWrap: 'wrap' }}>
        {[
          { id: 'gstr3b', label: `GSTR-3B Monthly Summary (${activeRows.length})` },
          { id: 'gstr1_sales', label: `GSTR-1: B2B & B2C Invoices (${allSalesInvoices.length})` },
          { id: 'gstr1_hsn', label: `GSTR-1: HSN Summary Table-12 (${mergedHsnList.length})` },
          { id: 'gstr2_itc', label: `GSTR-2B: Purchase ITC Register (${allPurchaseBills.length})` },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubView(t.id as any)}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              border: subView === t.id ? '1px solid #0284c7' : '1px solid #cbd5e1',
              background: subView === t.id ? '#0284c7' : '#ffffff',
              color: subView === t.id ? '#ffffff' : '#334155',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subView === 'gstr3b' && (
        <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                <th style={{ padding: '12px', textAlign: 'left' }}>Month</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Taxable Sales</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Out CGST</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Out SGST</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Out IGST</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Total Output</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Taxable Pur.</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Eligible ITC</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Net Payable</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>ITC C/F</th>
              </tr>
            </thead>
            <tbody>
              {activeRows.length === 0 ? (
                <tr><td colSpan={10} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>No GST transaction history available.</td></tr>
              ) : (
                activeRows.map((r) => (
                  <tr key={r.month} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px', fontWeight: 700 }}>{r.month}</td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>{symbol} {Number(r.sales || 0).toFixed(2)}</td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>{symbol} {Number(r.output_cgst || 0).toFixed(2)}</td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>{symbol} {Number(r.output_sgst || 0).toFixed(2)}</td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>{symbol} {Number(r.output_igst || 0).toFixed(2)}</td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#dc2626', fontWeight: 700 }}>{symbol} {Number(r.output_gst || 0).toFixed(2)}</td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>{symbol} {Number(r.purchases || 0).toFixed(2)}</td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#15803d', fontWeight: 700 }}>{symbol} {Number(r.input_gst || 0).toFixed(2)}</td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#0369a1', fontWeight: 700 }}>{symbol} {Number(r.net_payable ?? Math.max(0, Number(r.net_gst || 0))).toFixed(2)}</td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#7c3aed', fontWeight: 600 }}>{symbol} {Number(r.itc_carry_forward || 0).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {subView === 'gstr1_sales' && (
        <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                <th style={{ padding: '11px', textAlign: 'left' }}>Type</th>
                <th style={{ padding: '11px', textAlign: 'left' }}>Invoice #</th>
                <th style={{ padding: '11px', textAlign: 'left' }}>Date</th>
                <th style={{ padding: '11px', textAlign: 'left' }}>Customer</th>
                <th style={{ padding: '11px', textAlign: 'left' }}>Customer GSTIN</th>
                <th style={{ padding: '11px', textAlign: 'right' }}>Taxable</th>
                <th style={{ padding: '11px', textAlign: 'right' }}>CGST</th>
                <th style={{ padding: '11px', textAlign: 'right' }}>SGST</th>
                <th style={{ padding: '11px', textAlign: 'right' }}>IGST</th>
                <th style={{ padding: '11px', textAlign: 'right' }}>Invoice Total</th>
              </tr>
            </thead>
            <tbody>
              {allSalesInvoices.length === 0 ? (
                <tr><td colSpan={10} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>No outward sales invoices in selected period.</td></tr>
              ) : (
                allSalesInvoices.map((inv: any) => (
                  <tr key={`${inv.invoice_number}-${inv.id}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '11px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 700,
                        background: inv.supply_type === 'B2B' ? '#dbeafe' : '#fef3c7',
                        color: inv.supply_type === 'B2B' ? '#1d4ed8' : '#b45309',
                      }}>
                        {inv.supply_type}
                      </span>
                    </td>
                    <td style={{ padding: '11px', fontWeight: 700 }}>{inv.invoice_number}</td>
                    <td style={{ padding: '11px' }}>{inv.posting_date}</td>
                    <td style={{ padding: '11px' }}>{inv.customer_name}</td>
                    <td style={{ padding: '11px', fontFamily: 'monospace', fontSize: '12px' }}>{inv.gstin}</td>
                    <td style={{ padding: '11px', textAlign: 'right' }}>{symbol} {Number(inv.taxable_value || 0).toFixed(2)}</td>
                    <td style={{ padding: '11px', textAlign: 'right' }}>{symbol} {Number(inv.cgst || 0).toFixed(2)}</td>
                    <td style={{ padding: '11px', textAlign: 'right' }}>{symbol} {Number(inv.sgst || 0).toFixed(2)}</td>
                    <td style={{ padding: '11px', textAlign: 'right' }}>{symbol} {Number(inv.igst || 0).toFixed(2)}</td>
                    <td style={{ padding: '11px', textAlign: 'right', fontWeight: 700 }}>{symbol} {Number(inv.grand_total || 0).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {subView === 'gstr1_hsn' && (
        <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                <th style={{ padding: '11px', textAlign: 'left' }}>HSN Code</th>
                <th style={{ padding: '11px', textAlign: 'left' }}>Description</th>
                <th style={{ padding: '11px', textAlign: 'left' }}>UQC</th>
                <th style={{ padding: '11px', textAlign: 'right' }}>Total Qty</th>
                <th style={{ padding: '11px', textAlign: 'right' }}>GST %</th>
                <th style={{ padding: '11px', textAlign: 'right' }}>Taxable Value</th>
                <th style={{ padding: '11px', textAlign: 'right' }}>CGST</th>
                <th style={{ padding: '11px', textAlign: 'right' }}>SGST</th>
                <th style={{ padding: '11px', textAlign: 'right' }}>IGST</th>
                <th style={{ padding: '11px', textAlign: 'right' }}>Total Value</th>
              </tr>
            </thead>
            <tbody>
              {mergedHsnList.length === 0 ? (
                <tr><td colSpan={10} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>No HSN line items available in selected period.</td></tr>
              ) : (
                mergedHsnList.map((h: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '11px', fontFamily: 'monospace', fontWeight: 700 }}>{h.hsn_code}</td>
                    <td style={{ padding: '11px' }}>{h.description}</td>
                    <td style={{ padding: '11px' }}>{h.uqc}</td>
                    <td style={{ padding: '11px', textAlign: 'right' }}>{Number(h.total_qty || 0).toFixed(2)}</td>
                    <td style={{ padding: '11px', textAlign: 'right' }}>{Number(h.gst_rate || 0).toFixed(0)}%</td>
                    <td style={{ padding: '11px', textAlign: 'right' }}>{symbol} {Number(h.taxable_value || 0).toFixed(2)}</td>
                    <td style={{ padding: '11px', textAlign: 'right' }}>{symbol} {Number(h.cgst || 0).toFixed(2)}</td>
                    <td style={{ padding: '11px', textAlign: 'right' }}>{symbol} {Number(h.sgst || 0).toFixed(2)}</td>
                    <td style={{ padding: '11px', textAlign: 'right' }}>{symbol} {Number(h.igst || 0).toFixed(2)}</td>
                    <td style={{ padding: '11px', textAlign: 'right', fontWeight: 700 }}>{symbol} {Number(h.total_value || 0).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {subView === 'gstr2_itc' && (
        <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                <th style={{ padding: '11px', textAlign: 'left' }}>Bill #</th>
                <th style={{ padding: '11px', textAlign: 'left' }}>Date</th>
                <th style={{ padding: '11px', textAlign: 'left' }}>Supplier</th>
                <th style={{ padding: '11px', textAlign: 'left' }}>Supplier GSTIN</th>
                <th style={{ padding: '11px', textAlign: 'right' }}>Taxable</th>
                <th style={{ padding: '11px', textAlign: 'right' }}>CGST ITC</th>
                <th style={{ padding: '11px', textAlign: 'right' }}>SGST ITC</th>
                <th style={{ padding: '11px', textAlign: 'right' }}>IGST ITC</th>
                <th style={{ padding: '11px', textAlign: 'right' }}>Total ITC</th>
                <th style={{ padding: '11px', textAlign: 'right' }}>Bill Total</th>
              </tr>
            </thead>
            <tbody>
              {allPurchaseBills.length === 0 ? (
                <tr><td colSpan={10} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>No purchase bills in selected period.</td></tr>
              ) : (
                allPurchaseBills.map((pur: any) => (
                  <tr key={`${pur.bill_number}-${pur.id}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '11px', fontWeight: 700 }}>{pur.bill_number}</td>
                    <td style={{ padding: '11px' }}>{pur.posting_date}</td>
                    <td style={{ padding: '11px' }}>{pur.supplier_name}</td>
                    <td style={{ padding: '11px', fontFamily: 'monospace', fontSize: '12px' }}>{pur.gstin}</td>
                    <td style={{ padding: '11px', textAlign: 'right' }}>{symbol} {Number(pur.taxable_value || 0).toFixed(2)}</td>
                    <td style={{ padding: '11px', textAlign: 'right' }}>{symbol} {Number(pur.cgst || 0).toFixed(2)}</td>
                    <td style={{ padding: '11px', textAlign: 'right' }}>{symbol} {Number(pur.sgst || 0).toFixed(2)}</td>
                    <td style={{ padding: '11px', textAlign: 'right' }}>{symbol} {Number(pur.igst || 0).toFixed(2)}</td>
                    <td style={{ padding: '11px', textAlign: 'right', color: '#15803d', fontWeight: 700 }}>{symbol} {Number(pur.total_tax || 0).toFixed(2)}</td>
                    <td style={{ padding: '11px', textAlign: 'right', fontWeight: 700 }}>{symbol} {Number(pur.grand_total || 0).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showPrintModal && (
        <GSTPrintModal
          data={gstData}
          company={activeCompObj}
          companyName={companyName}
          initialReportType={subView}
          selectedMonth={selectedMonth}
          onClose={() => setShowPrintModal(false)}
        />
      )}
    </div>
  );
};

export default GSTTab;
