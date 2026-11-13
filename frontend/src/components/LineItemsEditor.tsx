import React from 'react';
import { Trash2 } from 'lucide-react';
import type { Item } from '../types/erp';
import { newLine, type LineForm } from '../utils/erpHelpers';

interface LineItemsEditorProps {
  lines: LineForm[];
  items: Item[];
  showStock?: boolean;
  priceMode?: 'selling' | 'buying';
  currencySymbol?: string;
  onChange: (lines: LineForm[]) => void;
}

export const LineItemsEditor: React.FC<LineItemsEditorProps> = ({
  lines,
  items,
  priceMode = 'selling',
  showStock = false,
  currencySymbol = '₹',
  onChange,
}) => {
  const handleLineChange = (index: number, field: keyof LineForm, value: any) => {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value };

    if (field === 'item_id') {
      const selectedItem = items.find(
        (i) => i.id !== undefined && String(i.id) === String(value)
      );
      if (selectedItem) {
        const sellVal = Number((selectedItem as any).selling_rate || 0);
        const costVal = Number(selectedItem.standard_rate || 0);
        updated[index].rate = (priceMode === 'selling' && sellVal > 0 ? sellVal : costVal).toString();
      }
    }
    onChange(updated);
  };

  const handleAddLine = () => {
    onChange([...lines, newLine()]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length === 1) return;
    onChange(lines.filter((_, i) => i !== index));
  };

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead style={{ background: '#f8fafc', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
          <tr>
            <th style={{ padding: '8px 10px', textAlign: 'left' }}>Item *</th>
            {showStock && <th style={{ padding: '8px 10px', textAlign: 'center', width: '70px' }}>Stock</th>}
            <th style={{ padding: '8px 10px', textAlign: 'center', width: '70px' }}>Qty *</th>
            <th style={{ padding: '8px 10px', textAlign: 'right', width: '110px' }}>Rate ({currencySymbol}) *</th>
            <th style={{ padding: '8px 10px', textAlign: 'center', width: '50px' }}>FOC</th>
            <th style={{ padding: '8px 10px', textAlign: 'center', width: '60px' }}>Disc %</th>
            <th style={{ padding: '8px 10px', textAlign: 'right', width: '120px' }}>Amount ({currencySymbol})</th>
            <th style={{ padding: '8px 10px', textAlign: 'center', width: '40px' }}></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, idx) => {
            const qty = parseFloat(line.quantity) || 0;
            const rate = line.is_foc ? 0 : parseFloat(line.rate) || 0;
            const disc = parseFloat(line.discount_percentage || '0') || 0;
            const gross = qty * rate;
            const net = Math.max(0, gross - (gross * disc) / 100);

            const selectedItem = items.find(
              (i) => i.id !== undefined && String(i.id) === String(line.item_id)
            );

            return (
              <tr key={line.uid || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '6px 10px' }}>
                  <select
                    required
                    value={line.item_id}
                    onChange={(e) => handleLineChange(idx, 'item_id', e.target.value)}
                    style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  >
                    <option value="">-- Choose Item --</option>
                    {items.filter((opt) => !lines.some((other, oIdx) => oIdx !== idx && other.item_id && String(other.item_id) === String(opt.id) && Boolean(other.is_foc) === Boolean(line.is_foc))).map((it, itIdx) => (
                      <option
                        key={it.id !== undefined ? it.id : itIdx}
                        value={it.id !== undefined ? String(it.id) : ''}
                      >
                        {it.item_name} ({it.item_code}){showStock ? ` — Stock: ${it.current_stock ?? 0}` : ''}
                      </option>
                    ))}
                  </select>
                </td>
                {showStock && (
                  <td style={{ padding: '6px 10px', textAlign: 'center', color: '#64748b' }}>
                    {selectedItem ? selectedItem.current_stock : '-'}
                  </td>
                )}
                <td style={{ padding: '6px 10px' }}>
                  <input
                    type="number"
                    min="1"
                    required
                    value={line.quantity}
                    onChange={(e) => handleLineChange(idx, 'quantity', e.target.value)}
                    style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'center' }}
                  />
                </td>
                <td style={{ padding: '6px 10px' }}>
                  <input
                    type="number"
                    step="0.01"
                    disabled={line.is_foc}
                    required
                    value={line.rate}
                    onChange={(e) => handleLineChange(idx, 'rate', e.target.value)}
                    style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'right', background: line.is_foc ? '#f1f5f9' : '#fff' }}
                  />
                </td>
                <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={line.is_foc || false}
                    onChange={(e) => handleLineChange(idx, 'is_foc', e.target.checked)}
                  />
                </td>
                <td style={{ padding: '6px 10px' }}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    disabled={line.is_foc}
                    value={line.discount_percentage || '0'}
                    onChange={(e) => handleLineChange(idx, 'discount_percentage', e.target.value)}
                    style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'center' }}
                  />
                </td>
                <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 'bold' }}>
                  {currencySymbol} {net.toFixed(2)}
                </td>
                <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveLine(idx)}
                      style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ padding: '8px 10px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
        <button
          type="button"
          onClick={handleAddLine}
          style={{ padding: '4px 12px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}
        >
          + Add Item Row
        </button>
      </div>
    </div>
  );
};