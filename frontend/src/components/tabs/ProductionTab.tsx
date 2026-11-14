import React, { useState, useEffect, useCallback } from 'react';
import { Factory, Plus, CheckCircle, XCircle, AlertTriangle, Layers, Play, Trash2, RefreshCw, Eye, Edit2, Printer } from 'lucide-react';
import { API_BASE, getErrorMessage } from '../../utils/erpHelpers';

interface ProductionTabProps {
  items: any[];
  activeCompany: any;
  user: any;
  onRefreshData?: () => void;
}

export const ProductionTab: React.FC<ProductionTabProps> = ({
  items,
  activeCompany,
  user,
  onRefreshData,
}) => {
  const symbol = activeCompany?.currency_symbol || '₹';
  const roleUpper = String(user?.role || '').trim().toUpperCase().replace(/\s+/g, '_');
  const canApprove = roleUpper === 'ADMIN' || roleUpper === 'MANAGER' || Boolean(user?.is_superuser || user?.is_staff);

  const [subTab, setSubTab] = useState<'orders' | 'boms'>('orders');
  const [boms, setBoms] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // BOM Modal State (Create & Edit)
  const [showBomModal, setShowBomModal] = useState(false);
  const [editingBomId, setEditingBomId] = useState<number | null>(null);
  const [bomName, setBomName] = useState('');
  const [bomCode, setBomCode] = useState('');
  const [finishedItemId, setFinishedItemId] = useState<string>('');
  const [outputQty, setOutputQty] = useState<string>('1');
  const [bomLaborCost, setBomLaborCost] = useState<string>('0');
  const [bomOverheadCost, setBomOverheadCost] = useState<string>('0');
  const [bomNotes, setBomNotes] = useState('');
  const [bomComponents, setBomComponents] = useState<Array<{ raw_item: string; qty_required: string; wastage_percent: string }>>([
    { raw_item: '', qty_required: '1', wastage_percent: '0' },
  ]);

  // Production Order Modal State (Create & Edit)
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const [editingVoucherNo, setEditingVoucherNo] = useState<string>('');
  const [selectedBomId, setSelectedBomId] = useState<string>('');
  const [postingDate, setPostingDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [voucherNo, setVoucherNo] = useState('');
  const [plannedQty, setPlannedQty] = useState<string>('1');
  const [actualQty, setActualQty] = useState<string>('1');
  const [orderLaborCost, setOrderLaborCost] = useState<string>('0');
  const [orderOverheadCost, setOrderOverheadCost] = useState<string>('0');
  const [scrapItemId, setScrapItemId] = useState<string>('');
  const [scrapQty, setScrapQty] = useState<string>('0');
  const [scrapValue, setScrapValue] = useState<string>('0');
  const [orderRemarks, setOrderRemarks] = useState('');
  const [orderConsumptions, setOrderConsumptions] = useState<Array<{ raw_item: number; raw_item_name: string; unit: string; available_stock: number; rate: number; planned_qty: number; actual_qty: string }>>([]);

  // View Voucher Modal State
  const [viewOrder, setViewOrder] = useState<any | null>(null);

  const buildHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
  }), []);

  const fetchManufacturing = useCallback(async () => {
    if (!activeCompany?.id) return;
    setLoading(true);
    try {
      const [bomRes, ordRes] = await Promise.all([
        fetch(`${API_BASE}/manufacturing/boms/?company_id=${activeCompany.id}`),
        fetch(`${API_BASE}/manufacturing/orders/?company_id=${activeCompany.id}`),
      ]);
      if (bomRes.ok) {
        const bData = await bomRes.json();
        setBoms(bData.boms || []);
      }
      if (ordRes.ok) {
        const oData = await ordRes.json();
        setOrders(oData.orders || []);
        setSummary(oData.summary || {});
      }
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [activeCompany?.id]);

  useEffect(() => {
    fetchManufacturing();
  }, [fetchManufacturing]);

  const syncOrderFromBom = (bomIdStr: string, targetQtyStr: string) => {
    const bom = boms.find((b) => String(b.id) === String(bomIdStr));
    if (!bom) {
      setOrderConsumptions([]);
      return;
    }
    const baseOut = Number(bom.output_qty) > 0 ? Number(bom.output_qty) : 1;
    const tQty = Number(targetQtyStr) > 0 ? Number(targetQtyStr) : baseOut;
    const mult = tQty / baseOut;
    setOrderLaborCost((Number(bom.labor_cost || 0) * mult).toFixed(2));
    setOrderOverheadCost((Number(bom.overhead_cost || 0) * mult).toFixed(2));
    const lines = (bom.components || []).map((c: any) => {
      const req = Number((Number(c.effective_qty || c.qty_required || 0) * mult).toFixed(3));
      return {
        raw_item: c.raw_item,
        raw_item_name: c.raw_item_name,
        unit: c.unit || 'Nos',
        available_stock: Number(c.available_stock || 0),
        rate: Number(c.rate || 0),
        planned_qty: req,
        actual_qty: String(req),
      };
    });
    setOrderConsumptions(lines);
  };

  const openNewBomModal = () => {
    setErrorMsg('');
    setEditingBomId(null);
    setBomName('');
    setBomCode('');
    setFinishedItemId('');
    setOutputQty('1');
    setBomLaborCost('0');
    setBomOverheadCost('0');
    setBomNotes('');
    setBomComponents([{ raw_item: '', qty_required: '1', wastage_percent: '0' }]);
    setShowBomModal(true);
  };

  const openEditBomModal = (b: any) => {
    setErrorMsg('');
    setEditingBomId(b.id);
    setBomName(b.name || '');
    setBomCode(b.bom_code || '');
    setFinishedItemId(String(b.finished_item || ''));
    setOutputQty(String(b.output_qty || 1));
    setBomLaborCost(String(b.labor_cost || 0));
    setBomOverheadCost(String(b.overhead_cost || 0));
    setBomNotes(b.notes || '');
    setBomComponents(
      (b.components || []).length > 0
        ? b.components.map((c: any) => ({
            raw_item: String(c.raw_item),
            qty_required: String(c.qty_required),
            wastage_percent: String(c.wastage_percent || 0),
          }))
        : [{ raw_item: '', qty_required: '1', wastage_percent: '0' }]
    );
    setShowBomModal(true);
  };

  const openOrderForBom = (bom?: any) => {
    setErrorMsg('');
    setSuccessMsg('');
    const chosen = bom || boms[0];
    if (!chosen) {
      setErrorMsg('Please create at least one Bill of Materials (BOM) recipe first.');
      setSubTab('boms');
      return;
    }
    const defQty = String(chosen.output_qty || 1);
    setEditingOrderId(null);
    setEditingVoucherNo('');
    setSelectedBomId(String(chosen.id));
    setPostingDate(new Date().toISOString().slice(0, 10));
    setPlannedQty(defQty);
    setActualQty(defQty);
    setVoucherNo('');
    setScrapItemId('');
    setScrapQty('0');
    setScrapValue('0');
    setOrderRemarks('');
    syncOrderFromBom(String(chosen.id), defQty);
    setShowOrderModal(true);
  };

  const handleEditOrder = async (order: any) => {
    setErrorMsg('');
    setSuccessMsg('');
    let targetOrder = order;
    if (order.status === 'APPROVED') {
      if (!canApprove) {
        setErrorMsg('Only Admin or Manager can reopen & edit an approved production voucher.');
        return;
      }
      if (!window.confirm(`Reopen approved voucher ${order.voucher_no} to edit? Existing Stock & General Ledger entries for ${order.voucher_no} will be reversed until you approve it again.`)) {
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/manufacturing/orders/${order.id}/reopen/?company_id=${activeCompany?.id}`, {
          method: 'POST',
          headers: buildHeaders(),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to reopen production order');
        targetOrder = data;
        await fetchManufacturing();
        if (onRefreshData) onRefreshData();
      } catch (err) {
        setErrorMsg(getErrorMessage(err));
        return;
      }
    }

    setEditingOrderId(targetOrder.id);
    setEditingVoucherNo(targetOrder.voucher_no);
    setSelectedBomId(String(targetOrder.bom));
    setPostingDate(targetOrder.posting_date || new Date().toISOString().slice(0, 10));
    setVoucherNo(targetOrder.voucher_no || '');
    setPlannedQty(String(targetOrder.planned_qty || targetOrder.actual_qty || 1));
    setActualQty(String(targetOrder.actual_qty || 1));
    setOrderLaborCost(String(targetOrder.labor_cost || 0));
    setOrderOverheadCost(String(targetOrder.overhead_cost || 0));
    setScrapItemId(targetOrder.scrap_item ? String(targetOrder.scrap_item) : '');
    setScrapQty(String(targetOrder.scrap_qty || 0));
    setScrapValue(String(targetOrder.scrap_value || 0));
    setOrderRemarks(targetOrder.remarks || '');
    const lines = (targetOrder.consumptions || []).map((c: any) => {
      const liveItem = items.find((it) => Number(it.id) === Number(c.raw_item));
      return {
        raw_item: c.raw_item,
        raw_item_name: c.raw_item_name,
        unit: c.unit || 'Nos',
        available_stock: liveItem ? Number(liveItem.current_stock || 0) : Number(c.available_stock || 0),
        rate: Number(c.rate || 0),
        planned_qty: Number(c.planned_qty || c.actual_qty || 0),
        actual_qty: String(c.actual_qty || 0),
      };
    });
    setOrderConsumptions(lines);
    setViewOrder(null);
    setShowOrderModal(true);
  };

  const handleSaveBom = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const validComps = bomComponents
      .filter((c) => c.raw_item && Number(c.qty_required) > 0)
      .map((c) => ({
        raw_item: Number(c.raw_item),
        qty_required: Number(c.qty_required),
        wastage_percent: Number(c.wastage_percent || 0),
      }));
    if (!finishedItemId || validComps.length === 0) {
      setErrorMsg('Select a Finished Product and at least one Raw Material.');
      return;
    }
    try {
      const url = editingBomId
        ? `${API_BASE}/manufacturing/boms/${editingBomId}/?company_id=${activeCompany?.id}`
        : `${API_BASE}/manufacturing/boms/?company_id=${activeCompany?.id}`;
      const res = await fetch(url, {
        method: editingBomId ? 'PUT' : 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({
          company_id: activeCompany?.id,
          bom_code: bomCode,
          name: bomName,
          finished_item: Number(finishedItemId),
          output_qty: Number(outputQty || 1),
          labor_cost: Number(bomLaborCost || 0),
          overhead_cost: Number(bomOverheadCost || 0),
          notes: bomNotes,
          components: validComps,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save BOM');
      setShowBomModal(false);
      setEditingBomId(null);
      setSuccessMsg(`BOM ${data.bom_code} (${data.name}) saved successfully.`);
      fetchManufacturing();
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    }
  };

  const handleDeleteBom = async (id: number) => {
    if (!window.confirm('Delete this BOM recipe?')) return;
    try {
      const res = await fetch(`${API_BASE}/manufacturing/boms/${id}/?company_id=${activeCompany?.id}`, {
        method: 'DELETE',
        headers: buildHeaders(),
      });
      if (res.ok) {
        setSuccessMsg('BOM recipe removed.');
        fetchManufacturing();
      }
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    }
  };

  const submitProductionOrder = async (approveNow: boolean) => {
    setErrorMsg('');
    if (!selectedBomId || Number(actualQty) <= 0) {
      setErrorMsg('Select a valid BOM and enter produced quantity > 0.');
      return;
    }
    try {
      const url = editingOrderId
        ? `${API_BASE}/manufacturing/orders/${editingOrderId}/?company_id=${activeCompany?.id}`
        : `${API_BASE}/manufacturing/orders/?company_id=${activeCompany?.id}`;
      const res = await fetch(url, {
        method: editingOrderId ? 'PUT' : 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({
          company_id: activeCompany?.id,
          bom: Number(selectedBomId),
          voucher_no: voucherNo,
          posting_date: postingDate,
          planned_qty: Number(plannedQty || actualQty),
          actual_qty: Number(actualQty),
          labor_cost: Number(orderLaborCost || 0),
          overhead_cost: Number(orderOverheadCost || 0),
          scrap_item: scrapItemId ? Number(scrapItemId) : null,
          scrap_qty: Number(scrapQty || 0),
          scrap_value: Number(scrapValue || 0),
          remarks: orderRemarks,
          auto_approve: approveNow && canApprove,
          consumptions: orderConsumptions.map((c) => ({
            raw_item: c.raw_item,
            planned_qty: c.planned_qty,
            actual_qty: Number(c.actual_qty || 0),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Production order failed');
      setShowOrderModal(false);
      setEditingOrderId(null);
      setSuccessMsg(
        data.status === 'APPROVED'
          ? `Production ${data.voucher_no} approved & posted! Stock & General Ledger updated.`
          : `Production ${data.voucher_no} saved as PENDING for Approval.`
      );
      await fetchManufacturing();
      if (onRefreshData) onRefreshData();
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    }
  };

  const handleApproveOrder = async (id: number) => {
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE}/manufacturing/orders/${id}/approve/?company_id=${activeCompany?.id}`, {
        method: 'POST',
        headers: buildHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Approval failed');
      setSuccessMsg(`Production ${data.voucher_no} approved & posted to Stock and Ledger.`);
      setViewOrder(null);
      await fetchManufacturing();
      if (onRefreshData) onRefreshData();
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    }
  };

  const handleCancelOrder = async (id: number) => {
    if (!window.confirm('Cancel this pending production order?')) return;
    try {
      const res = await fetch(`${API_BASE}/manufacturing/orders/${id}/cancel/?company_id=${activeCompany?.id}`, {
        method: 'POST',
        headers: buildHeaders(),
      });
      if (res.ok) {
        setSuccessMsg('Production order cancelled.');
        setViewOrder(null);
        fetchManufacturing();
      }
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    }
  };

  const estRawTotal = orderConsumptions.reduce((acc, c) => acc + Number(c.actual_qty || 0) * Number(c.rate || 0), 0);
  const estNetTotal = Math.max(0, estRawTotal + Number(orderLaborCost || 0) + Number(orderOverheadCost || 0) - Number(scrapValue || 0));
  const estUnitCost = Number(actualQty) > 0 ? estNetTotal / Number(actualQty) : 0;
  const hasShortage = orderConsumptions.some((c) => Number(c.actual_qty || 0) > Number(c.available_stock || 0));
  const selectedBomObj = boms.find((b) => String(b.id) === String(selectedBomId));
  const fgUnitLower = String(selectedBomObj?.finished_item_unit || '').trim().toLowerCase();
  const sameUnitRawTotal = orderConsumptions.reduce((acc, c) => (String(c.unit || '').trim().toLowerCase() === fgUnitLower ? acc + Number(c.actual_qty || 0) : acc), 0);
  const scrapItemObj = items.find((it) => String(it.id) === String(scrapItemId));
  const sameUnitScrapQty = scrapItemObj && String(scrapItemObj.unit || '').trim().toLowerCase() === fgUnitLower ? Number(scrapQty || 0) : 0;
  const hasMassBalanceError = sameUnitRawTotal > 0 && (Number(actualQty || 0) + sameUnitScrapQty) > sameUnitRawTotal;
  const hasSelfItemError = Boolean(selectedBomObj && orderConsumptions.some((c) => Number(c.raw_item) === Number(selectedBomObj.finished_item)));
  const isOrderInvalid = hasShortage || hasMassBalanceError || hasSelfItemError;

  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Factory size={24} color="#0284c7" /> Production &amp; BOM
          </h1>
          <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>
            Bill of Materials (BOM), raw material consumption, scrap recovery &amp; auto-costing
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={fetchManufacturing}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}
          >
            <RefreshCw size={15} /> Refresh
          </button>
          <button
            onClick={openNewBomModal}
            style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #0284c7', background: '#f0f9ff', color: '#0369a1', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}
          >
            <Layers size={15} /> + New BOM Recipe
          </button>
          <button
            onClick={() => openOrderForBom()}
            style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#0f172a', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}
          >
            <Plus size={16} /> New Production Order
          </button>
        </div>
      </div>

      {errorMsg && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={16} /> {errorMsg}
        </div>
      )}
      {successMsg && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle size={16} /> {successMsg}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '18px' }}>
        <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Active BOM Recipes</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#0284c7', marginTop: '4px' }}>{boms.length}</div>
        </div>
        <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Approved Batches</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#16a34a', marginTop: '4px' }}>{summary.approved_orders || 0}</div>
        </div>
        <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Pending Approval</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#d97706', marginTop: '4px' }}>{summary.pending_orders || 0}</div>
        </div>
        <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Total Production Value</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>
            {symbol} {Number(summary.total_production_value || 0).toFixed(2)}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
        <button
          onClick={() => setSubTab('orders')}
          style={{
            padding: '7px 14px',
            borderRadius: '8px',
            border: 'none',
            background: subTab === 'orders' ? '#0f172a' : '#f1f5f9',
            color: subTab === 'orders' ? '#fff' : '#475569',
            fontWeight: 600,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Production Journal ({orders.length})
        </button>
        <button
          onClick={() => setSubTab('boms')}
          style={{
            padding: '7px 14px',
            borderRadius: '8px',
            border: 'none',
            background: subTab === 'boms' ? '#0f172a' : '#f1f5f9',
            color: subTab === 'boms' ? '#fff' : '#475569',
            fontWeight: 600,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Bill of Materials / Recipes ({boms.length})
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>Loading manufacturing data...</div>
      ) : subTab === 'orders' ? (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                <th style={{ padding: '12px' }}>Voucher #</th>
                <th style={{ padding: '12px' }}>Date</th>
                <th style={{ padding: '12px' }}>Finished Item (BOM)</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Produced Qty</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Net Cost</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Unit Cost</th>
                <th style={{ padding: '12px' }}>Status</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '28px', textAlign: 'center', color: '#94a3b8' }}>
                    No production orders yet. Create a BOM recipe first, then record your first batch.
                  </td>
                </tr>
              ) : (
                orders.map((o) => (
                  <tr key={o.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px', fontWeight: 700, color: '#0284c7', cursor: 'pointer' }} onClick={() => setViewOrder(o)}>
                      {o.voucher_no}
                    </td>
                    <td style={{ padding: '12px', color: '#475569' }}>{o.posting_date}</td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{o.finished_item_name}</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>
                        {o.bom_code} • {(o.consumptions || []).map((c: any) => `${c.raw_item_name} (${c.actual_qty} ${c.unit})`).join(', ')}
                      </div>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>
                      {o.actual_qty} {o.finished_item_unit}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                      {symbol} {Number(o.net_production_cost).toFixed(2)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#0284c7', fontWeight: 600 }}>
                      {symbol} {Number(o.unit_cost).toFixed(2)}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: o.status === 'APPROVED' ? '#dcfce7' : o.status === 'PENDING' ? '#fef3c7' : '#fee2e2',
                          color: o.status === 'APPROVED' ? '#15803d' : o.status === 'PENDING' ? '#b45309' : '#b91c1c',
                        }}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => setViewOrder(o)}
                          title="View Voucher & Ledger Entries"
                          style={{ padding: '4px 9px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Eye size={13} /> Voucher
                        </button>
                        {o.status !== 'CANCELLED' && (
                          <button
                            onClick={() => handleEditOrder(o)}
                            title={o.status === 'APPROVED' ? 'Reopen & Edit' : 'Edit Order'}
                            style={{ padding: '4px 9px', borderRadius: '6px', border: '1px solid #bae6fd', background: '#f0f9ff', color: '#0369a1', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Edit2 size={13} /> Edit
                          </button>
                        )}
                        {o.status === 'PENDING' && canApprove && (
                          <>
                            <button
                              onClick={() => handleApproveOrder(o.id)}
                              style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: '#16a34a', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleCancelOrder(o.id)}
                              style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', fontSize: '12px', cursor: 'pointer' }}
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {boms.length === 0 ? (
            <div style={{ background: '#fff', padding: '32px', borderRadius: '12px', border: '1px solid #e2e8f0', textAlign: 'center', color: '#94a3b8', gridColumn: '1 / -1' }}>
              No BOM recipes configured yet. Click "+ New BOM Recipe" to define raw materials for your products.
            </div>
          ) : (
            boms.map((b) => (
              <div key={b.id} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#0284c7', background: '#e0f2fe', padding: '2px 8px', borderRadius: '6px' }}>
                        {b.bom_code}
                      </span>
                      <h3 style={{ margin: '6px 0 2px', fontSize: '16px', color: '#0f172a' }}>{b.name}</h3>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        Produces: <strong>{b.output_qty} {b.finished_item_unit}</strong> of {b.finished_item_name}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => openEditBomModal(b)}
                        title="Edit BOM"
                        style={{ background: 'transparent', border: 'none', color: '#0284c7', cursor: 'pointer', padding: '4px' }}
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => handleDeleteBom(b.id)}
                        title="Delete BOM"
                        style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>RAW MATERIALS:</div>
                    {(b.components || []).map((c: any) => (
                      <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '3px 0', color: '#334155' }}>
                        <span>
                          {c.raw_item_name} ({c.qty_required} {c.unit}{Number(c.wastage_percent) > 0 ? ` + ${c.wastage_percent}% loss` : ''})
                        </span>
                        <span style={{ color: Number(c.available_stock) >= Number(c.effective_qty) ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                          Stock: {c.available_stock} {c.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '12px' }}>
                    <div style={{ color: '#64748b' }}>
                      Est. Unit Cost: <strong style={{ color: '#0f172a' }}>{symbol} {Number(b.unit_cost).toFixed(2)}</strong>
                    </div>
                    <div style={{ color: Number(b.max_producible_qty) > 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                      Max Producible: {b.max_producible_qty} {b.finished_item_unit}
                    </div>
                  </div>
                  <button
                    onClick={() => openOrderForBom(b)}
                    style={{ padding: '7px 12px', borderRadius: '8px', border: 'none', background: '#0284c7', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                  >
                    <Play size={13} /> Produce
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* VIEW VOUCHER MODAL (STOCK + GENERAL LEDGER PROOF) */}
      {viewOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '820px', maxHeight: '92vh', overflowY: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px', marginBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>Manufacturing Voucher: {viewOrder.voucher_no}</h2>
                  <span
                    style={{
                      padding: '3px 10px',
                      borderRadius: '999px',
                      fontSize: '11px',
                      fontWeight: 700,
                      background: viewOrder.status === 'APPROVED' ? '#dcfce7' : viewOrder.status === 'PENDING' ? '#fef3c7' : '#fee2e2',
                      color: viewOrder.status === 'APPROVED' ? '#15803d' : viewOrder.status === 'PENDING' ? '#b45309' : '#b91c1c',
                    }}
                  >
                    {viewOrder.status}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  Date: <strong>{viewOrder.posting_date}</strong> • BOM: <strong>{viewOrder.bom_code} ({viewOrder.bom_name})</strong> • Created by: {viewOrder.created_by || 'Admin'}
                  {viewOrder.approved_by ? ` • Approved by: ${viewOrder.approved_by}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => window.print()}
                  style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  <Printer size={14} /> Print
                </button>
                <button onClick={() => setViewOrder(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}>
                  <XCircle size={22} />
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '16px', fontSize: '12px' }}>
              <div>
                <div style={{ color: '#64748b' }}>Finished Product</div>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '14px' }}>{viewOrder.finished_item_name}</div>
                <div style={{ color: '#0284c7', fontWeight: 600 }}>Qty: {viewOrder.actual_qty} {viewOrder.finished_item_unit}</div>
              </div>
              <div>
                <div style={{ color: '#64748b' }}>Raw Material Cost</div>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>{symbol} {Number(viewOrder.total_raw_cost).toFixed(2)}</div>
              </div>
              <div>
                <div style={{ color: '#64748b' }}>Labour + Overheads</div>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>
                  {symbol} {(Number(viewOrder.labor_cost) + Number(viewOrder.overhead_cost)).toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ color: '#64748b' }}>Scrap Recovery</div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#16a34a' }}>
                  - {symbol} {Number(viewOrder.scrap_value).toFixed(2)}
                </div>
                {viewOrder.scrap_item_name && <div style={{ fontSize: '11px', color: '#64748b' }}>{viewOrder.scrap_item_name} ({viewOrder.scrap_qty})</div>}
              </div>
              <div>
                <div style={{ color: '#64748b' }}>Net Cost / Unit Rate</div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>{symbol} {Number(viewOrder.net_production_cost).toFixed(2)}</div>
                <div style={{ color: '#0284c7', fontWeight: 700 }}>@ {symbol} {Number(viewOrder.unit_cost).toFixed(2)} / {viewOrder.finished_item_unit}</div>
              </div>
            </div>

            <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: '#0f172a' }}>1. Raw Materials Consumed</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '16px', border: '1px solid #e2e8f0' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '8px 10px' }}>Item</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Planned Qty</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Actual Consumed</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Rate ({symbol})</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Amount ({symbol})</th>
                </tr>
              </thead>
              <tbody>
                {(viewOrder.consumptions || []).map((c: any) => (
                  <tr key={c.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>{c.raw_item_name}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{c.planned_qty} {c.unit}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{c.actual_qty} {c.unit}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{Number(c.rate).toFixed(2)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{Number(c.amount).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: '#0f172a' }}>2. Stock Movement Voucher Entries ({(viewOrder.stock_entries || []).length})</h4>
            {(viewOrder.stock_entries || []).length === 0 ? (
              <div style={{ padding: '10px 12px', background: '#fefce8', border: '1px solid #fef08a', borderRadius: '8px', fontSize: '12px', color: '#854d0e', marginBottom: '16px' }}>
                Order is currently <strong>{viewOrder.status}</strong>. Stock movement vouchers will be generated automatically once approved.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '16px', border: '1px solid #e2e8f0' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', textAlign: 'left', color: '#475569' }}>
                    <th style={{ padding: '8px 10px' }}>Movement Type</th>
                    <th style={{ padding: '8px 10px' }}>Item</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>In / Out Qty</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Valuation Rate</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Closing Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {viewOrder.stock_entries.map((s: any) => (
                    <tr key={s.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 600 }}>{s.voucher_type}</td>
                      <td style={{ padding: '8px 10px' }}>{s.item_name}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: Number(s.actual_qty) >= 0 ? '#16a34a' : '#dc2626' }}>
                        {Number(s.actual_qty) >= 0 ? `+${s.actual_qty}` : s.actual_qty} {s.unit}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>{symbol} {Number(s.valuation_rate).toFixed(2)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{s.qty_after_transaction} {s.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: '#0f172a' }}>3. General Ledger Accounting Voucher ({(viewOrder.gl_entries || []).length})</h4>
            {(viewOrder.gl_entries || []).length === 0 ? (
              <div style={{ padding: '10px 12px', background: '#fefce8', border: '1px solid #fef08a', borderRadius: '8px', fontSize: '12px', color: '#854d0e', marginBottom: '16px' }}>
                Accounting double-entry will post to General Ledger upon Approval.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '16px', border: '1px solid #e2e8f0' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', textAlign: 'left', color: '#475569' }}>
                    <th style={{ padding: '8px 10px' }}>Ledger Account</th>
                    <th style={{ padding: '8px 10px' }}>Against</th>
                    <th style={{ padding: '8px 10px' }}>Narration</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Debit ({symbol})</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Credit ({symbol})</th>
                  </tr>
                </thead>
                <tbody>
                  {viewOrder.gl_entries.map((g: any) => (
                    <tr key={g.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0f172a' }}>{g.account}</td>
                      <td style={{ padding: '8px 10px', color: '#64748b' }}>{g.against}</td>
                      <td style={{ padding: '8px 10px', color: '#64748b' }}>{g.remarks}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: Number(g.debit) > 0 ? '#0f172a' : '#94a3b8' }}>
                        {Number(g.debit) > 0 ? Number(g.debit).toFixed(2) : '-'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: Number(g.credit) > 0 ? '#0f172a' : '#94a3b8' }}>
                        {Number(g.credit) > 0 ? Number(g.credit).toFixed(2) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '14px' }}>
              {viewOrder.status !== 'CANCELLED' && (
                <button
                  onClick={() => handleEditOrder(viewOrder)}
                  style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #0284c7', background: '#f0f9ff', color: '#0369a1', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
                >
                  {viewOrder.status === 'APPROVED' ? 'Reopen & Edit Voucher' : 'Edit Order'}
                </button>
              )}
              {viewOrder.status === 'PENDING' && canApprove && (
                <button
                  onClick={() => handleApproveOrder(viewOrder.id)}
                  style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#16a34a', color: '#fff', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
                >
                  Approve &amp; Post Voucher
                </button>
              )}
              <button
                onClick={() => setViewOrder(null)}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT BOM MODAL */}
      {showBomModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto', padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>
                {editingBomId ? 'Edit Bill of Materials (BOM Recipe)' : 'Create Bill of Materials (BOM Recipe)'}
              </h2>
              <button onClick={() => setShowBomModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}>
                <XCircle size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveBom}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Finished Product *</label>
                  <select
                    required
                    value={finishedItemId}
                    onChange={(e) => {
                      setFinishedItemId(e.target.value);
                      const it = items.find((x) => String(x.id) === e.target.value);
                      if (it && !bomName) setBomName(`${it.item_name} Standard BOM`);
                    }}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  >
                    <option value="">-- Select Finished Item --</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.item_name} ({it.unit}) — Stock: {it.current_stock}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Recipe / BOM Name *</label>
                  <input
                    required
                    value={bomName}
                    onChange={(e) => setBomName(e.target.value)}
                    placeholder="e.g. Brass Rod 12mm Batch"
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Batch Output Quantity *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={outputQty}
                    onChange={(e) => setOutputQty(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>BOM Code (Optional)</label>
                  <input
                    value={bomCode}
                    onChange={(e) => setBomCode(e.target.value)}
                    placeholder="Auto: BOM-001"
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Direct Labour Cost / Batch ({symbol})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={bomLaborCost}
                    onChange={(e) => setBomLaborCost(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Factory Overhead / Batch ({symbol})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={bomOverheadCost}
                    onChange={(e) => setBomOverheadCost(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ marginTop: '14px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Raw Material Components</span>
                  <button
                    type="button"
                    onClick={() => setBomComponents([...bomComponents, { raw_item: '', qty_required: '1', wastage_percent: '0' }])}
                    style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #0284c7', background: '#f0f9ff', color: '#0369a1', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    + Add Material
                  </button>
                </div>
                {bomComponents.map((comp, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                    <select
                      required
                      value={comp.raw_item}
                      onChange={(e) => {
                        const copy = [...bomComponents];
                        copy[idx].raw_item = e.target.value;
                        setBomComponents(copy);
                      }}
                      style={{ padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                    >
                      <option value="">-- Raw Material --</option>
                      {items.filter((it) => String(it.id) !== String(finishedItemId)).map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.item_name} ({it.unit}) — Rate: {symbol}{it.standard_rate}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      required
                      placeholder="Qty"
                      value={comp.qty_required}
                      onChange={(e) => {
                        const copy = [...bomComponents];
                        copy[idx].qty_required = e.target.value;
                        setBomComponents(copy);
                      }}
                      style={{ padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Wastage %"
                      value={comp.wastage_percent}
                      onChange={(e) => {
                        const copy = [...bomComponents];
                        copy[idx].wastage_percent = e.target.value;
                        setBomComponents(copy);
                      }}
                      style={{ padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                    />
                    {bomComponents.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setBomComponents(bomComponents.filter((_, i) => i !== idx))}
                        style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {finishedItemId && bomComponents.some((c) => c.raw_item === finishedItemId) && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#b45309', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', marginTop: '8px' }}>
                  Note: Finished Product and Raw Material are the same item. For accurate costing, use separate items for Raw Material and Finished Goods.
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button type="button" onClick={() => setShowBomModal(false)} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#0f172a', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                  {editingBomId ? 'Update BOM Recipe' : 'Save BOM Recipe'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE / EDIT PRODUCTION ORDER MODAL */}
      {showOrderModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '760px', maxHeight: '92vh', overflowY: 'auto', padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>
                {editingOrderId ? `Edit Production Order (${editingVoucherNo})` : 'Record Production Order (Manufacturing Journal)'}
              </h2>
              <button onClick={() => setShowOrderModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}>
                <XCircle size={20} />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); submitProductionOrder(false); }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>BOM Recipe *</label>
                  <select
                    required
                    value={selectedBomId}
                    onChange={(e) => {
                      setSelectedBomId(e.target.value);
                      const b = boms.find((x) => String(x.id) === e.target.value);
                      const q = String(b?.output_qty || 1);
                      setPlannedQty(q);
                      setActualQty(q);
                      syncOrderFromBom(e.target.value, q);
                    }}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  >
                    {boms.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bom_code} — {b.finished_item_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Posting Date *</label>
                  <input
                    type="date"
                    required
                    value={postingDate}
                    onChange={(e) => setPostingDate(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Actual Produced Qty *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={actualQty}
                    onChange={(e) => {
                      setActualQty(e.target.value);
                      setPlannedQty(e.target.value);
                      syncOrderFromBom(selectedBomId, e.target.value);
                    }}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', fontWeight: 700 }}
                  />
                </div>
              </div>

              <div style={{ marginTop: '12px', marginBottom: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ background: '#f8fafc', padding: '8px 12px', fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                  Raw Material Consumption (Auto-scaled from BOM — editable for actual floor usage)
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                      <th style={{ padding: '8px 12px' }}>Raw Material</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Available Stock</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Actual Consume Qty</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Cost ({symbol})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderConsumptions.map((c, idx) => {
                      const short = Number(c.actual_qty || 0) > Number(c.available_stock || 0);
                      return (
                        <tr key={c.raw_item} style={{ borderBottom: '1px solid #f1f5f9', background: short ? '#fef2f2' : '#fff' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600 }}>{c.raw_item_name}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: short ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                            {c.available_stock} {c.unit}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                            <input
                              type="number"
                              step="0.001"
                              min="0.001"
                              required
                              value={c.actual_qty}
                              onChange={(e) => {
                                const copy = [...orderConsumptions];
                                copy[idx].actual_qty = e.target.value;
                                setOrderConsumptions(copy);
                              }}
                              style={{ width: '90px', padding: '4px 6px', borderRadius: '5px', border: '1px solid #cbd5e1', textAlign: 'right' }}
                            />{' '}
                            {c.unit}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>
                            {symbol} {(Number(c.actual_qty || 0) * Number(c.rate || 0)).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Direct Labour ({symbol})</label>
                  <input type="number" step="0.01" min="0" value={orderLaborCost} onChange={(e) => setOrderLaborCost(e.target.value)} style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Factory Overheads ({symbol})</label>
                  <input type="number" step="0.01" min="0" value={orderOverheadCost} onChange={(e) => setOrderOverheadCost(e.target.value)} style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Scrap Item (Optional)</label>
                  <select value={scrapItemId} onChange={(e) => setScrapItemId(e.target.value)} style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}>
                    <option value="">-- None --</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>{it.item_name} ({it.unit})</option>
                    ))}
                  </select>
                </div>
                {scrapItemId && (
                  <>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Scrap Recovered Qty</label>
                      <input type="number" step="0.01" min="0" value={scrapQty} onChange={(e) => setScrapQty(e.target.value)} style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Scrap Recovery Value ({symbol})</label>
                      <input type="number" step="0.01" min="0" value={scrapValue} onChange={(e) => setScrapValue(e.target.value)} style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }} />
                    </div>
                  </>
                )}
              </div>

              <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '12px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', fontSize: '13px' }}>
                <span>Raw Material: <strong>{symbol} {estRawTotal.toFixed(2)}</strong></span>
                <span>Net Production Cost: <strong>{symbol} {estNetTotal.toFixed(2)}</strong></span>
                <span style={{ color: '#0369a1' }}>Finished Unit Cost: <strong>{symbol} {estUnitCost.toFixed(2)}</strong></span>
              </div>

              {hasShortage && (
                <div style={{ marginTop: '10px', color: '#dc2626', fontSize: '12px', fontWeight: 600 }}>
                  Warning: One or more raw materials have insufficient stock!
                </div>
              )}
              {hasMassBalanceError && (
                <div style={{ marginTop: '10px', color: '#dc2626', fontSize: '12px', fontWeight: 600 }}>
                  Validation Error: Produced Qty ({actualQty}) + Scrap Qty ({sameUnitScrapQty}) cannot be greater than Raw Material Consumed ({sameUnitRawTotal})!
                </div>
              )}
              {hasSelfItemError && (
                <div style={{ marginTop: '10px', color: '#dc2626', fontSize: '12px', fontWeight: 600 }}>
                  Validation Error: Finished Product and Raw Material cannot be the same item!
                </div>
              )}
              {hasMassBalanceError && (
                <div style={{ marginTop: '10px', color: '#dc2626', fontSize: '12px', fontWeight: 600 }}>
                  Validation Error: Produced Qty ({actualQty}) + Scrap Qty ({sameUnitScrapQty}) cannot be greater than Raw Material Consumed ({sameUnitRawTotal})!
                </div>
              )}
              {hasSelfItemError && (
                <div style={{ marginTop: '10px', color: '#dc2626', fontSize: '12px', fontWeight: 600 }}>
                  Validation Error: Finished Product and Raw Material cannot be the same item!
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => setShowOrderModal(false)} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={hasMassBalanceError || hasSelfItemError}
                  style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #d97706', background: (hasMassBalanceError || hasSelfItemError) ? '#f1f5f9' : '#fffbeb', color: (hasMassBalanceError || hasSelfItemError) ? '#94a3b8' : '#b45309', fontWeight: 600, cursor: (hasMassBalanceError || hasSelfItemError) ? 'not-allowed' : 'pointer' }}
                >
                  Save as Pending
                </button>
                {canApprove && (
                  <button
                    type="button"
                    disabled={isOrderInvalid}
                    onClick={() => submitProductionOrder(true)}
                    style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: isOrderInvalid ? '#94a3b8' : '#0f172a', color: '#fff', fontWeight: 600, cursor: isOrderInvalid ? 'not-allowed' : 'pointer' }}
                  >
                    Post &amp; Approve Production
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
