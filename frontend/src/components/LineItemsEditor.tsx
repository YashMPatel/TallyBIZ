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
  const [dualDraft, setDualDraft] = React.useState<Record<string, string>>({});

  const getBaseRate = (it: Item) => {
    const sellVal = Number((it as any).selling_rate || 0);
    const costVal = Number(it.standard_rate || 0);
    return priceMode === 'selling' && sellVal > 0 ? sellVal : costVal;
  };

  const getEffStock = (it: any) => {
    if (it && it.unit_stock !== undefined && it.unit_stock !== null) {
      return Number(it.unit_stock);
    }
    return Number(it?.current_stock ?? 0);
  };

  const itemHasAlt = (it?: Item | null) => {
    if (!it) return false;
    const conv = Number(it.conversion_factor || 0);
    return Boolean(
      it.alt_unit &&
        conv > 0 &&
        String(it.alt_unit).trim().toLowerCase() !== String(it.unit || '').trim().toLowerCase()
    );
  };

  const clearRowDraft = (rowKey: string) => {
    setDualDraft((prev) => {
      const next = { ...prev };
      delete next[`${rowKey}-base`];
      delete next[`${rowKey}-alt`];
      return next;
    });
  };

  const handleLineChange = (index: number, field: keyof LineForm, value: any) => {
    const updated = [...lines];
    const prevRow = lines[index];
    const rowKey = String(prevRow.uid || index);
    updated[index] = { ...prevRow, [field]: value };

    if (field === 'item_id') {
      clearRowDraft(rowKey);
      const selectedItem = items.find(
        (i) => i.id !== undefined && String(i.id) === String(value)
      );
      if (selectedItem) {
        updated[index].billed_unit = selectedItem.unit || 'Nos';
        updated[index].rate = getBaseRate(selectedItem).toString();
      }
    } else if (field === 'billed_unit') {
      clearRowDraft(rowKey);
      const selectedItem = items.find(
        (i) => i.id !== undefined && String(i.id) === String(updated[index].item_id)
      );
      if (selectedItem && itemHasAlt(selectedItem)) {
        const conv = Number(selectedItem.conversion_factor || 1);
        const prevUnit = prevRow.billed_unit || selectedItem.unit || 'Nos';
        const wasAlt = String(prevUnit).toLowerCase() === String(selectedItem.alt_unit).toLowerCase();
        const isAlt = String(value).toLowerCase() === String(selectedItem.alt_unit).toLowerCase();
        if (wasAlt !== isAlt) {
          const oldQty = parseFloat(prevRow.quantity) || 0;
          if (oldQty > 0) {
            updated[index].quantity = isAlt
              ? Number((oldQty * conv).toFixed(2)).toString()
              : Number((oldQty / conv).toFixed(4)).toString();
          }
          const oldRate = parseFloat(prevRow.rate) || 0;
          if (oldRate > 0) {
            updated[index].rate = (isAlt ? oldRate / conv : oldRate * conv).toFixed(2);
          } else {
            const baseRate = getBaseRate(selectedItem);
            updated[index].rate = (isAlt ? baseRate / conv : baseRate).toFixed(2);
          }
        }
      }
    }
    onChange(updated);
  };

  const handleDualQtyChange = (
    index: number,
    rowKey: string,
    mode: 'base' | 'alt',
    rawVal: string,
    isAltSelected: boolean,
    conv: number
  ) => {
    const isDirect = (mode === 'alt' && isAltSelected) || (mode === 'base' && !isAltSelected);
    const updated = [...lines];
    if (isDirect) {
      setDualDraft((prev) => {
        const next = { ...prev };
        delete next[`${rowKey}-${mode === 'base' ? 'alt' : 'base'}`];
        return next;
      });
      updated[index] = { ...updated[index], quantity: rawVal };
    } else {
      setDualDraft((prev) => ({ ...prev, [`${rowKey}-${mode}`]: rawVal }));
      if (rawVal === '') {
        updated[index] = { ...updated[index], quantity: '' };
      } else {
        const num = parseFloat(rawVal);
        if (!Number.isNaN(num)) {
          const converted = mode === 'base' ? num * conv : num / conv;
          updated[index] = {
            ...updated[index],
            quantity: Number(converted.toFixed(mode === 'base' ? 2 : 4)).toString(),
          };
        }
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
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead style={{ background: '#f8fafc', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
          <tr>
            <th style={{ padding: '8px 10px', textAlign: 'left', minWidth: '250px' }}>Item *</th>
            <th style={{ padding: '8px 10px', textAlign: 'center', width: '80px' }}>HSN</th>
            <th style={{ padding: '8px 10px', textAlign: 'center', width: '78px' }}>Bill Unit</th>
            {showStock && <th style={{ padding: '8px 10px', textAlign: 'center', width: '105px' }}>Stock</th>}
            <th style={{ padding: '8px 10px', textAlign: 'center', width: '185px', minWidth: '175px' }}>Qty (Base / Alt) *</th>
            <th style={{ padding: '8px 10px', textAlign: 'right', width: '125px', minWidth: '120px' }}>Rate ({currencySymbol}) *</th>
            <th style={{ padding: '8px 10px', textAlign: 'center', width: '50px' }}>FOC</th>
            <th style={{ padding: '8px 10px', textAlign: 'center', width: '60px' }}>Disc %</th>
            <th style={{ padding: '8px 10px', textAlign: 'right', width: '130px', minWidth: '125px' }}>Amount ({currencySymbol})</th>
            <th style={{ padding: '8px 10px', textAlign: 'center', width: '40px' }}></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, idx) => {
            const rowKey = String(line.uid || idx);
            const qty = parseFloat(line.quantity) || 0;
            const rate = line.is_foc ? 0 : parseFloat(line.rate) || 0;
            const disc = parseFloat(line.discount_percentage || '0') || 0;
            const gross = qty * rate;
            const net = Math.max(0, gross - (gross * disc) / 100);

            const selectedItem = items.find(
              (i) => i.id !== undefined && String(i.id) === String(line.item_id)
            );
            const conv = Number(selectedItem?.conversion_factor || 1);
            const hasAlt = itemHasAlt(selectedItem);
            const activeUnit = line.billed_unit || selectedItem?.unit || 'Nos';
            const isAltSelected =
              hasAlt && String(activeUnit).toLowerCase() === String(selectedItem?.alt_unit).toLowerCase();

            const baseQtyDisplay = !isAltSelected
              ? line.quantity
              : dualDraft[`${rowKey}-base`] !== undefined
                ? dualDraft[`${rowKey}-base`]
                : line.quantity === ''
                  ? ''
                  : Number((qty / conv).toFixed(4)).toString();

            const altQtyDisplay = isAltSelected
              ? line.quantity
              : dualDraft[`${rowKey}-alt`] !== undefined
                ? dualDraft[`${rowKey}-alt`]
                : line.quantity === ''
                  ? ''
                  : Number((qty * conv).toFixed(2)).toString();

            return (
              <tr key={rowKey} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '6px 10px' }}>
                  <select
                    required
                    value={line.item_id}
                    onChange={(e) => handleLineChange(idx, 'item_id', e.target.value)}
                    style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  >
                    <option value="">-- Choose Item --</option>
                    {items.filter((opt) => {
                      if (String(opt.id) === String(line.item_id)) return true;
                      if (priceMode === 'selling') {
                        const cat = String(opt.category || '').toLowerCase();
                        const code = String(opt.item_code || '').toUpperCase();
                        if (cat.includes('raw') || code.startsWith('RM-')) return false;
                      }
                      return !lines.some((other, oIdx) => oIdx !== idx && other.item_id && String(other.item_id) === String(opt.id) && Boolean(other.is_foc) === Boolean(line.is_foc));
                    }).map((it, itIdx) => {
                      const itHasAlt = itemHasAlt(it);
                      const effStock = getEffStock(it);
                      return (
                        <option
                          key={it.id !== undefined ? it.id : itIdx}
                          value={it.id !== undefined ? String(it.id) : ''}
                        >
                          {it.item_name} ({it.item_code}) • {it.unit || 'Nos'}{itHasAlt ? ` (1 ${it.unit} = ${Number(it.conversion_factor)} ${it.alt_unit})` : ''}{it.hsn_code ? ` • HSN: ${it.hsn_code}` : ''}{showStock ? ` — Stock: ${effStock}${Number(it.current_stock ?? 0) !== effStock ? ` (Co. Total: ${Number(it.current_stock ?? 0)})` : ''}` : ''}
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
                    {selectedItem ? (() => {
                      const dispStock = getEffStock(selectedItem);
                      return (
                        <div>
                          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '12.5px' }}>
                            {dispStock.toFixed(2)} {selectedItem.unit || 'Nos'}
                          </div>
                          {hasAlt && (
                            <div style={{ marginTop: '3px', fontSize: '12px', fontWeight: 700, color: '#0369a1', background: '#e0f2fe', border: '1px solid #7dd3fc', borderRadius: '4px', padding: '1px 6px', display: 'inline-block' }}>
                              {(dispStock * conv).toLocaleString('en-IN', { maximumFractionDigits: 2 })} {selectedItem.alt_unit}
                            </div>
                          )}
                          {Number(selectedItem.current_stock ?? 0) !== dispStock && (
                            <div style={{ marginTop: '3px', fontSize: '11px', fontWeight: 700, color: '#15803d' }}>
                              Total: {Number(selectedItem.current_stock ?? 0).toFixed(2)} {selectedItem.unit || 'Nos'}
                            </div>
                          )}
                        </div>
                      );
                    })() : '-'}
                  </td>
                )}
                <td style={{ padding: '6px 8px' }}>
                  {hasAlt && priceMode === 'selling' ? (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <input
                          type="number"
                          step="any"
                          min="0.0001"
                          required={!isAltSelected}
                          value={baseQtyDisplay}
                          onChange={(e) => handleDualQtyChange(idx, rowKey, 'base', e.target.value, isAltSelected, conv)}
                          onBlur={() => setDualDraft((prev) => { const n = { ...prev }; delete n[`${rowKey}-base`]; return n; })}
                          style={{ width: '100%', padding: '5px 4px', borderRadius: '4px', border: !isAltSelected ? '1.5px solid #0284c7' : '1px solid #cbd5e1', textAlign: 'center', fontWeight: !isAltSelected ? 700 : 500, background: !isAltSelected ? '#f0f9ff' : '#fff' }}
                        />
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a', textAlign: 'center', marginTop: '2px' }}>
                          {selectedItem!.unit} (Stock)
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <input
                          type="number"
                          step="any"
                          min="0.01"
                          required={isAltSelected}
                          value={altQtyDisplay}
                          onChange={(e) => handleDualQtyChange(idx, rowKey, 'alt', e.target.value, isAltSelected, conv)}
                          onBlur={() => setDualDraft((prev) => { const n = { ...prev }; delete n[`${rowKey}-alt`]; return n; })}
                          style={{ width: '100%', padding: '5px 4px', borderRadius: '4px', border: isAltSelected ? '1.5px solid #15803d' : '1px solid #cbd5e1', textAlign: 'center', fontWeight: isAltSelected ? 700 : 500, background: isAltSelected ? '#f0fdf4' : '#fff' }}
                        />
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#0369a1', textAlign: 'center', marginTop: '2px' }}>
                          {selectedItem!.alt_unit}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      required
                      value={line.quantity}
                      onChange={(e) => handleLineChange(idx, 'quantity', e.target.value)}
                      style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'center' }}
                    />
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
