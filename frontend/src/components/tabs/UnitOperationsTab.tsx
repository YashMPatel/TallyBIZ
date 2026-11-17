import React, { useState, useEffect, useCallback } from 'react';
import { Wallet, Plus, ArrowUpCircle, ArrowDownCircle, Send, CheckCircle, XCircle, Printer, Users } from 'lucide-react';
import { API_BASE, getErrorMessage } from '../../utils/erpHelpers';

interface UnitOperationsTabProps {
  activeCompany: any;
  businessUnits: any[];
  activeUnitId: string;
  user: any;
  onRefreshGlobal?: () => void;
}

export const UnitOperationsTab: React.FC<UnitOperationsTabProps> = ({
  activeCompany,
  businessUnits,
  activeUnitId,
  user,
  onRefreshGlobal,
}) => {
  const symbol = activeCompany?.currency_symbol || localStorage.getItem('active_company_symbol') || '₹';
  const activeUnit = businessUnits.find((u) => String(u.id) === String(activeUnitId));
  const isHOorAll = activeUnitId === 'all' || activeUnit?.unit_type === 'HO';
  const isMfg = activeUnit?.unit_type === 'MANUFACTURING';

  const [subTab, setSubTab] = useState<'petty' | 'requests'>('petty');
  const [pettyData, setPettyData] = useState<{ transactions: any[]; unit_balances: any[]; total_balance: number }>({
    transactions: [],
    unit_balances: [],
    total_balance: 0,
  });
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // Petty Cash Modal
  const [showPettyModal, setShowPettyModal] = useState(false);
  const [pettyType, setPettyType] = useState<'HO_ALLOCATION' | 'COUNTER_EXPENSE' | 'SCRAP_INCOME'>('COUNTER_EXPENSE');
  const [pettyUnitId, setPettyUnitId] = useState<string>('');
  const [pettyDate, setPettyDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [pettyPayee, setPettyPayee] = useState('');
  const [pettyHead, setPettyHead] = useState('Daily Unit Expense');
  const [pettyAmount, setPettyAmount] = useState('');
  const [pettyDesc, setPettyDesc] = useState('');
  const [printVoucher, setPrintVoucher] = useState<any | null>(null);

  // Salary / Expense Request Modal
  const [showReqModal, setShowReqModal] = useState(false);
  const [reqType, setReqType] = useState<'SALARY' | 'EXPENSE' | 'PETTY_TOPUP'>('SALARY');
  const [reqTitle, setReqTitle] = useState('');
  const [reqDetails, setReqDetails] = useState('');
  const [reqAmount, setReqAmount] = useState('');
  const [salaryRows, setSalaryRows] = useState<Array<{ worker_name: string; work_note: string; amount: string }>>([
    { worker_name: '', work_note: 'Monthly / Weekly Wages', amount: '' },
  ]);

  const loadAll = useCallback(async () => {
    if (!activeCompany?.id) return;
    setLoading(true);
    try {
      const [pRes, rRes] = await Promise.all([
        fetch(`${API_BASE}/accounts/petty-cash/?company_id=${activeCompany.id}`),
        fetch(`${API_BASE}/accounts/requests/?company_id=${activeCompany.id}`),
      ]);
      if (pRes.ok) setPettyData(await pRes.json());
      if (rRes.ok) setRequests(await rRes.json());
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [activeCompany?.id]);

  useEffect(() => {
    void loadAll();
  }, [loadAll, activeUnitId]);

  const openPettyForm = (type: 'HO_ALLOCATION' | 'COUNTER_EXPENSE' | 'SCRAP_INCOME') => {
    setErr('');
    setMsg('');
    setPettyType(type);
    const defaultU = activeUnitId !== 'all'
      ? activeUnitId
      : String(businessUnits.find((u) => u.unit_type === 'MANUFACTURING')?.id || businessUnits[0]?.id || '');
    setPettyUnitId(defaultU);
    setPettyPayee(type === 'HO_ALLOCATION' ? 'Head Office' : '');
    setPettyHead(
      type === 'HO_ALLOCATION'
        ? 'Petty Cash Credit Allocation'
        : type === 'SCRAP_INCOME'
        ? 'Scrap & Waste Cash Sale'
        : 'Tea, Snacks & Local Conveyance'
    );
    setPettyAmount('');
    setPettyDesc('');
    setShowPettyModal(true);
  };

  const handleSavePetty = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const res = await fetch(`${API_BASE}/accounts/petty-cash/?company_id=${activeCompany.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unit_id: pettyUnitId || activeUnitId,
          txn_type: pettyType,
          posting_date: pettyDate,
          party_or_payee: pettyPayee,
          expense_head: pettyHead,
          amount: pettyAmount,
          description: pettyDesc,
          created_by: user?.username || 'User',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save voucher');
      setShowPettyModal(false);
      setMsg(`Voucher ${data.voucher_no} saved & synced with Head Office!`);
      await loadAll();
      if (onRefreshGlobal) onRefreshGlobal();
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const cleanRows = reqType === 'SALARY'
        ? salaryRows.filter((r) => r.worker_name.trim() && Number(r.amount) > 0).map((r) => ({ ...r, amount: Number(r.amount) }))
        : [];
      const totalSal = cleanRows.reduce((s, r) => s + r.amount, 0);
      const finalAmt = reqType === 'SALARY' && totalSal > 0 ? totalSal : Number(reqAmount || 0);

      const res = await fetch(`${API_BASE}/accounts/requests/?company_id=${activeCompany.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_unit_id: activeUnitId !== 'all' ? activeUnitId : businessUnits[0]?.id,
          request_type: reqType,
          title: reqTitle || (reqType === 'SALARY' ? 'Worker Salary Payout List' : 'Unit Expense Request'),
          details: reqDetails,
          line_items: cleanRows,
          amount: finalAmt,
          requested_by: user?.username || 'Unit Staff',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit request');
      setShowReqModal(false);
      setMsg(`Request ${data.request_no} sent to Head Office!`);
      await loadAll();
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  };

  const handleResolveRequest = async (reqId: number, action: 'CLOSE' | 'REJECT') => {
    try {
      const res = await fetch(`${API_BASE}/accounts/requests/${reqId}/resolve/?company_id=${activeCompany.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          resolved_by: user?.username || 'Head Office',
          resolution_note: action === 'CLOSE' ? 'Approved, paid by Head Office & closed.' : 'Rejected by Head Office',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
      setMsg(`Request ${data.request_no || ''} marked ${data.status}!`);
      await loadAll();
      if (onRefreshGlobal) onRefreshGlobal();
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  };

  const visibleBalances = isHOorAll
    ? pettyData.unit_balances
    : pettyData.unit_balances.filter((b) => String(b.unit_id) === String(activeUnitId));

  const openReqCount = requests.filter((r) => r.status === 'OPEN').length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 6px 0' }}>
            Unit Petty Cash, Counter Receipts &amp; Requests {activeUnit ? `— ${activeUnit.name}` : '(Head Office Control)'}
          </h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>
            Imprest Credit Balance (+ / -), Daily Counter Receipts (auto-sent to HO), Scrap Cash Income &amp; Worker Salary Requests
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {isHOorAll && (
            <button
              onClick={() => openPettyForm('HO_ALLOCATION')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#0284c7', color: '#fff', border: 'none', padding: '10px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
            >
              <ArrowUpCircle size={16} /> + Allocate Credit to Unit
            </button>
          )}
          <button
            onClick={() => openPettyForm('COUNTER_EXPENSE')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#dc2626', color: '#fff', border: 'none', padding: '10px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
          >
            <ArrowDownCircle size={16} /> Counter Receipt (Expense -)
          </button>
          {(isMfg || isHOorAll) && (
            <button
              onClick={() => openPettyForm('SCRAP_INCOME')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#16a34a', color: '#fff', border: 'none', padding: '10px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
            >
              <Plus size={16} /> Scrap / Waste Cash Voucher (+)
            </button>
          )}
          <button
            onClick={() => {
              setErr('');
              setReqType('SALARY');
              setReqTitle('');
              setReqDetails('');
              setReqAmount('');
              setSalaryRows([{ worker_name: '', work_note: 'Wages / Salary', amount: '' }]);
              setShowReqModal(true);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#7c3aed', color: '#fff', border: 'none', padding: '10px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
          >
            <Send size={16} /> + New Salary / Expense Request
          </button>
        </div>
      </div>

      {msg && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#15803d', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', fontWeight: 600 }}>
          {msg}
        </div>
      )}
      {err && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
          {err}
        </div>
      )}

      {/* Unit Petty Cash Credit Balance Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '22px' }}>
        {visibleBalances.map((b) => (
          <div key={b.unit_id} style={{ background: '#fff', padding: '18px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>{b.name}</span>
              <Wallet size={16} color="#0284c7" />
            </div>
            <h2 style={{ margin: '8px 0', fontSize: '22px', color: b.credit_balance >= 0 ? '#15803d' : '#dc2626' }}>
              {symbol} {Number(b.credit_balance).toFixed(2)}
            </h2>
            <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
              <span>Credit (+): {symbol}{Number(b.total_credited).toFixed(0)}</span>
              <span>Spent (-): {symbol}{Number(b.total_spent).toFixed(0)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          onClick={() => setSubTab('petty')}
          style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '13px', background: subTab === 'petty' ? '#0f172a' : '#e2e8f0', color: subTab === 'petty' ? '#fff' : '#334155' }}
        >
          Petty Cash &amp; Counter Receipts ({pettyData.transactions.length})
        </button>
        <button
          onClick={() => setSubTab('requests')}
          style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '13px', background: subTab === 'requests' ? '#0f172a' : '#e2e8f0', color: subTab === 'requests' ? '#fff' : '#334155' }}
        >
          Salary &amp; Expense Requests ({requests.length}) {openReqCount > 0 ? `• ${openReqCount} Open` : ''}
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '20px', color: '#64748b' }}>Loading unit operations...</div>
      ) : subTab === 'petty' ? (
        <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#334155' }}>
                <th style={{ padding: '10px 12px' }}>Voucher #</th>
                <th style={{ padding: '10px 12px' }}>Date</th>
                <th style={{ padding: '10px 12px' }}>Unit</th>
                <th style={{ padding: '10px 12px' }}>Type</th>
                <th style={{ padding: '10px 12px' }}>Payee / Particulars</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Credit Impact ({symbol})</th>
                <th style={{ padding: '10px 12px' }}>HO Sync</th>
                <th style={{ padding: '10px 12px' }}>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {pettyData.transactions.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                    No petty cash or counter receipt entries yet.
                  </td>
                </tr>
              ) : (
                pettyData.transactions.map((t) => {
                  const isPlus = t.txn_type !== 'COUNTER_EXPENSE';
                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0284c7' }}>{t.voucher_no}</td>
                      <td style={{ padding: '10px 12px' }}>{t.posting_date}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{t.unit_name}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700,
                          background: t.txn_type === 'HO_ALLOCATION' ? '#dbeafe' : t.txn_type === 'SCRAP_INCOME' ? '#dcfce7' : '#fee2e2',
                          color: t.txn_type === 'HO_ALLOCATION' ? '#1d4ed8' : t.txn_type === 'SCRAP_INCOME' ? '#15803d' : '#b91c1c',
                        }}>
                          {t.txn_type === 'HO_ALLOCATION' ? 'HO Credit (+)' : t.txn_type === 'SCRAP_INCOME' ? 'Scrap Cash (+)' : 'Counter Receipt (-)'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <strong>{t.expense_head}</strong>
                        {t.party_or_payee ? ` — ${t.party_or_payee}` : ''}
                        {t.description ? <div style={{ fontSize: '11px', color: '#64748b' }}>{t.description}</div> : null}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: isPlus ? '#15803d' : '#dc2626' }}>
                        {isPlus ? `+ ${symbol}${Number(t.amount).toFixed(2)}` : `- ${symbol}${Number(t.amount).toFixed(2)}`}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '11px', color: '#15803d', fontWeight: 600 }}>✓ Sent to HO</td>
                      <td style={{ padding: '10px 12px' }}>
                        <button
                          onClick={() => setPrintVoucher(t)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}
                        >
                          <Printer size={12} /> Receipt
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {requests.length === 0 ? (
            <div style={{ background: '#fff', padding: '24px', borderRadius: '10px', border: '1px solid #e2e8f0', textAlign: 'center', color: '#64748b' }}>
              No salary or expense requests generated yet.
            </div>
          ) : (
            requests.map((r) => (
              <div key={r.id} style={{ background: '#fff', padding: '16px 20px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 700, color: '#7c3aed' }}>{r.request_no}</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px' }}>{r.from_unit_name} → {r.to_unit_name}</span>
                    <span style={{
                      fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px',
                      background: r.status === 'CLOSED' ? '#dcfce7' : r.status === 'REJECTED' ? '#fee2e2' : '#fef3c7',
                      color: r.status === 'CLOSED' ? '#15803d' : r.status === 'REJECTED' ? '#b91c1c' : '#92400e',
                    }}>
                      {r.status}
                    </span>
                  </div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '15px' }}>{r.title}</h3>
                  {r.details && <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#475569' }}>{r.details}</p>}
                  {Array.isArray(r.line_items) && r.line_items.length > 0 && (
                    <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', marginTop: '6px' }}>
                      {r.line_items.map((li: any, idx: number) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                          <span>{li.worker_name || li.item_name} ({li.work_note || `${li.qty || ''} ${li.unit || ''}`})</span>
                          <strong>{symbol} {Number(li.amount || 0).toFixed(2)}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
                    {symbol} {Number(r.amount || 0).toFixed(2)}
                  </div>
                  {isHOorAll && r.status === 'OPEN' && r.request_type !== 'MATERIAL_PURCHASE' && (
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => void handleResolveRequest(r.id, 'CLOSE')}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#16a34a', color: '#fff', border: 'none', padding: '7px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}
                      >
                        <CheckCircle size={14} /> Approve, Pay &amp; Close
                      </button>
                      <button
                        onClick={() => void handleResolveRequest(r.id, 'REJECT')}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', padding: '7px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}
                      >
                        <XCircle size={14} /> Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Petty Cash / Counter Receipt / Scrap Cash Modal */}
      {showPettyModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '460px', maxWidth: '94vw', padding: '22px' }}>
            <h3 style={{ margin: '0 0 14px 0', fontSize: '17px' }}>
              {pettyType === 'HO_ALLOCATION'
                ? 'Allocate Petty Cash Credit (+) to Unit'
                : pettyType === 'SCRAP_INCOME'
                ? 'Scrap / Waste Cash Received Voucher (+)'
                : 'Issue Counter Receipt — Daily Expense (-)'}
            </h3>
            <form onSubmit={handleSavePetty} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>Target Unit *</label>
                <select
                  value={pettyUnitId}
                  onChange={(e) => setPettyUnitId(e.target.value)}
                  disabled={!isHOorAll}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px' }}
                >
                  {businessUnits.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>Date *</label>
                  <input type="date" required value={pettyDate} onChange={(e) => setPettyDate(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>Amount ({symbol}) *</label>
                  <input type="number" step="0.01" min="0.01" required value={pettyAmount} onChange={(e) => setPettyAmount(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>{pettyType === 'SCRAP_INCOME' ? 'Buyer / Scrap Party Name' : 'Paid To / Receiver Name'}</label>
                <input type="text" value={pettyPayee} onChange={(e) => setPettyPayee(e.target.value)} placeholder="e.g. Ramesh Tea Stall / Scrap Buyer" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>Expense / Income Head *</label>
                <input type="text" required value={pettyHead} onChange={(e) => setPettyHead(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>Remarks / Description</label>
                <input type="text" value={pettyDesc} onChange={(e) => setPettyDesc(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button type="button" onClick={() => setShowPettyModal(false)} style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#0284c7', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Save &amp; Send to HO</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Salary / Expense Request Modal */}
      {showReqModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '540px', maxWidth: '95vw', padding: '22px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 14px 0', fontSize: '17px' }}>Generate Request to Head Office</h3>
            <form onSubmit={handleCreateRequest} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>Request Category *</label>
                <select value={reqType} onChange={(e) => setReqType(e.target.value as any)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px' }}>
                  <option value="SALARY">Worker Salary Payout List</option>
                  <option value="EXPENSE">Unit Expense / Machine Maintenance</option>
                  <option value="PETTY_TOPUP">Petty Cash Credit Top-Up Request</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>Request Title *</label>
                <input type="text" required value={reqTitle} onChange={(e) => setReqTitle(e.target.value)} placeholder="e.g. Nov 2026 Factory Worker Salary Sheet" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }} />
              </div>

              {reqType === 'SALARY' ? (
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700 }}><Users size={13} style={{ verticalAlign: 'middle' }} /> Worker Salary List</span>
                    <button type="button" onClick={() => setSalaryRows([...salaryRows, { worker_name: '', work_note: 'Wages', amount: '' }])} style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '4px', border: '1px solid #0284c7', color: '#0284c7', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                      + Add Worker
                    </button>
                  </div>
                  {salaryRows.map((row, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.2fr 0.9fr', gap: '6px', marginBottom: '6px' }}>
                      <input type="text" placeholder="Worker Name" value={row.worker_name} onChange={(e) => { const c = [...salaryRows]; c[idx].worker_name = e.target.value; setSalaryRows(c); }} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
                      <input type="text" placeholder="Shift / Days" value={row.work_note} onChange={(e) => { const c = [...salaryRows]; c[idx].work_note = e.target.value; setSalaryRows(c); }} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
                      <input type="number" step="0.01" placeholder="Amount" value={row.amount} onChange={(e) => { const c = [...salaryRows]; c[idx].amount = e.target.value; setSalaryRows(c); }} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }} />
                    </div>
                  ))}
                  <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700, marginTop: '6px' }}>
                    Total Salary: {symbol} {salaryRows.reduce((s, r) => s + (Number(r.amount) || 0), 0).toFixed(2)}
                  </div>
                </div>
              ) : (
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>Requested Amount ({symbol}) *</label>
                  <input type="number" step="0.01" min="0.01" required value={reqAmount} onChange={(e) => setReqAmount(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }} />
                </div>
              )}

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>Notes / Details</label>
                <textarea rows={2} value={reqDetails} onChange={(e) => setReqDetails(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setShowReqModal(false)} style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Submit Request</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Counter Receipt Print Modal */}
      {printVoucher && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300 }}>
          <div style={{ background: '#fff', borderRadius: '10px', width: '400px', padding: '24px', border: '2px solid #0f172a' }}>
            <h3 style={{ margin: '0 0 4px 0', textAlign: 'center' }}>{activeCompany?.name}</h3>
            <div style={{ textAlign: 'center', fontSize: '12px', color: '#475569', borderBottom: '1px dashed #94a3b8', paddingBottom: '8px', marginBottom: '12px' }}>
              {printVoucher.unit_name} — {printVoucher.txn_type === 'SCRAP_INCOME' ? 'CASH RECEIVED VOUCHER' : 'COUNTER EXPENSE RECEIPT'}
            </div>
            <div style={{ fontSize: '13px', lineHeight: 1.8 }}>
              <div><strong>Voucher No:</strong> {printVoucher.voucher_no}</div>
              <div><strong>Date:</strong> {printVoucher.posting_date}</div>
              <div><strong>Party / Payee:</strong> {printVoucher.party_or_payee || '-'}</div>
              <div><strong>Account Head:</strong> {printVoucher.expense_head}</div>
              <div><strong>Amount:</strong> {symbol} {Number(printVoucher.amount).toFixed(2)}</div>
              <div><strong>Remarks:</strong> {printVoucher.description || '-'}</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button onClick={() => window.print()} style={{ padding: '6px 12px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Print</button>
              <button onClick={() => setPrintVoucher(null)} style={{ padding: '6px 12px', background: '#e2e8f0', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
