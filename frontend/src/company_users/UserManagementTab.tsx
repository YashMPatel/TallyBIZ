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

  const fetchPendingUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/accounts/users/pending/`);
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
        body: JSON.stringify({ role, company_id, action: 'approve' }),
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

      {/* Main Content Area */}
      {pendingUsers.length === 0 ? (
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
            Pending Approval Requests ({pendingUsers.length})
          </div>

          {pendingUsers.map((u) => (
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
      )}
    </div>
  );
};
