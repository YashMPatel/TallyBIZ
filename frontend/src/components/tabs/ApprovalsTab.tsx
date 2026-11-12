import React, { useState } from 'react';
import { CheckCircle2, Clock, Check, AlertCircle, X, RefreshCw, Eye } from 'lucide-react';
import { API_BASE, getErrorMessage } from '../../utils/erpHelpers';
import type { SalesInvoice, PurchaseInvoice } from '../../types/erp';

interface ApprovalsTabProps {
  invoices: SalesInvoice[];
  purchases: PurchaseInvoice[];
  onRefresh: () => void;
}

export const ApprovalsTab: React.FC<ApprovalsTabProps> = ({ invoices, purchases, onRefresh }) => {
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ડિટેઇલ વ્યુ મોડલ સ્ટેટ
  const [viewDoc, setViewDoc] = useState<{
    type: 'sales' | 'purchase';
    data: SalesInvoice | PurchaseInvoice;
  } | null>(null);

  // ફક્ત એવા દસ્તાવેજો લિસ્ટ કરો જે હજુ Approved કે Rejected નથી
  const pendingSales = invoices.filter(inv => inv.status !== 'Approved' && inv.status !== 'Rejected');
  const pendingPurchases = purchases.filter(pur => pur.status !== 'Approved' && pur.status !== 'Rejected');

  const handleApprove = async (docType: 'sales-invoice' | 'purchase-invoice', id: number) => {
    const key = `${docType}-${id}`;
    setApprovingId(key);
    setMsg(null);

    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_BASE}/accounts/approve/${docType}/${id}/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Approval failed');
      }

      setMsg({ type: 'success', text: data.message || 'Document Approved successfully!' });
      setViewDoc(null);
      onRefresh();
    } catch (err) {
      setMsg({ type: 'error', text: getErrorMessage(err) });
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async (docType: 'sales' | 'purchase', id: number) => {
    const reason = window.prompt("કૃપા કરીને Reject કરવાનું કારણ લખો (Rejection Reason):");
    if (!reason || !reason.trim()) {
      alert("Rejection reason લખવું ફરજિયાત છે.");
      return;
    }

    const key = `${docType}-${id}`;
    setRejectingId(key);
    setMsg(null);

    const endpoint = docType === 'sales'
      ? `${API_BASE}/selling/invoices/${id}/`
      : `${API_BASE}/buying/invoices/${id}/`;

    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          status: 'Rejected',
          rejection_reason: reason.trim()
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reject document');
      }

      setMsg({ type: 'success', text: 'Document Rejected successfully with reason.' });
      setViewDoc(null);
      onRefresh();
    } catch (err) {
      setMsg({ type: 'error', text: getErrorMessage(err) });
    } finally {
      setRejectingId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Banner */}
      <div style={{ background: '#fff', padding: '20px 24px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={20} color="#f59e0b" />
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>Pending Approvals (Maker-Checker)</h2>
          </div>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0 0' }}>
            Verify pending invoices and bills. Approving will automatically commit stock deductions and General Ledger postings.
          </p>
        </div>
        <button
          onClick={onRefresh}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#475569', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
        >
          <RefreshCw size={14} /> Refresh Queue
        </button>
      </div>

      {msg && (
        <div style={{
          padding: '12px 16px', borderRadius: '8px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px',
          background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${msg.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
          color: msg.type === 'success' ? '#15803d' : '#b91c1c'
        }}>
          {msg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* 1. Pending Sales Invoices */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          Sales Invoices Awaiting Approval
          <span style={{ fontSize: '11px', background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '12px' }}>
            {pendingSales.length}
          </span>
        </h3>

        {pendingSales.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
            No sales invoices pending approval.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                <th style={{ padding: '10px 12px' }}>Invoice #</th>
                <th style={{ padding: '10px 12px' }}>Customer</th>
                <th style={{ padding: '10px 12px' }}>Date</th>
                <th style={{ padding: '10px 12px' }}>Amount</th>
                <th style={{ padding: '10px 12px' }}>Status</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {pendingSales.map((inv) => (
                <tr key={inv.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px', fontWeight: '600', color: '#0284c7' }}>{inv.invoice_number}</td>
                  <td style={{ padding: '12px' }}>{inv.customer_name}</td>
                  <td style={{ padding: '12px', color: '#64748b' }}>{inv.posting_date}</td>
                  <td style={{ padding: '12px', fontWeight: '600' }}>₹{Number(inv.grand_total).toFixed(2)}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', background: '#fef3c7', color: '#b45309' }}>
                      {inv.status || 'Pending Approval'}
                    </span>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button
                        onClick={() => setViewDoc({ type: 'sales', data: inv })}
                        style={{
                          background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd', padding: '6px 12px', borderRadius: '6px',
                          fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px'
                        }}
                      >
                        <Eye size={14} /> View
                      </button>

                      <button
                        disabled={approvingId === `sales-invoice-${inv.id}` || rejectingId === `sales-${inv.id}`}
                        onClick={() => inv.id && handleApprove('sales-invoice', inv.id)}
                        style={{
                          background: '#059669', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px',
                          fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px'
                        }}
                      >
                        <Check size={14} /> {approvingId === `sales-invoice-${inv.id}` ? 'Approving...' : 'Approve'}
                      </button>

                      <button
                        disabled={approvingId === `sales-invoice-${inv.id}` || rejectingId === `sales-${inv.id}`}
                        onClick={() => inv.id && handleReject('sales', inv.id)}
                        style={{
                          background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', padding: '6px 12px', borderRadius: '6px',
                          fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px'
                        }}
                      >
                        <X size={14} /> {rejectingId === `sales-${inv.id}` ? 'Rejecting...' : 'Reject'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 2. Pending Purchase Bills */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          Purchase Bills Awaiting Approval
          <span style={{ fontSize: '11px', background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '12px' }}>
            {pendingPurchases.length}
          </span>
        </h3>

        {pendingPurchases.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
            No purchase bills pending approval.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                <th style={{ padding: '10px 12px' }}>Bill #</th>
                <th style={{ padding: '10px 12px' }}>Supplier</th>
                <th style={{ padding: '10px 12px' }}>Date</th>
                <th style={{ padding: '10px 12px' }}>Amount</th>
                <th style={{ padding: '10px 12px' }}>Status</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {pendingPurchases.map((pur) => (
                <tr key={pur.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px', fontWeight: '600', color: '#0284c7' }}>{pur.bill_number}</td>
                  <td style={{ padding: '12px' }}>{pur.supplier_name}</td>
                  <td style={{ padding: '12px', color: '#64748b' }}>{pur.posting_date}</td>
                  <td style={{ padding: '12px', fontWeight: '600' }}>₹{Number(pur.grand_total).toFixed(2)}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', background: '#fef3c7', color: '#b45309' }}>
                      {pur.status || 'Pending Approval'}
                    </span>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button
                        onClick={() => setViewDoc({ type: 'purchase', data: pur })}
                        style={{
                          background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd', padding: '6px 12px', borderRadius: '6px',
                          fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px'
                        }}
                      >
                        <Eye size={14} /> View
                      </button>

                      <button
                        disabled={approvingId === `purchase-invoice-${pur.id}` || rejectingId === `purchase-${pur.id}`}
                        onClick={() => pur.id && handleApprove('purchase-invoice', pur.id)}
                        style={{
                          background: '#059669', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px',
                          fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px'
                        }}
                      >
                        <Check size={14} /> {approvingId === `purchase-invoice-${pur.id}` ? 'Approving...' : 'Approve'}
                      </button>

                      <button
                        disabled={approvingId === `purchase-invoice-${pur.id}` || rejectingId === `purchase-${pur.id}`}
                        onClick={() => pur.id && handleReject('purchase', pur.id)}
                        style={{
                          background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', padding: '6px 12px', borderRadius: '6px',
                          fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px'
                        }}
                      >
                        <X size={14} /> {rejectingId === `purchase-${pur.id}` ? 'Rejecting...' : 'Reject'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* View Detail Modal */}
      {viewDoc && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100
        }}>
          <div style={{
            background: '#ffffff', borderRadius: '12px', padding: '24px', width: '700px',
            maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', color: '#0f172a' }}>
                  {viewDoc.type === 'sales' ? 'Sales Invoice Review' : 'Purchase Bill Review'}
                </h3>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  {viewDoc.type === 'sales'
                    ? (viewDoc.data as SalesInvoice).invoice_number
                    : (viewDoc.data as PurchaseInvoice).bill_number}
                </span>
              </div>
              <button
                onClick={() => setViewDoc(null)}
                style={{ background: '#f1f5f9', border: 'none', color: '#64748b', padding: '6px', borderRadius: '6px', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Document Info */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', background: '#f8fafc', padding: '14px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
              <div>
                <div style={{ color: '#64748b', fontSize: '11px' }}>Party</div>
                <strong style={{ color: '#0f172a' }}>
                  {viewDoc.type === 'sales'
                    ? (viewDoc.data as SalesInvoice).customer_name
                    : (viewDoc.data as PurchaseInvoice).supplier_name}
                </strong>
              </div>
              <div>
                <div style={{ color: '#64748b', fontSize: '11px' }}>Posting Date</div>
                <strong>{viewDoc.data.posting_date}</strong>
              </div>
              <div>
                <div style={{ color: '#64748b', fontSize: '11px' }}>Status</div>
                <span style={{ color: '#b45309', fontWeight: 'bold' }}>{viewDoc.data.status}</span>
              </div>
            </div>

            {/* Items Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px', marginBottom: '16px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ padding: '8px 10px' }}>Item</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Qty</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Rate (₹)</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Disc %</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {(viewDoc.data.items || []).map((itm: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 10px', fontWeight: '500' }}>
                      {typeof itm.item === 'object' ? (itm.item.item_name || itm.item.item_code) : (itm.item_name || `Item #${itm.item}`)}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{itm.quantity}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{Number(itm.rate).toFixed(2)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{itm.discount_percentage || 0}%</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '600' }}>{Number(itm.amount).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Summary Box */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Net Total:</span>
                <strong>₹{Number(viewDoc.data.net_total || 0).toFixed(2)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Tax Amount:</span>
                <strong>₹{Number(viewDoc.data.tax_amount || 0).toFixed(2)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '6px', fontSize: '15px' }}>
                <strong>Grand Total:</strong>
                <strong style={{ color: '#0284c7' }}>₹{Number(viewDoc.data.grand_total || 0).toFixed(2)}</strong>
              </div>
            </div>

            {/* Footer Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setViewDoc(null)}
                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f1f5f9', color: '#475569', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}
              >
                Close
              </button>

              <button
                onClick={() => {
                  if (viewDoc.data.id) {
                    handleReject(viewDoc.type, viewDoc.data.id);
                  }
                }}
                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #fca5a5', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontWeight: '600', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <X size={14} /> Reject
              </button>

              <button
                onClick={() => {
                  if (viewDoc.data.id) {
                    const docKey = viewDoc.type === 'sales' ? 'sales-invoice' : 'purchase-invoice';
                    handleApprove(docKey, viewDoc.data.id);
                  }
                }}
                style={{ padding: '8px 18px', borderRadius: '6px', border: 'none', background: '#059669', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Check size={14} /> Approve Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};