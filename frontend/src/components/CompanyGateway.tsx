import React, { useState, useEffect } from 'react';

interface Company {
  id: number | string;
  name: string;
  currency?: string;
  currency_symbol?: string;
  symbol?: string;
  financial_year_start?: string;
}

interface CompanyGatewayProps {
  companies: Company[];
  onSelectCompany: (company: Company) => void;
  onQuit: () => void;
  userName?: string;
}

export const CompanyGateway: React.FC<CompanyGatewayProps> = ({
  companies,
  onSelectCompany,
  onQuit,
  userName,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  // Keyboard navigation: Arrow Up, Arrow Down, Enter, Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (companies.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % companies.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + companies.length) % companies.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (companies[selectedIndex]) {
          onSelectCompany(companies[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onQuit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [companies, selectedIndex, onSelectCompany, onQuit]);

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
          overflow: 'hidden',
          border: '1px solid #334155',
        }}
      >
        {/* Header Bar */}
        <div
          style={{
            backgroundColor: '#090d16',
            padding: '18px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #1e293b',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  backgroundColor: '#38bdf8',
                }}
              />
              <h2
                style={{
                  color: '#f8fafc',
                  fontSize: '16px',
                  fontWeight: 700,
                  margin: 0,
                  letterSpacing: '0.4px',
                }}
              >
                Select Company Workspace
              </h2>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '12px', margin: '4px 0 0 17px' }}>
              {userName ? `Logged in as ${userName}` : 'TallyBIZ Gateway'}
            </p>
          </div>

          <span
            style={{
              fontSize: '11px',
              color: '#94a3b8',
              backgroundColor: '#1e293b',
              padding: '4px 8px',
              borderRadius: '5px',
              fontFamily: 'monospace',
            }}
          >
            Esc to Quit
          </span>
        </div>

        {/* Company List Body */}
        <div style={{ padding: '20px 24px' }}>
          <p
            style={{
              fontSize: '13px',
              color: '#475569',
              margin: '0 0 14px 0',
              fontWeight: 500,
            }}
          >
            Use <strong style={{ color: '#0f172a' }}>↑ ↓</strong> arrow keys &amp;{' '}
            <strong style={{ color: '#0f172a' }}>Enter</strong> to select company:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {companies.map((comp, idx) => {
              const isSelected = idx === selectedIndex;
              const sym = comp.currency_symbol || comp.symbol || '₹';

              return (
                <div
                  key={comp.id}
                  onClick={() => onSelectCompany(comp)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 18px',
                    borderRadius: '8px',
                    border: isSelected ? '2px solid #0284c7' : '1px solid #e2e8f0',
                    backgroundColor: isSelected ? '#f0f9ff' : '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        backgroundColor: isSelected ? '#0284c7' : '#f1f5f9',
                        color: isSelected ? '#ffffff' : '#475569',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        fontSize: '14px',
                      }}
                    >
                      {comp.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          color: isSelected ? '#0369a1' : '#0f172a',
                        }}
                      >
                        {comp.name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                        Currency: {comp.currency || 'INR'} ({sym})
                      </div>
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: isSelected ? '#0284c7' : '#94a3b8',
                      fontFamily: 'monospace',
                    }}
                  >
                    {isSelected ? 'Enter ↵' : 'Select'}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Footer Guide */}
          <div
            style={{
              marginTop: '20px',
              paddingTop: '14px',
              borderTop: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11px',
              color: '#94a3b8',
            }}
          >
            <span>Navigate: ↑ / ↓</span>
            <span>Open: Enter</span>
            <span>Exit App: Esc</span>
          </div>
        </div>
      </div>
    </div>
  );
};