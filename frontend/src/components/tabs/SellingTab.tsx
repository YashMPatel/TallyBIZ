import { useState, useEffect, type FC, type FormEvent } from 'react';
import { Plus, Download, Search, Printer, Edit2, Trash2, Factory, CheckCircle2, FileText, RefreshCw } from 'lucide-react';
import { API_BASE, getErrorMessage } from '../../utils/erpHelpers';
import { suggestHsnFromNameOrCategory } from '../../utils/hsnLookup';
import { MonthlyAnalyticsChart } from '../MonthlyAnalyticsChart';
import type { SalesInvoice, Customer } from '../../types/erp';
import {
  getDueStatus,
  getNextInvoiceNumber,
  inferTaxRate,
  newLine,
  lineFromItem,
  exportToCSV,
  type DashboardSummary,
} from '../../utils/erpHelpers';

interface SellingTabProps {
  user?: any;
  businessUnits?: any[];
  invoices: SalesInvoice[];
  filteredInvoices: SalesInvoice[];
  customers: Customer[];
  salesStatusMap: Record<number, { status: 'Paid' | 'Partially Paid' | 'Unpaid'; paid: number; balance: number }>;
  dashboardSummary: DashboardSummary;
  gstData: any[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  setEditingId: (id: number | null) => void;
  setInvoiceForm: any;
  setShowInvoiceModal: (show: boolean) => void;
  setSelectedInvoiceForPrint: (inv: SalesInvoice | null) => void;
  handleDeleteInvoice: (id: number, invNo: string) => void;
}

const UOM_LIST = ['Nos', 'Ltr', 'Mtr', 'Kg', 'Box', 'Pcs', 'Ton', 'Roll', 'Sqft', 'Bottle'];

export const SellingTab: FC<SellingTabProps> = ({
  user,
  businessUnits = [],
  invoices,
  filteredInvoices,
  customers,
  salesStatusMap,
  dashboardSummary,
  gstData,
  searchQuery,
  setSearchQuery,
  setEditingId,
  setInvoiceForm,
  setShowInvoiceModal,
  setSelectedInvoiceForPrint,
  handleDeleteInvoice,
}) => {
  const symbol = dashboardSummary.currency_symbol || (localStorage.getItem('active_company_symbol') || '₹');
  const [showForwardMfgModal, setShowForwardMfgModal] = useState(false);
  const [showDispatchTracker, setShowDispatchTracker] = useState(false);
  const [dispatchTrackerFilter, setDispatchTrackerFilter] = useState<'active' | 'completed'>('active');
  const [partialConfirmModal, setPartialConfirmModal] = useState<{
    mode: 'proforma' | 'batch';
    inv?: SalesInvoice;
    reqId?: number;
    batchId?: string;
    data: any;
  } | null>(null);
  const [mfgUnits, setMfgUnits] = useState<any[]>([]);
  const [allItems, setAllItems] = useState<any[]>([]);

  const [fwdMfgUnitId, setFwdMfgUnitId] = useState('');
  const [fwdOrderType, setFwdOrderType] = useState<'OWN' | 'JOB_WORK'>('OWN');
  const [fwdPartyChallan, setFwdPartyChallan] = useState('');
  const [fwdSalesRef, setFwdSalesRef] = useState('');
  const [fwdCustomer, setFwdCustomer] = useState('');
  const [fwdNotes, setFwdNotes] = useState('');
  const [sendingInvId, setSendingInvId] = useState<number | null>(null);

  const [fwdFinMode, setFwdFinMode] = useState<'new' | 'existing'>('existing');
  const [fwdItemId, setFwdItemId] = useState('');
  const [fwdFinName, setFwdFinName] = useState('');
  const [fwdFinUnit, setFwdFinUnit] = useState('Ltr');
  const [fwdFinHsn, setFwdFinHsn] = useState('');
  const [fwdFinGst, setFwdFinGst] = useState('18');
  const [fwdQty, setFwdQty] = useState('1000');
  const [fwdSellRate, setFwdSellRate] = useState('');
  const [fwdCostRate, setFwdCostRate] = useState('');

  const [fwdRawRows, setFwdRawRows] = useState<Array<{
    mode: 'existing' | 'new';
    item_id: string;
    item_name: string;
    unit: string;
    hsn_code: string;
    qty: string;
    purchase_rate: string;
    wastage: string;
  }>>([
    { mode: 'existing', item_id: '', item_name: '', unit: 'Kg', hsn_code: '', qty: '1000', purchase_rate: '', wastage: '0' },
  ]);

  const [fwdMsg, setFwdMsg] = useState('');
  const [fwdErr, setFwdErr] = useState('');
  const [fwdBusy, setFwdBusy] = useState(false);
  const [invoicingBatchId, setInvoicingBatchId] = useState<string | null>(null);
  const [salesRequests, setSalesRequests] = useState<any[]>([]);
  const [directInvoices, setDirectInvoices] = useState<SalesInvoice[]>([]);

  const loadInvoicesDirect = () => {
    const compId = localStorage.getItem('active_company_id') || '';
    const unitId = localStorage.getItem('active_unit_id') || '';
    let token = '';
    for (const store of [localStorage, sessionStorage]) {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i) || '';
        const v = store.getItem(k) || '';
        if ((k.includes('token') || k.includes('jwt') || k.includes('access')) && v.length > 20 && !v.startsWith('{')) {
          token = v.replace(/^"|"$/g, '');
          break;
        }
        if (v.startsWith('{') && v.includes('access')) {
          try {
            const parsed = JSON.parse(v);
            if (parsed.access || parsed.token) {
              token = parsed.access || parsed.token;
              break;
            }
          } catch {}
        }
      }
      if (token) break;
    }
    if (!compId) return;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const qUnit = unitId ? `&unit_id=${unitId}` : '';
    fetch(`${API_BASE}/selling/invoices/?company_id=${compId}${qUnit}`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((rows) => {
        if (!rows) return;
        const list = Array.isArray(rows) ? rows : rows?.results || [];
        if (list.length > 0) {
          setDirectInvoices((prev) => {
            const m = new Map<number, SalesInvoice>();
            [...list, ...prev].forEach((x) => {
              if (x && x.id) m.set(x.id, x);
            });
            return Array.from(m.values());
          });
        }
      })
      .catch(() => {});
  };

  const loadSalesRequests = () => {
    const compId = localStorage.getItem('active_company_id') || '';
    if (!compId) return;
    fetch(`${API_BASE}/manufacturing/sales-requests/?company_id=${compId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setSalesRequests(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  };

  useEffect(() => {
    loadSalesRequests();
    loadInvoicesDirect();
  }, [fwdMsg, invoices.length]);

  useEffect(() => {
    if (!showForwardMfgModal) return;
    const compId = localStorage.getItem('active_company_id') || '';
    if (!compId) return;
    Promise.all([
      fetch(`${API_BASE}/accounts/units/?company_id=${compId}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_BASE}/stock/items/?company_id=${compId}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_BASE}/manufacturing/sales-requests/?company_id=${compId}`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([uRows, iRows, reqRows]) => {
        const uList = (Array.isArray(uRows) ? uRows : uRows?.units || []).filter(
          (u: any) => String(u.unit_type).toUpperCase() === 'MANUFACTURING'
        );
        const iList = Array.isArray(iRows) ? iRows : iRows?.results || [];
        const rList = Array.isArray(reqRows) ? reqRows : [];
        const yr = new Date().getFullYear();
        let maxSeq = rList.length;
        for (const r of rList) {
          const m = String(r.sales_ref || '').match(/(\d+)$/);
          if (m) {
            const n = parseInt(m[1], 10);
            if (n > maxSeq) maxSeq = n;
          }
        }
        setMfgUnits(uList);
        setAllItems(iList);
        setFwdSalesRef(`SO-${yr}-${String(maxSeq + 1).padStart(2, '0')}`);
        if (uList.length > 0 && !fwdMfgUnitId) setFwdMfgUnitId(String(uList[0].id));
        if (iList.length > 0) {
          setFwdFinMode('existing');
          const fg = iList.find((x: any) => String(x.category).toLowerCase().includes('finish'))
            || iList.find((x: any) => !String(x.category).toLowerCase().includes('raw'));
          if (fg) {
            setFwdItemId(String(fg.id));
            setFwdFinUnit(fg.unit || 'Ltr');
            setFwdFinHsn(fg.hsn_code || '');
            setFwdSellRate(String(fg.selling_rate || ''));
            setFwdCostRate(String(fg.standard_rate || ''));
          }
          const rm = iList.find((x: any) => String(x.category).toLowerCase().includes('raw')) || iList[0];
          setFwdRawRows([
            {
              mode: 'existing',
              item_id: String(rm.id),
              item_name: '',
              unit: rm.unit || 'Kg',
              hsn_code: rm.hsn_code || '',
              qty: '1000',
              purchase_rate: String(rm.standard_rate || ''),
              wastage: '0',
            },
          ]);
        } else {
          setFwdFinMode('existing');
          setFwdRawRows([
            { mode: 'new', item_id: '', item_name: '', unit: 'Kg', hsn_code: '', qty: '1000', purchase_rate: '', wastage: '0' },
          ]);
        }
      })
      .catch(() => {});
  }, [showForwardMfgModal]);

  const handleForwardToMfg = async (e: FormEvent) => {
    e.preventDefault();
    setFwdErr('');
    setFwdBusy(true);
    try {
      const compId = localStorage.getItem('active_company_id') || '';
      const cleanedRms = fwdRawRows
        .filter((r) => (r.mode === 'existing' ? Boolean(r.item_id) : Boolean(r.item_name.trim())))
        .map((r) => ({
          raw_item_id: r.mode === 'existing' ? r.item_id : '',
          raw_item_name: r.mode === 'new' ? r.item_name.trim() : '',
          raw_unit: r.unit || 'Kg',
          raw_hsn: r.hsn_code || '',
          raw_qty: r.qty || 0,
          raw_purchase_rate: r.purchase_rate || 0,
          raw_wastage: r.wastage || 0,
        }));
      const firstRm = cleanedRms[0];
      const payload: any = {
        mfg_unit_id: fwdMfgUnitId,
        order_type: fwdOrderType,
        party_challan_no: fwdPartyChallan,
        sales_ref: fwdSalesRef,
        customer_name: fwdCustomer,
        requested_qty: fwdQty,
        finished_unit: fwdFinUnit,
        finished_hsn: fwdFinHsn,
        finished_gst: fwdFinGst,
        selling_rate: fwdSellRate || 0,
        cost_rate: fwdCostRate || 0,
        raw_unit: firstRm?.raw_unit || 'Kg',
        raw_hsn: firstRm?.raw_hsn || '',
        raw_qty: firstRm?.raw_qty || 0,
        raw_purchase_rate: firstRm?.raw_purchase_rate || 0,
        raw_wastage: firstRm?.raw_wastage || 0,
        raw_materials: cleanedRms,
        notes: fwdNotes,
        created_by: user?.username || 'Sales Team',
      };
      if (fwdFinMode === 'existing' && fwdItemId) {
        payload.finished_item_id = fwdItemId;
      } else {
        payload.finished_item_name = fwdFinName;
      }
      if (firstRm?.raw_item_id) {
        payload.raw_item_id = firstRm.raw_item_id;
      } else if (firstRm?.raw_item_name) {
        payload.raw_item_name = firstRm.raw_item_name;
      }

      const res = await fetch(`${API_BASE}/manufacturing/sales-requests/?company_id=${compId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit order');
      setShowForwardMfgModal(false);
      setFwdMsg(`Order ${data.sales_ref} (${data.request_no}) sent directly to Manufacturing Division!`);
    } catch (err) {
      setFwdErr(getErrorMessage(err));
    } finally {
      setFwdBusy(false);
    }
  };

  const handleSendInvoiceToFactory = async (inv: any) => {
    if (!inv?.id) return;
    setSendingInvId(inv.id);
    setFwdErr('');
    try {
      const compId = localStorage.getItem('active_company_id') || '';
      const invType = String(inv.invoice_type || 'SALES').toUpperCase() === 'JOB_WORK' ? 'JOB_WORK' : 'OWN';
      const isProformaDoc = String(inv.invoice_number || '').toUpperCase().startsWith('PI-');
      const itemsList = Array.isArray(inv.items) ? inv.items : [];
      const firstLine = itemsList[0] || {};
      const totalQty = itemsList.reduce((s: number, it: any) => s + Number(it.quantity || 0), 0) || 1;
      const payload: any = {
        order_type: invType,
        party_challan_no: inv.party_challan_no || '',
        ...(isProformaDoc
          ? { proforma_invoice_id: inv.id, proforma_invoice_no: inv.invoice_number }
          : { existing_invoice_id: inv.id, existing_invoice_no: inv.invoice_number }),
        sales_ref: inv.invoice_number,
        posting_date: inv.posting_date,
        customer_name: inv.customer_name || 'Customer',
        finished_item_id: firstLine.item || undefined,
        finished_item_name: firstLine.item_name || firstLine.description || inv.invoice_number,
        finished_hsn: firstLine.hsn_code || (invType === 'JOB_WORK' ? '9988' : ''),
        requested_qty: totalQty,
        selling_rate: Number(firstLine.rate || inv.net_total || 0),
        line_items_summary: itemsList.map((it: any) => ({
          item_name: it.item_name || it.description || 'Item',
          quantity: Number(it.quantity || 0),
          rate: Number(it.rate || 0),
          hsn_code: it.hsn_code || '',
        })),
        notes: isProformaDoc
          ? `Confirmed Proforma Order ${inv.invoice_number} — Schedule production & dispatch; 1-Click Tax Invoice will be generated on dispatch.`
          : `Pre-generated ${invType === 'JOB_WORK' ? 'Job Work (SAC 9988)' : 'Sales'} Invoice ${inv.invoice_number} — Update dispatch details only (no duplicate invoice).`,
        created_by: user?.username || 'Sales Team',
      };
      const res = await fetch(`${API_BASE}/manufacturing/sales-requests/?company_id=${compId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send invoice to factory');
      setFwdMsg(`Invoice ${inv.invoice_number} forwarded to Factory (${data.request_no}) for schedule & dispatch tracking!`);
      loadSalesRequests();
    } catch (err: any) {
      setFwdErr(err.message || 'Failed to send invoice to factory');
    } finally {
      setSendingInvId(null);
    }
  };

  const handleOneClickInvoice = async (reqId: number, batchId: string, proceedPartial = false) => {
    setInvoicingBatchId(batchId);
    setFwdErr('');
    try {
      const compId = localStorage.getItem('active_company_id') || '';
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_BASE}/manufacturing/sales-requests/${reqId}/create-invoice/?company_id=${compId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ batch_id: batchId, proceed_partial: proceedPartial }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate invoice');

      if (data.needs_confirmation) {
        setPartialConfirmModal({ mode: 'batch', reqId, batchId, data });
        return;
      }

      setPartialConfirmModal(null);
      setSalesRequests((prev) =>
        prev.map((r) =>
          r.id === reqId ? { ...r, delivery_schedule: data.delivery_schedule || r.delivery_schedule } : r
        )
      );
      if (data.invoice) {
        setDirectInvoices((prev) => [data.invoice, ...prev.filter((x) => x.id !== data.invoice.id)]);
      }
      loadInvoicesDirect();
      loadSalesRequests();
      setFwdMsg(
        `Tax Invoice ${data.invoice_number} (${symbol}${Number(data.grand_total).toFixed(2)}) created & sent to HO / Admin for Approval!`
      );
      const tblEl = document.getElementById('sales-invoices-register');
      if (tblEl) tblEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setInvoicingBatchId(null);
    }
  };

  const handleConvertProformaToTax = async (inv: SalesInvoice, proceedPartial = false) => {
    if (!inv.id) return;
    setSendingInvId(inv.id);
    setFwdErr('');
    try {
      const compId = localStorage.getItem('active_company_id') || '';
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_BASE}/selling/invoices/${inv.id}/convert-to-tax/?company_id=${compId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ proceed_partial: proceedPartial }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to convert Proforma to Tax Invoice');

      if (data.needs_confirmation) {
        setPartialConfirmModal({ mode: 'proforma', inv, data });
        return;
      }

      setPartialConfirmModal(null);
      if (data.invoice) {
        setDirectInvoices((prev) => [
          data.invoice,
          ...prev.map((x) =>
            x.id === inv.id && !data.partial
              ? { ...x, status: 'Rejected', rejection_reason: `Converted to Tax Invoice ${data.invoice_number}` }
              : x
          ),
        ]);
      }
      loadInvoicesDirect();
      loadSalesRequests();
      setFwdMsg(data.message || `Tax Invoice ${data.invoice_number} created & sent to HO / Admin for Approval!`);
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setSendingInvId(null);
    }
  };

  const isSalesReqClosed = (x: any) =>
    x.status === 'COMPLETED' &&
    (x.delivery_schedule || []).length > 0 &&
    (x.delivery_schedule || []).every((b: any) => b.invoiced);
  const activeDispatchReqs = salesRequests.filter((x: any) => !isSalesReqClosed(x));
  const completedDispatchReqs = salesRequests.filter((x: any) => isSalesReqClosed(x));
  const visibleDispatchReqs = dispatchTrackerFilter === 'active' ? activeDispatchReqs : completedDispatchReqs;

  // Merge direct fetched invoices + fresh prop invoices so edited/approved records never show stale data
  const mergedInvoicesMap = new Map<number, SalesInvoice>();
  [...directInvoices, ...filteredInvoices].forEach((inv) => {
    if (inv && inv.id) mergedInvoicesMap.set(inv.id, inv);
  });
  const displayInvoices = Array.from(mergedInvoicesMap.values())
    .filter((inv) => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        String(inv.invoice_number || '').toLowerCase().includes(q) ||
        String(inv.customer_name || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => (b.id || 0) - (a.id || 0));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 6px 0' }}>Sales Orders &amp; Invoices</h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>All-in-one order entry to Manufacturing, live date-wise dispatch tracking &amp; 1-click GST invoicing</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              setFwdErr('');
              setFwdFinMode('new');
              setFwdFinName('');
              setFwdFinHsn('');
              setFwdQty('1000');
              setFwdSellRate('');
              setFwdCostRate('');
              setFwdRawRows([
                { mode: 'existing', item_id: '', item_name: '', unit: 'Kg', hsn_code: '', qty: '1000', purchase_rate: '', wastage: '0' },
              ]);
              setFwdCustomer('');
              setFwdNotes('');
              setShowForwardMfgModal(true);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#7c3aed', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '700', boxShadow: '0 2px 6px rgba(124,58,237,0.3)' }}
          >
            <Factory size={16} /> + New Order to Manufacturing
          </button>
          <button
            onClick={() => {
              const rows = filteredInvoices.map((inv) => {
                const payInfo = salesStatusMap[inv.id ?? 0] || { status: 'Unpaid', paid: 0, balance: parseFloat(String(inv.grand_total)) || 0 };
                return {
                  'Invoice #': inv.invoice_number,
                  'Customer': inv.customer_name || 'Walk-in Customer',
                  'Date': inv.posting_date,
                  'Due Date': getDueStatus(inv.posting_date, inv.due_date).dueDate,
                  [`Net (${symbol})`]: parseFloat(String(inv.net_total)).toFixed(2),
                  [`Tax (${symbol})`]: parseFloat(String(inv.tax_amount)).toFixed(2),
                  [`Grand Total (${symbol})`]: parseFloat(String(inv.grand_total)).toFixed(2),
                  'Approval Status': inv.status,
                  'Payment Status': payInfo.status,
                };
              });
              exportToCSV(rows, 'TallyBIZ_Sales_Invoices');
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#10b981', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
          >
            <Download size={16} /> Export Excel
          </button>
          <button
            onClick={() => {
              setEditingId(null);
              const piNums = displayInvoices
                .map((x) => String(x.invoice_number || '').match(/^PI-(\d+)$/i))
                .filter(Boolean)
                .map((m) => parseInt(m![1], 10));
              const nextPiSeq = (piNums.length > 0 ? Math.max(...piNums) : 0) + 1;
              const nextPiNo = `PI-${String(nextPiSeq).padStart(3, '0')}`;
              setInvoiceForm({
                invoice_number: nextPiNo,
                customer_id: customers.length > 0 ? String(customers[0].id) : '',
                posting_date: new Date().toISOString().split('T')[0],
                due_date: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
                tax_rate: '18',
                status: 'Draft',
                lines: [newLine()],
              });
              setShowInvoiceModal(true);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#d97706', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '700' }}
          >
            <FileText size={16} /> + Proforma Invoice
          </button>
          <button
            onClick={() => {
              setEditingId(null);
              const taxOnly = displayInvoices.filter((x) => !String(x.invoice_number || '').toUpperCase().startsWith('PI-'));
              const nextInvNo = getNextInvoiceNumber(taxOnly);
              setInvoiceForm({
                invoice_number: nextInvNo,
                customer_id: customers.length > 0 ? String(customers[0].id) : '',
                posting_date: new Date().toISOString().split('T')[0],
                due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
                tax_rate: '18',
                status: 'Draft',
                lines: [newLine()],
              });
              setShowInvoiceModal(true);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#0284c7', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
          >
            <Plus size={16} /> + Direct Invoice
          </button>
        </div>
      </div>

      {fwdMsg && (
        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', fontWeight: 600 }}>
          {fwdMsg}
        </div>
      )}

      {/* KPI Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#fff', padding: '18px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <div style={{ color: '#64748b', fontSize: '13px', fontWeight: '600' }}>Total Sales</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0284c7', marginTop: '6px' }}>{symbol} {Math.max(dashboardSummary.total_sales, displayInvoices.filter((x) => !String(x.invoice_number || '').toUpperCase().startsWith('PI-')).reduce((acc, x) => acc + (parseFloat(String(x.grand_total)) || 0), 0)).toFixed(2)}</div>
        </div>
        <div style={{ background: '#fff', padding: '18px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <div style={{ color: '#64748b', fontSize: '13px', fontWeight: '600' }}>Total Purchases</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#dc2626', marginTop: '6px' }}>{symbol} {dashboardSummary.total_purchases.toFixed(2)}</div>
        </div>
        <div style={{ background: '#fff', padding: '18px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <div style={{ color: '#64748b', fontSize: '13px', fontWeight: '600' }}>Bank Balance</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981', marginTop: '6px' }}>{symbol} {dashboardSummary.bank_balance.toFixed(2)}</div>
        </div>
      </div>

      {/* LIVE ORDERS & MANUFACTURING DATE-WISE DISPATCH TRACKER */}
      <div style={{ marginBottom: '24px', background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
              Sales Orders &amp; Manufacturing Date-Wise Dispatch ({salesRequests.length})
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
              See date-wise production schedule from Manufacturing and generate 1-click GST Invoices as batches dispatch
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setShowDispatchTracker((prev) => !prev)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '6px',
                border: '1px solid #0284c7',
                background: showDispatchTracker ? '#0284c7' : '#e0f2fe',
                color: showDispatchTracker ? '#fff' : '#0369a1',
                fontSize: '12.5px',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              Dispatch ({activeDispatchReqs.length}) {showDispatchTracker ? '▲' : '▼'}
            </button>
            <button
              type="button"
              onClick={loadSalesRequests}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
            >
              <RefreshCw size={13} /> Refresh Status
            </button>
          </div>
        </div>

        {showDispatchTracker && (
          <div style={{ marginTop: '14px' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <button
                type="button"
                onClick={() => setDispatchTrackerFilter('active')}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: dispatchTrackerFilter === 'active' ? '#0284c7' : '#fff',
                  color: dispatchTrackerFilter === 'active' ? '#fff' : '#334155',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Active / Pending ({activeDispatchReqs.length})
              </button>
              <button
                type="button"
                onClick={() => setDispatchTrackerFilter('completed')}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: dispatchTrackerFilter === 'completed' ? '#15803d' : '#fff',
                  color: dispatchTrackerFilter === 'completed' ? '#fff' : '#334155',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Completed &amp; Invoiced ({completedDispatchReqs.length})
              </button>
            </div>
        {visibleDispatchReqs.length === 0 ? (
          <div style={{ fontSize: '13px', color: '#64748b', padding: '14px', background: '#f8fafc', borderRadius: '8px' }}>
            {dispatchTrackerFilter === 'active'
              ? 'No active/pending manufacturing orders.'
              : 'No completed & invoiced manufacturing orders yet.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {visibleDispatchReqs.map((r: any) => {
              const schedule: any[] = r.delivery_schedule || [];
              const raw = r.raw_material || {};
              return (
                <div key={r.id} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', background: '#f8fafc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, color: '#7c3aed', fontSize: '14px' }}>{r.sales_ref || r.request_no}</span>
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>({r.request_no})</span>
                        <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '14px' }}>• {r.customer_name || 'Walk-in Party'}</span>
                        <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, background: r.status === 'COMPLETED' ? '#dcfce7' : r.status === 'PENDING_MFG' ? '#fef3c7' : '#e0f2fe', color: r.status === 'COMPLETED' ? '#166534' : r.status === 'PENDING_MFG' ? '#92400e' : '#0369a1' }}>
                          {r.status === 'PENDING_MFG' ? 'Awaiting Factory Date Schedule' : r.status === 'COMPLETED' ? 'Fully Dispatched' : 'Scheduled / In Production'}
                        </span>
                      </div>
                      <div style={{ fontSize: '13px', color: '#1e293b', marginTop: '5px' }}>
                        <strong>Product:</strong> {r.finished_item_name} — <strong>{r.requested_qty} {r.finished_unit || 'Nos'}</strong>
                        {r.finished_hsn ? ` • HSN: ${r.finished_hsn}` : ''}
                        {r.selling_rate > 0 ? ` • Sell Rate: ${symbol}${r.selling_rate}/${r.finished_unit || 'Nos'}` : ''}
                        {raw.raw_item_name ? (
                          <span style={{ color: '#475569' }}>
                            {' '}| <strong>Raw Material:</strong> {raw.raw_qty} {raw.raw_unit} {raw.raw_item_name} (@ {symbol}{raw.raw_purchase_rate})
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '12px', color: '#475569' }}>
                      <div>Order Date: <strong>{r.posting_date}</strong></div>
                      <div>Dispatched: <strong>{r.dispatched_qty || 0} / {r.requested_qty} {r.finished_unit}</strong></div>
                    </div>
                  </div>

                  {schedule.length > 0 ? (
                    <div style={{ marginTop: '10px', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '10px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>
                        Manufacturing Date-Wise Delivery Schedule
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {schedule.filter((b: any) => !b.invoiced).length === 0 ? (
                          <div style={{ fontSize: '12px', color: '#15803d', fontWeight: 600, padding: '6px 8px', background: '#f0fdf4', borderRadius: '6px' }}>
                            All dispatched batches shifted to Sales Invoices register below!
                          </div>
                        ) : null}
                        {schedule.filter((b: any) => !b.invoiced).map((b: any) => (
                          <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', padding: '6px 10px', borderRadius: '6px', background: b.status === 'DISPATCHED' ? '#f0fdf4' : '#f8fafc', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '13px' }}>
                              <strong>Date: {b.date}</strong> — Qty: <strong>{b.qty} {r.finished_unit}</strong>
                              {b.dispatch_no ? <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 700, color: '#0369a1' }}>Challan: {b.dispatch_no}</span> : null}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {b.status !== 'DISPATCHED' ? (
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#b45309', background: '#fef3c7', padding: '3px 8px', borderRadius: '999px' }}>
                                  Scheduled by Factory
                                </span>
                              ) : b.invoiced ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 700, color: '#15803d', background: '#dcfce7', padding: '4px 10px', borderRadius: '6px' }}>
                                  <CheckCircle2 size={14} /> Invoiced ({b.invoice_no})
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={invoicingBatchId === b.id}
                                  onClick={() => handleOneClickInvoice(r.id, b.id)}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#059669', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                                >
                                  <FileText size={14} /> {invoicingBatchId === b.id ? 'Creating...' : `1-Click Create Invoice (${b.qty} ${r.finished_unit})`}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#92400e', fontStyle: 'italic' }}>
                      Waiting for Manufacturing Division to submit date-wise production &amp; dispatch schedule...
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
                </div>
        )}
      </div>

<div style={{ marginBottom: '24px' }}>
        <MonthlyAnalyticsChart
          data={gstData}
          currencySymbol={symbol}
          title="Monthly Performance: Sales vs Purchases"
          subtitle="Taxable turnover comparison across fiscal months"
        />
      </div>

      <div style={{ marginBottom: '16px', position: 'relative', maxWidth: '350px' }}>
        <Search size={16} style={{ position: 'absolute', left: '12px', top: '11px', color: '#94a3b8' }} />
        <input
          type="text"
          placeholder="Search invoice # or customer..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: '100%', padding: '9px 12px 9px 36px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
        />
      </div>

      <div id="sales-invoices-register" style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
              <th style={{ padding: '12px' }}>Invoice #</th>
              <th style={{ padding: '12px' }}>Customer</th>
              <th style={{ padding: '12px' }}>Posting Date</th>
              <th style={{ padding: '12px' }}>Due Date</th>
              <th style={{ padding: '12px' }}>Net ({symbol})</th>
              <th style={{ padding: '12px' }}>Tax ({symbol})</th>
              <th style={{ padding: '12px' }}>Grand Total ({symbol})</th>
              <th style={{ padding: '12px' }}>Created By</th>
              <th style={{ padding: '12px' }}>Approved By</th>
              <th style={{ padding: '12px' }}>Approval Status</th>
              <th style={{ padding: '12px' }}>Payment Status</th>
              <th style={{ padding: '12px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayInvoices.length === 0 ? (
              <tr>
                <td colSpan={12} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                  No sales invoices found.
                </td>
              </tr>
            ) : (
              displayInvoices.map((inv) => {
                const due = getDueStatus(inv.posting_date, inv.due_date);
                const payInfo = salesStatusMap[inv.id ?? 0] || { status: 'Unpaid', paid: 0, balance: parseFloat(String(inv.grand_total)) || 0 };
                const badgeColor =
                  payInfo.status === 'Paid'
                    ? { bg: '#dcfce7', text: '#166534' }
                    : payInfo.status === 'Partially Paid'
                    ? { bg: '#dbeafe', text: '#1e40af' }
                    : { bg: '#fee2e2', text: '#991b1b' };
                return (
                  <tr key={inv.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px' }}><strong style={{ color: '#0f172a' }}>{inv.invoice_number}</strong></td>
                    <td style={{ padding: '12px' }}>{inv.customer_name || 'Walk-in Customer'}</td>
                    <td style={{ padding: '12px' }}>{inv.posting_date}</td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ fontWeight: '600', color: '#1e293b' }}>{due.dueDate}</div>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: due.isOverdue ? '#dc2626' : '#64748b' }}>{due.text}</div>
                    </td>
                    <td style={{ padding: '12px' }}>{symbol} {parseFloat(String(inv.net_total)).toFixed(2)}</td>
                    <td style={{ padding: '12px' }}>{symbol} {parseFloat(String(inv.tax_amount)).toFixed(2)}</td>
                    <td style={{ padding: '12px' }}><strong>{symbol} {parseFloat(String(inv.grand_total)).toFixed(2)}</strong></td>
                    <td style={{ padding: '12px', fontSize: '12px', color: '#475569' }}>{(inv as any).created_by_name || 'Admin'}</td>
                    <td style={{ padding: '12px', fontSize: '12px', color: '#475569' }}>{(inv as any).approved_by_name || '-'}</td>
                    <td style={{ padding: '12px' }}>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          background: inv.status === 'Approved' ? '#dcfce7' : inv.status === 'Rejected' ? '#fee2e2' : '#fef3c7',
                          color: inv.status === 'Approved' ? '#166534' : inv.status === 'Rejected' ? '#991b1b' : '#92400e',
                        }}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', background: badgeColor.bg, color: badgeColor.text }}>
                        {payInfo.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {(() => {
                          const isPi = String(inv.invoice_number || '').toUpperCase().startsWith('PI-');
                          const rejReason = String((inv as any).rejection_reason || '');
                          const isConvertedPi = isPi && (rejReason.includes('Converted') || inv.status === 'Rejected');
                          const sourcePi = !isPi
                            ? invoices.find(
                                (p: any) =>
                                  String(p.invoice_number || '').toUpperCase().startsWith('PI-') &&
                                  String(p.rejection_reason || '').includes(inv.invoice_number)
                              )
                            : null;
                          const linkedReq = salesRequests.find(
                            (r: any) =>
                              r.existing_invoice_no === inv.invoice_number ||
                              r.proforma_invoice_no === inv.invoice_number ||
                              r.sales_ref === inv.invoice_number ||
                              (sourcePi && (r.proforma_invoice_no === sourcePi.invoice_number || r.sales_ref === sourcePi.invoice_number))
                          );
                          if (isConvertedPi) {
                            return (
                              <span
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  background: '#dcfce7',
                                  color: '#166534',
                                }}
                              >
                                {rejReason || 'Converted / Locked'}
                              </span>
                            );
                          }
                          if (linkedReq) {
                            const dispBatches = (linkedReq.delivery_schedule || []).filter((b: any) => b.status === 'DISPATCHED');
                            const readyBatch = dispBatches.find((b: any) => !b.invoiced);
                            if (readyBatch) {
                              return (
                                <button
                                  type="button"
                                  disabled={invoicingBatchId === readyBatch.id}
                                  onClick={() => handleOneClickInvoice(linkedReq.id, readyBatch.id)}
                                  title="Factory dispatched! Generate next Tax Invoice (INV-...) in 1 click"
                                  style={{
                                    padding: '4px 9px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: '#059669',
                                    color: '#fff',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                  }}
                                >
                                  {invoicingBatchId === readyBatch.id ? 'Creating...' : '1-Click Tax Invoice'}
                                </button>
                              );
                            }
                            return (
                              <span
                                title={`Linked to Factory Request ${linkedReq.request_no} (${linkedReq.status})`}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  background: dispBatches.length > 0 ? '#dcfce7' : '#e0f2fe',
                                  color: dispBatches.length > 0 ? '#166534' : '#0369a1',
                                }}
                              >
                                {dispBatches.length > 0
                                  ? `Dispatched (${dispBatches.map((b: any) => b.dispatch_no).join(', ')})`
                                  : `Confirmed • In Factory (${linkedReq.request_no})`}
                              </span>
                            );
                          }
                          if (!isPi && (inv.status === 'Approved' || inv.status === 'Pending Approval' || sourcePi)) {
                            const isPendingApproval = inv.status !== 'Approved';
                            return (
                              <span
                                title={
                                  isPendingApproval
                                    ? 'Awaiting HO / Admin Approval in Approvals Hub before stock & GL posting'
                                    : sourcePi
                                    ? `Converted from ${sourcePi.invoice_number}`
                                    : 'Tax Invoice Approved & Stock Deducted'
                                }
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  background: isPendingApproval ? '#fef3c7' : '#f1f5f9',
                                  color: isPendingApproval ? '#92400e' : '#475569',
                                  border: isPendingApproval ? '1px solid #fcd34d' : '1px solid #e2e8f0',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {isPendingApproval
                                  ? sourcePi
                                    ? `From ${sourcePi.invoice_number} • Pending HO Approval`
                                    : 'Pending HO Approval'
                                  : sourcePi
                                  ? `From ${sourcePi.invoice_number} • Invoiced`
                                  : 'Invoiced • Locked'}
                              </span>
                            );
                          }
                          return (
                            <>
                              <button
                                type="button"
                                disabled={sendingInvId === inv.id}
                                onClick={() => handleSendInvoiceToFactory(inv)}
                                title={
                                  isPi
                                    ? 'Party confirmed Proforma! Send order to Factory Unit for production & dispatch'
                                    : 'Send this invoice order to Factory Unit for Date Schedule & Dispatch tracking'
                                }
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  border: isPi ? '1px solid #fcd34d' : '1px solid #bae6fd',
                                  background: isPi ? '#fef3c7' : '#f0f9ff',
                                  color: isPi ? '#92400e' : '#0369a1',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  fontSize: '11px',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {sendingInvId === inv.id
                                  ? 'Sending...'
                                  : isPi
                                  ? 'Confirm & Send to Factory'
                                  : 'Send to Factory'}
                              </button>
                              {isPi && (
                                <button
                                  type="button"
                                  disabled={sendingInvId === inv.id}
                                  onClick={() => handleConvertProformaToTax(inv)}
                                  title="Convert Proforma directly to next sequential Tax Invoice (INV-...)"
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: '#059669',
                                    color: '#fff',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  1-Click Tax Invoice
                                </button>
                              )}
                            </>
                          );
                        })()}
                        <button
                          onClick={() => setSelectedInvoiceForPrint(inv)}
                          title="Print GST Invoice"
                          style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                        >
                          <Printer size={13} /> Print
                        </button>
                        <button
                          onClick={() => {
                            const curUnitId = localStorage.getItem('active_unit_id') || 'all';
                            const curUnit = (businessUnits || []).find((u: any) => String(u.id) === String(curUnitId));
                            const isHoOrAll = curUnitId === 'all' || String(curUnit?.unit_type || '').toUpperCase() === 'HO';
                            const roleUp = String(user?.role || '').toUpperCase().replace(/\s+/g, '_');
                            const isPrivUser = roleUp === 'ADMIN' || roleUp === 'MANAGER' || Boolean(user?.is_superuser || user?.is_staff);
                            const isApprovedLocked = inv.status === 'Approved' && (!isHoOrAll || !isPrivUser);
                            if (isApprovedLocked) {
                              const lockMsg = `Invoice ${inv.invoice_number} is Approved & Locked. Please get approval from HO or Admin before editing.`;
                              setFwdErr(lockMsg);
                              alert(lockMsg);
                              return;
                            }
                            setEditingId(inv.id ?? null);
                            const invType = (inv as any).invoice_type || 'SALES';
                            const lines = inv.items && inv.items.length > 0
                              ? inv.items.map((it: any) => ({
                                  ...lineFromItem(it),
                                  hsn_code: it.hsn_code || (invType === 'JOB_WORK' ? '9988' : ''),
                                }))
                              : [newLine()];
                            const inferredTax = inferTaxRate(inv.net_total, inv.tax_amount);
                            setInvoiceForm({
                              invoice_type: invType,
                              party_challan_no: (inv as any).party_challan_no || '',
                              invoice_number: inv.invoice_number,
                              customer_id: String(inv.customer || ''),
                              posting_date: inv.posting_date,
                              due_date: inv.due_date || new Date(new Date(inv.posting_date).getTime() + 30 * 86400000).toISOString().split('T')[0],
                              tax_rate: inferredTax,
                              adjustment: String((inv as any).adjustment ?? '0'),
                              status: inv.status,
                              lines,
                            } as any);
                            setShowInvoiceModal(true);
                          }}
                          style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                        >
                          <Edit2 size={13} /> Edit
                        </button>
                        <button
                          onClick={() => handleDeleteInvoice(inv.id ?? 0, inv.invoice_number)}
                          style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ALL-IN-ONE ORDER ENTRY MODAL */}
      {partialConfirmModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1200,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '580px',
              padding: '22px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.22)',
            }}
          >
            <h3 style={{ margin: '0 0 8px 0', fontSize: '17px', fontWeight: 800, color: '#b45309' }}>
              Stock Shortfall Alert — {partialConfirmModal.data?.proforma_number || 'Proforma'}
            </h3>
            <p style={{ margin: '0 0 14px 0', fontSize: '13px', color: '#334155', lineHeight: 1.5 }}>
              {partialConfirmModal.data?.message}
            </p>

            {(partialConfirmModal.data?.ready_items || []).length > 0 && (
              <div style={{ marginBottom: '12px', padding: '10px 12px', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#166534', marginBottom: '6px' }}>
                  Ready to Invoice Now ({partialConfirmModal.data.ready_items.length}):
                </div>
                {partialConfirmModal.data.ready_items.map((it: any, i: number) => (
                  <div key={i} style={{ fontSize: '12.5px', color: '#14532d', display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span><strong>{it.item_name}</strong> ({it.item_code}) — {it.quantity} {it.unit}</span>
                    <span>@ {symbol}{Number(it.rate || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}

            {(partialConfirmModal.data?.missing_items || []).length > 0 && (
              <div style={{ marginBottom: '16px', padding: '10px 12px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#991b1b', marginBottom: '6px' }}>
                  Missing / Short Stock ({partialConfirmModal.data.missing_items.length}) — Will stay pending on Proforma:
                </div>
                {partialConfirmModal.data.missing_items.map((it: any, i: number) => (
                  <div key={i} style={{ fontSize: '12.5px', color: '#7f1d1d', display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span><strong>{it.item_name}</strong> ({it.item_code})</span>
                    <span>Need {it.required_qty} {it.unit} • Avail {it.available_qty} {it.unit}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setPartialConfirmModal(null)}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#334155', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
              >
                Wait Until Stock Ready
              </button>
              {(partialConfirmModal.data?.ready_count || 0) > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const ctx = partialConfirmModal;
                    setPartialConfirmModal(null);
                    if (ctx.mode === 'proforma' && ctx.inv) {
                      handleConvertProformaToTax(ctx.inv, true);
                    } else if (ctx.mode === 'batch' && ctx.reqId && ctx.batchId) {
                      handleOneClickInvoice(ctx.reqId, ctx.batchId, true);
                    }
                  }}
                  style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#059669', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                >
                  Proceed Partial Tax Invoice ({partialConfirmModal.data.ready_count} Ready Item{partialConfirmModal.data.ready_count > 1 ? 's' : ''})
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showForwardMfgModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '12px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '700px', maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto', padding: '22px' }}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', color: '#0f172a' }}>New Customer Order &rarr; Direct to Manufacturing</h3>
            <p style={{ margin: '0 0 14px 0', fontSize: '12px', color: '#64748b' }}>
              Enter Party, Finished Product, Raw Material requirement, HSN &amp; Rates in one place — automatically sends to Manufacturing!
            </p>
            {fwdErr && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', marginBottom: '10px' }}>
                {fwdErr}
              </div>
            )}
            <form onSubmit={handleForwardToMfg} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>1. PARTY &amp; ORDER DETAILS</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: '#f0f9ff', padding: '10px', borderRadius: '8px', border: '1px solid #bae6fd', marginBottom: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#0369a1' }}>Production / Order Type</label>
                    <select value={fwdOrderType} onChange={(e) => {
                      const val = e.target.value as 'OWN' | 'JOB_WORK';
                      setFwdOrderType(val);
                      if (val === 'JOB_WORK') setFwdFinHsn('9988');
                    }} style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #7dd3fc', marginTop: '3px', fontWeight: 600 }}>
                      <option value="OWN">Own Production (Company Material)</option>
                      <option value="JOB_WORK">Job Work — SAC 9988 (Party Material)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#0369a1' }}>Party Challan / Job Ref #</label>
                    <input value={fwdPartyChallan} onChange={(e) => setFwdPartyChallan(e.target.value)} placeholder="e.g. CH-402 (for Job Work)" style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #7dd3fc', marginTop: '3px', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Party / Customer Name *</label>
                    <input
                      list="party-list"
                      required
                      placeholder="Select or type party name"
                      value={fwdCustomer}
                      onChange={(e) => setFwdCustomer(e.target.value)}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }}
                    />
                    <datalist id="party-list">
                      {customers.map((c) => (
                        <option key={c.id} value={c.customer_name} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Order Ref #</label>
                    <input type="text" value={fwdSalesRef} onChange={(e) => setFwdSalesRef(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box', fontWeight: 700, color: '#7c3aed' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Manufacturing Unit *</label>
                    <select required value={fwdMfgUnitId} onChange={(e) => setFwdMfgUnitId(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', background: '#fff' }}>
                      {mfgUnits.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#0369a1' }}>2. FINISHED PRODUCT TO SUPPLY</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button type="button" onClick={() => setFwdFinMode('new')} style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid #0284c7', background: fwdFinMode === 'new' ? '#0284c7' : '#fff', color: fwdFinMode === 'new' ? '#fff' : '#0284c7', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>+ Type New Item</button>
                    <button type="button" onClick={() => setFwdFinMode('existing')} style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid #0284c7', background: fwdFinMode === 'existing' ? '#0284c7' : '#fff', color: fwdFinMode === 'existing' ? '#fff' : '#0284c7', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Select Existing</button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '10px', marginBottom: '8px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Finished Product Name *</label>
                    {fwdFinMode === 'existing' ? (
                      <select
                        required
                        value={fwdItemId}
                        onChange={(e) => {
                          const id = e.target.value;
                          if (id === '__NEW__') { setFwdFinMode('new'); setFwdItemId(''); return; }
                          setFwdItemId(id);
                          const it = allItems.find((x) => String(x.id) === id);
                          if (it) {
                            setFwdFinUnit(it.unit || 'Nos');
                            setFwdFinHsn(it.hsn_code || '');
                            setFwdSellRate(String(it.selling_rate || ''));
                            setFwdCostRate(String(it.standard_rate || ''));
                          }
                        }}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', background: '#fff' }}
                      >
                        <option value="">-- Choose Finished Product --</option>
                        {(allItems.filter((it) => !String(it.category || '').toLowerCase().includes('raw')).length > 0
                          ? allItems.filter((it) => !String(it.category || '').toLowerCase().includes('raw'))
                          : allItems
                        ).map((it) => (
                          <option key={it.id} value={it.id}>{it.item_name} ({it.unit})</option>
                        ))}
                        <option value="__NEW__">+ Create New Finished Product...</option>
                      </select>
                    ) : (
                      <input
                        type="text"
                        required
                        placeholder="e.g. Epoxy Shield Paint"
                        value={fwdFinName}
                        onChange={(e) => {
                          const nm = e.target.value;
                          setFwdFinName(nm);
                          const sug = suggestHsnFromNameOrCategory(nm, 'Finished Goods');
                          if (sug) {
                            setFwdFinHsn(sug.hsn);
                            setFwdFinGst(sug.gst);
                          }
                        }}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }}
                      />
                    )}
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Order Qty *</label>
                    <input type="number" step="0.01" min="0.01" required value={fwdQty} onChange={(e) => setFwdQty(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Unit (UOM) *</label>
                    <select value={fwdFinUnit} onChange={(e) => setFwdFinUnit(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', background: '#fff' }}>
                      {UOM_LIST.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>HSN Code (Auto)</label>
                    <input type="text" placeholder="e.g. 3208" value={fwdFinHsn} onChange={(e) => setFwdFinHsn(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>GST %</label>
                    <select value={fwdFinGst} onChange={(e) => setFwdFinGst(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', background: '#fff' }}>
                      <option value="0">0%</option>
                      <option value="5">5%</option>
                      <option value="12">12%</option>
                      <option value="18">18%</option>
                      <option value="28">28%</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Selling Rate ({symbol}) *</label>
                    <input type="number" step="0.01" required placeholder="e.g. 650" value={fwdSellRate} onChange={(e) => setFwdSellRate(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>Mfg Cost Rate ({symbol})</label>
                    <input type="number" step="0.01" placeholder="e.g. 420" value={fwdCostRate} onChange={(e) => setFwdCostRate(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }} />
                  </div>
                </div>
              </div>

              <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#92400e' }}>3. RAW MATERIALS REQUIRED FOR THIS ORDER ({fwdRawRows.length} ITEM{fwdRawRows.length > 1 ? 'S' : ''})</span>
                  <button
                    type="button"
                    onClick={() =>
                      setFwdRawRows((prev) => [
                        ...prev,
                        { mode: 'new', item_id: '', item_name: '', unit: 'Kg', hsn_code: '', qty: '', purchase_rate: '', wastage: '0' },
                      ])
                    }
                    style={{ padding: '4px 10px', borderRadius: '5px', border: 'none', background: '#d97706', color: '#fff', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    + Add Raw Material
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {fwdRawRows.map((row, idx) => {
                    const updateRow = (patch: Partial<typeof row>) =>
                      setFwdRawRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
                    return (
                      <div key={idx} style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '7px', padding: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#78350f' }}>RM #{idx + 1}</span>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <button
                              type="button"
                              onClick={() => updateRow({ mode: 'existing' })}
                              style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid #d97706', background: row.mode === 'existing' ? '#d97706' : '#fff', color: row.mode === 'existing' ? '#fff' : '#d97706', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                            >
                              Select Existing RM
                            </button>
                            <button
                              type="button"
                              onClick={() => updateRow({ mode: 'new' })}
                              style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid #d97706', background: row.mode === 'new' ? '#d97706' : '#fff', color: row.mode === 'new' ? '#fff' : '#d97706', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                            >
                              + Type New RM
                            </button>
                            {fwdRawRows.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setFwdRawRows((prev) => prev.filter((_, i) => i !== idx))}
                                style={{ padding: '2px 7px', borderRadius: '4px', border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '10px', marginBottom: '8px' }}>
                          <div>
                            <label style={{ fontSize: '12px', fontWeight: 600 }}>Raw Material Name</label>
                            {row.mode === 'existing' ? (
                              <select
                                value={row.item_id}
                                onChange={(e) => {
                                  const id = e.target.value;
                                  const it = allItems.find((x) => String(x.id) === id);
                                  updateRow({
                                    item_id: id,
                                    ...(it
                                      ? {
                                          unit: it.unit || 'Kg',
                                          hsn_code: it.hsn_code || '',
                                          purchase_rate: String(it.standard_rate || ''),
                                        }
                                      : {}),
                                  });
                                }}
                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', background: '#fff' }}
                              >
                                <option value="">-- Choose Raw Material --</option>
                                {allItems.filter((it) => !String(it.category || '').toLowerCase().includes('finish')).map((it) => (
                                  <option key={it.id} value={it.id}>{it.item_name} ({it.unit}) — Stock: {it.current_stock}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                placeholder="e.g. Polyester Lycra / Cotton Lycra"
                                value={row.item_name}
                                onChange={(e) => {
                                  const nm = e.target.value;
                                  const sug = suggestHsnFromNameOrCategory(nm, 'Raw Material');
                                  updateRow({ item_name: nm, ...(sug ? { hsn_code: sug.hsn } : {}) });
                                }}
                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }}
                              />
                            )}
                          </div>
                          <div>
                            <label style={{ fontSize: '12px', fontWeight: 600 }}>RM Qty Needed</label>
                            <input type="number" step="0.01" placeholder="e.g. 500" value={row.qty} onChange={(e) => updateRow({ qty: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }} />
                          </div>
                          <div>
                            <label style={{ fontSize: '12px', fontWeight: 600 }}>RM Unit</label>
                            <select value={row.unit} onChange={(e) => updateRow({ unit: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', background: '#fff' }}>
                              {UOM_LIST.map((u) => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                          <div>
                            <label style={{ fontSize: '12px', fontWeight: 600 }}>RM HSN Code</label>
                            <input type="text" placeholder="e.g. 5402" value={row.hsn_code} onChange={(e) => updateRow({ hsn_code: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }} />
                          </div>
                          <div>
                            <label style={{ fontSize: '12px', fontWeight: 600 }}>RM Purchase Rate ({symbol})</label>
                            <input type="number" step="0.01" placeholder="e.g. 180" value={row.purchase_rate} onChange={(e) => updateRow({ purchase_rate: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }} />
                          </div>
                          <div>
                            <label style={{ fontSize: '12px', fontWeight: 600 }}>Wastage %</label>
                            <input type="number" step="0.1" value={row.wastage} onChange={(e) => updateRow({ wastage: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {(() => {
                  const totalRmCost = fwdRawRows.reduce((acc, r) => {
                    const q = parseFloat(r.qty || '0') || 0;
                    const rt = parseFloat(r.purchase_rate || '0') || 0;
                    const w = parseFloat(r.wastage || '0') || 0;
                    return acc + q * (1 + w / 100) * rt;
                  }, 0);
                  const ordQ = parseFloat(fwdQty || '0') || 0;
                  const unitRmCost = ordQ > 0 ? totalRmCost / ordQ : 0;
                  return (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #f59e0b', fontSize: '12px', color: '#78350f', flexWrap: 'wrap', gap: '8px' }}>
                      <span>
                        Est. Total RM Cost: <strong>{symbol}{totalRmCost.toFixed(2)}</strong>
                        {ordQ > 0 ? <> &bull; Per {fwdFinUnit}: <strong>{symbol}{unitRmCost.toFixed(2)}</strong></> : null}
                      </span>
                      {unitRmCost > 0 && (
                        <button
                          type="button"
                          onClick={() => setFwdCostRate(unitRmCost.toFixed(2))}
                          style={{ padding: '3px 8px', borderRadius: '4px', border: '1px solid #b45309', background: '#fff', color: '#b45309', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Use as Mfg Cost Rate ({symbol}{unitRmCost.toFixed(2)})
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>Delivery Notes / Instructions</label>
                <input type="text" placeholder="e.g. Deliver in 2 date-wise batches..." value={fwdNotes} onChange={(e) => setFwdNotes(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                <button type="button" onClick={() => setShowForwardMfgModal(false)} style={{ padding: '9px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                <button type="submit" disabled={fwdBusy} style={{ padding: '9px 20px', borderRadius: '6px', border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  {fwdBusy ? 'Submitting...' : 'Submit Order to Manufacturing'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
