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
  const getBaseRate = (it: Item) => {
    const sellVal = Number((it as any).selling_rate || 0);
    const costVal = Number(it.standard_rate || 0);
    return priceMode === 'selling' && sellVal > 0 ? sellVal : costVal;
  };

  const handleLineChange = (index: number, field: keyof LineForm, value: any) => {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value };

    if (field === 'item_id') {
      const selectedItem = items.find(
        (i) => i.id !== undefined && String(i.id) === String(value)
      );
      if (selectedItem) {
        updated[index].billed_unit = selectedItem.unit || 'Nos';
        updated[index].rate = getBaseRate(selectedItem).toString();
      }
    } else if (field === 'billed_unit') {
      const selectedItem = items.find(
        (i) => i.id !== undefined && String(i.id) === String(updated[index].item_id)
      );
      if (selectedItem) {
        const baseRate = getBaseRate(selectedItem);
        const conv = Number(selectedItem.conversion_factor || 1);
        const isAlt =
          selectedItem.alt_unit &&
          String(value).toLowerCase() === String(selectedItem.alt_unit).toLowerCase() &&
          conv > 0;
        updated[index].rate = (isAlt ? baseRate / conv : baseRate).toFixed(2);
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
            <th style={{ padding: '8px 10px', textAlign: 'center', width: '80px' }}>HSN</th>
            <th style={{ padding: '8px 10px', textAlign: 'center', width: '78px' }}>Unit</th>
            {showStock && <th style={{ padding: '8px 10px', textAlign: 'center', width: '85px' }}>Stock</th>}
            <th style={{ padding: '8px 10px', textAlign: 'center', width: '95px' }}>Qty *</th>
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
            const conv = Number(selectedItem?.conversion_factor || 1);
            const hasAlt = Boolean(
              selectedItem?.alt_unit &&
                conv > 0 &&
                String(selectedItem.alt_unit).toLowerCase() !== String(selectedItem.unit || '').toLowerCase()
            );
            const activeUnit = line.billed_unit || selectedItem?.unit || 'Nos';
            const isAltSelected =
              hasAlt && String(activeUnit).toLowerCase() === String(selectedItem?.alt_unit).toLowerCase();

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
                    {items.filter((opt) => !lines.some((other, oIdx) => oIdx !== idx && other.item_id && String(other.item_id) === String(opt.id) && Boolean(other.is_foc) === Boolean(line.is_foc))).map((it, itIdx) => {
                      const itHasAlt = it.alt_unit && Number(it.conversion_factor || 0) > 0;
                      return (
                        <option
                          key={it.id !== undefined ? it.id : itIdx}
                          value={it.id !== undefined ? String(it.id) : ''}
                        >
                          {it.item_name} ({it.item_code}) • {it.unit || 'Nos'}{itHasAlt ? ` (1 ${it.unit} = ${Number(it.conversion_factor)} ${it.alt_unit})` : ''}{it.hsn_code ? ` • HSN: ${it.hsn_code}` : ''}{showStock ? ` — Stock: ${it.current_stock ?? 0}` : ''}
                        </option>
                      );
                    })}
                  </select>
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                  <input
                    type="text"
                    placeholder="HSN/SAC"
                    value={(line as any).hsn_code !== undefined ? (line as any).hsn_code : ((selectedItem as any)?.hsn_code || '')}
                    onChange={(e) => handleLineChange(idx, 'hsn_code' as any, e.target.value)}
                    style={{ width: '74px', padding: '5px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#0369a1' }}
                  />
                </td>
                <td style={{ padding: '6px 6px', textAlign: 'center', fontSize: '12px', color: '#475569' }}>
                  {hasAlt && priceMode === 'selling' ? (
                    <select
                      value={activeUnit}
                      onChange={(e) => handleLineChange(idx, 'billed_unit', e.target.value)}
                      style={{ padding: '5px 4px', borderRadius: '4px', border: '1px solid #0284c7', background: '#f0f9ff', color: '#0369a1', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
                    >
                      <option value={selectedItem!.unit}>{selectedItem!.unit}</option>
                      <option value={selectedItem!.alt_unit}>{selectedItem!.alt_unit}</option>
                    </select>
                  ) : (
                    selectedItem?.unit || '-'
                  )}
                </td>
                {showStock && (
                  <td style={{ padding: '6px 8px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                    {selectedItem ? (
                      <div>
                        <div>{selectedItem.current_stock} {selectedItem.unit}</div>
                        {hasAlt && (
                          <div style={{ fontSize: '10px', color: '#0369a1' }}>
                            ({(Number(selectedItem.current_stock || 0) * conv).toFixed(0)} {selectedItem.alt_unit})
                          </div>
                        )}
                      </div>
                    ) : '-'}
                  </td>
                )}
                <td style={{ padding: '6px 8px' }}>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    value={line.quantity}
                    onChange={(e) => handleLineChange(idx, 'quantity', e.target.value)}
                    style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'center' }}
                  />
                  {hasAlt && qty > 0 && (
                    <div style={{ fontSize: '10px', color: isAltSelected ? '#15803d' : '#0369a1', fontWeight: 600, textAlign: 'center', marginTop: '2px' }}>
                      {isAltSelected
                        ? `= ${(qty / conv).toFixed(2)} ${selectedItem!.unit}`
                        : `= ${(qty * conv).toFixed(0)} ${selectedItem!.alt_unit}`}
                    </div>
                  )}
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
