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
    </div>
  );
};