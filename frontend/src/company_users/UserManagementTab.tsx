import React, { useState, useEffect } from 'react';
import { API_BASE } from '../utils/erpHelpers';

interface PendingUser {
  id: number;
  user_id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  company_id?: number | null;
  company_name?: string;
  date_joined?: string;
  is_approved?: boolean;
  custom_permissions?: string[] | { allowed?: string[]; revoked?: string[] };
}

interface Company {
  id: number;
  name: string;
}

export const UserManagementTab: React.FC = () => {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<Record<number, string>>({});
  const [selectedCompanies, setSelectedCompanies] = useState<Record<number, number>>({});
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [customPermsMap, setCustomPermsMap] = useState<Record<number, { allowed: string[]; revoked: string[] }>>({});
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);

  const ALL_MODULES = [
    { key: 'approvals', label: 'Approvals Hub', salesDefault: false, mgrDefault: true, adminOnly: false },
    { key: 'selling', label: 'Selling (Invoices & Orders)', salesDefault: true, mgrDefault: true, adminOnly: false },
    { key: 'buying', label: 'Buying (Bills & Requests)', salesDefault: false, mgrDefault: true, adminOnly: false },
    { key: 'customers', label: 'Customers', salesDefault: true, mgrDefault: true, adminOnly: false },
    { key: 'suppliers', label: 'Suppliers', salesDefault: false, mgrDefault: true, adminOnly: false },
    { key: 'returns', label: 'Credit & Debit Notes', salesDefault: true, mgrDefault: true, adminOnly: false },
    { key: 'production', label: 'Production & BOM', salesDefault: true, mgrDefault: true, adminOnly: false },
    { key: 'stock', label: 'Stock (Items)', salesDefault: true, mgrDefault: true, adminOnly: false },
    { key: 'stock_ledger', label: 'Stock Movement Ledger', salesDefault: false, mgrDefault: true, adminOnly: false },
    { key: 'petty_cash', label: 'Petty Cash & Requests', salesDefault: true, mgrDefault: true, adminOnly: false },
    { key: 'payments', label: 'Payments (HO Central)', salesDefault: false, mgrDefault: true, adminOnly: false },
    { key: 'bank_accounts', label: 'Bank Accounts (Statements)', salesDefault: false, mgrDefault: true, adminOnly: false },
    { key: 'capital_loans', label: 'Partners, Capital & Loans', salesDefault: false, mgrDefault: true, adminOnly: false },
    { key: 'accounts', label: 'General Ledger', salesDefault: false, mgrDefault: true, adminOnly: false },
    { key: 'reports', label: 'Profit & Loss / Balance Sheet', salesDefault: false, mgrDefault: true, adminOnly: false },
    { key: 'gst', label: 'GST Returns (GSTR-1/3B)', salesDefault: false, mgrDefault: true, adminOnly: false },
    { key: 'users_management', label: 'Users & Permissions', salesDefault: false, mgrDefault: false, adminOnly: true },
  ];

  const isRoleDefault = (roleStr: string, mod: typeof ALL_MODULES[0]) => {
    const r = String(roleStr || '').trim().toUpperCase().replace(/\s+/g, '_');
    if (r === 'ADMIN') return true;
    if (r === 'MANAGER') return mod.mgrDefault;
    return mod.salesDefault;
  };

  const isModuleChecked = (u: PendingUser, m: typeof ALL_MODULES[0]) => {
    const activeRole = selectedRoles[u.id] || u.role || 'Sales User';
    const rUpper = String(activeRole || '').trim().toUpperCase().replace(/\s+/g, '_');
    if (rUpper === 'ADMIN') return true;
    const entry = customPermsMap[u.id] || { allowed: [], revoked: [] };
    if (entry.revoked.includes(m.key)) return false;
    return isRoleDefault(activeRole, m) || entry.allowed.includes(m.key);
  };

  const getActivePermCount = (u: PendingUser) => {
    return ALL_MODULES.filter((m) => isModuleChecked(u, m)).length;
  };

  const togglePerm = (u: PendingUser, m: typeof ALL_MODULES[0]) => {
    const activeRole = selectedRoles[u.id] || u.role || 'Sales User';
    const byRole = isRoleDefault(activeRole, m);
    const entry = customPermsMap[u.id] || { allowed: [], revoked: [] };
    const currentlyChecked = isModuleChecked(u, m);

    let nextAllowed = [...entry.allowed];
    let nextRevoked = [...entry.revoked];

    if (currentlyChecked) {
      nextAllowed = nextAllowed.filter((k) => k !== m.key);
      if (byRole && !nextRevoked.includes(m.key)) nextRevoked.push(m.key);
    } else {
      nextRevoked = nextRevoked.filter((k) => k !== m.key);
      if (!byRole && !nextAllowed.includes(m.key)) nextAllowed.push(m.key);
    }
    setCustomPermsMap({ ...customPermsMap, [u.id]: { allowed: nextAllowed, revoked: nextRevoked } });
  };

  const fetchPendingUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/accounts/users/pending/?include_all=1`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.users || data.results || []);
        setPendingUsers(list);

        // Pre-fill selection defaults
        const rMap: Record<number, string> = {};
        const cMap: Record<number, number> = {};
        list.forEach((u: PendingUser) => {
          rMap[u.id] = u.role || 'Sales User';
          if (u.company_id) cMap[u.id] = u.company_id;
        });
        setSelectedRoles(rMap);
        setSelectedCompanies(cMap);
        const pMap: Record<number, { allowed: string[]; revoked: string[] }> = {};
        list.forEach((u: PendingUser) => {
          const raw = u.custom_permissions;
          if (Array.isArray(raw)) pMap[u.id] = { allowed: raw, revoked: [] };
          else if (raw && typeof raw === 'object') pMap[u.id] = { allowed: raw.allowed || [], revoked: raw.revoked || [] };
          else pMap[u.id] = { allowed: [], revoked: [] };
        });
        setCustomPermsMap(pMap);
      }
    } catch (err) {
      console.error('Failed to fetch pending users:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanies = async () => {
    try {
      const res = await fetch(`${API_BASE}/accounts/companies/`);
      if (res.ok) {
        const data = await res.json();
        setCompanies(Array.isArray(data) ? data : (data.results || []));
      }
    } catch (err) {
      console.error('Failed to fetch companies:', err);
    }
  };

  useEffect(() => {
    fetchPendingUsers();
    fetchCompanies();
  }, []);

  const handleApprove = async (user: PendingUser) => {
    const role = selectedRoles[user.id] || user.role || 'Sales User';
    const company_id = selectedCompanies[user.id] || (companies[0] ? companies[0].id : null);

    try {
      const res = await fetch(`${API_BASE}/accounts/users/${user.id}/approve/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, company_id, custom_permissions: customPermsMap[user.id] || { allowed: [], revoked: [] }, action: 'approve' }),
      });

      if (res.ok) {
        setSuccessMsg(`User ${user.username} approved successfully!`);
        setTimeout(() => setSuccessMsg(null), 4000);
        fetchPendingUsers();
      } else {
        alert('Failed to approve user.');
      }
    } catch (err) {
      console.error('Approve error:', err);
    }
  };

  const handleReject = async (user: PendingUser) => {
    if (!window.confirm(`Are you sure you want to reject and remove registration for ${user.username}?`)) return;

    try {
      const res = await fetch(`${API_BASE}/accounts/users/${user.id}/reject/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      });

      if (res.ok) {
        fetchPendingUsers();
      }
    } catch (err) {
      console.error('Reject error:', err);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Banner */}
      <div style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '10px',
        padding: '18px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
      }}>
        <div>
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
            User Management &amp; Access Control (RBAC)
          </h2>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>
            Review pending signups, assign company access, define roles, and approve user accounts
          </p>
        </div>

        <button
          onClick={fetchPendingUsers}
          disabled={loading}
          style={{
            padding: '7px 14px',
            fontSize: '12px',
            fontWeight: 600,
            color: '#0284c7',
            backgroundColor: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          {loading ? 'Refreshing...' : '🔄 Refresh Queue'}
        </button>
      </div>

      {successMsg && (
        <div style={{
          backgroundColor: '#f0fdf4',
          border: '1px solid #bbf7d0',
          color: '#15803d',
          padding: '12px 18px',
          borderRadius: '8px',
          fontSize: '13px',
          fontWeight: 600,
        }}>
          ✅ {successMsg}
        </div>
      )}

      {/* Pending Approval Requests */}
      {(() => {
        const pendingList = pendingUsers.filter((u) => !u.is_approved);
        return pendingList.length === 0 ? (
        <div style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '40px',
          textAlign: 'center',
          color: '#16a34a',
          fontSize: '14px',
          fontWeight: 600,
        }}>
          ✅ No pending signups. All users have been approved!
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>
            Pending Approval Requests ({pendingList.length})
          </div>

          {pendingList.map((u) => (
            <div
              key={u.id}
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '18px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}
            >
              {/* User Identity */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: '220px' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  backgroundColor: '#f59e0b',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '16px',
                }}>
                  {u.username.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                    {u.first_name ? `${u.first_name} ${u.last_name}` : u.username}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    @{u.username} • {u.email || 'No email provided'}
                  </div>
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                  Assign Role
                </label>
                <select
                  value={selectedRoles[u.id] || u.role || 'Sales User'}
                  onChange={(e) => setSelectedRoles({ ...selectedRoles, [u.id]: e.target.value })}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    color: '#0f172a',
                    fontWeight: 500,
                  }}
                >
                  <option value="Admin">Admin</option>
                  <option value="Manager">Manager</option>
                  <option value="Sales User">Sales User</option>
                  <option value="Staff">Staff</option>
                </select>
              </div>

              {/* Company Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                  Company Access
                </label>
                <select
                  value={selectedCompanies[u.id] || u.company_id || (companies[0]?.id || '')}
                  onChange={(e) => setSelectedCompanies({ ...selectedCompanies, [u.id]: parseInt(e.target.value, 10) })}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    color: '#0f172a',
                    fontWeight: 500,
                    minWidth: '160px',
                  }}
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => handleReject(u)}
                  style={{
                    padding: '7px 14px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#dc2626',
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  Reject
                </button>

                <button
                  onClick={() => handleApprove(u)}
                  style={{
                    padding: '7px 18px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#ffffff',
                    backgroundColor: '#16a34a',
                    border: '1px solid #15803d',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(22, 163, 74, 0.2)',
                  }}
                >
                  ✓ Approve User
                </button>
              </div>
            </div>
          ))}
        </div>
        );
      })()}

      {/* Approved / Active Users List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
          Approved / Active Users ({pendingUsers.filter((u) => u.is_approved).length})
        </div>
        {pendingUsers.filter((u) => u.is_approved).map((u) => (
          <div
            key={u.id}
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '14px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '220px' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '50%', backgroundColor: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px' }}>
                {u.username.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                  {u.first_name ? `${u.first_name} ${u.last_name}` : u.username}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  @{u.username} • {u.email || 'No email'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '3px' }}>Role</label>
                <select
                  value={selectedRoles[u.id] || u.role || 'Sales User'}
                  onChange={(e) => setSelectedRoles({ ...selectedRoles, [u.id]: e.target.value })}
                  style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#fff' }}
                >
                  <option value="ADMIN">Admin</option>
                  <option value="Manager">Manager</option>
                  <option value="Sales User">Sales User</option>
                  <option value="Staff">Staff</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '3px' }}>Company</label>
                <select
                  value={selectedCompanies[u.id] || u.company_id || (companies[0]?.id || '')}
                  onChange={(e) => setSelectedCompanies({ ...selectedCompanies, [u.id]: parseInt(e.target.value, 10) })}
                  style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#fff', minWidth: '150px' }}
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => setExpandedUserId(expandedUserId === u.id ? null : u.id)}
                style={{ marginTop: '16px', padding: '7px 12px', fontSize: '12px', fontWeight: 600, color: '#0f172a', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer' }}
              >
                {expandedUserId === u.id ? 'Hide Permissions' : `Permissions (${getActivePermCount(u)}/${ALL_MODULES.length})`}
              </button>

              <button
                onClick={() => handleApprove(u)}
                style={{ marginTop: '16px', padding: '7px 14px', fontSize: '12px', fontWeight: 600, color: '#fff', backgroundColor: '#2563eb', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
              >
                Save
              </button>
            </div>
          </div>
          {expandedUserId === u.id && (
            <div style={{ paddingTop: '10px', borderTop: '1px dashed #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {ALL_MODULES.map((m) => {
                const activeRole = selectedRoles[u.id] || u.role || 'Sales User';
                const rUpper = String(activeRole || '').trim().toUpperCase().replace(/\s+/g, '_');
                const isTargetAdmin = rUpper === 'ADMIN';
                const byRole = isRoleDefault(activeRole, m);
                const checked = isModuleChecked(u, m);
                const isLocked = isTargetAdmin || m.adminOnly;
                return (
                  <label
                    key={m.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '12px',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: `1px solid ${checked ? (byRole ? '#10b981' : '#2563eb') : '#cbd5e1'}`,
                      backgroundColor: checked ? (byRole ? '#ecfdf5' : '#eff6ff') : '#fff',
                      color: checked ? (byRole ? '#065f46' : '#1e40af') : '#64748b',
                      cursor: isLocked ? 'default' : 'pointer',
                      opacity: isLocked && !checked ? 0.55 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isLocked}
                      onChange={() => !isLocked && togglePerm(u, m)}
                    />
                    {m.label}
                    {byRole && checked && <span style={{ fontSize: '10px', fontWeight: 600, opacity: 0.75 }}>(Role)</span>}
                    {byRole && !checked && <span style={{ fontSize: '10px', fontWeight: 600, color: '#dc2626' }}>(Revoked)</span>}
                  </label>
                );
              })}
            </div>
          )}
          </div>
        ))}
      </div>
    </div>
  );
};
