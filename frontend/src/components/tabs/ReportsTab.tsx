import type { FC } from 'react';
import { Printer } from 'lucide-react';
import type { FinancialStatements } from '../../types/erp';

interface ReportsTabProps {
  finance: FinancialStatements | null;
  loading: boolean;
  loadError: string | null;
  setShowFinancePrintModal: (show: boolean) => void;
  onDrillDown: (accountName: string) => void;
}

export const ReportsTab: FC<ReportsTabProps> = ({
  finance,
  loading,
  loadError,
  setShowFinancePrintModal,
  onDrillDown,
}) => {
  const symbol = (finance as any)?.currency_symbol || localStorage.getItem('active_company_symbol') || '₹';

  if (loading && !finance) {
    return (
      <div style={{ padding: '24px', color: '#64748b', fontSize: '14px' }}>
        Loading financial statements...
      </div>
    );
  }

  if (!finance && loadError) {
    return (
      <div style={{ padding: '16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c', fontSize: '13px' }}>
        {loadError}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 6px 0' }}>Profit & Loss / Balance Sheet</h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>Real time trial balance derived financial reports (Click on accounts to drill down)</p>
        </div>
        <button
          onClick={() => setShowFinancePrintModal(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#0284c7', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
        >
          <Printer size={16} /> Print Statements
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Income Statement (P&L) */}
        <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 16px 0', borderBottom: '2px solid #0284c7', paddingBottom: '8px' }}>
            Income Statement (P&L)
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b' }}>INCOME</span>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '14px' }}>
                <span onClick={() => onDrillDown('Sales Income')} style={{ color: '#0284c7', cursor: 'pointer', textDecoration: 'underline' }}>
                  Sales Income
                </span>
                <strong>{symbol} {(finance?.income?.sales ?? 0).toFixed(2)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '14px' }}>
                <span onClick={() => onDrillDown('Job Work Income')} style={{ color: '#0284c7', cursor: 'pointer', textDecoration: 'underline' }}>
                  Job Work Income (SAC 9988)
                </span>
                <strong>{symbol} {((finance?.income as any)?.job_work ?? 0).toFixed(2)}</strong>
              </div>
            </div>

            <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b' }}>EXPENSES / COGS</span>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '14px' }}>
                <span onClick={() => onDrillDown('Stock Received')} style={{ color: '#0284c7', cursor: 'pointer', textDecoration: 'underline' }}>
                  Purchases (Cost of Goods)
                </span>
                <strong>{symbol} {(finance?.expense?.purchases ?? 0).toFixed(2)}</strong>
              </div>
            </div>

            <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                  <strong style={{ color: '#475569' }}>Gross Profit</strong>
                  <strong>{symbol} {(finance?.profit?.gross_profit ?? 0).toFixed(2)}</strong>
                </div>

                <div>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b' }}>ADJUSTMENTS & OPERATING EXPENSES</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '14px' }}>
                    <span onClick={() => onDrillDown('Freight & Adjustments')} style={{ color: '#0284c7', cursor: 'pointer', textDecoration: 'underline' }}>
                      Freight & Adjustments (Net)
                    </span>
                    <strong style={{ color: ((finance?.profit as any)?.freight_adjustments ?? 0) >= 0 ? '#16a34a' : '#dc2626' }}>
                      {((finance?.profit as any)?.freight_adjustments ?? 0) >= 0 ? '+' : '-'}{symbol} {Math.abs((finance?.profit as any)?.freight_adjustments ?? 0).toFixed(2)}
                    </strong>
                  </div>
                  {((finance?.expense as any)?.other_expenses || []).map((exp: any) => (
                    <div key={exp.account} style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '14px' }}>
                      <span onClick={() => onDrillDown(exp.account)} style={{ color: '#0284c7', cursor: 'pointer', textDecoration: 'underline' }}>
                        {exp.account}
                      </span>
                      <strong style={{ color: exp.amount >= 0 ? '#dc2626' : '#16a34a' }}>
                        {exp.amount >= 0 ? '-' : '+'}{symbol} {Math.abs(Number(exp.amount || 0)).toFixed(2)}
                      </strong>
                    </div>
                  ))}
                </div>

                <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '16px' }}>
                  <strong>Net Profit</strong>
              <strong style={{ color: (finance?.profit?.net_profit ?? 0) >= 0 ? '#15803d' : '#dc2626' }}>
                {symbol} {(finance?.profit?.net_profit ?? 0).toFixed(2)}
              </strong>
            </div>
          </div>
        </div>

        {/* Balance Sheet */}
        <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 16px 0', borderBottom: '2px solid #10b981', paddingBottom: '8px' }}>
            Balance Sheet
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b' }}>ASSETS</span>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span onClick={() => onDrillDown('Bank Account')} style={{ color: '#0284c7', cursor: 'pointer', textDecoration: 'underline' }}>
                Bank & Cash Accounts
              </span>
              <span>{symbol} {(finance?.balance_sheet?.assets?.bank_cash ?? 0).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span onClick={() => onDrillDown('Debtors')} style={{ color: '#0284c7', cursor: 'pointer', textDecoration: 'underline' }}>
                Debtors (Customer Receivables)
              </span>
              <span>{symbol} {(finance?.balance_sheet?.assets?.debtors_receivable ?? 0).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span onClick={() => onDrillDown('Input GST')} style={{ color: '#0284c7', cursor: 'pointer', textDecoration: 'underline' }}>
                GST Input Credit (ITC Asset)
              </span>
              <span>{symbol} {(((finance?.balance_sheet?.assets as any)?.gst_credit ?? finance?.gst?.input_itc ?? 0)).toFixed(2)}</span>
            </div>

            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', marginTop: '8px' }}>LIABILITIES</span>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span onClick={() => onDrillDown('Creditors')} style={{ color: '#0284c7', cursor: 'pointer', textDecoration: 'underline' }}>
                Creditors (Supplier Payables)
              </span>
              <span>{symbol} {(finance?.balance_sheet?.liabilities?.creditors_payable ?? 0).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span onClick={() => onDrillDown('Output GST')} style={{ color: '#0284c7', cursor: 'pointer', textDecoration: 'underline' }}>
                GST Net Payable
              </span>
              <span>{symbol} {(finance?.balance_sheet?.liabilities?.gst_payable ?? 0).toFixed(2)}</span>
            </div>

            <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '15px' }}>
              <strong>Total Assets / Liabilities</strong>
              <strong>{symbol} {(finance?.balance_sheet?.assets?.total_assets ?? 0).toFixed(2)}</strong>
            </div>
          </div>
        </div>
      </div>
    
      {/* Division / Unit-Wise Profit & Loss Bifurcation */}
      {Array.isArray((finance as any)?.unit_bifurcation) && (finance as any).unit_bifurcation.length > 0 && (
        <div style={{ marginTop: '24px', background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '2px solid #0f172a', paddingBottom: '10px' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: '#0f172a' }}>
                Division / Unit-Wise P&amp;L Bifurcation (Profit / Loss Analysis)
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                Separate profitability breakdown across Head Office, Trading Division, and Manufacturing Unit
              </p>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#334155' }}>
                  <th style={{ padding: '10px 12px' }}>Division / Unit</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Goods Sales</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Job Work (9988)</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Purchases</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Closing Stock</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>COGS</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Gross Profit</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Unit Expenses</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Net Profit / Loss</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {(finance as any).unit_bifurcation.map((u: any) => {
                  const isProfit = Number(u.net_profit || 0) >= 0;
                  return (
                    <tr key={u.unit_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '11px 12px', fontWeight: 700, color: '#0f172a' }}>
                        {u.name} <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>({u.code})</span>
                      </td>
                      <td style={{ padding: '11px 12px', textAlign: 'right' }}>{symbol} {Number(u.sales || 0).toFixed(2)}</td>
                      <td style={{ padding: '11px 12px', textAlign: 'right', color: '#0369a1', fontWeight: 600 }}>{symbol} {Number(u.job_work || 0).toFixed(2)}</td>
                      <td style={{ padding: '11px 12px', textAlign: 'right' }}>{symbol} {Number(u.purchases || 0).toFixed(2)}</td>
                      <td style={{ padding: '11px 12px', textAlign: 'right' }}>{symbol} {Number(u.closing_stock || 0).toFixed(2)}</td>
                      <td style={{ padding: '11px 12px', textAlign: 'right' }}>{symbol} {Number(u.cogs || 0).toFixed(2)}</td>
                      <td style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 600 }}>{symbol} {Number(u.gross_profit || 0).toFixed(2)}</td>
                      <td style={{ padding: '11px 12px', textAlign: 'right' }}>{symbol} {Number(u.other_expenses_total || 0).toFixed(2)}</td>
                      <td style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 800, color: isProfit ? '#15803d' : '#b91c1c' }}>
                        {symbol} {Number(u.net_profit || 0).toFixed(2)}
                      </td>
                      <td style={{ padding: '11px 12px', textAlign: 'center' }}>
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: isProfit ? '#dcfce7' : '#fee2e2',
                          color: isProfit ? '#166534' : '#991b1b'
                        }}>
                          {isProfit ? 'PROFIT' : 'LOSS'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Job Work Income Register & Summary (SAC 9988) */}
      <div style={{ marginTop: '24px', background: '#fff', borderRadius: '10px', border: '1px solid #bae6fd', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '2px solid #0284c7', paddingBottom: '10px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: '#0c4a6e' }}>
              Job Work Income Register &amp; Summary (SAC 9988)
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#0369a1' }}>
              Service &amp; labour revenue earned on party-supplied material (zero inventory stock deduction)
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>TOTAL JOB WORK REVENUE</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#0284c7' }}>
              {symbol} {((finance?.income as any)?.job_work ?? 0).toFixed(2)}
            </div>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f0f9ff', borderBottom: '2px solid #bae6fd', textAlign: 'left', color: '#0c4a6e' }}>
                <th style={{ padding: '10px 12px' }}>Invoice #</th>
                <th style={{ padding: '10px 12px' }}>Date</th>
                <th style={{ padding: '10px 12px' }}>Party Challan #</th>
                <th style={{ padding: '10px 12px' }}>Customer</th>
                <th style={{ padding: '10px 12px' }}>Service / Item</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>SAC</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Labour Value</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>GST</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Grand Total</th>
              </tr>
            </thead>
            <tbody>
              {Array.isArray((finance as any)?.job_work_register) && (finance as any).job_work_register.length > 0 ? (
                (finance as any).job_work_register.map((jw: any) => (
                  <tr key={jw.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0284c7' }}>{jw.invoice_number}</td>
                    <td style={{ padding: '10px 12px', color: '#475569' }}>{jw.posting_date}</td>
                    <td style={{ padding: '10px 12px', color: '#475569' }}>{jw.party_challan_no}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0f172a' }}>{jw.customer_name}</td>
                    <td style={{ padding: '10px 12px', color: '#334155' }}>{jw.service_desc}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 700 }}>
                        {jw.sac_code}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{symbol} {Number(jw.net_total || 0).toFixed(2)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748b' }}>{symbol} {Number(jw.tax_amount || 0).toFixed(2)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{symbol} {Number(jw.grand_total || 0).toFixed(2)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} style={{ padding: '18px', textAlign: 'center', color: '#64748b' }}>
                    No Job Work invoices recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

</div>
  );
};