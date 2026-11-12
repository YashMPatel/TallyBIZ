import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../utils/erpHelpers';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const u: any = user || {};

  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile');
  const [loading, setLoading] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('OTHER');
  const [address, setAddress] = useState('');

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const getAuthHeader = (): Record<string, string> => {
    const headers: Record<string, string> = {};
    try {
      const rbacRaw = localStorage.getItem('rbac_user');
      if (rbacRaw) {
        const parsed = JSON.parse(rbacRaw);
        if (parsed?.id) headers['X-User-ID'] = String(parsed.id);
        if (parsed?.username) headers['X-Username'] = String(parsed.username);
        return headers;
      }
    } catch {}
    const token = localStorage.getItem('access_token') || localStorage.getItem('token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  const loadProfile = async () => {
    try {
      const res = await fetch(`${API_BASE}/org/profile/`, {
        headers: { ...getAuthHeader() },
      });
      if (res.ok) {
        const data = await res.json();
        const prof = data.profile || {};
        setFirstName(data.first_name ?? u.first_name ?? '');
        setLastName(data.last_name ?? u.last_name ?? '');
        setEmail(data.email ?? u.email ?? '');
        setPhone(data.phone ?? prof.phone ?? '');
        setGender(data.gender ?? prof.gender ?? 'OTHER');
        setAddress(data.address ?? prof.address ?? '');
      } else {
        setFirstName(u.first_name || u.username || '');
        setLastName(u.last_name || '');
        setEmail(u.email || '');
      }
    } catch {
      setFirstName(u.first_name || u.username || '');
      setLastName(u.last_name || '');
      setEmail(u.email || '');
    }
  };

  useEffect(() => {
    if (isOpen) {
      setActiveTab('profile');
      void loadProfile();
    }
  }, [isOpen]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/org/profile/`, {
        method: 'PUT',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          gender,
          address,
        }),
      });
      if (res.ok) {
        try {
          const rbacRaw = localStorage.getItem('rbac_user');
          if (rbacRaw) {
            const parsed = JSON.parse(rbacRaw);
            parsed.first_name = firstName;
            parsed.last_name = lastName;
            parsed.email = email;
            parsed.phone = phone;
            parsed.gender = gender;
            parsed.address = address;
            localStorage.setItem('rbac_user', JSON.stringify(parsed));
          }
        } catch {}
        alert('Profile details updated successfully.');
        onClose();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || err.error || 'Could not update profile.');
      }
    } catch (err: any) {
      alert('Server connection error: ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      alert('New password and confirm password do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/org/change-password/`, {
        method: 'POST',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          old_password: oldPassword,
          new_password: newPassword,
        }),
      });
      if (res.ok) {
        alert('Password changed successfully.');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        onClose();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || err.error || 'Failed to change password.');
      }
    } catch (err: any) {
      alert('Server connection error: ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  let rbacData: any = {};
  try {
    rbacData = JSON.parse(localStorage.getItem('rbac_user') || '{}');
  } catch {}

  let activeCompanyName = 'TallyBIZ Pvt Ltd';
  try {
    const comp = JSON.parse(localStorage.getItem('active_company') || '{}');
    if (comp?.name) activeCompanyName = comp.name;
  } catch {}

  const roleRaw = (u.role || rbacData?.role || 'Sales User').toString();
  const roleLower = roleRaw.toLowerCase();
  const isAdminOrManager =
    roleLower.includes('admin') ||
    roleLower.includes('manager') ||
    roleLower.includes('owner') ||
    Boolean(u.is_superuser);

  const actionPermissions = [
    {
      label: 'Create Sales Invoices & Notes',
      allowed: rbacData?.can_create_invoice ?? true,
      note: isAdminOrManager ? 'Direct creation' : 'Saved as Draft for approval',
    },
    {
      label: 'Approve / Reject Vouchers',
      allowed: rbacData?.can_approve_invoice ?? isAdminOrManager,
      note: isAdminOrManager ? 'Posts Stock & GL entries' : 'Manager / Admin only',
    },
    {
      label: 'Delete Records & Vouchers',
      allowed: rbacData?.can_delete_records ?? isAdminOrManager,
      note: isAdminOrManager ? 'Full delete access' : 'Locked for Sales User',
    },
    {
      label: 'View Financial & GST Reports',
      allowed: rbacData?.can_view_reports ?? isAdminOrManager,
      note: isAdminOrManager ? 'GL, P&L, Balance Sheet, GSTR' : 'Restricted',
    },
  ];

  const allModules = [
    { name: 'Selling (Invoices)', salesAllowed: true },
    { name: 'Customers', salesAllowed: true },
    { name: 'Credit & Debit Notes', salesAllowed: true },
    { name: 'Stock (Items)', salesAllowed: true },
    { name: 'Approvals Hub', salesAllowed: false },
    { name: 'Buying (Bills)', salesAllowed: false },
    { name: 'Suppliers', salesAllowed: false },
    { name: 'Payments', salesAllowed: false },
    { name: 'Stock Movement Ledger', salesAllowed: false },
    { name: 'General Ledger', salesAllowed: false },
    { name: 'Profit & Loss / Balance Sheet', salesAllowed: false },
    { name: 'GST Returns (GSTR 1/3B)', salesAllowed: false },
    { name: 'Users & Permissions', salesAllowed: false },
  ];

  const displayName =
    [firstName, lastName].filter(Boolean).join(' ') ||
    u.username ||
    'User';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.6)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '12px',
          width: '640px',
          maxWidth: '96vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            background: '#0f172a',
            color: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '700' }}>
              User Profile &amp; Permissions
            </h2>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
              Account details, assigned role, and module access rights
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: '22px',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>

        <div
          style={{
            padding: '14px 20px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                background: isAdminOrManager ? '#0284c7' : '#10b981',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '700',
                fontSize: '17px',
              }}
            >
              {(displayName[0] || 'U').toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a' }}>
                {displayName}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                @{u.username || 'user'} &bull; {activeCompanyName}
              </div>
            </div>
          </div>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: '999px',
              fontSize: '11px',
              fontWeight: '700',
              background: isAdminOrManager ? '#e0f2fe' : '#fef3c7',
              color: isAdminOrManager ? '#0369a1' : '#92400e',
              border: `1px solid ${isAdminOrManager ? '#bae6fd' : '#fde68a'}`,
            }}
          >
            Role: {roleRaw}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #e2e8f0',
            background: '#fff',
            padding: '0 20px',
            gap: '16px',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            style={{
              padding: '10px 4px',
              border: 'none',
              borderBottom: activeTab === 'profile' ? '2px solid #0284c7' : '2px solid transparent',
              background: 'transparent',
              color: activeTab === 'profile' ? '#0284c7' : '#64748b',
              fontWeight: '700',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Profile &amp; Permissions
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('password')}
            style={{
              padding: '10px 4px',
              border: 'none',
              borderBottom: activeTab === 'password' ? '2px solid #0284c7' : '2px solid transparent',
              background: 'transparent',
              color: activeTab === 'password' ? '#0284c7' : '#64748b',
              fontWeight: '700',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Change Password
          </button>
        </div>

        <div style={{ padding: '18px 20px', overflowY: 'auto', flex: 1 }}>
          {activeTab === 'profile' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '14px',
                  background: '#f8fafc',
                }}
              >
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: '700',
                    color: '#0f172a',
                    marginBottom: '10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span>Assigned Permissions &amp; Access Control</span>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>
                    {isAdminOrManager ? 'Full Enterprise Access' : 'Maker Role (Restricted)'}
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                    gap: '8px',
                    marginBottom: '12px',
                  }}
                >
                  {actionPermissions.map((perm) => (
                    <div
                      key={perm.label}
                      style={{
                        background: '#fff',
                        border: `1px solid ${perm.allowed ? '#bbf7d0' : '#fecaca'}`,
                        borderRadius: '6px',
                        padding: '8px 10px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#1e293b' }}>
                          {perm.label}
                        </div>
                        <div style={{ fontSize: '10px', color: '#64748b' }}>{perm.note}</div>
                      </div>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: '700',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: perm.allowed ? '#dcfce7' : '#fee2e2',
                          color: perm.allowed ? '#15803d' : '#b91c1c',
                        }}
                      >
                        {perm.allowed ? 'Allowed' : 'Restricted'}
                      </span>
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: '11px', fontWeight: '700', color: '#475569', marginBottom: '6px' }}>
                  Module Access ({allModules.filter((m) => isAdminOrManager || m.salesAllowed).length} of {allModules.length} modules):
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {allModules.map((mod) => {
                    const hasAccess = isAdminOrManager || mod.salesAllowed;
                    return (
                      <span
                        key={mod.name}
                        style={{
                          fontSize: '11px',
                          padding: '3px 8px',
                          borderRadius: '5px',
                          fontWeight: '600',
                          background: hasAccess ? '#ecfdf5' : '#f1f5f9',
                          color: hasAccess ? '#047857' : '#94a3b8',
                          border: `1px solid ${hasAccess ? '#a7f3d0' : '#e2e8f0'}`,
                          textDecoration: hasAccess ? 'none' : 'line-through',
                        }}
                      >
                        {hasAccess ? '✓ ' : '✕ '}
                        {mod.name}
                      </span>
                    );
                  })}
                </div>

                {!isAdminOrManager && (
                  <div
                    style={{
                      marginTop: '10px',
                      padding: '8px 10px',
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      borderRadius: '6px',
                      fontSize: '11px',
                      color: '#92400e',
                    }}
                  >
                    <strong>Compliance &amp; Workflow Rule:</strong> Invoices created under your account are saved in <strong>Draft</strong> status and require Manager/Admin approval before updating Stock or General Ledger. Customer Legal Name and GSTIN fields are locked.
                  </div>
                )}
              </div>

              <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a' }}>
                  Personal Information
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>
                      First Name
                    </label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '5px',
                        marginTop: '4px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '5px',
                        marginTop: '4px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>
                      Username (Read-Only)
                    </label>
                    <input
                      type="text"
                      disabled
                      value={u.username || ''}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '5px',
                        marginTop: '4px',
                        background: '#f1f5f9',
                        color: '#64748b',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="user@company.com"
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '5px',
                        marginTop: '4px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>
                      Phone Number
                    </label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="9876543210"
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '5px',
                        marginTop: '4px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>
                      Gender
                    </label>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '5px',
                        marginTop: '4px',
                        boxSizing: 'border-box',
                      }}
                    >
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>
                    Address
                  </label>
                  <textarea
                    rows={2}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Residential or office address"
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '5px',
                      marginTop: '4px',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                  <button
                    type="button"
                    onClick={onClose}
                    style={{
                      padding: '8px 16px',
                      background: '#e2e8f0',
                      color: '#334155',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontWeight: '600',
                    }}
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      padding: '8px 18px',
                      background: '#0284c7',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontWeight: '700',
                    }}
                  >
                    {loading ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '5px',
                    marginTop: '4px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>
                  New Password
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '5px',
                    marginTop: '4px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '5px',
                    marginTop: '4px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '8px 16px',
                    background: '#e2e8f0',
                    color: '#334155',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontWeight: '600',
                  }}
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '8px 18px',
                    background: '#0284c7',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontWeight: '700',
                  }}
                >
                  {loading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserProfileModal;
