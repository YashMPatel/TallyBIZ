import type { FC } from 'react';
import { DataTable } from '../DataTable';
import type { StockLedgerRow, Item } from '../../types/erp';

interface StockLedgerItem {
  id?: number | string;
  posting_date?: string;
  item?: number;
  item_id?: number;
  item_name?: string;
  item_code?: string;
  voucher_type?: string;
  voucher_no?: string;
  actual_qty?: number | string;
  inward_qty?: number | string;
  outward_qty?: number | string;
  qty_after_transaction?: number | string;
  balance_qty?: number | string;
  valuation_rate?: number | string;
  total_value?: number | string;
  [key: string]: any;
}

interface StockLedgerTabProps {
  stockLedger: StockLedgerRow[];
  items: Item[];
  stockItemFilter: string;
  setStockItemFilter: (filter: string) => void;
}

export const StockLedgerTab: FC<StockLedgerTabProps> = ({
  stockLedger,
  items,
  stockItemFilter,
  setStockItemFilter,
}) => {
  const symbol = localStorage.getItem('active_company_symbol') || '₹';
  const ledgerRows = (stockLedger || []) as StockLedgerItem[];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 6px 0' }}>Stock Movement & Valuation Ledger</h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>Chronological register of inward receipts, outward issues & item balances</p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', background: '#fff', padding: '14px 18px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Filter by Item:</span>
        <select
          value={stockItemFilter}
          onChange={(e) => setStockItemFilter(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
        >
          <option value="all">All Inventory Items</option>
          {items.map((it) => (
            <option key={it.id} value={it.id}>
              {it.item_name} ({it.item_code})
            </option>
          ))}
        </select>
        {stockItemFilter !== 'all' && (
          <button
            onClick={() => setStockItemFilter('all')}
            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f1f5f9', cursor: 'pointer', fontSize: '12px' }}
          >
            Reset Item Filter
          </button>
        )}
      </div>

      <DataTable<StockLedgerItem>
        columns={[
          { header: 'Date', accessor: (r) => r.posting_date || '-' },
          {
            header: 'Item Name',
            accessor: (r) => {
              const itmId = r.item !== undefined ? r.item : r.item_id;
              const matched = items.find((i) => i.id !== undefined && String(i.id) === String(itmId));
              if (matched) {
                return `${matched.item_name} (${matched.item_code})`;
              }
              if (r.item_name) {
                return `${r.item_name} (${r.item_code || ''})`;
              }
              return itmId ? `Item #${itmId}` : '-';
            },
          },
          {
            header: 'Voucher',
            accessor: (r) => `${r.voucher_type || ''} #${r.voucher_no || ''}`,
          },
          {
            header: 'Inward (+)',
            accessor: (r) => {
              const qty = Number(r.actual_qty !== undefined ? r.actual_qty : r.inward_qty);
              return qty > 0 ? <span style={{ color: '#15803d', fontWeight: 'bold' }}>+{qty}</span> : '-';
            },
          },
          {
            header: 'Outward (-)',
            accessor: (r) => {
              const actQty = Number(r.actual_qty);
              const outQty = Number(r.outward_qty);
              if (actQty < 0) {
                return <span style={{ color: '#dc2626', fontWeight: 'bold' }}>{actQty}</span>;
              }
              if (outQty > 0) {
                return <span style={{ color: '#dc2626', fontWeight: 'bold' }}>-{outQty}</span>;
              }
              return '-';
            },
          },
          {
            header: 'Balance Qty',
            accessor: (r) => <strong>{r.qty_after_transaction !== undefined ? r.qty_after_transaction : (r.balance_qty ?? 0)}</strong>,
          },
          {
            header: `Valuation Rate (${symbol})`,
            accessor: (r) => `${symbol} ${Number(r.valuation_rate || 0).toFixed(2)}`,
          },
          {
            header: `Total Value (${symbol})`,
            accessor: (r) => {
              const bal = Number(r.qty_after_transaction !== undefined ? r.qty_after_transaction : (r.balance_qty ?? 0));
              const rate = Number(r.valuation_rate || 0);
              const total = r.total_value !== undefined ? Number(r.total_value) : bal * rate;
              return <strong style={{ color: '#0369a1' }}>{symbol} {total.toFixed(2)}</strong>;
            },
          },
        ]}
        data={ledgerRows}
        emptyMessage="No stock movements recorded yet."
      />
    </div>
  );
};