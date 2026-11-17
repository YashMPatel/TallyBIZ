import React, { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Landmark } from 'lucide-react';
import { API_BASE, getErrorMessage } from '../../utils/erpHelpers';

interface CapitalLoansTabProps {
  activeCompany: any;
  onRefreshGlobal?: () => void;
}

export const CapitalLoansTab: React.FC<CapitalLoansTabProps> = ({ activeCompany, onRefreshGlobal }) => {
  const symbol = activeCompany?.currency_symbol || localStorage.getItem('active_company_symbol') || '₹';
  const [partners, setPartners] = useState<any[]>([]);
  const [partnerSummary, setPartnerSummary] = useState<any>({});
  const [loans, setLoans] = useState<any[]>([]);
  const [loanSummary, setLoanSummary] = useState<any>({});
  const [banks, setBanks] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // New Partner Modal
  const [showPartnerModal, setShowPartnerModal] = useState(false);
  const [pName, setPName] = useState('');
  const [pShare, setPShare] = useState('');
  const [pCash, setPCash] = useState('0');
  const [pAsset, setPAsset] = useState('0');
  const [pAssetDesc, setPAssetDesc] = useState('');
  const [pBankId, setPBankId] = useState('');

  // Partner Txn Modal
  const [partnerTxnTarget, setPartnerTxnTarget] = useState<any | null>(null);
  const [partnerTxnAction, setPartnerTxnAction] = useState<'ADD_CAPITAL' | 'ADD_ASSET' | 'WITHDRAW'>('ADD_CAPITAL');
  const [partnerTxnAmt, setPartnerTxnAmt] = useState('');
  const [partnerTxnNote, setPartnerTxnNote] = useState('');
  const [partnerTxnBank, setPartnerTxnBank] = useState('');

  // New Loan Modal
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [lenderName, setLenderName] = useState('');
  const [loanType, setLoanType] = useState('PRIVATE_UDHARI');
  const [loanPrincipal, setLoanPrincipal] = useState('');
  const [loanRate, setLoanRate] = useState('0');
  const [loanBankId, setLoanBankId] = useState('');
  const [loanNotes, setLoanNotes] = useState('');

  // Loan Repay Modal
  const [repayLoanTarget, setRepayLoanTarget] = useState<any | null>(null);
  const [repayPrincipal, setRepayPrincipal] = useState('');
  const [repayInterest, setRepayInterest] = useState('0');
  const [repayBankId, setRepayBankId] = useState('');

  const loadData = useCallback(async () => {
    if (!activeCompany?.id) return;
    try {
      const [pRes, lRes, bRes] = await Promise.all([
        fetch(`${API_BASE}/accounts/partners/?company_id=${activeCompany.id}`),
        fetch(`${API_BASE}/accounts/loans/?company_id=${activeCompany.id}`),
        fetch(`${API_BASE}/accounts/bank-accounts/?company_id=${activeCompany.id}`),
      ]);
      if (pRes.ok) {
        const pd = await pRes.json();
        setPartners(pd.partners || []);
        setPartnerSummary(pd.summary || {});
      }
      if (lRes.ok) {
        const ld = await lRes.json();
        setLoans(ld.loans || []);
        setLoanSummary(ld.summary || {});
      }
      if (bRes.ok) {
        const bd = await bRes.json();
        setBanks(Array.isArray(bd) ? bd : []);
      }
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  }, [activeCompany?.id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleAddPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const res = await fetch(`${API_BASE}/accounts/partners/?company_id=${activeCompany.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partner_name: pName,
          share_percentage: pShare,
          capital_cash_bank: pCash,
          asset_contribution: pAsset,
          asset_description: pAssetDesc,
          bank_account_id: pBankId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add partner');
      setShowPartnerModal(false);
      setMsg(`Partner ${data.partner_name} added with Capital & Share %!`);
      await loadData();
      if (onRefreshGlobal) onRefreshGlobal();
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  };

  const handlePartnerTxn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerTxnTarget) return;
    try {
      const res = await fetch(`${API_BASE}/accounts/partners/${partnerTxnTarget.id}/txn/?company_id=${activeCompany.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: partnerTxnAction,
          amount: partnerTxnAmt,
          notes: partnerTxnNote,
          bank_account_id: partnerTxnBank || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Transaction failed');
      setPartnerTxnTarget(null);
      setMsg('Partner capital / asset ledger updated!');
      await loadData();
      if (onRefreshGlobal) onRefreshGlobal();
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  };

  const handleAddLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/accounts/loans/?company_id=${activeCompany.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lender_name: lenderName,
          loan_type: loanType,
          principal_amount: loanPrincipal,
          interest_rate: loanRate,
          bank_account_id: loanBankId || null,
          notes: loanNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add loan');
      setShowLoanModal(false);
      setMsg(`Loan / Borrowed Fund ${data.loan_code} recorded!`);
      await loadData();
      if (onRefreshGlobal) onRefreshGlobal();
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  };

  const handleRepayLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repayLoanTarget) return;
    try {
      const res = await fetch(`${API_BASE}/accounts/loans/${repayLoanTarget.id}/repay/?company_id=${activeCompany.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: repayPrincipal,
          interest_amount: repayInterest,
          bank_account_id: repayBankId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Repayment failed');
      setRepayLoanTarget(null);
      setMsg('Loan repayment & interest posted to ledger!');
      await loadData();
      if (onRefreshGlobal) onRefreshGlobal();
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  };

  const netProfit = Number(partnerSummary.company_net_profit || 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 6px 0' }}>
            Partners Capital, Assets, Profit/Loss Share % &amp; Loans
          </h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>
            Track multiple owners, cash/asset investments, live profit/loss share % and borrowed funds / loans
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => {
              setPName(''); setPShare(''); setPCash('0'); setPAsset('0'); setPAssetDesc('');
              setPBankId(String(banks.find((b) => b.purpose === 'PARTNER_LOAN')?.id || banks[0]?.id || ''));
              setShowPartnerModal(true);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#0284c7', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
          >
            <Plus size={16} /> Add Partner / Owner
          </button>
          <button
            onClick={() => {
              setLenderName(''); setLoanType('PRIVATE_UDHARI'); setLoanPrincipal(''); setLoanRate('0'); setLoanNotes('');
              setLoanBankId(String(banks.find((b) => b.purpose === 'PARTNER_LOAN')?.id || banks[0]?.id || ''));
              setShowLoanModal(true);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#7c3aed', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
          >
            <Landmark size={16} /> + Add Loan / Borrowed Fund
          </button>
        </div>
      </div>

      {msg && <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#15803d', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}>{msg}</div>}
      {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 14px', borderRadius: '8px', fontSize: '13px' }}>{err}</div>}

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        <div style={{ background: '#fff', padding: '18px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>TOTAL PARTNERS CAPITAL + ASSETS</span>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '20px', color: '#0f172a' }}>{symbol} {Number(partnerSummary.total_combined_capital || 0).toFixed(2)}</h3>
        </div>
        <div style={{ background: '#fff', padding: '18px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>TOTAL SHARE ALLOCATED</span>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '20px', color: Number(partnerSummary.total_share_percentage) === 100 ? '#15803d' : '#d97706' }}>
            {Number(partnerSummary.total_share_percentage || 0).toFixed(2)}%
          </h3>
        </div>
        <div style={{ background: '#fff', padding: '18px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>LIVE COMPANY NET PROFIT / LOSS</span>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '20px', color: netProfit >= 0 ? '#15803d' : '#dc2626' }}>
            {symbol} {netProfit.toFixed(2)}
          </h3>
        </div>
        <div style={{ background: '#fff', padding: '18px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>OUTSTANDING LOANS / UDHARI</span>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '20px', color: '#7c3aed' }}>
            {symbol} {Number(loanSummary.total_outstanding || 0).toFixed(2)}
          </h3>
        </div>
      </div>

      {/* Partners Table */}
      <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '20px' }}>
        <h2 style={{ margin: '0 0 14px 0', fontSize: '17px' }}><Users size={17} style={{ verticalAlign: 'middle', marginRight: '6px' }} /> Partners Capital &amp; Live Profit/Loss Share</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                <th style={{ padding: '10px' }}>Partner Name</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Share %</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Cash/Bank Capital</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Assets Brought</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Current P&amp;L Share</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Drawings (-)</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Net Equity</th>
                <th style={{ padding: '10px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {partners.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '18px', textAlign: 'center', color: '#64748b' }}>No partners added yet. Click "+ Add Partner / Owner" above.</td></tr>
              ) : (
                partners.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px', fontWeight: 700 }}>{p.partner_name}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: '#0284c7' }}>{Number(p.share_percentage).toFixed(2)}%</td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>{symbol} {Number(p.capital_cash_bank).toFixed(2)}</td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>
                      {symbol} {Number(p.asset_contribution).toFixed(2)}
                      {p.asset_description ? <div style={{ fontSize: '11px', color: '#64748b' }}>{p.asset_description}</div> : null}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: p.current_pnl_share >= 0 ? '#15803d' : '#dc2626' }}>
                      {symbol} {Number(p.current_pnl_share).toFixed(2)}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', color: '#b91c1c' }}>{symbol} {Number(p.drawings_withdrawn).toFixed(2)}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 800 }}>{symbol} {Number(p.net_partner_equity).toFixed(2)}</td>
                    <td style={{ padding: '10px' }}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={() => { setPartnerTxnTarget(p); setPartnerTxnAction('ADD_CAPITAL'); setPartnerTxnAmt(''); setPartnerTxnNote(''); setPartnerTxnBank(String(banks.find((b) => b.purpose === 'PARTNER_LOAN')?.id || '')); }} style={{ padding: '4px 7px', fontSize: '11px', borderRadius: '4px', border: '1px solid #0284c7', color: '#0284c7', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>+Cap</button>
                        <button onClick={() => { setPartnerTxnTarget(p); setPartnerTxnAction('ADD_ASSET'); setPartnerTxnAmt(''); setPartnerTxnNote(''); }} style={{ padding: '4px 7px', fontSize: '11px', borderRadius: '4px', border: '1px solid #16a34a', color: '#16a34a', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>+Asset</button>
                        <button onClick={() => { setPartnerTxnTarget(p); setPartnerTxnAction('WITHDRAW'); setPartnerTxnAmt(''); setPartnerTxnNote(''); setPartnerTxnBank(String(banks.find((b) => b.purpose === 'PARTNER_LOAN')?.id || '')); }} style={{ padding: '4px 7px', fontSize: '11px', borderRadius: '4px', border: '1px solid #dc2626', color: '#dc2626', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>-Draw</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Loans & Borrowed Funds Table */}
      <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '20px' }}>
        <h2 style={{ margin: '0 0 14px 0', fontSize: '17px' }}><Landmark size={17} style={{ verticalAlign: 'middle', marginRight: '6px' }} /> Loans &amp; Borrowed Funds (ઉધારી / લોન ખાતું)</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                <th style={{ padding: '10px' }}>Loan #</th>
                <th style={{ padding: '10px' }}>Lender / Fund Source</th>
                <th style={{ padding: '10px' }}>Category</th>
                <th style={{ padding: '10px' }}>Bank A/c</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Borrowed ({symbol})</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Repaid ({symbol})</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Balance Payable</th>
                <th style={{ padding: '10px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loans.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '18px', textAlign: 'center', color: '#64748b' }}>No loans or borrowed funds recorded yet.</td></tr>
              ) : (
                loans.map((ln) => (
                  <tr key={ln.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px', fontWeight: 700, color: '#7c3aed' }}>{ln.loan_code}</td>
                    <td style={{ padding: '10px', fontWeight: 700 }}>{ln.lender_name}</td>
                    <td style={{ padding: '10px' }}>{ln.loan_type_label}</td>
                    <td style={{ padding: '10px', fontSize: '12px', color: '#475569' }}>{ln.bank_account_name}</td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>{symbol} {Number(ln.principal_amount).toFixed(2)}</td>
                    <td style={{ padding: '10px', textAlign: 'right', color: '#15803d' }}>{symbol} {Number(ln.repaid_amount).toFixed(2)}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 800, color: ln.balance_payable > 0 ? '#dc2626' : '#15803d' }}>{symbol} {Number(ln.balance_payable).toFixed(2)}</td>
                    <td style={{ padding: '10px' }}>
                      {ln.balance_payable > 0 ? (
                        <button onClick={() => { setRepayLoanTarget(ln); setRepayPrincipal(''); setRepayInterest('0'); setRepayBankId(String(banks.find((b) => b.purpose === 'PARTNER_LOAN')?.id || '')); }} style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '4px', border: 'none', background: '#0f172a', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                          Repay / Interest
                        </button>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#15803d', fontWeight: 700 }}>✓ Closed</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Partner Modal */}
      {showPartnerModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '460px', maxWidth: '94vw', padding: '22px' }}>
            <h3 style={{ margin: '0 0 14px 0' }}>Add Partner / Owner</h3>
            <form onSubmit={handleAddPartner} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input type="text" required placeholder="Partner Full Name *" value={pName} onChange={(e) => setPName(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600 }}>Profit/Loss Share % *</label>
                  <input type="number" step="0.01" min="0" max="100" required value={pShare} onChange={(e) => setPShare(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600 }}>Cash/Bank Capital ({symbol})</label>
                  <input type="number" step="0.01" min="0" value={pCash} onChange={(e) => setPCash(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600 }}>Asset Value Brought ({symbol})</label>
                  <input type="number" step="0.01" min="0" value={pAsset} onChange={(e) => setPAsset(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600 }}>Asset Details (Machine/Land/Car)</label>
                  <input type="text" placeholder="e.g. CNC Machine / Shed" value={pAssetDesc} onChange={(e) => setPAssetDesc(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600 }}>Deposit Cash Capital Into Bank Account</label>
                <select value={pBankId} onChange={(e) => setPBankId(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                  <option value="">-- Default Bank Account --</option>
                  {banks.map((b) => <option key={b.id} value={b.id}>{b.account_name} ({b.purpose_label})</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button type="button" onClick={() => setShowPartnerModal(false)} style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#0284c7', color: '#fff', fontWeight: 600 }}>Save Partner</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Partner Capital/Asset/Withdraw Modal */}
      {partnerTxnTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '400px', padding: '22px' }}>
            <h3 style={{ margin: '0 0 12px 0' }}>{partnerTxnTarget.partner_name} — {partnerTxnAction}</h3>
            <form onSubmit={handlePartnerTxn} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input type="number" step="0.01" min="0.01" required placeholder={`Amount (${symbol})`} value={partnerTxnAmt} onChange={(e) => setPartnerTxnAmt(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              {partnerTxnAction !== 'ADD_ASSET' && (
                <select value={partnerTxnBank} onChange={(e) => setPartnerTxnBank(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                  <option value="">-- Default Bank Account --</option>
                  {banks.map((b) => <option key={b.id} value={b.id}>{b.account_name}</option>)}
                </select>
              )}
              <input type="text" placeholder="Description / Asset Name" value={partnerTxnNote} onChange={(e) => setPartnerTxnNote(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setPartnerTxnTarget(null)} style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#0284c7', color: '#fff', fontWeight: 600 }}>Post Entry</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Loan Modal */}
      {showLoanModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '440px', padding: '22px' }}>
            <h3 style={{ margin: '0 0 12px 0' }}>Add Loan / Borrowed Fund</h3>
            <form onSubmit={handleAddLoan} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input type="text" required placeholder="Lender / Bank / Party Name *" value={lenderName} onChange={(e) => setLenderName(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              <select value={loanType} onChange={(e) => setLoanType(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                <option value="PRIVATE_UDHARI">Private Lender / Udhari Fund</option>
                <option value="BANK_LOAN">Bank Loan / CC / OD</option>
                <option value="PARTNER_LOAN">Partner Unsecured Loan</option>
              </select>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <input type="number" step="0.01" min="0.01" required placeholder={`Principal (${symbol}) *`} value={loanPrincipal} onChange={(e) => setLoanPrincipal(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                <input type="number" step="0.01" min="0" placeholder="Interest Rate % p.a." value={loanRate} onChange={(e) => setLoanRate(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              </div>
              <select value={loanBankId} onChange={(e) => setLoanBankId(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                <option value="">-- Receive Into Bank Account --</option>
                {banks.map((b) => <option key={b.id} value={b.id}>{b.account_name} ({b.purpose_label})</option>)}
              </select>
              <input type="text" placeholder="Terms / Notes" value={loanNotes} onChange={(e) => setLoanNotes(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setShowLoanModal(false)} style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 600 }}>Save Loan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Loan Repay Modal */}
      {repayLoanTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '400px', padding: '22px' }}>
            <h3 style={{ margin: '0 0 12px 0' }}>Repay Loan — {repayLoanTarget.lender_name}</h3>
            <form onSubmit={handleRepayLoan} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input type="number" step="0.01" min="0" placeholder={`Principal Repayment (${symbol})`} value={repayPrincipal} onChange={(e) => setRepayPrincipal(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              <input type="number" step="0.01" min="0" placeholder={`Interest Paid (${symbol})`} value={repayInterest} onChange={(e) => setRepayInterest(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              <select value={repayBankId} onChange={(e) => setRepayBankId(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                <option value="">-- Pay From Bank Account --</option>
                {banks.map((b) => <option key={b.id} value={b.id}>{b.account_name}</option>)}
              </select>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setRepayLoanTarget(null)} style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#16a34a', color: '#fff', fontWeight: 600 }}>Confirm Repayment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
