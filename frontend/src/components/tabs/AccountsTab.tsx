import type { FC } from 'react';
import { Download, Plus, Printer } from 'lucide-react';
import { DataTable } from '../DataTable';
import type { GLEntryRow } from '../../types/erp';
import { exportToCSV } from '../../utils/erpHelpers';

interface AccountsTabProps {
  glEntries: GLEntryRow[];
  allPartyNames: string[];
  glAccountFilter: string;
  setGlAccountFilter: (filter: string) => void;
  glPartyFilter: string;
  setGlPartyFilter: (filter: string) => void;
  fromDate: string;
  setFromDate: (date: string) => void;
  toDate: string;
  setToDate: (date: string) => void;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  setShowLedgerPrintModal: (show: boolean) => void;
  onNewJournalEntry: () => void;
}

export const AccountsTab: FC<AccountsTabProps> = ({
  glEntries,
  allPartyNames,
  glAccountFilter,
  setGlAccountFilter,
  glPartyFilter,
  setGlPartyFilter,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  totalDebit,
  totalCredit,
  closingBalance,
  setShowLedgerPrintModal,
  onNewJournalEntry,
}) => {
  const symbol = localStorage.getItem('active_company_symbol') || '₹';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 6px 0' }}>General Ledger Entries</h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>Unified double-entry bookkeeping ledger & individual party statements</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => {
              const exportData = glEntries.map((r) => ({
                Date: r.posting_date,
                Voucher: `${r.voucher_type} #${r.voucher_no}`,
                Account: r.account,
                Party: r.party || '-',
                [`Debit (${symbol})`]: r.debit,
                [`Credit (${symbol})`]: r.credit,
                [`Balance (${symbol})`]: r.balance,
              }));
              exportToCSV(exportData, 'General_Ledger');
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#10b981', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
          >
            <Download size={16} /> Export CSV
          </button>
          <button
            onClick={() => setShowLedgerPrintModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#0284c7', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
          >
            <Printer size={16} /> Print Statement
          </button>
          <button
            onClick={onNewJournalEntry}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#0f766e', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
          >
            <Plus size={16} /> New Journal Entry
          </button>
        </div>
      </div>

      {/* Filter Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', background: '#fff', padding: '16px 20px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
        <div>
          <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Filter by Account</label>
          <select
            value={glAccountFilter}
            onChange={(e) => setGlAccountFilter(e.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px' }}
          >
            <option value="all">All Accounts (Complete Ledger)</option>
            <option value="Sales Income">Sales Income</option>
            <option value="Cost of Goods Sold">Cost of Goods Sold</option>
            <option value="Debtors">Debtors (Customer Receivables)</option>
            <option value="Creditors">Creditors (Supplier Payables)</option>
            <option value="Bank Account">Bank Account</option>
            <option value="Cash Account">Cash Account</option>
            <option value="Output GST">Output GST</option>
            <option value="Input GST">Input GST</option>
                <option value="Freight & Adjustments">Freight & Adjustments</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Filter by Party</label>
          <select
            value={glPartyFilter}
            onChange={(e) => setGlPartyFilter(e.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px' }}
          >
            <option value="all">All Parties</option>
            {allPartyNames.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>From Date</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px' }}
          />
        </div>
        <div>
          <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>To Date</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px' }}
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '20px' }}>
        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>Total Debits</span>
          <h3 style={{ margin: '6px 0 0 0', fontSize: '20px', color: '#0f172a' }}>
            {symbol} {totalDebit.toFixed(2)}
          </h3>
        </div>
        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>Total Credits</span>
          <h3 style={{ margin: '6px 0 0 0', fontSize: '20px', color: '#0f172a' }}>
            {symbol} {totalCredit.toFixed(2)}
          </h3>
        </div>
        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>Statement Closing Balance</span>
          <h3 style={{ margin: '6px 0 0 0', fontSize: '20px', color: '#0284c7' }}>
            {symbol} {Math.abs(closingBalance).toFixed(2)} {closingBalance >= 0 ? 'Dr' : 'Cr'}
          </h3>
        </div>
      </div>

      <DataTable<GLEntryRow>
        columns={[
          { header: 'Date', accessor: 'posting_date' },
          { header: 'Voucher', accessor: (r) => `${r.voucher_type} #${r.voucher_no}` },
          { header: 'Account', accessor: 'account' },
          { header: 'Party', accessor: (r) => r.party || '-' },
          {
            header: `Debit (${symbol})`,
            accessor: (r) => {
              const val = Number(r.debit || 0);
              if (val <= 0) return '-';
              if (r.account === 'Freight & Adjustments') {
                return <span style={{ color: '#dc2626', fontWeight: 600 }}>-{symbol} {val.toFixed(2)}</span>;
              }
              return `${symbol} ${val.toFixed(2)}`;
            },
          },
          {
            header: `Credit (${symbol})`,
            accessor: (r) => {
              const val = Number(r.credit || 0);
              if (val <= 0) return '-';
              if (r.account === 'Freight & Adjustments') {
                return <span style={{ color: '#16a34a', fontWeight: 600 }}>+{symbol} {val.toFixed(2)}</span>;
              }
              return `${symbol} ${val.toFixed(2)}`;
            },
          },
          {
            header: `Running Bal (${symbol})`,
            accessor: (r) => {
              const bal = Number(r.balance || 0);
              const isLessAdj = r.account === 'Freight & Adjustments' && Number(r.debit || 0) > 0 && Math.abs(bal) === Number(r.debit || 0);
              if (bal < 0 || isLessAdj) {
                return <strong style={{ color: '#dc2626' }}>-{symbol} {Math.abs(bal).toFixed(2)}</strong>;
              }
              return <strong>{symbol} {bal.toFixed(2)}</strong>;
            },
          },
        ]}
        data={glEntries}
        emptyMessage="No ledger entries match the selected filters."
      />
    </div>
  );
};