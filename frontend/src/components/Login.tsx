import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../utils/erpHelpers';

// 1. Signup Modal (100% English)
const SignupModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    phone: '',
    gender: 'MALE',
    address: ''
  });
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/org/signup/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      let data = null;
    const textData = await res.text();
    try {
      data = JSON.parse(textData);
    } catch (e) {
      if (!res.ok) throw new Error(`Server Error (${ res.status }): Please check server connection`);
      throw new Error("Invalid server response format");
    }
      if (res.ok) {
        alert(data.message || 'Registration successful! You can login once your account is approved by the admin.');
        onClose();
      } else {
        const errorMsg = Object.values(data).flat().join('\n') || 'Failed to submit signup request.';
        alert(errorMsg);
      }
    } catch (err) {
      alert('Server connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
      <div style={{ background: '#fff', borderRadius: '12px', width: '460px', maxWidth: '95vw', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>Register New User</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>First Name *</label>
              <input required type="text" value={formData.first_name} onChange={e => setFormData({ ...formData, first_name: e.target.value })} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>Last Name *</label>
              <input required type="text" value={formData.last_name} onChange={e => setFormData({ ...formData, last_name: e.target.value })} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box' }} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>Username *</label>
            <input required type="text" value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box' }} />
          </div>

          <div>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>Email *</label>
            <input required type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box' }} />
          </div>

          <div>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>Password *</label>
            <input required type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box' }} />
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>Phone Number</label>
              <input type="text" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>Gender</label>
              <select value={formData.gender} onChange={e => setFormData({ ...formData, gender: e.target.value })} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box' }}>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#475569' }}>Address</label>
            <textarea rows={2} value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', boxSizing: 'border-box' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={loading} style={{ padding: '8px 20px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
              {loading ? 'Submitting...' : 'Sign Up'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// 2. Main Login Component (100% English)
export const Login: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSignup, setShowSignup] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/accounts/auth/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      let data = null;
    const textData = await response.text();
    try {
      data = JSON.parse(textData);
    } catch (e) {
      if (!response.ok) throw new Error(`Server Error (${ response.status }): Please check server connection`);
      throw new Error("Invalid server response format");
    }

      if (!response.ok) {
        throw new Error(data.error || 'Login failed. Please check credentials.');
      }

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
      padding: '20px'
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
          boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)'
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
        boxSizing: 'border-box'
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
            marginBottom: '16px'
          }}>
            {error}
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
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Signing in...' : 'Continue'}
          </button>
        </form>

        {/* English Signup Link */}
        <div style={{ marginTop: '20px', textAlign: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
          <span style={{ fontSize: '13px', color: '#64748b' }}>Don't have an account? </span>
          <button
            type="button"
            onClick={() => setShowSignup(true)}
            style={{ background: 'transparent', border: 'none', color: '#0284c7', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer', padding: 0 }}
          >
            Sign Up
          </button>
        </div>
      </div>

      <SignupModal isOpen={showSignup} onClose={() => setShowSignup(false)} />
    </div>
  );
};