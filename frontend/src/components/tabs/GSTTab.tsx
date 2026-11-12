import type { FC } from 'react';
import { Printer } from 'lucide-react';
import { DataTable } from '../DataTable';

interface GSTTabProps {
  gstData: any[];
  setShowGSTPrintModal: (show: boolean) => void;
}

export const GSTTab: FC<GSTTabProps> = ({ gstData, setShowGSTPrintModal }) => {
  const symbol = localStorage.getItem('active_company_symbol') || '₹';

  const totalOutput = gstData.reduce((sum, r) => sum + (parseFloat(r.output_gst) || 0), 0);
  const totalInput = gstData.reduce((sum, r) => sum + (parseFloat(r.input_gst) || 0), 0);
  const netPayable = Math.max(0, totalOutput - totalInput);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 6px 0' }}>GST Overview & Tax Compliance</h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>Monthly Output GST, Input Tax Credit (ITC) & Net Liability</p>
        </div>
        <button
          onClick={() => setShowGSTPrintModal(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#0284c7', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
        >
          <Printer size={16} /> Print GST Summary
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '24px' }}>
        <div style={{ background: '#fff', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>TOTAL OUTPUT GST (LIABILITY)</span>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '22px', color: '#dc2626' }}>
            {symbol} {totalOutput.toFixed(2)}
          </h3>
        </div>
        <div style={{ background: '#fff', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>TOTAL INPUT GST (ITC)</span>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '22px', color: '#15803d' }}>
            {symbol} {totalInput.toFixed(2)}
          </h3>
        </div>
        <div style={{ background: '#fff', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>NET GST PAYABLE</span>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '22px', color: '#0369a1' }}>
            {symbol} {netPayable.toFixed(2)}
          </h3>
        </div>
      </div>

      <DataTable<any>
        columns={[
          { header: 'Month', accessor: 'month' },
          {
            header: `Taxable Sales (${symbol})`,
            accessor: (r) => `${symbol} ${Number(r.sales || 0).toFixed(2)}`,
          },
          {
            header: `Output GST (${symbol})`,
            accessor: (r) => (
              <span style={{ color: '#dc2626', fontWeight: '600' }}>
                {symbol} {Number(r.output_gst || 0).toFixed(2)}
              </span>
            ),
          },
          {
            header: `Taxable Purchases (${symbol})`,
            accessor: (r) => `${symbol} ${Number(r.purchases || 0).toFixed(2)}`,
          },
          {
            header: `Input GST / ITC (${symbol})`,
            accessor: (r) => (
              <span style={{ color: '#15803d', fontWeight: '600' }}>
                {symbol} {Number(r.input_gst || 0).toFixed(2)}
              </span>
            ),
          },
          {
            header: `Net Payable / (Credit) (${symbol})`,
            accessor: (r) => (
              <strong>
                {symbol} {Number(r.net_gst || 0).toFixed(2)}
              </strong>
            ),
          },
        ]}
        data={gstData}
        emptyMessage="No GST transaction history available."
      />
    </div>
  );
};