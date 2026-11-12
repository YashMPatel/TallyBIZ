import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { FilePlus2, Printer, Pencil, Trash2, X } from 'lucide-react';
import { API_BASE } from '../../utils/erpHelpers';
import { DataTable } from '../DataTable';
import { ReturnNotePrintModal } from '../ReturnNotePrintModal';
import { useAuth } from '../../context/AuthContext';

type ReturnType = 'Credit' | 'Debit';
type NoteType = ReturnType;

interface Party {
  id: number;
  customer_name?: string;
  supplier_name?: string;
  gstin?: string;
  gst_category?: string;
  email?: string;
  mobile_no?: string;
  city?: string;
  postal_code?: string;
  address?: string;
}

interface SourceInvoice {
  id: number;
  invoice_number?: string;
  bill_number?: string;
  customer?: number;
  supplier?: number;
  customer_name?: string;
  supplier_name?: string;
  posting_date: string;
  grand_total: string | number;
  items?: Array<{
    item: number;
    quantity: string | number;
  }>;
}

interface NoteReferenceInvoice {
  number: string;
  date: string;
}

interface StockItem {
  id: number;
  item_name: string;
  item_code: string;
  standard_rate: string | number;
}

interface NoteRecord {
  id: number;
  credit_note_number?: string;
  debit_note_number?: string;
  customer_name?: string;
  supplier_name?: string;
  customer?: number | null;
  supplier?: number | null;
  sales_invoice?: number | null;
  purchase_invoice?: number | null;
  posting_date: string;
  reason?: string | null;
  net_total: string | number;
  tax_amount: string | number;
  grand_total: string | number;
  items: Array<{
    id: number;
    item: number;
    quantity: string | number;
    rate: string | number;
    amount: string | number;
  }>;
}

interface NoteListRow {
  id: string;
  noteNumber: string;
  postingDate: string;
  noteType: NoteType;
  partyName: string;
  amount: string | number;
  itemCount: number;
  note: NoteRecord;
}

interface LineItem {
  item: string;
  quantity: string;
  rate: string;
}

function getRemainingInvoiceQuantity(
  invoice: SourceInvoice,
  notes: NoteRecord[],
  editingNoteId: number | null,
  itemId: number
): number {
  const invoicedQuantity = (invoice.items ?? [])
    .filter((item) => Number(item.item) === itemId)
    .reduce((total, item) => total + Number(item.quantity), 0);
  const returnedQuantity = notes
    .filter(
      (note) =>
        note.id !== editingNoteId &&
        Number(note.sales_invoice ?? note.purchase_invoice) === invoice.id
    )
    .flatMap((note) => note.items)
    .filter((item) => Number(item.item) === itemId)
    .reduce((total, item) => total + Number(item.quantity), 0);

  return Math.max(0, invoicedQuantity - returnedQuantity);
}

function getListData<T>(data: unknown): T[] {
  if (Array.isArray(data)) {
    return data as T[];
  }
  if (data && typeof data === 'object' && 'results' in data && Array.isArray(data.results)) {
    return data.results as T[];
  }
  throw new Error('The server returned an invalid list response.');
}

function getNextNoteNumber(notes: NoteRecord[], returnType: ReturnType): string {
  const numberField = returnType === 'Credit' ? 'credit_note_number' : 'debit_note_number';
  const noteNumbers = notes
    .map((note) => note[numberField] ?? '')
    .map((noteNumber) => noteNumber.match(/(\d+)$/)?.[1])
    .filter((number): number is string => Boolean(number))
    .map(Number);
  const nextNumber = Math.max(0, ...noteNumbers) + 1;
  return String(nextNumber).padStart(3, '0');
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data ? JSON.stringify(error.response.data) : error.message;
  }
  return error instanceof Error ? error.message : 'Unknown error';
}

function getTodayDate(): string {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().slice(0, 10);
}

function selectedPartyForNote(
  note: NoteRecord,
  type: NoteType,
  customers: Party[],
  suppliers: Party[]
): Party | undefined {
  const partyId = type === 'Credit' ? note.customer : note.supplier;
  const partyName = type === 'Credit' ? note.customer_name : note.supplier_name;
  const parties = type === 'Credit' ? customers : suppliers;
  return (
    parties.find((party) => party.id === partyId) ??
    parties.find((party) => (type === 'Credit' ? party.customer_name : party.supplier_name) === partyName)
  );
}

function getReferenceInvoice(
  note: NoteRecord,
  type: NoteType,
  salesInvoices: SourceInvoice[],
  purchaseInvoices: SourceInvoice[]
): NoteReferenceInvoice | undefined {
  const invoiceId = type === 'Credit' ? note.sales_invoice : note.purchase_invoice;
  if (!invoiceId) return undefined;

  const invoice = (type === 'Credit' ? salesInvoices : purchaseInvoices).find(
    (item) => item.id === invoiceId
  );
  const number = type === 'Credit' ? invoice?.invoice_number : invoice?.bill_number;
  return invoice && number ? { number, date: invoice.posting_date } : undefined;
}

export default function ReturnsTab() {
  const { user } = useAuth();
  const isSalesUser = String(user?.role || '').trim().toUpperCase().replace(/\s+/g, '_') === 'SALES_USER';

  const symbol = localStorage.getItem('active_company_symbol') || '₹';
  const activeCompanyId = localStorage.getItem('active_company_id') || '';
  const compParam = activeCompanyId ? `?company_id=${activeCompanyId}` : '';

  const [returnType, setReturnType] = useState<ReturnType>('Credit');
  const [noteNumber, setNoteNumber] = useState('001');
  const [partyId, setPartyId] = useState('');
  const [referenceInvoiceId, setReferenceInvoiceId] = useState('');
  const [reason, setReason] = useState('');
  const [postingDate, setPostingDate] = useState(getTodayDate);
  const [items, setItems] = useState<LineItem[]>([{ item: '', quantity: '1', rate: '0' }]);

  const [customers, setCustomers] = useState<Party[]>([]);
  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [salesInvoices, setSalesInvoices] = useState<SourceInvoice[]>([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState<SourceInvoice[]>([]);
  const [creditNotes, setCreditNotes] = useState<NoteRecord[]>([]);
  const [debitNotes, setDebitNotes] = useState<NoteRecord[]>([]);
  const [noteListType, setNoteListType] = useState<NoteType>('Credit');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<{ note: NoteRecord; type: NoteType } | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [nextNoteNumbers, setNextNoteNumbers] = useState<Record<ReturnType, string>>({
    Credit: '001',
    Debit: '001',
  });

  useEffect(() => {
    let isMounted = true;

    const loadList = async <T,>(url: string, setData: (data: T[]) => void, label: string) => {
      try {
        const response = await axios.get<unknown>(`${API_BASE}${url}`);
        const data = getListData<T>(response.data);
        if (isMounted) setData(data);
        return data;
      } catch (error) {
        if (isMounted) {
          setLoadError((prev) => [prev, `${label}: ${getErrorMessage(error)}`].filter(Boolean).join('\n'));
        }
        return [];
      }
    };

    const loadOptions = async () => {
      const [crNotes, dbNotes] = await Promise.all([
        loadList<NoteRecord>(`/selling/credit-notes/${compParam}`, setCreditNotes, 'Credit notes'),
        isSalesUser ? Promise.resolve([]) : loadList<NoteRecord>(`/buying/debit-notes/${compParam}`, setDebitNotes, 'Debit notes'),
        loadList<Party>(`/selling/customers/${compParam}`, setCustomers, 'Customers'),
        isSalesUser ? Promise.resolve([]) : loadList<Party>(`/buying/suppliers/${compParam}`, setSuppliers, 'Suppliers'),
        loadList<StockItem>(`/stock/items/${compParam}`, setStockItems, 'Items'),
        loadList<SourceInvoice>(`/selling/invoices/${compParam}`, setSalesInvoices, 'Sales invoices'),
        isSalesUser ? Promise.resolve([]) : loadList<SourceInvoice>(`/buying/invoices/${compParam}`, setPurchaseInvoices, 'Purchase bills'),
      ]);

      if (isMounted) {
        const nextNumbers = {
          Credit: getNextNoteNumber(crNotes, 'Credit'),
          Debit: getNextNoteNumber(dbNotes, 'Debit'),
        };
        setNextNoteNumbers(nextNumbers);
        setNoteNumber(nextNumbers.Credit);
        setIsLoadingOptions(false);
      }
    };

    void loadOptions();

    return () => {
      isMounted = false;
    };
  }, [compParam, isSalesUser]);

  const handleReturnTypeChange = (nextType: ReturnType) => {
    setReturnType(nextType);
    setPartyId('');
    setReferenceInvoiceId('');
    setReason('');
    setItems([{ item: '', quantity: '1', rate: '0' }]);
    setNoteNumber(nextNoteNumbers[nextType]);
    setEditingNoteId(null);
  };

  const openNewNote = (type: ReturnType) => {
    handleReturnTypeChange(type);
    setPostingDate(getTodayDate());
    setSubmitError('');
    setIsFormOpen(true);
  };

  const handleEditNote = (note: NoteRecord, type: NoteType) => {
    const notePartyName = type === 'Credit' ? note.customer_name : note.supplier_name;
    const party = (type === 'Credit' ? customers : suppliers).find(
      (option) => (type === 'Credit' ? option.customer_name : option.supplier_name) === notePartyName
    );
    setReturnType(type);
    setNoteListType(type);
    setEditingNoteId(note.id);
    setNoteNumber(type === 'Credit' ? note.credit_note_number || '' : note.debit_note_number || '');
    setPartyId(party ? String(party.id) : '');
    const sourceInvoiceId = type === 'Credit' ? note.sales_invoice : note.purchase_invoice;
    setReferenceInvoiceId(sourceInvoiceId ? String(sourceInvoiceId) : '');
    setReason(note.reason || '');
    setPostingDate(note.posting_date);
    setItems(
      note.items.map((item) => ({
        item: String(item.item),
        quantity: String(item.quantity),
        rate: String(item.rate),
      }))
    );
    setSubmitError('');
    setIsFormOpen(true);
  };

  const handleDeleteNote = async (note: NoteRecord, type: NoteType) => {
    const number = type === 'Credit' ? note.credit_note_number : note.debit_note_number;
    if (!window.confirm(`Delete ${type.toLowerCase()} note ${number}?`)) return;

    const endpoint = type === 'Credit' ? 'selling/credit-notes' : 'buying/debit-notes';
    try {
      await axios.delete(`${API_BASE}/${endpoint}/${note.id}/`);
      if (type === 'Credit') {
        const remaining = creditNotes.filter((existing) => existing.id !== note.id);
        setCreditNotes(remaining);
        const nextNumber = getNextNoteNumber(remaining, 'Credit');
        setNextNoteNumbers((prev) => ({ ...prev, Credit: nextNumber }));
        if (returnType === 'Credit' && editingNoteId === note.id) {
          setNoteNumber(nextNumber);
          setEditingNoteId(null);
        }
      } else {
        const remaining = debitNotes.filter((existing) => existing.id !== note.id);
        setDebitNotes(remaining);
        const nextNumber = getNextNoteNumber(remaining, 'Debit');
        setNextNoteNumbers((prev) => ({ ...prev, Debit: nextNumber }));
        if (returnType === 'Debit' && editingNoteId === note.id) {
          setNoteNumber(nextNumber);
          setEditingNoteId(null);
        }
      }
    } catch (error) {
      window.alert(`Could not delete the note: ${getErrorMessage(error)}`);
    }
  };

  const handleItemChange = (index: number, field: keyof LineItem, value: string) => {
    setItems((currentItems) =>
      currentItems.map((item, itemIndex) => {
        if (itemIndex !== index) return item;

        if (field === 'item') {
          const selectedItem = stockItems.find((stockItem) => String(stockItem.id) === value);
          return {
            ...item,
            item: value,
            rate: selectedItem ? String(selectedItem.standard_rate) : '0',
          };
        }
        return { ...item, [field]: value };
      })
    );
  };

  const addItemRow = () => {
    setItems((current) => [...current, { item: '', quantity: '1', rate: '0' }]);
  };

  const removeItemRow = (index: number) => {
    setItems((current) => current.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    const selectedParty = (returnType === 'Credit' ? customers : suppliers).find(
      (party) => String(party.id) === partyId
    );
    const partyName = returnType === 'Credit' ? selectedParty?.customer_name : selectedParty?.supplier_name;

    if (!selectedParty || !partyName) {
      setSubmitError(`Please select a ${returnType === 'Credit' ? 'customer' : 'supplier'}.`);
      return;
    }

    const selectedSourceInvoice = (returnType === 'Credit' ? salesInvoices : purchaseInvoices).find(
      (invoice) => String(invoice.id) === referenceInvoiceId
    );

    if (selectedSourceInvoice) {
      const noteItems = returnType === 'Credit' ? creditNotes : debitNotes;
      for (const item of items) {
        const itemId = Number(item.item);
        const requestedQuantity = Number(item.quantity);
        const remainingQuantity = getRemainingInvoiceQuantity(
          selectedSourceInvoice,
          noteItems,
          editingNoteId,
          itemId
        );
        if (requestedQuantity > remainingQuantity) {
          const itemName = stockItems.find((s) => s.id === itemId)?.item_name ?? 'Item';
          setSubmitError(
            `${itemName}: Maximum ${remainingQuantity} can be returned from this invoice.`
          );
          return;
        }
      }
    }

    try {
      const lineItems = items.map((item) => {
        const qty = Number(item.quantity) || 0;
        const rate = Number(item.rate) || 0;
        return {
          item: Number(item.item),
          quantity: qty,
          rate,
          amount: Number((qty * rate).toFixed(2)),
        };
      });

      const isEditing = editingNoteId !== null;
      if (returnType === 'Credit') {
        const endpoint = `${API_BASE}/selling/credit-notes/${isEditing ? `${editingNoteId}/` : ''}`;
        const payload = {
          credit_note_number: noteNumber,
          customer: selectedParty.id,
          customer_name: partyName,
          company: activeCompanyId ? parseInt(activeCompanyId, 10) : undefined,
          sales_invoice: referenceInvoiceId ? Number(referenceInvoiceId) : null,
          reason: reason.trim(),
          posting_date: postingDate,
          items: lineItems,
        };
        const response = isEditing
          ? await axios.put<NoteRecord>(endpoint, payload)
          : await axios.post<NoteRecord>(endpoint, payload);
        setCreditNotes((prev) =>
          isEditing ? prev.map((n) => (n.id === response.data.id ? response.data : n)) : [response.data, ...prev]
        );
      } else {
        const endpoint = `${API_BASE}/buying/debit-notes/${isEditing ? `${editingNoteId}/` : ''}`;
        const payload = {
          debit_note_number: noteNumber,
          supplier: selectedParty.id,
          supplier_name: partyName,
          company: activeCompanyId ? parseInt(activeCompanyId, 10) : undefined,
          purchase_invoice: referenceInvoiceId ? Number(referenceInvoiceId) : null,
          reason: reason.trim(),
          posting_date: postingDate,
          items: lineItems,
        };
        const response = isEditing
          ? await axios.put<NoteRecord>(endpoint, payload)
          : await axios.post<NoteRecord>(endpoint, payload);
        setDebitNotes((prev) =>
          isEditing ? prev.map((n) => (n.id === response.data.id ? response.data : n)) : [response.data, ...prev]
        );
      }

      setIsFormOpen(false);
      setEditingNoteId(null);
    } catch (error) {
      setSubmitError(`Error saving note: ${getErrorMessage(error)}`);
    }
  };

  const parties = returnType === 'Credit' ? customers : suppliers;
  const sourceInvoices = (returnType === 'Credit' ? salesInvoices : purchaseInvoices).filter((invoice) =>
    returnType === 'Credit' ? String(invoice.customer) === partyId : String(invoice.supplier) === partyId
  );
  const selectedSourceInvoice = sourceInvoices.find((invoice) => String(invoice.id) === referenceInvoiceId);
  const selectableItems = selectedSourceInvoice
    ? stockItems.filter((stockItem) =>
        (selectedSourceInvoice.items ?? []).some((invItem) => Number(invItem.item) === stockItem.id)
      )
    : stockItems;

  const activeListType: NoteType = isSalesUser ? 'Credit' : noteListType;

  const noteList: NoteListRow[] = (activeListType === 'Credit' ? creditNotes : debitNotes).map((note) => ({
    id: `${activeListType}-${note.id}`,
    noteNumber: (activeListType === 'Credit' ? note.credit_note_number : note.debit_note_number) || '',
    postingDate: note.posting_date,
    noteType: activeListType,
    partyName: (activeListType === 'Credit' ? note.customer_name : note.supplier_name) || '',
    amount: note.grand_total,
    itemCount: note.items?.length ?? 0,
    note,
  }));

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 700, color: '#0f172a' }}>
            {isSalesUser ? 'Credit Notes (Sales Returns)' : 'Credit & Debit Notes'}
          </h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>
            {isSalesUser ? 'Customer sales returns' : 'Sales returns and purchase returns'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => openNewNote('Credit')} style={actionButtonStyle('#0284c7')}>
            <FilePlus2 size={16} /> New Credit Note
          </button>
          {!isSalesUser && (
            <button type="button" onClick={() => openNewNote('Debit')} style={actionButtonStyle('#0f766e')}>
              <FilePlus2 size={16} /> New Debit Note
            </button>
          )}
        </div>
      </div>

      {loadError && (
        <p role="alert" style={{ whiteSpace: 'pre-line', color: '#b91c1c', marginBottom: 16 }}>
          Could not load return form options: {loadError}
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {(isSalesUser ? (['Credit'] as const) : (['Credit', 'Debit'] as const)).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setNoteListType(type)}
              style={{
                ...actionButtonStyle(activeListType === type ? '#0284c7' : '#fff', activeListType !== type),
                color: activeListType === type ? '#fff' : '#334155',
                border: activeListType === type ? '1px solid #0284c7' : '1px solid #cbd5e1',
              }}
            >
              {type} Notes ({type === 'Credit' ? creditNotes.length : debitNotes.length})
            </button>
          ))}
        </div>
      </div>

      <DataTable<NoteListRow>
        columns={[
          { header: 'Note #', accessor: 'noteNumber' },
          { header: 'Date', accessor: 'postingDate' },
          { header: 'Type', accessor: (row) => `${row.noteType} Note` },
          { header: 'Party', accessor: 'partyName' },
          { header: 'Items', accessor: 'itemCount' },
          {
            header: `Amount (${symbol})`,
            accessor: (row) => (
              <strong style={{ color: row.noteType === 'Credit' ? '#15803d' : '#b91c1c' }}>
                {symbol} {Number(row.amount || 0).toFixed(2)}
              </strong>
            ),
          },
          {
            header: 'Action',
            accessor: (row) => (
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setSelectedNote({ note: row.note, type: activeListType })}
                  style={smallActionButtonStyle('#e0f2fe', '#7dd3fc', '#0369a1')}
                >
                  <Printer size={13} /> Print
                </button>
                <button
                  type="button"
                  onClick={() => handleEditNote(row.note, activeListType)}
                  style={smallActionButtonStyle('#fef3c7', '#f59e0b', '#92400e')}
                >
                  <Pencil size={13} /> Edit
                </button>
                {!isSalesUser && (
                  <button
                    type="button"
                    onClick={() => void handleDeleteNote(row.note, activeListType)}
                    style={smallActionButtonStyle('#fee2e2', '#fca5a5', '#b91c1c')}
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                )}
              </div>
            ),
          },
        ]}
        data={noteList}
        emptyMessage={`No ${activeListType.toLowerCase()} notes yet.`}
      />

      {isFormOpen && (
        <div style={modalBackdropStyle}>
          <div style={formModalStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
              <h2 style={{ margin: 0, color: '#0f172a', fontSize: 19 }}>
                {editingNoteId ? 'Edit' : 'New'} {returnType} Note
              </h2>
              <button type="button" onClick={() => setIsFormOpen(false)} style={closeButtonStyle}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                <label style={fieldLabelStyle}>
                  {returnType} Note No
                  <input type="text" value={noteNumber} onChange={(e) => setNoteNumber(e.target.value)} style={fieldStyle} required />
                </label>
                <label style={fieldLabelStyle}>
                  {returnType === 'Credit' ? 'Customer' : 'Supplier'}
                  <select
                    value={partyId}
                    onChange={(e) => {
                      setPartyId(e.target.value);
                      setReferenceInvoiceId('');
                    }}
                    style={fieldStyle}
                    required
                    disabled={isLoadingOptions || parties.length === 0}
                  >
                    <option value="">{isLoadingOptions ? 'Loading...' : `-- Select ${returnType === 'Credit' ? 'Customer' : 'Supplier'} --`}</option>
                    {parties.map((party) => {
                      const name = returnType === 'Credit' ? party.customer_name : party.supplier_name;
                      return name ? <option key={party.id} value={party.id}>{name}</option> : null;
                    })}
                  </select>
                </label>
                <label style={fieldLabelStyle}>
                  Posting Date
                  <input type="date" value={postingDate} onChange={(e) => setPostingDate(e.target.value)} style={fieldStyle} required />
                </label>
                <label style={fieldLabelStyle}>
                  Reference {returnType === 'Credit' ? 'Sales Invoice' : 'Purchase Bill'}
                  <select
                    value={referenceInvoiceId}
                    onChange={(e) => {
                      setReferenceInvoiceId(e.target.value);
                      setItems([{ item: '', quantity: '1', rate: '0' }]);
                    }}
                    style={fieldStyle}
                    disabled={!partyId}
                  >
                    <option value="">
                      {partyId ? `-- Select ${returnType === 'Credit' ? 'Invoice' : 'Bill'} --` : 'Select a party first'}
                    </option>
                    {sourceInvoices.map((inv) => {
                      const num = returnType === 'Credit' ? inv.invoice_number : inv.bill_number;
                      return (
                        <option key={inv.id} value={inv.id}>
                          {num} · {inv.posting_date} · {symbol} {Number(inv.grand_total).toFixed(2)}
                        </option>
                      );
                    })}
                  </select>
                </label>
              </div>

              <label style={{ ...fieldLabelStyle, display: 'block', marginTop: 14 }}>
                Reason
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  style={{ ...fieldStyle, minHeight: 70, resize: 'vertical' }}
                  placeholder="Reason for return"
                  required
                />
              </label>

              <div style={{ marginTop: 20 }}>
                <h3 style={{ margin: '0 0 10px', fontSize: 15, color: '#334155' }}>Line Items</h3>
                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead style={{ background: '#f8fafc', color: '#64748b' }}>
                      <tr>
                        <th style={{ padding: '10px 12px', textAlign: 'left' }}>Item</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', width: 90 }}>Quantity</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', width: 120 }}>Rate ({symbol})</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', width: 60 }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((row, index) => (
                        <tr key={index}>
                          <td style={lineCellStyle}>
                            <select
                              value={row.item}
                              onChange={(e) => handleItemChange(index, 'item', e.target.value)}
                              style={fieldStyle}
                              required
                            >
                              <option value="">-- Select Item --</option>
                              {selectableItems.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.item_name} ({item.item_code})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td style={lineCellStyle}>
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={row.quantity}
                              onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                              style={{ ...fieldStyle, textAlign: 'center' }}
                              required
                            />
                          </td>
                          <td style={lineCellStyle}>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.rate}
                              onChange={(e) => handleItemChange(index, 'rate', e.target.value)}
                              style={{ ...fieldStyle, textAlign: 'right' }}
                              required
                            />
                          </td>
                          <td style={{ ...lineCellStyle, textAlign: 'center' }}>
                            {items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeItemRow(index)}
                                style={smallActionButtonStyle('#fee2e2', '#fca5a5', '#b91c1c')}
                              >
                                Remove
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  onClick={addItemRow}
                  style={{ ...smallActionButtonStyle('#f1f5f9', '#cbd5e1', '#334155'), marginTop: 10 }}
                >
                  + Add Line
                </button>
              </div>

              {submitError && <p role="alert" style={{ color: '#b91c1c', margin: '14px 0 0' }}>{submitError}</p>}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  style={smallActionButtonStyle('#fff', '#cbd5e1', '#334155')}
                >
                  Cancel
                </button>
                <button type="submit" style={actionButtonStyle('#0284c7')}>
                  {editingNoteId ? 'Update' : 'Save'} {returnType} Note
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedNote && (
        <ReturnNotePrintModal
          key={`${selectedNote.type}-${selectedNote.note.id}`}
          note={selectedNote.note}
          noteType={selectedNote.type}
          stockItems={stockItems}
          party={selectedPartyForNote(selectedNote.note, selectedNote.type, customers, suppliers)}
          referenceInvoice={getReferenceInvoice(selectedNote.note, selectedNote.type, salesInvoices, purchaseInvoices)}
          onClose={() => setSelectedNote(null)}
        />
      )}
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 10px',
  marginTop: 5,
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  background: '#fff',
  color: '#0f172a',
  fontSize: 14,
};

const fieldLabelStyle: React.CSSProperties = {
  display: 'block',
  color: '#334155',
  fontSize: 13,
  fontWeight: 600,
};

const lineCellStyle: React.CSSProperties = {
  padding: '9px 10px',
  borderBottom: '1px solid #f1f5f9',
  verticalAlign: 'middle',
};

function actionButtonStyle(background: string, outlined = false): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '9px 13px',
    border: outlined ? '1px solid #cbd5e1' : '1px solid transparent',
    borderRadius: 6,
    background,
    color: outlined ? '#334155' : '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  };
}

function smallActionButtonStyle(background: string, border: string, color: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: '5px 8px',
    border: `1px solid ${border}`,
    borderRadius: 4,
    background,
    color,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    whiteSpace: 'nowrap',
  };
}

const modalBackdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 150,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflowY: 'auto',
  padding: 20,
  background: 'rgba(15, 23, 42, 0.6)',
};

const formModalStyle: React.CSSProperties = {
  width: 820,
  maxWidth: '100%',
  maxHeight: '94vh',
  overflowY: 'auto',
  borderRadius: 10,
  background: '#fff',
  boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)',
};

const closeButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 34,
  height: 34,
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  background: '#fff',
  color: '#475569',
  cursor: 'pointer',
};