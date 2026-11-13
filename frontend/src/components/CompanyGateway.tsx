import React, { useState, useEffect, useRef } from 'react';
import { Building2, PlusCircle, Download, Upload, LogOut, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';

export interface Company {
  id: number | string;
  name: string;
  currency?: string;
  currency_symbol?: string;
  symbol?: string;
  country?: string;
  financial_year_start?: string;
}

interface CompanyGatewayProps {
  companies: Company[];
  onSelectCompany: (company: Company) => void;
  onQuit: () => void;
  userName?: string;
  onCompanyCreated?: (company: Company, updatedUser?: any) => void;
  onRefreshCompanies?: () => Promise<void> | void;
}

export const CompanyGateway: React.FC<CompanyGatewayProps> = ({
  companies,
  onSelectCompany,
  onQuit,
  userName,
  onCompanyCreated,
  onRefreshCompanies,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [compName, setCompName] = useState('');
  const [country, setCountry] = useState('India');
  const [currency, setCurrency] = useState('INR');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (companies.length === 0) {
      setShowCreateForm(true);
    } else {
      setSelectedIndex((prev) => (prev >= companies.length ? 0 : prev));
    }
  }, [companies.length]);

  const getAuthHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('access_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      const u = JSON.parse(localStorage.getItem('user_data') || localStorage.getItem('rbac_user') || 'null');
      if (u?.id) headers['X-User-ID'] = String(u.id);
      if (u?.username) headers['X-Username'] = String(u.username);
    } catch {}
    return headers;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.key === 'Escape') {
        e.preventDefault();
        if (showCreateForm && companies.length > 0) {
          setShowCreateForm(false);
          setStatusMsg(null);
        } else {
          onQuit();
        }
        return;
      }

      if (isInput || showCreateForm) return;

      if (e.key === 'ArrowDown' && companies.length > 0) {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % companies.length);
      } else if (e.key === 'ArrowUp' && companies.length > 0) {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + companies.length) % companies.length);
      } else if (e.key === 'Enter' && companies.length > 0) {
        e.preventDefault();
        if (companies[selectedIndex]) {
          onSelectCompany(companies[selectedIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [companies, selectedIndex, onSelectCompany, onQuit, showCreateForm]);

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compName.trim()) {
      setStatusMsg({ type: 'error', text: 'Please enter Company Name.' });
      return;
    }
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/accounts/manage/company/create/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          name: compName.trim(),
          country,
          currency,
          symbol: currency === 'INR' ? '₹' : '$',
          gstin: gstin.trim(),
          address: address.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create company');

      if (data.user) {
        localStorage.setItem('user_data', JSON.stringify(data.user));
        localStorage.setItem('rbac_user', JSON.stringify(data.user));
      }
      setCompName('');
      setGstin('');
      setAddress('');
      setShowCreateForm(false);
      if (onRefreshCompanies) await onRefreshCompanies();
      if (onCompanyCreated) onCompanyCreated(data.company, data.user);
      onSelectCompany(data.company);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Error creating company' });
    } finally {
      setBusy(false);
    }
  };

  const handleBackup = async () => {
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/accounts/manage/backup/', {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Backup failed');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dt = new Date().toISOString().slice(0, 10);
      a.download = `TallyBIZ_Backup_${dt}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setStatusMsg({ type: 'success', text: 'Full data backup downloaded successfully.' });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Backup failed' });
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!window.confirm(`Restore data from "${file.name}"? Existing matching records will be updated.`)) {
      return;
    }

    setBusy(true);
    setStatusMsg(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/accounts/manage/restore/', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Restore failed');
      setStatusMsg({ type: 'success', text: data.message || 'Data restored successfully!' });
      if (onRefreshCompanies) await onRefreshCompanies();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Restore failed' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px'
    }}>
      <div style={{
        width: '100%', maxWidth: '640px', backgroundColor: '#ffffff', borderRadius: '12px',
        overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)', border: '1px solid #334155'
      }}>
        <div style={{
          backgroundColor: '#0f172a', padding: '16px 22px', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e293b'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#38bdf8' }} />
              <h2 style={{ color: '#f8fafc', fontSize: '16px', fontWeight: 700, margin: 0, letterSpacing: '0.4px' }}>
                Gateway of TallyBIZ — Company &amp; Data Menu
              </h2>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '12px', margin: '4px 0 0 17px' }}>
              {userName ? `Logged in as ${userName}` : 'TallyBIZ Workspace'}
            </p>
          </div>
          <span style={{
            fontSize: '11px', color: '#94a3b8', backgroundColor: '#1e293b',
            padding: '4px 8px', borderRadius: '5px', fontFamily: 'monospace'
          }}>
            Esc to Quit
          </span>
        </div>

        {statusMsg && (
          <div style={{
            margin: '14px 22px 0', padding: '10px 14px', borderRadius: '8px', fontSize: '13px',
            display: 'flex', alignItems: 'center', gap: '8px',
            backgroundColor: statusMsg.type === 'success' ? '#f0fdf4' : '#fef2f2',
            color: statusMsg.type === 'success' ? '#166534' : '#991b1b',
            border: `1px solid ${statusMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}`
          }}>
            {statusMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{statusMsg.text}</span>
          </div>
        )}

        <div style={{ padding: '18px 22px' }}>
          {!showCreateForm ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>
                  Select Company (Press <strong>Enter</strong> to open default):
                </span>
                <button
                  type="button"
                  onClick={() => { setShowCreateForm(true); setStatusMsg(null); }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px',
                    fontWeight: 600, color: '#0369a1', backgroundColor: '#e0f2fe',
                    border: '1px solid #bae6fd', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer'
                  }}
                >
                  <PlusCircle size={14} /> Create Company (Admin)
                </button>
              </div>

              {companies.length > 0 ? (
                <div style={{
                  border: '1px solid #e2e8f0', borderRadius: '8px', maxHeight: '210px',
                  overflowY: 'auto', marginBottom: '16px'
                }}>
                  {companies.map((c, idx) => {
                    const active = idx === selectedIndex;
                    return (
                      <div
                        key={c.id}
                        onClick={() => onSelectCompany(c)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        style={{
                          padding: '11px 14px', display: 'flex', alignItems: 'center',
                          justifyContent: 'space-between', cursor: 'pointer',
                          backgroundColor: active ? '#0f172a' : '#ffffff',
                          color: active ? '#f8fafc' : '#1e293b',
                          borderBottom: idx < companies.length - 1 ? '1px solid #e2e8f0' : 'none'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Building2 size={16} color={active ? '#38bdf8' : '#64748b'} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '14px' }}>{c.name}</div>
                            <div style={{ fontSize: '11px', color: active ? '#94a3b8' : '#64748b' }}>
                              {c.country || 'India'} • {c.currency || 'INR'} ({c.currency_symbol || c.symbol || '₹'})
                            </div>
                          </div>
                        </div>
                        <span style={{
                          fontSize: '11px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px',
                          color: active ? '#38bdf8' : '#64748b'
                        }}>
                          Open <ArrowRight size={13} />
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{
                  padding: '22px', textAlign: 'center', backgroundColor: '#f8fafc',
                  borderRadius: '8px', border: '1px dashed #cbd5e1', marginBottom: '16px', fontSize: '13px', color: '#475569'
                }}>
                  No company assigned yet. Click <strong>Create Company (Admin)</strong> to create your company workspace.
                </div>
              )}

              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px',
                paddingTop: '12px', borderTop: '1px solid #e2e8f0'
              }}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleBackup}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    padding: '9px 10px', borderRadius: '7px', border: '1px solid #cbd5e1',
                    backgroundColor: '#f8fafc', color: '#0f172a', fontWeight: 600, fontSize: '12px', cursor: 'pointer'
                  }}
                >
                  <Download size={14} color="#0284c7" /> Backup Data
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    padding: '9px 10px', borderRadius: '7px', border: '1px solid #cbd5e1',
                    backgroundColor: '#f8fafc', color: '#0f172a', fontWeight: 600, fontSize: '12px', cursor: 'pointer'
                  }}
                >
                  <Upload size={14} color="#16a34a" /> Restore Data
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleRestoreFile}
                  style={{ display: 'none' }}
                />

                <button
                  type="button"
                  onClick={onQuit}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    padding: '9px 10px', borderRadius: '7px', border: '1px solid #fecaca',
                    backgroundColor: '#fef2f2', color: '#b91c1c', fontWeight: 600, fontSize: '12px', cursor: 'pointer'
                  }}
                >
                  <LogOut size={14} /> Quit / Logout
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={handleCreateCompany}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                  Create New Company (Auto-assigns you as Admin)
                </h3>
                {companies.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { setShowCreateForm(false); setStatusMsg(null); }}
                    style={{ fontSize: '12px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    ← Back to List
                  </button>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Company Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. TallyBIZ Pvt Ltd"
                    value={compName}
                    onChange={(e) => setCompName(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Country
                  </label>
                  <select
                    value={country}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCountry(val);
                      setCurrency(val === 'Canada' ? 'CAD' : val === 'USA' ? 'USD' : 'INR');
                    }}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  >
                    <option value="India">India</option>
                    <option value="Canada">Canada</option>
                    <option value="USA">USA</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Currency
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="CAD">CAD ($)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    GSTIN / Tax ID
                  </label>
                  <input
                    type="text"
                    placeholder="Optional"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Address
                  </label>
                  <input
                    type="text"
                    placeholder="City, State"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px' }}>
                <button
                  type="button"
                  onClick={onQuit}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #fecaca', backgroundColor: '#fef2f2', color: '#b91c1c', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Quit / Logout
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  style={{ padding: '9px 18px', borderRadius: '6px', border: 'none', backgroundColor: '#0f172a', color: '#ffffff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {busy ? 'Creating...' : 'Create Company & Enter as Admin'}
                </button>
              </div>
            </form>
          )}
        </div>

        <div style={{
          backgroundColor: '#f8fafc', padding: '10px 22px', borderTop: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b'
        }}>
          <span>Navigate: <strong>↑ / ↓</strong></span>
          <span>Open Default: <strong>Enter</strong></span>
          <span>Exit App: <strong>Esc</strong></span>
        </div>
      </div>
    </div>
  );
};
