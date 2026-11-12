import React from 'react';

interface QuitConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const QuitConfirmModal: React.FC<QuitConfirmModalProps> = ({
  isOpen,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(9, 13, 22, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '16px',
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '10px',
          width: '100%',
          maxWidth: '460px',
          boxShadow: '0 20px 30px -10px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.08)',
          overflow: 'hidden',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Header - Enterprise Slate */}
        <div
          style={{
            backgroundColor: '#090d16',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #1e293b',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#ef4444',
                display: 'inline-block',
              }}
            />
            <h3
              style={{
                color: '#f8fafc',
                fontSize: '14px',
                fontWeight: 600,
                letterSpacing: '0.3px',
                margin: 0,
              }}
            >
              Quit TallyBIZ ERP?
            </h3>
          </div>

          <span
            style={{
              fontSize: '11px',
              color: '#94a3b8',
              backgroundColor: '#1e293b',
              padding: '3px 8px',
              borderRadius: '4px',
              fontFamily: 'monospace',
            }}
          >
            Esc to Cancel
          </span>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px 24px' }}>
          <p
            style={{
              fontSize: '13.5px',
              color: '#334155',
              lineHeight: '1.55',
              margin: '0 0 16px 0',
            }}
          >
            Are you sure you want to end your current session and exit to the login gateway?
          </p>

          {/* Keyboard Shortcut Ribbon */}
          <div
            style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '20px',
              fontSize: '12px',
              color: '#64748b',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>Exit:</span>
              <kbd
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#dc2626',
                  fontFamily: 'monospace',
                  boxShadow: '0 1px 1px rgba(0,0,0,0.06)',
                }}
              >
                Enter
              </kbd>
              <span>or</span>
              <kbd
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#dc2626',
                  fontFamily: 'monospace',
                  boxShadow: '0 1px 1px rgba(0,0,0,0.06)',
                }}
              >
                Y
              </kbd>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>Stay:</span>
              <kbd
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#0f172a',
                  fontFamily: 'monospace',
                  boxShadow: '0 1px 1px rgba(0,0,0,0.06)',
                }}
              >
                Esc
              </kbd>
              <span>or</span>
              <kbd
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#0f172a',
                  fontFamily: 'monospace',
                  boxShadow: '0 1px 1px rgba(0,0,0,0.06)',
                }}
              >
                N
              </kbd>
            </div>
          </div>

          {/* Action Buttons - Horizontal Layout */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px',
            }}
          >
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '8px 18px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#475569',
                backgroundColor: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e2e8f0')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
            >
              Cancel <span style={{ fontSize: '11px', color: '#64748b' }}>(Esc)</span>
            </button>

            <button
              type="button"
              onClick={onConfirm}
              style={{
                padding: '8px 20px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#ffffff',
                backgroundColor: '#dc2626',
                border: '1px solid #b91c1c',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 1px 2px rgba(220, 38, 38, 0.2)',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#b91c1c')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#dc2626')}
            >
              Yes, Exit <span style={{ fontSize: '11px', color: '#fecaca' }}>(Enter)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};