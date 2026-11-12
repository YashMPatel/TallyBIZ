import React, { useState, useEffect } from 'react';
import { Building2 } from 'lucide-react';
import { API_BASE } from '../utils/erpHelpers';
import { useAuth } from '../context/AuthContext';

interface Company {
  id: number;
  name: string;
  code?: string;
  currency?: string;
  symbol?: string;
  currency_symbol?: string;
  address?: string;
  gstin?: string;
  state?: string;
  bank_details?: string;
}

interface CompanySwitcherProps {
  onCompanyChange: (company: Company) => void;
}

export const CompanySwitcher: React.FC<CompanySwitcherProps> = ({ onCompanyChange }) => {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchUserCompanies = async () => {
      setLoading(true);
      try {
        // Logged-in user na params pass thashe jethi backend fakt allowed company j mokle
        const params = new URLSearchParams();
        if (user?.id) params.append('user_id', String(user.id));
        if (user?.username) params.append('username', user.username);

        const res = await fetch(`${API_BASE}/accounts/companies/?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          const list: Company[] = Array.isArray(data) ? data : (data.results || []);
          setCompanies(list);

          // Current active company check
          const savedActive = localStorage.getItem('active_company');
          let currentComp: Company | null = null;
          if (savedActive) {
            try {
              currentComp = JSON.parse(savedActive);
            } catch (e) {
              currentComp = null;
            }
          }

          // Jo saved company allowed list ma hoy to e select rakho, nahi to first allowed company set karo
          const matched = list.find(c => c.id === currentComp?.id);
          if (matched) {
            setSelectedId(String(matched.id));
            localStorage.setItem('active_company', JSON.stringify(matched));
          } else if (list.length > 0) {
            setSelectedId(String(list[0].id));
            localStorage.setItem('active_company', JSON.stringify(list[0]));
            onCompanyChange(list[0]);
          }
        }
      } catch (err) {
        console.error('Failed to load companies in switcher:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchUserCompanies();
  }, [user]);

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const compId = parseInt(e.target.value, 10);
    const targetComp = companies.find(c => c.id === compId);
    if (targetComp) {
      setSelectedId(String(targetComp.id));
      onCompanyChange(targetComp);
    }
  };

  // Jo user pase fakt 1 j company no access hoy to switcher dropdown batavvani jarur nathi
  if (companies.length <= 1) {
    const singleComp = companies[0];
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          backgroundColor: '#f1f5f9',
          border: '1px solid #cbd5e1',
          borderRadius: '6px',
          padding: '6px 12px',
          fontSize: '12px',
          fontWeight: 700,
          color: '#0f172a',
        }}
      >
        <Building2 size={14} color="#0284c7" />
        <span>{singleComp?.name || 'Assigned Company'}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        backgroundColor: '#f1f5f9',
        border: '1px solid #cbd5e1',
        borderRadius: '6px',
        padding: '3px 8px',
      }}
    >
      <Building2 size={14} color="#0284c7" />
      <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>
        COMPANY:
      </span>
      <select
        value={selectedId}
        onChange={handleSelect}
        disabled={loading}
        style={{
          border: 'none',
          background: 'transparent',
          fontSize: '12px',
          fontWeight: 600,
          color: '#0f172a',
          outline: 'none',
          cursor: 'pointer',
        }}
      >
        {companies.map(c => {
          const sym = c.symbol || c.currency_symbol || (c.currency === 'CAD' || c.currency === 'USD' ? '$' : '₹');
          return (
            <option key={c.id} value={c.id}>
              {c.name} ({sym})
            </option>
          );
        })}
      </select>
    </div>
  );
};