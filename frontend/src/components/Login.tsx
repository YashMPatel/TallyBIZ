import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../utils/erpHelpers';

interface InviteInfo {
  valid: boolean;
  company_id: number;
  company_name: string;
  username: string;
  first_name: string;
  last_name: string;
  role: string;
}

const SignupModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  inviteToken: string;
  inviteInfo: InviteInfo | null;
  onSignedUp?: (username: string, autoApproved: boolean) => void;
}> = ({ isOpen, onClose, inviteToken, inviteInfo, onSignedUp }) => {
  const [formData, setFormData] = useState({
    company_name: '',
    currency: 'INR',
    username: '',
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    phone: '',
    gender: 'MALE',
    address: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (inviteInfo) {
      setFormData((prev) => ({
        ...prev,
        username: inviteInfo.username || prev.username,
        first_name: inviteInfo.first_name || prev.first_name,
        last_name: inviteInfo.last_name || prev.last_name,
      }));
    }
  }, [inviteInfo]);

  if (!isOpen) return null;

  const isInvited = Boolean(inviteToken && inviteInfo?.valid);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = isInvited
        ? { ...formData, invite_token: inviteToken }
        : { ...formData };

      const res = await fetch(`${API_BASE}/org/signup/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      let data: any = null;
      const textData = await res.text();
      try {
        data = JSON.parse(textData);
      } catch {
        if (!res.ok) throw new Error(`Server Error (${res.status}): Please check server connection`);
        throw new Error('Invalid server response format');
      }

      if (res.ok) {
        alert(
          data.message ||
            (isInvited
              ? 'Registration successful! You can login once your account is approved by the admin.'
              : 'Company workspace created! You can sign in now.')
        );
        if (window.location.search.includes('invite=')) {
          window.history.replaceState({}, '', window.location.pathname);
        }
        if (onSignedUp) onSignedUp(formData.username, Boolean(data.auto_approved));
        onClose();
      } else {
        const errorMsg = Object.values(data).flat().join('\n') || 'Failed to submit signup request.';
        alert(errorMsg);
      }
    } catch {
      alert('Server connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
      <div style={{ background: '#fff', borderRadius: '12px', width: '480px', maxWidth: '95vw', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>
              {isInvited ? 'Join Company via Staff Invite' : 'Create Your Own Company & Account'}
            </h3>
            <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#64748b' }}>
              {isInvited
                ? 'Your registration will be sent to your Company Admin for role & module approval.'
                : 'Sets up an isolated company workspace for your business with instant Admin access.'}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
        </div>

        {isInvited && inviteInfo && (
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', fontSize: '12px', color: '#1e40af' }}>
            <div><strong>Invited Company:</strong> {inviteInfo.company_name}</div>
            <div style={{ marginTop: '2px' }}><strong>Assigned Role:</strong> {inviteInfo.role} (Requires Admin Approval)</div>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {!isInvited && (
            <div style={{ display: 'flex', gap: '10px', background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ flex: 2 }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#0f172a' }}>Company / Business Name *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Patel Industries Pvt Ltd"
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box', marginTop: '3px' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#0f172a' }}>Currency *</label>
                <select
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box', marginTop: '3px', background: '#fff' }}
                >
                  <option value="INR">INR (₹)</option>
                  <option value="CAD">CAD ($)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>First Name *</label>
              <input required type="text" value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>Last Name *</label>
              <input required type="text" value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box' }} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>Username *</label>
            <input
              required
              type="text"
              readOnly={Boolean(isInvited && inviteInfo?.username)}
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                boxSizing: 'border-box',
                background: isInvited && inviteInfo?.username ? '#f1f5f9' : '#fff',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>Email *</label>
            <input required type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box' }} />
          </div>

          <div>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>Password *</label>
            <input required type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box' }} />
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>Phone Number</label>
              <input type="text" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>Gender</label>
              <select value={formData.gender} onChange={(e) => setFormData({ ...formData, gender: e.target.value })} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box' }}>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>Address</label>
            <textarea rows={2} value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={loading} style={{ padding: '8px 20px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
              {loading ? 'Submitting...' : isInvited ? 'Submit Staff Request' : 'Create Company & Sign Up'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const Login: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [inviteToken, setInviteToken] = useState('');
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tok = (params.get('invite') || '').trim();
    if (tok) {
      setInviteToken(tok);
      fetch(`${API_BASE}/org/invite-info/?token=${encodeURIComponent(tok)}`)
        .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
          if (ok && d?.valid) {
            setInviteInfo(d);
            setShowSignup(true);
          } else {
            setError(d?.error || 'This staff invite link is invalid or expired.');
          }
        })
        .catch(() => setError('Unable to verify staff invite link.'));
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMsg(null);
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/accounts/auth/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      let data: any = null;
      const textData = await response.text();
      try {
        data = JSON.parse(textData);
      } catch {
        if (!response.ok) throw new Error(`Server Error (${response.status}): Please check server connection`);
        throw new Error('Invalid server response format');
      }

      if (!response.ok) {
        throw new Error(data.error || 'Login failed. Please check credentials.');
      }

      localStorage.setItem('access_token', data.access || data.token || '');
      localStorage.setItem('token', data.access || data.token || '');
      login(data.access, data.user);
    } catch (err: any) {
      setError(err.message || 'Server error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f8fafc',
      fontFamily: 'sans-serif',
      padding: '20px',
    }}>
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div style={{
          width: '48px',
          height: '48px',
          background: '#0284c7',
          color: '#ffffff',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '24px',
          fontWeight: 'bold',
          margin: '0 auto 12px auto',
          boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)',
        }}>
          E
        </div>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 6px 0' }}>Sign In</h2>
        <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Welcome! Please sign in to continue.</p>
      </div>

      <div style={{
        background: '#ffffff',
        width: '100%',
        maxWidth: '380px',
        padding: '32px',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)',
        boxSizing: 'border-box',
      }}>
        {error && (
          <div style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: '600',
            marginBottom: '16px',
          }}>
            {error}
          </div>
        )}
        {infoMsg && (
          <div style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            color: '#15803d',
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: '600',
            marginBottom: '16px',
          }}>
            {infoMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>
              Email or Username
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. user@example.com"
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#f8fafc', boxSizing: 'border-box', outline: 'none' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#f8fafc', boxSizing: 'border-box', outline: 'none' }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              background: '#0f172a',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: '6px',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Signing in...' : 'Continue'}
          </button>
        </form>

        <div style={{ marginTop: '20px', textAlign: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
          <span style={{ fontSize: '13px', color: '#64748b' }}>New business or team member? </span>
          <button
            type="button"
            onClick={() => {
              setInviteToken('');
              setInviteInfo(null);
              setShowSignup(true);
            }}
            style={{ background: 'transparent', border: 'none', color: '#0284c7', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer', padding: 0 }}
          >
            Create Company / Sign Up
          </button>
        </div>
      </div>

      <SignupModal
        isOpen={showSignup}
        onClose={() => setShowSignup(false)}
        inviteToken={inviteToken}
        inviteInfo={inviteInfo}
        onSignedUp={(uName, autoApproved) => {
          setUsername(uName);
          if (autoApproved) {
            setInfoMsg('Company workspace created! Enter your password to sign in as Admin.');
          } else {
            setInfoMsg('Staff signup submitted! Sign in once your Admin approves your request.');
          }
        }}
      />
    </div>
  );
};
