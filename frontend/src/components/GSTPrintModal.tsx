import React from 'react';
import { X, Printer } from 'lucide-react';

interface GSTDataRow {
  month: string;
  taxable_sales: number | string;
  output_gst: number | string;
  taxable_purchases: number | string;
  input_gst: number | string;
  net_payable: number | string;
}

interface GSTPrintModalProps {
  data: GSTDataRow[];
  onClose: () => void;
  companyName?: string;
}

export const GSTPrintModal: React.FC<GSTPrintModalProps> = ({
  data = [],
  onClose,
  companyName = 'TallyBIZ Enterprise',
}) => {
  const safeData = Array.isArray(data) ? data : [];

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '20px',
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '10px',
          width: '100%',
          maxWidth: '800px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Action Header */}
        <div
          className="no-print"
          style={{
            padding: '14px 20px',
            backgroundColor: '#090d16',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #1e293b',
          }}
        >
          <span style={{ color: '#f8fafc', fontWeight: 600, fontSize: '14px' }}>
            GST Summary Print Preview
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={handlePrint}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                backgroundColor: '#0284c7',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '12px',
              }}
            >
              <Printer size={15} /> Print
            </button>
            <button
              onClick={onClose}
              style={{
                backgroundColor: '#334155',
                color: '#f8fafc',
                border: 'none',
                borderRadius: '6px',
                padding: '6px',
                cursor: 'pointer',
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Printable Area */}
        <div style={{ padding: '30px', overflowY: 'auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px' }}>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', color: '#0f172a' }}>{companyName}</h2>
            <h4 style={{ margin: 0, fontSize: '14px', color: '#64748b', fontWeight: 500 }}>
              GST Compliance &amp; Tax Summary (GSTR-1 vs GSTR-3B)
            </h4>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Month</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Taxable Sales</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Output GST</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Taxable Purchases</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Input GST (ITC)</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Net Payable / (Credit)</th>
              </tr>
            </thead>
            <tbody>
              {safeData.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                    No GST return records available to display.
                  </td>
                </tr>
              ) : (
                safeData.map((row, index) => {
                  const net = Number(row.net_payable) || 0;
                  return (
                    <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{row.month}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>₹{Number(row.taxable_sales || 0).toFixed(2)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#dc2626' }}>₹{Number(row.output_gst || 0).toFixed(2)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>₹{Number(row.taxable_purchases || 0).toFixed(2)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#16a34a' }}>₹{Number(row.input_gst || 0).toFixed(2)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: net > 0 ? '#dc2626' : '#0284c7' }}>
                        ₹{net.toFixed(2)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};