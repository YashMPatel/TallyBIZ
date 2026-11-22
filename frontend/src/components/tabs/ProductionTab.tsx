import React, { useState, useEffect, useCallback } from 'react';
import { Factory, Plus, CheckCircle, XCircle, AlertTriangle, Layers, Trash2, RefreshCw, Eye, Edit2 } from 'lucide-react';
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

  const [subTab, setSubTab] = useState<'orders' | 'boms' | 'requests' | 'jobwork'>('orders');
  const [salesRequests, setSalesRequests] = useState<any[]>([]);
  const [jobWorkInvoices, setJobWorkInvoices] = useState<any[]>([]);
  const [planReqTarget, setPlanReqTarget] = useState<any | null>(null);
  const [inhouseQtyInput, setInhouseQtyInput] = useState<string>('0');
  const [outsourceQtyInput, setOutsourceQtyInput] = useState<string>('0');
  const [planBusy, setPlanBusy] = useState(false);
  const [schedModalReq, setSchedModalReq] = useState<any | null>(null);
  const [schedRows, setSchedRows] = useState<Array<{ id?: string; date: string; qty: string; challan_no?: string; vehicle_no?: string; dispatch_notes?: string; status?: string; dispatch_no?: string; invoiced?: boolean; invoice_no?: string }>>([]);
  const [reqRmPurchase, setReqRmPurchase] = useState<boolean>(true);
  const [schedBusy, setSchedBusy] = useState<boolean>(false);
  const [dispatchingBatchId, setDispatchingBatchId] = useState<string | null>(null);

  const openScheduleModal = (req: any) => {
    setSchedModalReq(req);
    const existing = req.delivery_schedule || [];
    if (existing.length > 0) {
      setSchedRows(existing.map((x: any) => ({ ...x, qty: String(x.qty) })));
    } else {
      const today = new Date().toISOString().split('T')[0];
      setSchedRows([{ date: today, qty: String(req.requested_qty) }]);
    }
    setReqRmPurchase(true);
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedModalReq) return;
    setSchedBusy(true);
    setErrorMsg('');
    try {
      const compId = localStorage.getItem('active_company_id') || '';
      const res = await fetch(`${API_BASE}/manufacturing/sales-requests/${schedModalReq.id}/schedule/?company_id=${compId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Username': user?.username || 'Manufacturing Manager' },
        body: JSON.stringify({ schedule: schedRows, request_rm_purchase: reqRmPurchase }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save schedule');
      setSchedModalReq(null);
      setSuccessMsg(`Date-wise delivery schedule submitted for ${schedModalReq.sales_ref || schedModalReq.request_no}! Sales can now see it live.`);
      if (onRefreshData) onRefreshData();
      window.location.reload();
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setSchedBusy(false);
    }
  };

  const handleDispatchBatch = async (reqId: number, batchId: string) => {
    setDispatchingBatchId(batchId);
    setErrorMsg('');
    try {
      const compId = localStorage.getItem('active_company_id') || '';
      const res = await fetch(`${API_BASE}/manufacturing/sales-requests/${reqId}/dispatch/?company_id=${compId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id: batchId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to dispatch batch');
      setSuccessMsg(`Dispatched ${data.dispatched_qty} units (Challan ${data.dispatch_no}) to Sales! Sales can now generate 1-Click Invoice.`);
      window.location.reload();
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setDispatchingBatchId(null);
    }
  };
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
  const [orderLaborRate, setOrderLaborRate] = useState<string>('0');
  const [orderOverheadRate, setOrderOverheadRate] = useState<string>('0');
  const [orderLaborCost, setOrderLaborCost] = useState<string>('0');
  const [orderOverheadCost, setOrderOverheadCost] = useState<string>('0');
  const [scrapItemId, setScrapItemId] = useState<string>('');
  const [scrapQty, setScrapQty] = useState<string>('0');
  const [scrapValue, setScrapValue] = useState<string>('0');
  const [orderType, setOrderType] = useState<'OWN' | 'JOB_WORK'>('OWN');
  const [orderPartyName, setOrderPartyName] = useState('');
  const [orderPartyChallan, setOrderPartyChallan] = useState('');
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
      const [bomRes, ordRes, reqRes, jwRes] = await Promise.all([
        fetch(`${API_BASE}/manufacturing/boms/?company_id=${activeCompany.id}`),
        fetch(`${API_BASE}/manufacturing/orders/?company_id=${activeCompany.id}`),
        fetch(`${API_BASE}/manufacturing/sales-requests/?company_id=${activeCompany.id}`),
        fetch(`${API_BASE}/selling/invoices/?company_id=${activeCompany.id}&unit_id=all`, { headers: { 'X-Unit-Id': 'all' } }),
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
      if (reqRes.ok) {
        const rData = await reqRes.json();
        setSalesRequests(Array.isArray(rData) ? rData : []);
      }
      if (jwRes.ok) {
        const jData = await jwRes.json();
        const list = Array.isArray(jData) ? jData : (jData.results || []);
        setJobWorkInvoices(list.filter((inv: any) => inv.invoice_type === 'JOB_WORK'));
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

  const syncOrderFromBom = (bomIdStr: string, targetQtyStr: string, customLaborRate?: string, customOhRate?: string) => {
    const bom = boms.find((b) => String(b.id) === String(bomIdStr));
    if (!bom) {
      setOrderConsumptions([]);
      return;
    }
    const baseOut = Number(bom.output_qty) > 0 ? Number(bom.output_qty) : 1;
    const tQty = Number(targetQtyStr) > 0 ? Number(targetQtyStr) : baseOut;
    const mult = tQty / baseOut;
    const lRate = customLaborRate !== undefined ? Number(customLaborRate) : Number(bom.labor_cost || 0);
    const oRate = customOhRate !== undefined ? Number(customOhRate) : Number(bom.overhead_cost || 0);
    if (customLaborRate === undefined) setOrderLaborRate(String(lRate));
    if (customOhRate === undefined) setOrderOverheadRate(String(oRate));
    setOrderLaborCost((lRate * tQty).toFixed(2));
    setOrderOverheadCost((oRate * tQty).toFixed(2));
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

  const openOrderForBom = (bomOrId?: any) => {
    setErrorMsg('');
    setSuccessMsg('');
    const resolvedBom =
      bomOrId && typeof bomOrId === 'object'
        ? boms.find((x) => String(x.id) === String(bomOrId.id)) || bomOrId
        : bomOrId !== undefined && bomOrId !== null
        ? boms.find((x) => String(x.id) === String(bomOrId))
        : boms[0];
    const chosen = resolvedBom;
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
    const editQty = Number(targetOrder.actual_qty || 1) || 1;
    setOrderLaborRate((Number(targetOrder.labor_cost || 0) / editQty).toFixed(2));
    setOrderOverheadRate((Number(targetOrder.overhead_cost || 0) / editQty).toFixed(2));
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
        available_stock: c.available_stock !== undefined ? Number(c.available_stock) : (liveItem ? Number(liveItem.current_stock || 0) : 0),
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
          order_type: orderType,
          party_name: orderType === 'JOB_WORK' ? orderPartyName : '',
          party_challan_no: orderType === 'JOB_WORK' ? orderPartyChallan : '',
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
  const unaccountedLoss = sameUnitRawTotal > 0 ? Math.max(0, Number((sameUnitRawTotal - (Number(actualQty || 0) + sameUnitScrapQty)).toFixed(3))) : 0;
  const bomStdUnitCost = Number(selectedBomObj?.unit_cost || 0);
  const hasAbnormalCostSpike = bomStdUnitCost > 0 && estUnitCost > bomStdUnitCost * 1.5;

  void viewOrder; void openEditBomModal; void handleDeleteBom;
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
        <button
          onClick={() => setSubTab('requests')}
          style={{
            padding: '7px 14px',
            borderRadius: '8px',
            border: 'none',
            background: subTab === 'requests' ? '#7c3aed' : '#f3e8ff',
            color: subTab === 'requests' ? '#fff' : '#6b21a8',
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Incoming Sales Requests ({salesRequests.length}) {salesRequests.filter((r) => r.status === 'PENDING_MFG').length > 0 ? `• ${salesRequests.filter((r) => r.status === 'PENDING_MFG').length} New` : ''}
        </button>
        <button
          onClick={() => setSubTab('jobwork')}
          style={{
            padding: '7px 14px',
            borderRadius: '8px',
            border: 'none',
            background: subTab === 'jobwork' ? '#0284c7' : '#e0f2fe',
            color: subTab === 'jobwork' ? '#fff' : '#0369a1',
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Job Work Orders — SAC 9988 ({jobWorkInvoices.length + orders.filter((o) => o.order_type === 'JOB_WORK').length})
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
      ) : subTab === 'boms' ? (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                <th style={{ padding: '12px' }}>BOM Code</th>
                <th style={{ padding: '12px' }}>Recipe Name</th>
                <th style={{ padding: '12px' }}>Finished Item</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Output Qty</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Raw Cost</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Unit Cost</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {boms.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>No BOM recipes found.</td></tr>
              ) : boms.map((b: any) => (
                <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px', fontWeight: 700, color: '#0284c7' }}>{b.bom_code}</td>
                  <td style={{ padding: '12px', fontWeight: 600 }}>{b.name}</td>
                  <td style={{ padding: '12px' }}>{b.finished_item_name} ({b.finished_item_unit})</td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>{b.output_qty}</td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>₹{Number(b.raw_material_cost || 0).toFixed(2)}</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700 }}>₹{Number(b.unit_cost || 0).toFixed(2)}</td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '6px' }}>
                      <button onClick={() => openOrderForBom(b.id)} style={{ padding: '4px 9px', borderRadius: '6px', border: 'none', background: '#0f172a', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>+ Order</button>
                      <button onClick={() => openEditBomModal(b)} style={{ padding: '4px 9px', borderRadius: '6px', border: '1px solid #bae6fd', background: '#f0f9ff', color: '#0369a1', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Edit</button>
                      <button onClick={() => handleDeleteBom(b.id)} style={{ padding: '4px 9px', borderRadius: '6px', border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', fontSize: '12px', cursor: 'pointer' }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : subTab === 'requests' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {salesRequests.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '28px', textAlign: 'center', color: '#64748b' }}>
              No incoming sales orders yet. Orders submitted from Sales appear here automatically.
            </div>
          ) : (
            salesRequests.map((r: any) => {
              const schedule: any[] = r.delivery_schedule || [];
              const raw = r.raw_material || {};
              return (
                <div key={r.id} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, color: '#7c3aed', fontSize: '15px' }}>{r.sales_ref || r.request_no}</span>
                        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>({r.request_no})</span>
                        <span style={{
                          padding: '3px 9px',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: r.order_type === 'JOB_WORK' ? '#e0f2fe' : '#f1f5f9',
                          color: r.order_type === 'JOB_WORK' ? '#0369a1' : '#334155',
                        }}>
                          {r.order_type === 'JOB_WORK' ? 'JOB WORK (SAC 9988)' : 'OWN PRODUCTION'}
                        </span>
                        {r.party_challan_no ? (
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#0369a1' }}>• Challan: {r.party_challan_no}</span>
                        ) : null}
                        {r.existing_invoice_no ? (
                          <span style={{ padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, background: '#dcfce7', color: '#166534' }}>
                            Pre-Invoiced: {r.existing_invoice_no} (Dispatch Only)
                          </span>
                        ) : null}
                        <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '14px' }}>• Party: {r.customer_name || 'Customer'}</span>
                        <span style={{ padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, background: r.status === 'COMPLETED' ? '#dcfce7' : r.status === 'PENDING_MFG' ? '#fef3c7' : '#e0f2fe', color: r.status === 'COMPLETED' ? '#166534' : r.status === 'PENDING_MFG' ? '#92400e' : '#0369a1' }}>
                          {r.status}
                        </span>
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginTop: '6px' }}>
                        {r.finished_item_name} ({r.finished_item_code}) — Ordered: {r.requested_qty} {r.finished_unit || 'Nos'}
                        {r.finished_hsn ? <span style={{ marginLeft: '8px', fontSize: '12px', color: '#0369a1' }}>HSN: {r.finished_hsn}</span> : null}
                      </div>
                      <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
                        Order Date: {r.posting_date}
                        {r.selling_rate > 0 ? ` • Sell Rate: ${symbol}${r.selling_rate}` : ''}
                        {raw.raw_item_name ? ` • Raw Material: ${raw.raw_qty} ${raw.raw_unit} ${raw.raw_item_name} (@ ${symbol}${raw.raw_purchase_rate})` : ''}
                        {r.notes ? ` • Notes: ${r.notes}` : ''}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => openScheduleModal(r)}
                        style={{ background: '#7c3aed', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                      >
                        {schedule.length > 0 ? 'Edit Date-Wise Schedule' : '+ Submit Date-Wise Delivery Schedule'}
                      </button>
                    </div>
                  </div>

                  {schedule.length > 0 && (
                    <div style={{ marginTop: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '12px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '8px', textTransform: 'uppercase' }}>
                        Date-Wise Production &amp; Dispatch Plan (Visible to Sales)
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {schedule.map((b: any) => (
                          <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', background: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '13px' }}>
                              <strong>Delivery Date: {b.date}</strong> — Batch Qty: <strong>{b.qty} {r.finished_unit || 'Nos'}</strong>
                              {b.vehicle_no ? <span style={{ marginLeft: '8px', fontSize: '12px', fontWeight: 600, color: '#0369a1' }}>• Vehicle: {b.vehicle_no}</span> : null}
                              {b.dispatch_notes ? <span style={{ marginLeft: '8px', fontSize: '12px', color: '#475569' }}>• {b.dispatch_notes}</span> : null}
                              {b.dispatch_no ? <span style={{ marginLeft: '10px', fontSize: '12px', fontWeight: 700, color: '#15803d' }}>Challan: {b.dispatch_no}</span> : null}
                            </div>
                            <div>
                              {b.status === 'DISPATCHED' ? (
                                <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, background: '#dcfce7', color: '#166534' }}>
                                  Dispatched to Sales {b.invoiced ? `• Invoiced (${b.invoice_no})` : '• Ready for Sales Invoice'}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={dispatchingBatchId === b.id}
                                  onClick={() => handleDispatchBatch(r.id, b.id)}
                                  style={{ background: '#059669', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                                >
                                  {dispatchingBatchId === b.id ? 'Dispatching...' : `Dispatch ${b.qty} ${r.finished_unit || 'Nos'} to Sales`}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : subTab === 'jobwork' ? (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #bae6fd', overflowX: 'auto' }}>
          <div style={{ padding: '14px 18px', background: '#f0f9ff', borderBottom: '1px solid #bae6fd', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <strong style={{ color: '#0c4a6e', fontSize: '14px' }}>Job Work Processing Register (SAC 9988 — Party-Supplied Material)</strong>
              <div style={{ fontSize: '12px', color: '#0369a1', marginTop: '2px' }}>
                All Job Work labour orders &amp; invoices — processed without deducting own raw/finished inventory
              </div>
            </div>
            <div style={{ fontWeight: 800, color: '#0284c7', fontSize: '15px' }}>
              Total Job Work Labour: {symbol} {jobWorkInvoices.reduce((s, j) => s + Number(j.net_total || 0), 0).toFixed(2)}
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                <th style={{ padding: '12px' }}>Voucher / Invoice #</th>
                <th style={{ padding: '12px' }}>Date</th>
                <th style={{ padding: '12px' }}>Party Challan #</th>
                <th style={{ padding: '12px' }}>Customer / Party</th>
                <th style={{ padding: '12px' }}>Processed Item &amp; Qty</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>SAC</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Labour Charges</th>
                <th style={{ padding: '12px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {jobWorkInvoices.length === 0 && orders.filter((o) => o.order_type === 'JOB_WORK').length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                    No Job Work orders recorded yet.
                  </td>
                </tr>
              ) : (
                <>
                  {jobWorkInvoices.map((jw: any) => (
                    <tr key={`inv-${jw.id}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px', fontWeight: 700, color: '#0284c7' }}>{jw.invoice_number}</td>
                      <td style={{ padding: '12px', color: '#475569' }}>{jw.posting_date}</td>
                      <td style={{ padding: '12px', fontWeight: 600, color: '#334155' }}>{jw.party_challan_no || '-'}</td>
                      <td style={{ padding: '12px', fontWeight: 600, color: '#0f172a' }}>{jw.customer_name}</td>
                      <td style={{ padding: '12px', color: '#334155' }}>
                        {Array.isArray(jw.items) && jw.items.length > 0
                          ? jw.items.map((it: any) => `${it.item_name || 'Item'} — ${it.quantity} @ ${symbol}${it.rate}`).join(', ')
                          : 'Job Work Service'}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 700 }}>
                          {(jw.items && jw.items[0]?.hsn_code) || '9988'}
                        </span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                        {symbol} {Number(jw.net_total || 0).toFixed(2)}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: jw.status === 'Approved' ? '#dcfce7' : '#fef3c7',
                          color: jw.status === 'Approved' ? '#166534' : '#92400e',
                        }}>
                          {jw.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {orders.filter((o) => o.order_type === 'JOB_WORK').map((o: any) => (
                    <tr key={`ord-${o.id}`} style={{ borderBottom: '1px solid #f1f5f9', background: '#fafaf9' }}>
                      <td style={{ padding: '12px', fontWeight: 700, color: '#0369a1' }}>{o.voucher_no}</td>
                      <td style={{ padding: '12px', color: '#475569' }}>{o.posting_date}</td>
                      <td style={{ padding: '12px', fontWeight: 600, color: '#334155' }}>{o.party_challan_no || '-'}</td>
                      <td style={{ padding: '12px', fontWeight: 600, color: '#0f172a' }}>{o.party_name || '-'}</td>
                      <td style={{ padding: '12px', color: '#334155' }}>{o.finished_item_name} — {o.actual_qty} {o.unit || 'Nos'}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 700 }}>9988</span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700 }}>{symbol} {Number(o.labor_cost || 0).toFixed(2)}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, background: '#dcfce7', color: '#166534' }}>
                          {o.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {schedModalReq && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '520px', maxWidth: '94vw', padding: '22px' }}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '17px' }}>
              Date-Wise Delivery Schedule — {schedModalReq.sales_ref || schedModalReq.request_no}
            </h3>
            <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#64748b' }}>
              Party: <strong>{schedModalReq.customer_name || 'Customer'}</strong> | Ordered: <strong>{schedModalReq.requested_qty} {schedModalReq.finished_unit} {schedModalReq.finished_item_name}</strong>
            </p>
            <form onSubmit={handleSaveSchedule} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {schedRows.map((row, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 0.75fr 0.95fr 1fr auto', gap: '8px', alignItems: 'center' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600 }}>Dispatch Date #{idx + 1}</label>
                    <input
                      type="date"
                      required
                      disabled={row.status === 'DISPATCHED'}
                      value={row.date}
                      onChange={(e) => {
                        const copy = [...schedRows];
                        copy[idx] = { ...copy[idx], date: e.target.value };
                        setSchedRows(copy);
                      }}
                      style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '2px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600 }}>Qty ({schedModalReq.finished_unit})</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      disabled={row.status === 'DISPATCHED'}
                      value={row.qty}
                      onChange={(e) => {
                        const copy = [...schedRows];
                        copy[idx] = { ...copy[idx], qty: e.target.value };
                        setSchedRows(copy);
                      }}
                      style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '2px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600 }}>Challan No (Auto if blank)</label>
                    <input
                      type="text"
                      disabled={row.status === 'DISPATCHED'}
                      placeholder="Auto DSP-0013"
                      value={row.challan_no || row.dispatch_no || ''}
                      onChange={(e) => {
                        const copy = [...schedRows];
                        copy[idx] = { ...copy[idx], challan_no: e.target.value };
                        setSchedRows(copy);
                      }}
                      style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '2px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600 }}>Vehicle No</label>
                    <input
                      type="text"
                      disabled={row.status === 'DISPATCHED'}
                      placeholder="e.g. GJ-01-AB-1234"
                      value={row.vehicle_no || ''}
                      onChange={(e) => {
                        const copy = [...schedRows];
                        copy[idx] = { ...copy[idx], vehicle_no: e.target.value.toUpperCase() };
                        setSchedRows(copy);
                      }}
                      style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '2px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ paddingTop: '16px' }}>
                    {schedRows.length > 1 && row.status !== 'DISPATCHED' && (
                      <button
                        type="button"
                        onClick={() => setSchedRows(schedRows.filter((_, i) => i !== idx))}
                        style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: '12px' }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => setSchedRows([...schedRows, { date: new Date().toISOString().split('T')[0], qty: '' }])}
                style={{ alignSelf: 'flex-start', padding: '5px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                + Add Another Date Split
              </button>

              {schedModalReq.raw_material?.raw_item_name && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#334155', background: '#fefce8', padding: '8px 10px', borderRadius: '6px', border: '1px solid #fde68a' }}>
                  <input type="checkbox" checked={reqRmPurchase} onChange={(e) => setReqRmPurchase(e.target.checked)} />
                  Send Raw Material Purchase Request ONLY if stock is short in Manufacturing
                </label>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button type="button" onClick={() => setSchedModalReq(null)} style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={schedBusy} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  {schedBusy ? 'Saving...' : 'Submit Date-Wise Schedule to Sales'}
                </button>
              </div>
            </form>
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
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Direct Labour Cost / Unit ({symbol} per Nos)</label>
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
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Factory Overhead / Unit ({symbol} per Nos)</label>
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
                <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1.1fr 0.9fr 24px', gap: '8px', marginBottom: '4px', fontSize: '11px', fontWeight: 600, color: '#475569' }}>
                  <span>Raw Material Item</span>
                  <span>Batch Qty ({outputQty || 1} Nos)</span>
                  <span>Scrap / Wastage %</span>
                  <span></span>
                </div>
                {bomComponents.map((comp, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2.2fr 1.1fr 0.9fr 24px', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                    <select
                      required
                      value={comp.raw_item}
                      onChange={(e) => {
                        const copy = [...bomComponents];
                        copy[idx].raw_item = e.target.value;
                        setBomComponents(copy);
                      }}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
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
                      placeholder="Batch Qty"
                      value={comp.qty_required}
                      onChange={(e) => {
                        const copy = [...bomComponents];
                        copy[idx].qty_required = e.target.value;
                        setBomComponents(copy);
                      }}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Scrap %"
                      value={comp.wastage_percent}
                      onChange={(e) => {
                        const copy = [...bomComponents];
                        copy[idx].wastage_percent = e.target.value;
                        setBomComponents(copy);
                      }}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                    />
                    {bomComponents.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => setBomComponents(bomComponents.filter((_, i) => i !== idx))}
                        style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: 0 }}
                      >
                        <Trash2 size={15} />
                      </button>
                    ) : <span />}
                  </div>
                ))}

                {(() => {
                  const batchOut = Math.max(parseFloat(outputQty) || 1, 0.0001);
                  const batchRawTotal = bomComponents.reduce((sum, c) => {
                    const it = items.find((x) => String(x.id) === String(c.raw_item));
                    const rate = it ? Number(it.standard_rate || 0) : 0;
                    const qty = parseFloat(c.qty_required) || 0;
                    const scrap = parseFloat(c.wastage_percent) || 0;
                    return sum + rate * qty * (1 + scrap / 100);
                  }, 0);
                  const rawPerUnit = batchRawTotal / batchOut;
                  const labourPerUnit = parseFloat(bomLaborCost) || 0;
                  const overheadPerUnit = parseFloat(bomOverheadCost) || 0;
                  const totalPerUnit = rawPerUnit + labourPerUnit + overheadPerUnit;
                  const totalBatchCost = totalPerUnit * batchOut;
                  return (
                    <div style={{ marginTop: '12px', padding: '12px 14px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #cbd5e1' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                        Live Per-Unit Cost Breakdown (1 Nos)
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                        <div style={{ background: '#fff', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>Raw Material / Nos</div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>{symbol}{rawPerUnit.toFixed(2)}</div>
                          <div style={{ fontSize: '10px', color: '#64748b' }}>Batch: {symbol}{batchRawTotal.toFixed(2)}</div>
                        </div>
                        <div style={{ background: '#fff', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>Labour + Overhead / Nos</div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0369a1', marginTop: '2px' }}>{symbol}{(labourPerUnit + overheadPerUnit).toFixed(2)}</div>
                          <div style={{ fontSize: '10px', color: '#64748b' }}>{symbol}{labourPerUnit.toFixed(0)} + {symbol}{overheadPerUnit.toFixed(0)}</div>
                        </div>
                        <div style={{ background: '#f0fdf4', padding: '8px 10px', borderRadius: '8px', border: '1px solid #86efac' }}>
                          <div style={{ fontSize: '11px', color: '#166534', fontWeight: 600 }}>Total Cost / Nos</div>
                          <div style={{ fontSize: '15px', fontWeight: 800, color: '#15803d', marginTop: '2px' }}>{symbol}{totalPerUnit.toFixed(2)}</div>
                          <div style={{ fontSize: '10px', color: '#166534' }}>Batch ({batchOut}): {symbol}{totalBatchCost.toFixed(2)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
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
              <div style={{ background: orderType === 'JOB_WORK' ? '#fef3c7' : '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', marginBottom: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: orderType === 'JOB_WORK' ? '1fr 1.2fr 1fr' : '1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>Production Mode *</label>
                    <select
                      value={orderType}
                      onChange={(e) => setOrderType(e.target.value as 'OWN' | 'JOB_WORK')}
                      style={{ width: '100%', padding: '7px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600 }}
                    >
                      <option value="OWN">Own Production (Company Stock)</option>
                      <option value="JOB_WORK">Job Work (Party Material — Labour Only)</option>
                    </select>
                  </div>
                  {orderType === 'JOB_WORK' && (
                    <>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 700, color: '#92400e', display: 'block', marginBottom: '4px' }}>Party / Customer Name *</label>
                        <input
                          required
                          placeholder="e.g. Shreeji Polymers"
                          value={orderPartyName}
                          onChange={(e) => setOrderPartyName(e.target.value)}
                          style={{ width: '100%', padding: '7px 8px', borderRadius: '6px', border: '1px solid #f59e0b', fontSize: '13px', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 700, color: '#92400e', display: 'block', marginBottom: '4px' }}>Party Challan #</label>
                        <input
                          placeholder="e.g. CH-101"
                          value={orderPartyChallan}
                          onChange={(e) => setOrderPartyChallan(e.target.value)}
                          style={{ width: '100%', padding: '7px 8px', borderRadius: '6px', border: '1px solid #f59e0b', fontSize: '13px', boxSizing: 'border-box' }}
                        />
                      </div>
                    </>
                  )}
                </div>
                {orderType === 'JOB_WORK' && (
                  <div style={{ fontSize: '11px', color: '#92400e', marginTop: '6px', fontWeight: 600 }}>
                    Job Work Mode: Consumes ₹0 party material, books Labour/Overheads to Job Work Direct Expense, and dispatches output without inflating Finished Goods Asset.
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>BOM Recipe *</label>
                    <button
                      type="button"
                      onClick={() => {
                        const b = boms.find((x) => String(x.id) === String(selectedBomId));
                        if (b) {
                          const lr = Number(b.labor_cost || 0);
                          const orate = Number(b.overhead_cost || 0);
                          const q = Number(actualQty || 0);
                          setOrderLaborRate(String(lr));
                          setOrderOverheadRate(String(orate));
                          setOrderLaborCost((lr * q).toFixed(2));
                          setOrderOverheadCost((orate * q).toFixed(2));
                        }
                      }}
                      style={{ fontSize: '11px', color: '#0284c7', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                    >
                      Sync Rates
                    </button>
                  </div>
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
                      syncOrderFromBom(selectedBomId, e.target.value, orderLaborRate, orderOverheadRate);
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
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Direct Labour / Unit ({symbol})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={orderLaborRate}
                    onChange={(e) => {
                      setOrderLaborRate(e.target.value);
                      setOrderLaborCost((Number(e.target.value || 0) * Number(actualQty || 0)).toFixed(2));
                    }}
                    style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Total Labour: {symbol} {Number(orderLaborCost).toFixed(2)}</div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Factory Overhead / Unit ({symbol})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={orderOverheadRate}
                    onChange={(e) => {
                      setOrderOverheadRate(e.target.value);
                      setOrderOverheadCost((Number(e.target.value || 0) * Number(actualQty || 0)).toFixed(2));
                    }}
                    style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Total Overhead: {symbol} {Number(orderOverheadCost).toFixed(2)}</div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Scrap Item (Optional)</label>
                  <select value={scrapItemId} onChange={(e) => { setScrapItemId(e.target.value); const sc = items.find((it) => String(it.id) === e.target.value); if (sc && Number(sc.standard_rate) > 0) setScrapValue((Number(scrapQty || 0) * Number(sc.standard_rate)).toFixed(2)); }} style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}>
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
                      <input type="number" step="0.01" min="0" value={scrapQty} onChange={(e) => { setScrapQty(e.target.value); if (scrapItemObj && Number(scrapItemObj.standard_rate) > 0) setScrapValue((Number(e.target.value || 0) * Number(scrapItemObj.standard_rate)).toFixed(2)); }} style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }} />
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

              {sameUnitRawTotal > 0 && !hasMassBalanceError && (
                <div style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', background: unaccountedLoss > 0 ? '#fffbeb' : '#f0fdf4', border: `1px solid ${unaccountedLoss > 0 ? '#fde68a' : '#bbf7d0'}`, color: unaccountedLoss > 0 ? '#92400e' : '#166534' }}>
                  <strong>Material Yield Check:</strong> Input <strong>{sameUnitRawTotal}</strong> = Produced <strong>{actualQty}</strong> + Scrap <strong>{sameUnitScrapQty}</strong>
                  {unaccountedLoss > 0 && <span> • <strong>Unaccounted Loss: {unaccountedLoss}</strong> (Verify Produced Qty!)</span>}
                </div>
              )}
              {hasAbnormalCostSpike && (
                <div style={{ marginTop: '8px', color: '#b45309', fontSize: '12px', fontWeight: 600 }}>
                  Cost Alert: Unit Cost ({symbol}{estUnitCost.toFixed(2)}) is much higher than BOM Standard ({symbol}{bomStdUnitCost.toFixed(2)}). Check Actual Produced Qty vs Consumed Qty!
                </div>
              )}
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

      {planReqTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '480px', maxWidth: '94vw', padding: '22px' }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '17px' }}>Accept &amp; Split Capacity — {planReqTarget.request_no}</h3>
            <p style={{ margin: '0 0 14px 0', fontSize: '12px', color: '#475569' }}>
              Total Requested: <strong>{planReqTarget.requested_qty} {planReqTarget.finished_item_name}</strong>. Decide how many units to make In-House vs Outsource (direct purchase), and Smart MRP will check Raw Material stock automatically.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setPlanBusy(true);
                setErrorMsg('');
                try {
                  const res = await fetch(`${API_BASE}/manufacturing/sales-requests/${planReqTarget.id}/accept-plan/?company_id=${activeCompany.id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      inhouse_qty: inhouseQtyInput,
                      outsource_qty: outsourceQtyInput,
                      accepted_by: user?.username || 'Manufacturing Manager',
                    }),
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || 'Smart MRP failed');
                  setPlanReqTarget(null);
                  setSuccessMsg(
                    `Smart MRP Planned! Batch #1 Production: ${data.producible_now_qty} units (${data.created_mfg_vno || 'None'})` +
                    (data.rm_purchase_req_no ? ` | RM Purchase Request: ${data.rm_purchase_req_no}` : '') +
                    (data.outsource_purchase_req_no ? ` | Outsource Purchase Request: ${data.outsource_purchase_req_no}` : '')
                  );
                  await fetchManufacturing();
                  if (onRefreshData) onRefreshData();
                } catch (err) {
                  setErrorMsg(getErrorMessage(err));
                } finally {
                  setPlanBusy(false);
                }
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#15803d' }}>In-House Production Qty *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={planReqTarget.requested_qty}
                    required
                    value={inhouseQtyInput}
                    onChange={(e) => {
                      const val = e.target.value.replace(/^0+(?=\d)/, '');
                      setInhouseQtyInput(val);
                      const rem = Math.max(0, Number(planReqTarget.requested_qty) - Number(val || 0));
                      setOutsourceQtyInput(String(rem));
                    }}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#1d4ed8' }}>Outsource / Direct Buy Qty *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={outsourceQtyInput}
                    onChange={(e) => setOutsourceQtyInput(e.target.value.replace(/^0+(?=\d)/, ''))}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button type="button" onClick={() => setPlanReqTarget(null)} style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={planBusy} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  {planBusy ? 'Running MRP...' : 'Confirm & Generate MRP'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {viewOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300, padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '720px', maxHeight: '90vh', overflowY: 'auto', padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>Manufacturing Voucher: {viewOrder.voucher_no}</h2>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Date: {viewOrder.posting_date} • Status: <strong>{viewOrder.status}</strong></div>
              </div>
              <button onClick={() => setViewOrder(null)} style={{ border: 'none', background: '#f1f5f9', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', fontWeight: 700 }}>Close</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', background: '#f8fafc', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
              <div><span style={{ color: '#64748b' }}>Finished Item:</span><br /><strong>{viewOrder.finished_item_name}</strong></div>
              <div><span style={{ color: '#64748b' }}>Produced Qty:</span><br /><strong>{viewOrder.actual_qty} {viewOrder.finished_item_unit}</strong></div>
              <div><span style={{ color: '#64748b' }}>Net Cost / Unit:</span><br /><strong>₹{Number(viewOrder.net_production_cost || 0).toFixed(2)} (₹{Number(viewOrder.unit_cost || 0).toFixed(2)}/unit)</strong></div>
            </div>

            <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#334155' }}>Raw Material Consumption</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '16px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Item</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Actual Qty</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Rate</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {(viewOrder.consumptions || []).length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: '10px', textAlign: 'center', color: '#94a3b8' }}>No consumption lines recorded.</td></tr>
                ) : (viewOrder.consumptions || []).map((c: any) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px' }}>{c.raw_item_name}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{c.actual_qty} {c.unit}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>₹{Number(c.rate || 0).toFixed(2)}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>₹{Number(c.amount || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {(viewOrder.gl_entries || []).length > 0 && (
              <>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#334155' }}>Accounting Ledger (GL Entries)</h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                      <th style={{ padding: '8px' }}>Account</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Debit</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewOrder.gl_entries.map((g: any) => (
                      <tr key={g.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px' }}>{g.account}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>₹{Number(g.debit || 0).toFixed(2)}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>₹{Number(g.credit || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
