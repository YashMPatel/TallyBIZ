import { useState, useEffect, useCallback, useMemo, type FC } from 'react';
import { Plus, Download, Search, Edit2, ArrowLeftRight, X, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { DataTable } from '../DataTable';
import type { Item } from '../../types/erp';
import { API_BASE, exportToCSV } from '../../utils/erpHelpers';

interface StockTabProps {
  items: Item[];
  filteredItems: Item[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  setEditingId: (id: number | null) => void;
  setItemForm: any;
  setShowItemModal: (show: boolean) => void;
}

export const StockTab: FC<StockTabProps> = ({
  items,
  filteredItems,
  searchQuery,
  setSearchQuery,
  setEditingId,
  setItemForm,
  setShowItemModal,
}) => {
  const symbol = localStorage.getItem('active_company_symbol') || '₹';
  const activeUnitId = localStorage.getItem('active_unit_id') || 'all';
  const isUnitFiltered = activeUnitId !== 'all';

  const [stockSubTab, setStockSubTab] = useState<'items' | 'transfers'>('items');
  const [units, setUnits] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [sourceItems, setSourceItems] = useState<any[]>([]);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [trfItemId, setTrfItemId] = useState('');
  const [trfFromUnit, setTrfFromUnit] = useState('');
  const [trfToUnit, setTrfToUnit] = useState('');
  const [trfQty, setTrfQty] = useState('');
  const [trfBusy, setTrfBusy] = useState(false);
  const [trfMsg, setTrfMsg] = useState<string | null>(null);
  const [batchModalItem, setBatchModalItem] = useState<Item | null>(null);
  const [itemBatches, setItemBatches] = useState<any[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [newBatchNo, setNewBatchNo] = useState('');
  const [newBatchQty, setNewBatchQty] = useState('');
  const [newBatchRate, setNewBatchRate] = useState('');
  const [newBatchSupplier, setNewBatchSupplier] = useState('');
  const [newBatchJobWork, setNewBatchJobWork] = useState(false);
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchErr, setBatchErr] = useState<string | null>(null);

  const [itemPage, setItemPage] = useState(1);
  const [itemPageSize, setItemPageSize] = useState(25);

  const [trfSearch, setTrfSearch] = useState('');
  const [trfFromDate, setTrfFromDate] = useState('');
  const [trfToDate, setTrfToDate] = useState('');
  const [trfPage, setTrfPage] = useState(1);
  const [trfPageSize, setTrfPageSize] = useState(15);

  useEffect(() => {
    setItemPage(1);
  }, [searchQuery, filteredItems.length, itemPageSize]);

  useEffect(() => {
    setTrfPage(1);
  }, [trfSearch, trfFromDate, trfToDate, trfPageSize]);

  const loadTransfers = useCallback(() => {
    const compId = localStorage.getItem('active_company_id');
    if (!compId) return;
    fetch(`${API_BASE}/stock/transfer/?company_id=${compId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (Array.isArray(rows)) setTransfers(rows);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const compId = localStorage.getItem('active_company_id');
    if (!compId) return;
    fetch(`${API_BASE}/accounts/units/?company_id=${compId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (Array.isArray(rows)) {
          setUnits(rows);
          if (rows.length >= 2) {
            const defaultFrom = isUnitFiltered ? activeUnitId : String(rows[1].id);
            const defaultTo = String(rows.find((u: any) => String(u.id) !== defaultFrom)?.id || rows[0].id);
            setTrfFromUnit(defaultFrom);
            setTrfToUnit(defaultTo);
          }
        }
      })
      .catch(() => {});
    loadTransfers();
  }, [activeUnitId, isUnitFiltered, loadTransfers]);

  useEffect(() => {
    if (!showTransferModal || !trfFromUnit) return;
    const compId = localStorage.getItem('active_company_id');
    if (!compId) return;
    fetch(`${API_BASE}/stock/items/?company_id=${compId}&unit_id=${trfFromUnit}&in_unit_only=1`, {
      headers: { 'X-Unit-Id': trfFromUnit },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : rows.results || [];
        setSourceItems(list);
        if (list.length > 0) {
          setTrfItemId((prev) => (list.some((x: any) => String(x.id) === String(prev)) ? prev : String(list[0].id)));
        } else {
          setTrfItemId('');
        }
      })
      .catch(() => setSourceItems([]));
  }, [showTransferModal, trfFromUnit]);

  const getEffStock = (it: any) =>
    isUnitFiltered && it.unit_stock !== undefined ? Number(it.unit_stock) : Number(it.current_stock || 0);

  const divisionItems = useMemo(
    () => (isUnitFiltered ? items.filter((it) => getEffStock(it) !== 0) : items),
    [items, isUnitFiltered, activeUnitId]
  );

  const divisionFilteredItems = useMemo(
    () => (isUnitFiltered ? filteredItems.filter((it) => getEffStock(it) !== 0) : filteredItems),
    [filteredItems, isUnitFiltered, activeUnitId]
  );

  const totalValuation = divisionItems.reduce(
    (sum, it) => sum + getEffStock(it) * Number(it.standard_rate || 0),
    0
  );
  const lowStockCount = divisionItems.filter((it) => getEffStock(it) <= 5).length;

  const totalItemPages = Math.max(1, Math.ceil(divisionFilteredItems.length / itemPageSize));
  const safeItemPage = Math.min(itemPage, totalItemPages);
  const paginatedItems = useMemo(() => {
    const start = (safeItemPage - 1) * itemPageSize;
    return divisionFilteredItems.slice(start, start + itemPageSize);
  }, [divisionFilteredItems, safeItemPage, itemPageSize]);

  const filteredTransfers = useMemo(() => {
    const q = trfSearch.trim().toLowerCase();
    return transfers.filter((t: any) => {
      if (trfFromDate && String(t.posting_date) < trfFromDate) return false;
      if (trfToDate && String(t.posting_date) > trfToDate) return false;
      if (q) {
        const hay = `${t.voucher_no} ${t.item_name} ${t.item_code} ${t.from_unit} ${t.to_unit}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transfers, trfSearch, trfFromDate, trfToDate]);

  const totalTrfPages = Math.max(1, Math.ceil(filteredTransfers.length / trfPageSize));
  const safeTrfPage = Math.min(trfPage, totalTrfPages);
  const paginatedTransfers = useMemo(() => {
    const start = (safeTrfPage - 1) * trfPageSize;
    return filteredTransfers.slice(start, start + trfPageSize);
  }, [filteredTransfers, safeTrfPage, trfPageSize]);

  const handleStockTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setTrfBusy(true);
    setTrfMsg(null);
    try {
      const compId = localStorage.getItem('active_company_id');
      const res = await fetch(`${API_BASE}/stock/transfer/?company_id=${compId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Company-Id': String(compId || '') },
        body: JSON.stringify({
          item_id: trfItemId,
          from_unit_id: trfFromUnit,
          to_unit_id: trfToUnit,
          qty: trfQty,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Transfer failed');
      setShowTransferModal(false);
      loadTransfers();
      window.location.reload();
    } catch (err: any) {
      setTrfMsg(err.message || 'Error transferring stock');
    } finally {
      setTrfBusy(false);
    }
  };

  const openBatchModal = async (itm: Item) => {
    setBatchModalItem(itm);
    setBatchErr(null);
    setNewBatchNo('');
    setNewBatchQty('');
    setNewBatchRate(String(itm.standard_rate || ''));
    setNewBatchSupplier('');
    setBatchesLoading(true);
    try {
      const compId = localStorage.getItem('active_company_id') || '';
      const res = await fetch(`${API_BASE}/stock/batches/?company_id=${compId}&item_id=${itm.id}`);
      const rows = res.ok ? await res.json() : [];
      setItemBatches(Array.isArray(rows) ? rows : []);
    } catch {
      setItemBatches([]);
    } finally {
      setBatchesLoading(false);
    }
  };

  const handleAddBatchLot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchModalItem) return;
    setBatchSaving(true);
    setBatchErr(null);
    try {
      const compId = localStorage.getItem('active_company_id') || '';
      const res = await fetch(`${API_BASE}/stock/batches/?company_id=${compId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Company-Id': String(compId) },
        body: JSON.stringify({
          item_id: batchModalItem.id,
          batch_no: newBatchNo.trim(),
          initial_qty: newBatchQty,
          purchase_rate: newBatchJobWork ? 0 : (newBatchRate || batchModalItem.standard_rate || 0),
          source_type: newBatchJobWork ? 'Job Work Inward' : 'Manual Batch Inward',
          party_name: newBatchSupplier.trim() || (newBatchJobWork ? 'Job Work Party' : 'Direct Lot Inward'),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add batch');
      await openBatchModal(batchModalItem);
    } catch (err: any) {
      setBatchErr(err.message || 'Failed to create batch');
    } finally {
      setBatchSaving(false);
    }
  };

  const activeUnitObj = units.find((u) => String(u.id) === String(activeUnitId));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 6px 0' }}>
            Stock Items &amp; Inventory {activeUnitObj ? `— ${activeUnitObj.name}` : '(All Divisions)'}
          </h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>
            Division-specific stock items, valuation and inter-unit stock transfer register
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {units.length > 1 && (
            <button
              onClick={() => {
                setTrfMsg(null);
                setTrfQty('');
                setShowTransferModal(true);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#7c3aed', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
            >
              <ArrowLeftRight size={16} /> Transfer Stock (Unit to Unit)
            </button>
          )}
          <button
            onClick={() => {
              const exportData = divisionItems.map((it) => ({
                'Item Code': it.item_code,
                'Item Name': it.item_name,
                'Category': it.category,
                [`Rate (${symbol})`]: it.standard_rate,
                'Division Stock': getEffStock(it),
                'Total Company Stock': it.current_stock,
                [`Stock Value (${symbol})`]: (getEffStock(it) * Number(it.standard_rate || 0)).toFixed(2),
              }));
              exportToCSV(exportData, 'Stock_Inventory');
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#10b981', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
          >
            <Download size={16} /> Export Stock
          </button>
          <button
            onClick={() => {
              setEditingId(null);
              setItemForm({
                item_code: '',
                item_name: '',
                category: 'General',
                unit: 'Nos',
                standard_rate: '0',
                selling_rate: '0',
                current_stock: '0',
              });
              setShowItemModal(true);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#0284c7', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
          >
            <Plus size={16} /> New Item
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '20px' }}>
        <div style={{ background: '#fff', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>
            {activeUnitObj ? `${activeUnitObj.name} SKUs` : 'Total SKUs / Items'}
          </span>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '22px', color: '#0f172a' }}>{divisionItems.length} Products</h3>
        </div>
        <div style={{ background: '#fff', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>
            {activeUnitObj ? `${activeUnitObj.name} Valuation` : 'Total Inventory Valuation'}
          </span>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '22px', color: '#0284c7' }}>
            {symbol} {totalValuation.toFixed(2)}
          </h3>
        </div>
        <div style={{ background: '#fff', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Low / Out of Stock Alert</span>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '22px', color: lowStockCount > 0 ? '#dc2626' : '#15803d' }}>
            {lowStockCount} Items Need Attention
          </h3>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
        <button
          onClick={() => setStockSubTab('items')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '13px',
            background: stockSubTab === 'items' ? '#0f172a' : '#e2e8f0',
            color: stockSubTab === 'items' ? '#ffffff' : '#334155',
          }}
        >
          Stock Items ({divisionItems.length})
        </button>
        <button
          onClick={() => setStockSubTab('transfers')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '13px',
            background: stockSubTab === 'transfers' ? '#0f172a' : '#e2e8f0',
            color: stockSubTab === 'transfers' ? '#ffffff' : '#334155',
          }}
        >
          Inter-Unit Stock Transfers ({transfers.length})
        </button>
      </div>

      {stockSubTab === 'items' ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div style={{ position: 'relative', width: '320px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search item code, name, or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '8px 12px 8px 36px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', background: '#fff', boxSizing: 'border-box' }}
              />
            </div>
            {divisionFilteredItems.length > 25 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#475569' }}>
                <span>Rows:</span>
                <select
                  value={itemPageSize}
                  onChange={(e) => setItemPageSize(Number(e.target.value))}
                  style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '12px' }}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span>
                  {(safeItemPage - 1) * itemPageSize + 1}–{Math.min(safeItemPage * itemPageSize, divisionFilteredItems.length)} of {divisionFilteredItems.length}
                </span>
                <button
                  disabled={safeItemPage <= 1}
                  onClick={() => setItemPage((p) => Math.max(1, p - 1))}
                  style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: safeItemPage <= 1 ? 'not-allowed' : 'pointer', opacity: safeItemPage <= 1 ? 0.5 : 1 }}
                >
                  Prev
                </button>
                <button
                  disabled={safeItemPage >= totalItemPages}
                  onClick={() => setItemPage((p) => Math.min(totalItemPages, p + 1))}
                  style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: safeItemPage >= totalItemPages ? 'not-allowed' : 'pointer', opacity: safeItemPage >= totalItemPages ? 0.5 : 1 }}
                >
                  Next
                </button>
              </div>
            )}
          </div>

          <DataTable<Item>
            columns={[
              { header: 'Code', accessor: 'item_code' },
              { header: 'Item Name', accessor: 'item_name' },
              { header: 'Category', accessor: 'category' },
              {
                header: `Rate (${symbol})`,
                accessor: (r) => `${symbol} ${Number(r.standard_rate || 0).toFixed(2)}`,
              },
              {
                header: activeUnitObj ? `${activeUnitObj.name} Stock` : 'Current Stock',
                accessor: (r) => (
                  <span>
                    <strong>{getEffStock(r)} {r.unit || 'Nos'}</strong>
                    {isUnitFiltered && (
                      <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '6px' }}>
                        (Company Total: {r.current_stock || 0})
                      </span>
                    )}
                  </span>
                ),
              },
              {
                header: `Stock Value (${symbol})`,
                accessor: (r) => (
                  <strong style={{ color: '#0284c7' }}>
                    {symbol} {(getEffStock(r) * Number(r.standard_rate || 0)).toFixed(2)}
                  </strong>
                ),
              },
              {
                header: 'Actions',
                accessor: (r) => (
                  <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                    <button
                      onClick={() => openBatchModal(r)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '700', color: '#1d4ed8' }}
                    >
                      <Layers size={13} /> Batches
                    </button>
                    <button
                      onClick={() => {
                      setEditingId(r.id!);
                      setItemForm({
                        item_code: r.item_code,
                        item_name: r.item_name,
                        category: r.category,
                        unit: r.unit,
                        standard_rate: String(r.standard_rate),
                        selling_rate: String((r as any).selling_rate ?? r.standard_rate),
                        current_stock: String(r.current_stock),
                      });
                      setShowItemModal(true);
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: '#334155' }}
                  >
                    <Edit2 size={13} /> Edit
                  </button>
                  </div>
                ),
              },
            ]}
            data={paginatedItems}
            emptyMessage={activeUnitObj ? `No stock items available in ${activeUnitObj.name} yet. Purchase or Transfer stock into this division.` : 'No inventory items found.'}
          />
        </>
      ) : (
        <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                Inter-Unit Stock Transfer Register ({filteredTransfers.length}{filteredTransfers.length !== transfers.length ? ` of ${transfers.length}` : ''})
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                Searchable &amp; paginated register of all stock transfers between Head Office, Trading Division, and Manufacturing Unit
              </p>
            </div>
            {transfers.length > 0 && (
              <button
                onClick={() => {
                  const csvRows = filteredTransfers.map((t: any) => ({
                    'Transfer #': t.voucher_no,
                    'Date': t.posting_date,
                    'Item Code': t.item_code,
                    'Item Name': t.item_name,
                    'From Division': t.from_unit,
                    'To Division': t.to_unit,
                    'Qty': t.qty,
                    'Unit': t.unit,
                    [`Valuation (${symbol})`]: Number(t.total_value || 0).toFixed(2),
                  }));
                  exportToCSV(csvRows, 'Inter_Unit_Stock_Transfers');
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f1f5f9', color: '#0f172a', border: '1px solid #cbd5e1', padding: '7px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
              >
                <Download size={14} /> Export Transfers CSV
              </button>
            )}
          </div>

          {transfers.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', marginBottom: '14px', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '200px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Search TRF #, item name/code, or division..."
                  value={trfSearch}
                  onChange={(e) => setTrfSearch(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px 6px 32px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#fff', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#475569' }}>
                <span>From:</span>
                <input
                  type="date"
                  value={trfFromDate}
                  onChange={(e) => setTrfFromDate(e.target.value)}
                  style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#fff' }}
                />
                <span>To:</span>
                <input
                  type="date"
                  value={trfToDate}
                  onChange={(e) => setTrfToDate(e.target.value)}
                  style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', background: '#fff' }}
                />
                {(trfSearch || trfFromDate || trfToDate) && (
                  <button
                    onClick={() => { setTrfSearch(''); setTrfFromDate(''); setTrfToDate(''); }}
                    style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: '12px', color: '#dc2626', fontWeight: 600 }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}

          {transfers.length === 0 ? (
            <div style={{ padding: '18px', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', fontSize: '13px', color: '#64748b' }}>
              No inter-unit stock transfers recorded yet. Click <strong>Transfer Stock (Unit to Unit)</strong> above to move stock between divisions.
            </div>
          ) : filteredTransfers.length === 0 ? (
            <div style={{ padding: '18px', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', fontSize: '13px', color: '#64748b' }}>
              No transfer records match your search or date filter.
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#334155' }}>
                      <th style={{ padding: '9px 12px' }}>Transfer #</th>
                      <th style={{ padding: '9px 12px' }}>Date</th>
                      <th style={{ padding: '9px 12px' }}>Item</th>
                      <th style={{ padding: '9px 12px' }}>From Division</th>
                      <th style={{ padding: '9px 12px' }}>To Division</th>
                      <th style={{ padding: '9px 12px', textAlign: 'right' }}>Transferred Qty</th>
                      <th style={{ padding: '9px 12px', textAlign: 'right' }}>Valuation ({symbol})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedTransfers.map((t: any) => (
                      <tr key={t.voucher_no} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: '#7c3aed' }}>{t.voucher_no}</td>
                        <td style={{ padding: '10px 12px', color: '#475569' }}>{t.posting_date}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0f172a' }}>
                          {t.item_name} <span style={{ fontSize: '11px', color: '#64748b' }}>({t.item_code})</span>
                        </td>
                        <td style={{ padding: '10px 12px', color: '#b91c1c', fontWeight: 600 }}>{t.from_unit}</td>
                        <td style={{ padding: '10px 12px', color: '#15803d', fontWeight: 600 }}>{t.to_unit}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>
                          {t.qty} {t.unit}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#0284c7' }}>
                          {symbol} {Number(t.total_value || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #e2e8f0', fontSize: '12px', color: '#475569' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>Rows per page:</span>
                  <select
                    value={trfPageSize}
                    onChange={(e) => setTrfPageSize(Number(e.target.value))}
                    style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '12px', fontWeight: 600 }}
                  >
                    <option value={15}>15</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span>
                    Showing <strong>{(safeTrfPage - 1) * trfPageSize + 1}–{Math.min(safeTrfPage * trfPageSize, filteredTransfers.length)}</strong> of <strong>{filteredTransfers.length}</strong> entries
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    disabled={safeTrfPage <= 1}
                    onClick={() => setTrfPage((p) => Math.max(1, p - 1))}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: safeTrfPage <= 1 ? 'not-allowed' : 'pointer', opacity: safeTrfPage <= 1 ? 0.5 : 1, fontWeight: 600 }}
                  >
                    <ChevronLeft size={14} /> Prev
                  </button>
                  <span style={{ fontWeight: 600, color: '#0f172a' }}>
                    Page {safeTrfPage} of {totalTrfPages}
                  </span>
                  <button
                    disabled={safeTrfPage >= totalTrfPages}
                    onClick={() => setTrfPage((p) => Math.min(totalTrfPages, p + 1))}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: safeTrfPage >= totalTrfPages ? 'not-allowed' : 'pointer', opacity: safeTrfPage >= totalTrfPages ? 0.5 : 1, fontWeight: 600 }}
                  >
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}


      {batchModalItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.58)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300 }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '820px', maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto', padding: '22px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                  Batch / Lot-Wise Stock Register — {batchModalItem.item_name} ({batchModalItem.item_code})
                </h3>
                <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                  Track inward lots (1000 nos), FIFO outward deductions (100 / 50 / 20), and exact remaining stock per batch
                </p>
              </div>
              <button onClick={() => setBatchModalItem(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={20} />
              </button>
            </div>

            {batchesLoading ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>Loading batch lots...</div>
            ) : (
              <div style={{ overflowX: 'auto', marginBottom: '18px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#334155' }}>
                      <th style={{ padding: '8px 10px' }}>Batch / Lot #</th>
                      <th style={{ padding: '8px 10px' }}>Date</th>
                      <th style={{ padding: '8px 10px' }}>Source / Supplier</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Inward Qty</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Outward (Sold)</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Balance Stock</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Rate ({symbol})</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemBatches.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ padding: '16px', textAlign: 'center', color: '#64748b' }}>
                          No batch lots recorded for this item yet. Create a Purchase Bill or add a batch lot below.
                        </td>
                      </tr>
                    ) : (
                      itemBatches.map((b: any) => {
                        const rem = Number(b.remaining_qty || 0);
                        const init = Number(b.initial_qty || 0);
                        const sold = Math.max(0, init - rem);
                        return (
                          <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '9px 10px', fontWeight: 700, color: '#1d4ed8' }}>{b.batch_no}</td>
                            <td style={{ padding: '9px 10px', color: '#475569' }}>{b.received_date}</td>
                            <td style={{ padding: '9px 10px', color: '#0f172a' }}>
                              {b.party_name || b.source_type} <span style={{ fontSize: '11px', color: '#64748b' }}>({b.source_voucher})</span>
                            </td>
                            <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 600 }}>{init} {batchModalItem.unit || 'Nos'}</td>
                            <td style={{ padding: '9px 10px', textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>-{sold} {batchModalItem.unit || 'Nos'}</td>
                            <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 800, color: rem > 0 ? '#15803d' : '#94a3b8' }}>
                              {rem} {batchModalItem.unit || 'Nos'}
                            </td>
                            <td style={{ padding: '9px 10px', textAlign: 'right' }}>{symbol} {Number(b.purchase_rate || 0).toFixed(2)}</td>
                            <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                              <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, background: rem > 0 ? '#dcfce7' : '#f1f5f9', color: rem > 0 ? '#166534' : '#64748b' }}>
                                {rem > 0 ? 'AVAILABLE' : 'EXHAUSTED'}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <form onSubmit={handleAddBatchLot} style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>
                + Add New Inward Batch / Lot Manually
              </div>
              {batchErr && <div style={{ color: '#b91c1c', fontSize: '12px', marginBottom: '8px' }}>{batchErr}</div>}
              <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', background: '#fef3c7', padding: '6px 10px', borderRadius: '6px', border: '1px solid #fde68a' }}>
                <input
                  id="jw-batch-chk"
                  type="checkbox"
                  checked={newBatchJobWork}
                  onChange={(e) => {
                    setNewBatchJobWork(e.target.checked);
                    if (e.target.checked) setNewBatchRate('0');
                  }}
                />
                <label htmlFor="jw-batch-chk" style={{ fontSize: '12px', fontWeight: 700, color: '#92400e', cursor: 'pointer' }}>
                  Party Job Work Material (₹0 Valuation — Customer-Owned Stock, No Asset/Purchase Impact)
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1.3fr auto', gap: '8px', alignItems: 'end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '3px' }}>Batch / Lot # (Optional)</label>
                  <input value={newBatchNo} onChange={(e) => setNewBatchNo(e.target.value)} placeholder="Auto if blank" style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '3px' }}>Qty ({batchModalItem.unit || 'Nos'}) *</label>
                  <input type="number" step="0.01" min="0.01" required value={newBatchQty} onChange={(e) => setNewBatchQty(e.target.value)} placeholder="e.g. 1000" style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '3px' }}>Rate ({symbol})</label>
                  <input type="number" step="0.01" value={newBatchRate} onChange={(e) => setNewBatchRate(e.target.value)} style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '3px' }}>Supplier / Source</label>
                  <input value={newBatchSupplier} onChange={(e) => setNewBatchSupplier(e.target.value)} placeholder="e.g. Patel & Sons" style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', boxSizing: 'border-box' }} />
                </div>
                <button type="submit" disabled={batchSaving} style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '12px' }}>
                  {batchSaving ? 'Adding...' : '+ Add Lot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTransferModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '440px', maxWidth: '94vw', padding: '22px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Inter-Unit Stock Transfer</h3>
              <button onClick={() => setShowTransferModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>
            {trfMsg && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', marginBottom: '12px' }}>
                {trfMsg}
              </div>
            )}
            <form onSubmit={handleStockTransfer} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>From Division *</label>
                  <select
                    required
                    value={trfFromUnit}
                    onChange={(e) => setTrfFromUnit(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  >
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>To Division *</label>
                  <select
                    required
                    value={trfToUnit}
                    onChange={(e) => setTrfToUnit(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  >
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Select Item (Available in Source Division) *</label>
                <select
                  required
                  value={trfItemId}
                  onChange={(e) => setTrfItemId(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                >
                  {sourceItems.length === 0 ? (
                    <option value="">-- No items with stock in selected From Division --</option>
                  ) : (
                    sourceItems.map((it: any) => (
                      <option key={it.id} value={it.id}>
                        {it.item_name} ({it.item_code}) — Available: {it.unit_stock ?? it.current_stock} {it.unit}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Quantity to Transfer *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={trfQty}
                  onChange={(e) => setTrfQty(e.target.value)}
                  placeholder="e.g. 10"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button type="button" onClick={() => setShowTransferModal(false)} style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: '13px' }}>
                  Cancel
                </button>
                <button type="submit" disabled={trfBusy || sourceItems.length === 0} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '13px', opacity: sourceItems.length === 0 ? 0.6 : 1 }}>
                  {trfBusy ? 'Transferring...' : 'Confirm Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
