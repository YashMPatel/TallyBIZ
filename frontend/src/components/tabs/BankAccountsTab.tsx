import React, { useState, useEffect, useCallback } from 'react';
import { Building2, Plus, Eye, ArrowLeftRight, Factory } from 'lucide-react';
import { API_BASE, getErrorMessage } from '../../utils/erpHelpers';

interface BankAccountsTabProps {
  activeCompany: any;
  businessUnits: any[];
  onDrillDownLedger?: (accountName: string) => void;
}

export const BankAccountsTab: React.FC<BankAccountsTabProps> = ({ activeCompany, businessUnits, onDrillDownLedger }) => {
  const symbol = activeCompany?.currency_symbol || localStorage.getItem('active_company_symbol') || '₹';
  const [accounts, setAccounts] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);

  // Create Bank Account Modal
  const [showModal, setShowModal] = useState(false);
  const [accName, setAccName] = useState('');
  const [bankName, setBankName] = useState('');
  const [accNum, setAccNum] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [purpose, setPurpose] = useState('SALES_PURCHASE');
  const [unitId, setUnitId] = useState('');
  const [openBal, setOpenBal] = useState('0');

  // Bank-to-Bank Transfer Modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [fromBankId, setFromBankId] = useState('');
  const [toBankId, setToBankId] = useState('');
  const [transferAmt, setTransferAmt] = useState('');
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [transferRemarks, setTransferRemarks] = useState('');

  // Buy Machinery / Fixed Asset Modal
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [assetName, setAssetName] = useState('');
  const [assetUnitId, setAssetUnitId] = useState('');
  const [assetBankId, setAssetBankId] = useState('');
  const [assetAmt, setAssetAmt] = useState('');
  const [assetDate, setAssetDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [assetVendor, setAssetVendor] = useState('');
  const [assetRemarks, setAssetRemarks] = useState('');

  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadAll = useCallback(async () => {
    if (!activeCompany?.id) return;
    try {
      const [bRes, tRes, aRes] = await Promise.all([
        fetch(`${API_BASE}/accounts/bank-accounts/?company_id=${activeCompany.id}`),
        fetch(`${API_BASE}/accounts/bank-transfers/?company_id=${activeCompany.id}`),
        fetch(`${API_BASE}/accounts/asset-purchases/?company_id=${activeCompany.id}`),
      ]);
      if (bRes.ok) setAccounts(await bRes.json());
      if (tRes.ok) setTransfers(await tRes.json());
      if (aRes.ok) setAssets(await aRes.json());
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  }, [activeCompany?.id]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleCreateBank = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const res = await fetch(`${API_BASE}/accounts/bank-accounts/?company_id=${activeCompany.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_name: accName,
          bank_name: bankName,
          account_number: accNum,
          ifsc_code: ifsc,
          purpose,
          unit_id: unitId || null,
          opening_balance: openBal,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add bank account');
      setShowModal(false);
      setMsg(`Bank Account "${data.account_name}" created!`);
      await loadAll();
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  };

  const handleBankTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const res = await fetch(`${API_BASE}/accounts/bank-transfers/?company_id=${activeCompany.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_bank_id: fromBankId,
          to_bank_id: toBankId,
          amount: transferAmt,
          posting_date: transferDate,
          remarks: transferRemarks,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fund transfer failed');
      setShowTransferModal(false);
      setMsg(`Fund Transfer ${data.voucher_no} completed & both bank statements updated!`);
      await loadAll();
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  };

  const handleBuyAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const res = await fetch(`${API_BASE}/accounts/asset-purchases/?company_id=${activeCompany.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_name: assetName,
          unit_id: assetUnitId,
          bank_account_id: assetBankId || null,
          amount: assetAmt,
          posting_date: assetDate,
          vendor_name: assetVendor,
          remarks: assetRemarks,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Asset purchase failed');
      setShowAssetModal(false);
      setMsg(`Fixed Asset Voucher ${data.voucher_no} (${data.asset_account}) booked to unit!`);
      await loadAll();
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 6px 0' }}>
            Bank Accounts, Department Fund Transfers &amp; Machinery/Assets
          </h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>
            Maintain separate bank statements, transfer working capital across departments &amp; book factory machinery
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              setErr('');
              const hoBank = accounts.find((a) => a.purpose === 'PARTNER_LOAN') || accounts[0];
              const otherBank = accounts.find((a) => a.id !== hoBank?.id) || accounts[1];
              setFromBankId(String(hoBank?.id || ''));
              setToBankId(String(otherBank?.id || ''));
              setTransferAmt('');
              setTransferRemarks('');
              setShowTransferModal(true);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#16a34a', color: '#fff', border: 'none', padding: '10px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
          >
            <ArrowLeftRight size={16} /> Bank-to-Bank Fund Transfer
          </button>
          <button
            onClick={() => {
              setErr('');
              setAssetName('');
              const mfgU = businessUnits.find((u) => u.unit_type === 'MANUFACTURING') || businessUnits[0];
              setAssetUnitId(String(mfgU?.id || ''));
              const hoBank = accounts.find((a) => a.purpose === 'PARTNER_LOAN') || accounts[0];
              setAssetBankId(String(hoBank?.id || ''));
              setAssetAmt('');
              setAssetVendor('');
              setAssetRemarks('');
              setShowAssetModal(true);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#7c3aed', color: '#fff', border: 'none', padding: '10px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
          >
            <Factory size={16} /> + Buy Machinery / Fixed Asset
          </button>
          <button
            onClick={() => { setAccName(''); setBankName(''); setAccNum(''); setIfsc(''); setOpenBal('0'); setShowModal(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#0284c7', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
          >
            <Plus size={16} /> Add Bank Account
          </button>
        </div>
      </div>

      {msg && <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#15803d', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}>{msg}</div>}
      {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 14px', borderRadius: '8px', fontSize: '13px' }}>{err}</div>}

      {/* Bank Account Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '18px' }}>
        {accounts.length === 0 ? (
          <div style={{ background: '#fff', padding: '28px', borderRadius: '10px', border: '1px solid #e2e8f0', color: '#64748b' }}>
            No purpose-specific bank accounts added yet. Click <strong>+ Add Bank Account</strong> above.
          </div>
        ) : (
          accounts.map((acc) => (
            <div key={acc.id} style={{ background: '#fff', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: '#eff6ff', color: '#1d4ed8' }}>
                    {acc.purpose_label} ({acc.unit_name})
                  </span>
                  <h3 style={{ margin: '8px 0 2px 0', fontSize: '17px' }}>{acc.account_name}</h3>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>{acc.bank_name} {acc.account_number ? `• A/c ${acc.account_number}` : ''}</div>
                </div>
                <Building2 size={20} color="#0284c7" />
              </div>

              <div style={{ margin: '14px 0', padding: '10px', background: '#f8fafc', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: '#64748b' }}>CURRENT STATEMENT BALANCE</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: acc.current_balance >= 0 ? '#15803d' : '#dc2626' }}>
                  {symbol} {Number(acc.current_balance).toFixed(2)}
                </div>
                <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Inflow (Dr): {symbol}{Number(acc.total_inflow).toFixed(2)}</span>
                  <span>Outflow (Cr): {symbol}{Number(acc.total_outflow).toFixed(2)}</span>
                </div>
              </div>

              {onDrillDownLedger && (
                <button
                  onClick={() => onDrillDownLedger(acc.ledger_name)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                >
                  <Eye size={14} /> View Bank Statement Ledger
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Fixed Assets & Machinery Register */}
      {assets.length > 0 && (
        <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '18px' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>🏭 Company &amp; Unit Fixed Assets / Machinery Register</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                <th style={{ padding: '8px' }}>Voucher #</th>
                <th style={{ padding: '8px' }}>Date</th>
                <th style={{ padding: '8px' }}>Asset / Machinery</th>
                <th style={{ padding: '8px' }}>Owning Unit</th>
                <th style={{ padding: '8px' }}>Supplier / Partner</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Value ({symbol})</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontWeight: 700, color: '#7c3aed' }}>{a.voucher_no}</td>
                  <td style={{ padding: '8px' }}>{a.posting_date}</td>
                  <td style={{ padding: '8px', fontWeight: 600 }}>{a.asset_account}</td>
                  <td style={{ padding: '8px' }}>{a.unit_name}</td>
                  <td style={{ padding: '8px', color: '#475569' }}>{a.vendor_or_source}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{symbol} {Number(a.amount).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent Department Fund Transfers */}
      {transfers.length > 0 && (
        <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '18px' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>⇄ Department Bank-to-Bank Fund Transfers</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                <th style={{ padding: '8px' }}>Voucher #</th>
                <th style={{ padding: '8px' }}>Date</th>
                <th style={{ padding: '8px' }}>From Bank Account</th>
                <th style={{ padding: '8px' }}>To Bank Account</th>
                <th style={{ padding: '8px' }}>Remarks</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Amount ({symbol})</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px', fontWeight: 700, color: '#16a34a' }}>{t.voucher_no}</td>
                  <td style={{ padding: '8px' }}>{t.posting_date}</td>
                  <td style={{ padding: '8px' }}>{t.from_bank}</td>
                  <td style={{ padding: '8px', fontWeight: 600 }}>{t.to_bank}</td>
                  <td style={{ padding: '8px', color: '#475569' }}>{t.remarks}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{symbol} {Number(t.amount).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal 1: Add Bank Account */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '450px', maxWidth: '94vw', padding: '22px' }}>
            <h3 style={{ margin: '0 0 14px 0' }}>Add Purpose-Wise Bank Account</h3>
            <form onSubmit={handleCreateBank} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>Account Purpose *</label>
                <select value={purpose} onChange={(e) => setPurpose(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px' }}>
                  <option value="PARTNER_LOAN">Partner Capital &amp; Loan Account</option>
                  <option value="SALES_PURCHASE">Sales &amp; Purchase Account</option>
                  <option value="FACTORY">Factory / Manufacturing Unit Account</option>
                  <option value="GENERAL">Head Office / General Account</option>
                </select>
              </div>
              <input type="text" required placeholder="Account Label * (e.g. Sales & Purchase Operating A/c)" value={accName} onChange={(e) => setAccName(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <input type="text" placeholder="Bank Name (e.g. HDFC / SBI)" value={bankName} onChange={(e) => setBankName(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                <input type="text" placeholder="Account Number" value={accNum} onChange={(e) => setAccNum(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <input type="text" placeholder="IFSC Code" value={ifsc} onChange={(e) => setIfsc(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                <input type="number" step="0.01" placeholder={`Opening Balance (${symbol})`} value={openBal} onChange={(e) => setOpenBal(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>Linked Unit / Division</label>
                <select value={unitId} onChange={(e) => setUnitId(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px' }}>
                  <option value="">-- Auto-Assign by Purpose --</option>
                  {businessUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#0284c7', color: '#fff', fontWeight: 600 }}>Create Bank Account</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Bank-to-Bank Department Fund Transfer */}
      {showTransferModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '460px', maxWidth: '94vw', padding: '22px' }}>
            <h3 style={{ margin: '0 0 12px 0' }}>⇄ Bank-to-Bank Department Fund Transfer</h3>
            <form onSubmit={handleBankTransfer} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>Transfer From Bank (Source) *</label>
                <select required value={fromBankId} onChange={(e) => setFromBankId(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px' }}>
                  <option value="">-- Select Source Bank --</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.account_name} (Bal: {symbol}{Number(a.current_balance).toFixed(0)})</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>Transfer To Bank (Target Department) *</label>
                <select required value={toBankId} onChange={(e) => setToBankId(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px' }}>
                  <option value="">-- Select Destination Bank --</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.account_name} ({a.unit_name})</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>Date *</label>
                  <input type="date" required value={transferDate} onChange={(e) => setTransferDate(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>Transfer Amount ({symbol}) *</label>
                  <input type="number" step="0.01" min="0.01" required placeholder="e.g. 2500000" value={transferAmt} onChange={(e) => setTransferAmt(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }} />
                </div>
              </div>
              <input type="text" placeholder="Purpose / Remarks (e.g. Working capital for Factory Unit)" value={transferRemarks} onChange={(e) => setTransferRemarks(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button type="button" onClick={() => setShowTransferModal(false)} style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#16a34a', color: '#fff', fontWeight: 600 }}>Transfer Funds</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Buy Machinery / Fixed Asset */}
      {showAssetModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '460px', maxWidth: '94vw', padding: '22px' }}>
            <h3 style={{ margin: '0 0 12px 0' }}>🏭 Buy Machinery / Fixed Asset</h3>
            <form onSubmit={handleBuyAsset} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>Machinery / Asset Name *</label>
                <input type="text" required placeholder="e.g. CNC Rolling Machine / Factory Shed" value={assetName} onChange={(e) => setAssetName(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>For Which Unit / Department? *</label>
                <select required value={assetUnitId} onChange={(e) => setAssetUnitId(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px' }}>
                  {businessUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>Paid From Bank Account *</label>
                <select required value={assetBankId} onChange={(e) => setAssetBankId(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px' }}>
                  <option value="">-- Select Bank Account --</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.account_name} (Bal: {symbol}{Number(a.current_balance).toFixed(0)})</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>Purchase Date *</label>
                  <input type="date" required value={assetDate} onChange={(e) => setAssetDate(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>Asset Cost ({symbol}) *</label>
                  <input type="number" step="0.01" min="0.01" required placeholder="e.g. 4500000" value={assetAmt} onChange={(e) => setAssetAmt(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }} />
                </div>
              </div>
              <input type="text" placeholder="Machinery Supplier / Vendor Name" value={assetVendor} onChange={(e) => setAssetVendor(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              <input type="text" placeholder="Invoice / Serial No / Remarks" value={assetRemarks} onChange={(e) => setAssetRemarks(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button type="button" onClick={() => setShowAssetModal(false)} style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 600 }}>Book Fixed Asset</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
