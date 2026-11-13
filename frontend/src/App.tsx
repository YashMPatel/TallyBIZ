import { useState, useEffect, useRef, useCallback, type FormEvent } from 'react';
import { InvoicePrintModal } from './components/InvoicePrintModal';
import { PurchaseBillPrintModal } from './components/PurchaseBillPrintModal';
import { PaymentPrintModal } from './components/PaymentPrintModal';
import { LedgerPrintModal } from './components/LedgerPrintModal';
import { FinancialReportPrintModal } from './components/FinancialReportPrintModal';
import { GSTPrintModal } from './components/GSTPrintModal';
import { LineItemsEditor } from './components/LineItemsEditor';
import { SellingTab } from './components/tabs/SellingTab';
import { BuyingTab } from './components/tabs/BuyingTab';
import { StockTab } from './components/tabs/StockTab';
import { PaymentsTab } from './components/tabs/PaymentsTab';
import { CustomersTab } from './components/tabs/CustomersTab';
import { SuppliersTab } from './components/tabs/SuppliersTab';
import { StockLedgerTab } from './components/tabs/StockLedgerTab';
import { ProductionTab } from './components/tabs/ProductionTab';
import { AccountsTab } from './components/tabs/AccountsTab';
import { GSTTab } from './components/tabs/GSTTab';
import { ReportsTab } from './components/tabs/ReportsTab';
import { JournalEntryModal } from './components/JournalEntryModal';
import { PaymentReconciliationModal } from './components/PaymentReconciliationModal';
import type { Customer, Supplier, Item, GLEntryRow, SalesInvoice, PurchaseInvoice, PaymentEntry, StockLedgerRow, FinancialStatements, JournalEntryPayload } from './types/erp';
import { X, RefreshCw } from 'lucide-react';
import { API_BASE, GST_SLABS, getErrorMessage, newLine } from './utils/erpHelpers';
import { fieldStyle, getSalesPaymentStatusMap, getPurchasePaymentStatusMap, type DashboardSummary, type LineForm } from './utils/erpHelpers';
import ReturnsTab from './components/tabs/ReturnsTab';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './components/Login';
import { ApprovalsTab } from './components/tabs/ApprovalsTab';
import { CompanySwitcher } from './company_users/CompanySwitcher';
import { UserProfileModal } from './company_users/UserProfileModal';
import { UserManagementTab } from './company_users/UserManagementTab';
import { useTallyNavigation } from './hooks/useTallyNavigation';
import { QuitConfirmModal } from './components/QuitConfirmModal';
import { CompanyGateway } from './components/CompanyGateway';
import { AppSidebar } from './components/AppSidebar';

function MainERPApp() {
  const { isAuthenticated, user, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<'selling' | 'buying' | 'customers' | 'suppliers' | 'payments' | 'stock' | 'stock-ledger' | 'production' | 'accounts' | 'ReturnsTab' | 'reports' | 'gst' | 'approvals'| 'users_management'>('selling');
  const [searchQuery, setSearchQuery] = useState('');

  const [activeCompany, setActiveCompany] = useState<any>(() => {
    const saved = localStorage.getItem('active_company');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return null;
  });

  // --- Company Gateway States ---
  const [companies, setCompanies] = useState<any[]>([]);

  // Sync logged-in user to localStorage for RBAC API headers
  useEffect(() => {
    if (user) {
      localStorage.setItem('rbac_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('rbac_user');
    }
  }, [user]);

  const handleCleanLogout = useCallback(() => {
    setActiveCompany(null);
    setCompanies([]);
    setShowUserDropdown(false);
    localStorage.removeItem('active_company');
    localStorage.removeItem('active_company_id');
    localStorage.removeItem('active_company_symbol');
    localStorage.removeItem('rbac_user');
    setActiveTab('selling');
    logout();
  }, [logout]);

  // 1. Fetch accessible companies on login (filtered by logged-in user)
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const fetchCompanies = async () => {
      try {
        const params = new URLSearchParams();
        if (user?.id) params.append('user_id', String(user.id));
        if (user?.username) params.append('username', user.username);

        const res = await fetch(`${API_BASE}/accounts/companies/?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          const compList = Array.isArray(data) ? data : (data.results || []);
          setCompanies(compList);

          // Single company user hoy to direct te j company lock kari do
          if (compList.length === 1) {
            handleCompanyChange(compList[0]);
          } else if (compList.length > 1) {
            // Refresh activeCompany with latest address/gstin/bank_details from API
            setActiveCompany((prev: any) => {
              if (!prev) return null;
              const matched = compList.find((c: any) => c.id === prev.id);
              if (matched) {
                localStorage.setItem('active_company', JSON.stringify(matched));
                return matched;
              }
              localStorage.removeItem('active_company');
              return null;
            });
          }
        }
      } catch (err) {
        console.error('Failed to load companies:', err);
      }
    };

    fetchCompanies();
  }, [isAuthenticated, user]);

  const currencySymbol = activeCompany?.symbol || activeCompany?.currency_symbol || (localStorage.getItem('active_company_symbol') || '₹');

  // Data states
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [purchases, setPurchases] = useState<PurchaseInvoice[]>([]);
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [glEntries, setGlEntries] = useState<GLEntryRow[]>([]);
  const [stockLedger, setStockLedger] = useState<StockLedgerRow[]>([]);
  const [finance, setFinance] = useState<FinancialStatements | null>(null);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary>({
    total_sales: 0,
    total_purchases: 0,
    bank_balance: 0,
    currency_symbol: currencySymbol
  });
  const [partyOutstanding, setPartyOutstanding] = useState<{
    customers: Record<string, number>;
    suppliers: Record<string, number>;
    total_receivable: number;
    total_payable: number;
  }>({
    customers: {},
    suppliers: {},
    total_receivable: 0,
    total_payable: 0,
  });
  const [showFinancePrintModal, setShowFinancePrintModal] = useState<boolean>(false);
  const [gstData, setGstData] = useState<any[]>([]);
  const [showGstModal, setShowGstModal] = useState<boolean>(false);
  const [showJournalModal, setShowJournalModal] = useState<boolean>(false);
  const [showReconciliationModal, setShowReconciliationModal] = useState<boolean>(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  // Request status
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  // Filters & Date Range
  const [glAccountFilter, setGlAccountFilter] = useState<string>('all');
  const [glPartyFilter, setGlPartyFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [stockItemFilter, setStockItemFilter] = useState<string>('all');

  // Print Modals
  const [selectedInvoiceForPrint, setSelectedInvoiceForPrint] = useState<SalesInvoice | null>(null);
  const [selectedPurchaseForPrint, setSelectedPurchaseForPrint] = useState<PurchaseInvoice | null>(null);
  const [selectedPaymentForPrint, setSelectedPaymentForPrint] = useState<PaymentEntry | null>(null);
  const [showLedgerPrintModal, setShowLedgerPrintModal] = useState<boolean>(false);

  const [editingId, setEditingId] = useState<number | null>(null);

  // Form Modals
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Forms
  const [customerForm, setCustomerForm] = useState<Customer>({
    customer_name: '',
    customer_type: 'Company',
    gst_category: 'Unregistered',
    gstin: '',
    email: '',
    mobile_no: '',
    city: '',
    postal_code: '',
    address: ''
  });

  const [supplierForm, setSupplierForm] = useState<Supplier>({
    supplier_name: '',
    supplier_type: 'Company',
    gst_category: 'Registered Regular',
    gstin: '',
    email: '',
    mobile_no: '',
    city: '',
    postal_code: '',
    address: ''
  });

  const [itemForm, setItemForm] = useState({
    item_code: '',
    item_name: '',
    category: 'General',
    unit: 'Nos',
    standard_rate: '0',
    selling_rate: '0',
    current_stock: '0'
  });

  const [invoiceForm, setInvoiceForm] = useState(() => ({
    invoice_number: 'INV-0001', 
    customer_id: '', 
    posting_date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    tax_rate: '18', 
    status: 'Draft', 
    lines: [newLine()]
  }));

  const [paymentForm, setPaymentForm] = useState({
    voucher_no: 'PAY-0001',
    payment_type: 'Receive' as 'Receive' | 'Pay',
    posting_date: new Date().toISOString().split('T')[0],
    party_type: 'Customer',
    party_name: '',
    mode_of_payment: 'Bank' as 'Bank' | 'Cash' | 'Cheque',
    paid_amount: '0',
    reference_no: '',
    remarks: ''
  });

  const [purchaseForm, setPurchaseForm] = useState(() => ({
    bill_number: 'PUR-0001', 
    supplier_id: '', 
    posting_date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    tax_rate: '18', 
    status: 'Submitted', 
    lines: [newLine()]
  }));

  // --- Tally Style Navigation Setup ---
  const isAnyModalOpen = Boolean(
    showCustomerModal || showSupplierModal || showItemModal ||
    showInvoiceModal || showPurchaseModal || showPaymentModal ||
    showFinancePrintModal || showGstModal || showJournalModal ||
    showReconciliationModal || isProfileOpen || selectedInvoiceForPrint ||
    selectedPurchaseForPrint || selectedPaymentForPrint || showLedgerPrintModal
  );

  const closeAllModals = () => {
    setShowCustomerModal(false);
    setShowSupplierModal(false);
    setShowItemModal(false);
    setShowInvoiceModal(false);
    setShowPurchaseModal(false);
    setShowPaymentModal(false);
    setShowFinancePrintModal(false);
    setShowGstModal(false);
    setShowJournalModal(false);
    setShowReconciliationModal(false);
    setIsProfileOpen(false);
    setSelectedInvoiceForPrint(null);
    setSelectedPurchaseForPrint(null);
    setSelectedPaymentForPrint(null);
    setShowLedgerPrintModal(false);
    setEditingId(null);
  };

  const { showQuitModal, setShowQuitModal, handleStepBack } = useTallyNavigation({
    isModalOpen: isAnyModalOpen,
    closeActiveModal: closeAllModals,
    activeView: activeTab,
    setActiveView: (view: any) => setActiveTab(view),
    activeCompany,
    setActiveCompany,
    onLogout: handleCleanLogout,
    defaultView: 'selling',
  });

  const loadData = useCallback(async (targetCompId?: string | number) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setLoadError(null);
    try {
      const compId = targetCompId || activeCompany?.id || localStorage.getItem('active_company_id') || '';
      const compParam = compId ? `company_id=${compId}` : '';

      const glParams = new URLSearchParams();
      if (glAccountFilter !== 'all') glParams.append('account', glAccountFilter);
      if (glPartyFilter !== 'all') glParams.append('party', glPartyFilter);
      if (fromDate) glParams.append('from_date', fromDate);
      if (toDate) glParams.append('to_date', toDate);
      if (compId) glParams.append('company_id', compId.toString());

      const stockParams = new URLSearchParams();
      if (stockItemFilter !== 'all') stockParams.append('item_id', stockItemFilter);
      if (compId) stockParams.append('company_id', compId.toString());

      const [resCust, resSupp, resItems, resInvoices, resPurch, resPay, resGL, resStock, resFin, resGST, resDash, resParty] = await Promise.all([
        fetch(`${API_BASE}/selling/customers/?${compParam}`),
        fetch(`${API_BASE}/buying/suppliers/?${compParam}`),
        fetch(`${API_BASE}/stock/items/?${compParam}`),
        fetch(`${API_BASE}/selling/invoices/?${compParam}`),
        fetch(`${API_BASE}/buying/invoices/?${compParam}`),
        fetch(`${API_BASE}/accounts/payments/?${compParam}`),
        fetch(`${API_BASE}/accounts/general-ledger/?${glParams.toString()}`),
        fetch(`${API_BASE}/stock/stock-ledger/?${stockParams.toString()}`),
        fetch(`${API_BASE}/accounts/financial-statements/?${compParam}`),
        fetch(`${API_BASE}/accounts/gst-returns/?${compParam}`),
        fetch(`${API_BASE}/accounts/dashboard-summary/?${compParam}`),
        fetch(`${API_BASE}/accounts/party-outstanding/?${compParam}`)
      ]);

      if (seq !== requestSeq.current) return;

      const failed: string[] = [];
      const read = async <T,>(label: string, res: Response): Promise<T | null> => {
        if (!res.ok) { failed.push(label); return null; }
        try { return (await res.json()) as T; }
        catch { failed.push(label); return null; }
      };

      const [cust, supp, itemList, inv, pur, pay, gl, stock, fin, gst, dash, party] = await Promise.all([
        read<Customer[]>('Customers', resCust),
        read<Supplier[]>('Suppliers', resSupp),
        read<Item[]>('Items', resItems),
        read<SalesInvoice[]>('Sales invoices', resInvoices),
        read<PurchaseInvoice[]>('Purchase bills', resPurch),
        read<PaymentEntry[]>('Payments', resPay),
        read<GLEntryRow[]>('General ledger', resGL),
        read<StockLedgerRow[]>('Stock ledger', resStock),
        read<FinancialStatements>('Financial statements', resFin),
        read<any[]>('GST returns', resGST),
        read<DashboardSummary>('Dashboard summary', resDash),
        read<any>('Party Outstanding', resParty)
      ]);

      if (cust) setCustomers([...cust].sort((a: any, b: any) => b.id - a.id));
      if (supp) setSuppliers([...supp].sort((a: any, b: any) => b.id - a.id));
      if (itemList) setItems([...itemList].sort((a: any, b: any) => b.id - a.id));
      if (inv) setInvoices([...inv].sort((a: any, b: any) => b.id - a.id));
      if (pur) setPurchases([...pur].sort((a: any, b: any) => b.id - a.id));
      if (pay) setPayments([...pay].sort((a: any, b: any) => b.id - a.id));
      if (gl) setGlEntries([...gl].sort((a: any, b: any) => b.id - a.id));
      if (stock) setStockLedger([...stock].sort((a: any, b: any) => b.id - a.id));
      if (fin) setFinance(fin);
      if (gst) setGstData(gst);
      if (dash) setDashboardSummary(dash);
      if (party) setPartyOutstanding(party);

      if (failed.length > 0) setLoadError(`Could not load: ${failed.join(', ')}.`);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      console.error("API error:", err);
      setLoadError('Could not reach the server.');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [activeCompany, glAccountFilter, glPartyFilter, fromDate, toDate, stockItemFilter]);

  const handleCompanyChange = (comp: any) => {
    setActiveCompany(comp);
    const sym =
      comp.currency_symbol ||
      comp.symbol ||
      (String(comp.name).includes('CAD') || String(comp.name).includes('USD') || String(comp.name).includes('$') ? '$' : '₹');
    localStorage.setItem('active_company', JSON.stringify(comp));
    localStorage.setItem('active_company_id', comp.id.toString());
    localStorage.setItem('active_company_symbol', sym);
    void loadData(comp.id);
  };

  useEffect(() => {
    const cid = activeCompany?.id || localStorage.getItem('active_company_id');
    if (isAuthenticated && cid) {
      void loadData(cid);
    }
  }, [isAuthenticated, activeCompany?.id, loadData]);

  useEffect(() => {
    if (showInvoiceModal || showPurchaseModal) {
      const compId = activeCompany?.id || localStorage.getItem('active_company_id') || '';
      const compParam = compId ? `company_id=${compId}` : '';
      fetch(`${API_BASE}/stock/items/?${compParam}`)
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (Array.isArray(data)) setItems([...data].sort((a: any, b: any) => b.id - a.id));
          else if (data && Array.isArray(data.results)) setItems([...data.results].sort((a: any, b: any) => b.id - a.id));
        })
        .catch(() => {});
    }
  }, [showInvoiceModal, showPurchaseModal, activeCompany]);

  const handleDeleteInvoice = async (id: number, invNo: string) => {
    if (!window.confirm(`Delete Sales Invoice #${invNo}?`)) return;
    try {
      const res = await fetch(`${API_BASE}/selling/invoices/${id}/`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete invoice');
      void loadData();
    } catch (err: unknown) { alert(getErrorMessage(err)); }
  };

  const handleDeletePurchase = async (id: number, billNo: string) => {
    if (!window.confirm(`Delete Purchase Bill #${billNo}?`)) return;
    try {
      const res = await fetch(`${API_BASE}/buying/invoices/${id}/`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete purchase bill');
      void loadData();
    } catch (err: unknown) { alert(getErrorMessage(err)); }
  };

  const handleDeletePayment = async (id: number, voucherNo: string) => {
    if (!window.confirm(`Delete Payment Entry #${voucherNo}?`)) return;
    try {
      const res = await fetch(`${API_BASE}/accounts/payments/${id}/`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete payment entry');
      void loadData();
    } catch (err: unknown) { alert(getErrorMessage(err)); }
  };

  const handleSaveCustomer = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const activeCompanyId = activeCompany?.id || localStorage.getItem('active_company_id');
      const compParam = activeCompanyId ? `?company_id=${activeCompanyId}` : '';
      const url = editingId
        ? `${API_BASE}/selling/customers/${editingId}/${compParam}`
        : `${API_BASE}/selling/customers/${compParam}`;
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...customerForm,
          company: activeCompanyId ? parseInt(String(activeCompanyId), 10) : undefined
        })
      });

      if (!res.ok) {
        let msg = 'Failed to save customer';
        try {
          const errData = await res.json();
          if (errData && Object.keys(errData).length > 0) {
            msg = typeof errData === 'string' ? errData : JSON.stringify(errData);
          }
        } catch {
          msg = `Server error (${res.status}: ${res.statusText})`;
        }
        throw new Error(msg);
      }

      setShowCustomerModal(false);
      setEditingId(null);
      void loadData();
    } catch (err: unknown) {
      alert(getErrorMessage(err));
    }
  };

  const pendingApprovalsCount = 
    invoices.filter(i => i.status !== 'Approved' && i.status !== 'Rejected').length + 
    purchases.filter(p => p.status !== 'Approved' && p.status !== 'Rejected').length;

  const handleSaveSupplier = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const activeCompanyId = activeCompany?.id || localStorage.getItem('active_company_id');
      const compParam = activeCompanyId ? `?company_id=${activeCompanyId}` : '';
      const url = editingId
        ? `${API_BASE}/buying/suppliers/${editingId}/${compParam}`
        : `${API_BASE}/buying/suppliers/${compParam}`;
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...supplierForm,
          company: activeCompanyId ? parseInt(String(activeCompanyId), 10) : undefined
        })
      });

      if (!res.ok) {
        let msg = 'Failed to save supplier';
        try {
          const errData = await res.json();
          if (errData && Object.keys(errData).length > 0) {
            msg = typeof errData === 'string' ? errData : JSON.stringify(errData);
          }
        } catch {
          msg = `Server error (${res.status}: ${res.statusText})`;
        }
        throw new Error(msg);
      }

      setShowSupplierModal(false);
      setEditingId(null);
      void loadData();
    } catch (err: unknown) {
      alert(getErrorMessage(err));
    }
  };

  const handleSaveItem = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const activeCompanyId = activeCompany?.id || localStorage.getItem('active_company_id');
      const compParam = activeCompanyId ? `?company_id=${activeCompanyId}` : '';
      const url = editingId
        ? `${API_BASE}/stock/items/${editingId}/${compParam}`
        : `${API_BASE}/stock/items/${compParam}`;
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...itemForm,
          company: activeCompanyId ? parseInt(String(activeCompanyId), 10) : undefined,
          standard_rate: parseFloat(itemForm.standard_rate) || 0,
      selling_rate: parseFloat((itemForm as any).selling_rate) || 0,
          current_stock: parseFloat(itemForm.current_stock) || 0
        })
      });

      if (!res.ok) {
        let msg = 'Failed to save item';
        try {
          const errData = await res.json();
          if (errData && Object.keys(errData).length > 0) {
            msg = typeof errData === 'string' ? errData : JSON.stringify(errData);
          }
        } catch {
          msg = `Server error (${res.status}: ${res.statusText})`;
        }
        throw new Error(msg);
      }

      setShowItemModal(false);
      setEditingId(null);
      void loadData();
    } catch (err: unknown) {
      alert(getErrorMessage(err));
    }
  };

  const buildLines = (lines: LineForm[]) =>
    lines.map(l => {
      const quantity = parseFloat(l.quantity) || 0;
      const isFoc = Boolean(l.is_foc);
      const rate = isFoc ? 0 : (parseFloat(l.rate) || 0);
      const discPct = isFoc ? 0 : (parseFloat(l.discount_percentage || '0') || 0);
      const base = quantity * rate;
      const discAmt = (base * discPct) / 100;
      const netAmount = Math.max(0, base - discAmt);

      return {
        item: parseInt(l.item_id, 10),
        quantity,
        rate,
        discount_percentage: discPct,
        discount_amount: parseFloat(discAmt.toFixed(2)),
        is_foc: isFoc,
        amount: parseFloat(netAmount.toFixed(2))
      };
    });

  const validateLines = (lines: LineForm[]): boolean => {
    const invalid = lines.some(l => !l.item_id || !(parseFloat(l.quantity) > 0) || !(parseFloat(l.rate) >= 0));
    if (invalid) { alert('Each line needs an item, a quantity above zero and a rate.'); return false; }
    return true;
  };

  const sumLines = (lines: LineForm[]) =>
    lines.reduce((sum, l) => {
      if (l.is_foc) return sum;
      const qty = parseFloat(l.quantity) || 0;
      const rate = parseFloat(l.rate) || 0;
      const base = qty * rate;
      const discPct = parseFloat(l.discount_percentage || '0') || 0;
      const discAmt = (base * discPct) / 100;
      return sum + Math.max(0, base - discAmt);
    }, 0);

  const handleSaveJournalEntry = async (payload: JournalEntryPayload) => {
    const res = await fetch(`${API_BASE}/accounts/journal-entries/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to save Journal Entry');
    }
    void loadData();
  };

  const handleSaveInvoice = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!invoiceForm.customer_id || invoiceForm.lines.length === 0) {
      alert('Please select a customer and add at least one item.');
      return;
    }

    const selectedCustomer = customers.find((c: any) => c.id.toString() === invoiceForm.customer_id.toString());
    const customerName = selectedCustomer ? selectedCustomer.customer_name : '';

    const lineItems = buildLines(invoiceForm.lines);
    const net = sumLines(invoiceForm.lines);
    const taxRate = parseFloat(invoiceForm.tax_rate) || 0;
    const tax = (net * taxRate) / 100;
    const adj = parseFloat((invoiceForm as any).adjustment) || 0;
    const grand = net + tax + adj;

    const payload = {
      invoice_number: invoiceForm.invoice_number,
      customer: parseInt(invoiceForm.customer_id, 10),
      customer_name: customerName,
      company: activeCompany?.id || localStorage.getItem('active_company_id'),
      posting_date: invoiceForm.posting_date,
      due_date: invoiceForm.due_date,
      tax_rate: taxRate.toFixed(2),
      net_total: net.toFixed(2),
      tax_amount: tax.toFixed(2),
      adjustment: adj.toFixed(2),
      grand_total: grand.toFixed(2),
      status: 'Draft',
      items: lineItems
    };

    try {
      const url = editingId 
        ? `${API_BASE}/selling/invoices/${editingId}/` 
        : `${API_BASE}/selling/invoices/`;
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(JSON.stringify(errData));
      }

      setShowInvoiceModal(false);
      setEditingId(null);
      void loadData();
    } catch (err: unknown) {
      alert(getErrorMessage(err));
    }
  };

  const handleSavePurchase = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const selSupp = suppliers.find(s => s.id === parseInt(purchaseForm.supplier_id, 10));
    if (!selSupp) { alert('Select a supplier'); return; }
    if (!validateLines(purchaseForm.lines)) return;

    const lineItems = buildLines(purchaseForm.lines);
    const net = sumLines(purchaseForm.lines);
    const tax = (net * (parseFloat(purchaseForm.tax_rate) || 0)) / 100;
    try {
      const url = editingId ? `${API_BASE}/buying/invoices/${editingId}/` : `${API_BASE}/buying/invoices/`;
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bill_number: purchaseForm.bill_number, 
          supplier: selSupp.id, 
          supplier_name: selSupp.supplier_name,
          company: activeCompany?.id || localStorage.getItem('active_company_id'),
          posting_date: purchaseForm.posting_date, 
          due_date: purchaseForm.due_date,
          net_total: net.toFixed(2), 
          tax_amount: tax.toFixed(2), 
          grand_total: (net + tax).toFixed(2),
          status: purchaseForm.status, 
          items: lineItems
        })
      });
      if (!res.ok) throw new Error('Failed to save purchase bill');
      setShowPurchaseModal(false);
      setEditingId(null);
      void loadData();
    } catch (err: unknown) { alert(getErrorMessage(err)); }
  };

  const handleSavePayment = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const amount = parseFloat(paymentForm.paid_amount);
    if (!paymentForm.party_name || !amount || amount <= 0) { alert('Enter valid party and amount'); return; }
    const partyType = paymentForm.payment_type === 'Receive' ? 'Customer' : 'Supplier';
    try {
      const url = editingId ? `${API_BASE}/accounts/payments/${editingId}/` : `${API_BASE}/accounts/payments/`;
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...paymentForm, 
          company: activeCompany?.id || localStorage.getItem('active_company_id'),
          party_type: partyType, 
          paid_amount: amount.toFixed(2) 
        })
      });
      if (!res.ok) throw new Error('Payment failed');
      setShowPaymentModal(false);
      setEditingId(null);
      void loadData();
    } catch (err: unknown) { alert(getErrorMessage(err)); }
  };

  const allPartyNames = Array.from(new Set([
    ...customers.map(c => c.customer_name),
    ...suppliers.map(s => s.supplier_name)
  ]));

  const totalDebit = glEntries.reduce((sum, r) => sum + Number(r.debit), 0);
  const totalCredit = glEntries.reduce((sum, r) => sum + Number(r.credit), 0);
  const closingBalance = glEntries.length > 0 ? glEntries[glEntries.length - 1].balance : 0;

  const invoiceNet = sumLines(invoiceForm.lines);
  const invoiceTax = (invoiceNet * (parseFloat(invoiceForm.tax_rate) || 0)) / 100;
  const invoiceAdj = parseFloat((invoiceForm as any).adjustment) || 0;
  const purchaseNet = sumLines(purchaseForm.lines);
  const purchaseTax = (purchaseNet * (parseFloat(purchaseForm.tax_rate) || 0)) / 100;
  const salesStatusMap = getSalesPaymentStatusMap(invoices, payments);
  const purchaseStatusMap = getPurchasePaymentStatusMap(purchases, payments);

  const filteredInvoices = invoices.filter(inv =>
    String(inv?.invoice_number || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    String(inv?.customer_name || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredPurchases = purchases.filter(pur =>
    String(pur?.bill_number || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    String(pur?.supplier_name || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredItems = items.filter(it =>
    String(it?.item_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    String(it?.item_code || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    it.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // --- CONDITIONAL RENDERS AFTER ALL HOOKS (Prevents Blank Page on Logout/Login) ---
  if (!isAuthenticated) {
    return <Login />;
  }

  if (!activeCompany) {
    return (
      <>
        <CompanyGateway
          companies={companies}
          onSelectCompany={handleCompanyChange}
          onQuit={() => setShowQuitModal(true)}
          userName={user?.first_name || user?.username}
          onRefreshCompanies={async () => {
            try {
              const token = localStorage.getItem('access_token');
              const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
              const r = await fetch('/api/accounts/manage/company/list/', { headers });
              if (r.ok) {
                const list = await r.json();
                setCompanies(Array.isArray(list) ? list : []);
              }
            } catch {}
          }}
        />
        <QuitConfirmModal
          isOpen={showQuitModal}
          onConfirm={() => {
            setShowQuitModal(false);
            handleCleanLogout();
          }}
          onCancel={() => setShowQuitModal(false)}
        />
      </>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif', background: '#f8fafc', color: '#0f172a' }}>
      <AppSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        pendingApprovalsCount={pendingApprovalsCount}
      />

      <main style={{ flex: 1, minWidth: 0, padding: 0, overflowY: 'auto' }}>
        <header
          className="no-print"
          style={{
            position: 'sticky', top: 0, left: 0, right: 0, zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 24px', background: '#ffffff', borderBottom: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              onClick={handleStepBack}
              title="Back (Esc)"
              style={{display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px',
                height: '30px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc',
                color: '#334155', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px'
              }}
            >
              ←
            </button>
            <span style={{ fontSize: '15px', fontWeight: 'bold', color: '#0f172a' }}>
              {activeTab.toUpperCase().replace('-', ' ')}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', position: 'relative' }}>
            {companies.length > 1 ? (
              <CompanySwitcher onCompanyChange={handleCompanyChange} />
            ) : (
              <div style={{
                fontSize: '12px',
                fontWeight: '700',
                color: '#0f172a',
                backgroundColor: '#f1f5f9',
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1'
              }}>
                {activeCompany?.name}
              </div>
            )}

            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowUserDropdown(prev => !prev)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '50%', background: '#10b981', color: '#ffffff', border: 'none', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer', textTransform: 'uppercase'
                }}
              >
                {(user?.first_name?.[0] || user?.username?.[0] || 'U')}
              </button>

              {showUserDropdown && (
                <div style={{ position: 'absolute', right: 0, top: '46px', width: '200px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 1000, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                    <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#0f172a' }}>{user?.first_name || user?.username}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{user?.role}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', padding: '4px 0' }}>
                    <button
                      onClick={() => { setShowUserDropdown(false); setIsProfileOpen(true); }}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', background: 'transparent', border: 'none', borderBottom: '1px solid #f1f5f9', textAlign: 'left', fontSize: '12px', color: '#0f172a', fontWeight: '600', cursor: 'pointer', width: '100%' }}
                    >
                      My Profile &amp; Permissions
                    </button>
                    <button onClick={handleCleanLogout} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', background: 'transparent', border: 'none', textAlign: 'left', fontSize: '12px', color: '#ef4444', fontWeight: '600', cursor: 'pointer', width: '100%' }}>
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <div style={{ padding: '28px 36px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {loadError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '13px' }}>
              <X size={16} />
              <span style={{ flex: 1 }}>{loadError}</span>
              <button onClick={() => void loadData()} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '6px', border: '1px solid #fca5a5', background: '#fff', color: '#b91c1c', fontWeight: '600' }}>
                <RefreshCw size={13} /> Retry
              </button>
            </div>
          )}

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '13px' }}>
              <RefreshCw size={14} className="spin" /> Loading data...
            </div>
          )}

          {activeTab === 'selling' && (
            <SellingTab
              user={user}
              invoices={invoices}
              filteredInvoices={filteredInvoices}
              customers={customers}
              salesStatusMap={salesStatusMap}
              dashboardSummary={{ ...dashboardSummary, currency_symbol: currencySymbol }}
              gstData={gstData}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              setEditingId={setEditingId}
              setInvoiceForm={setInvoiceForm}
              setShowInvoiceModal={setShowInvoiceModal}
              setSelectedInvoiceForPrint={setSelectedInvoiceForPrint}
              handleDeleteInvoice={handleDeleteInvoice}
            />
          )}

          {activeTab === 'buying' && (
            <BuyingTab
              user={user}
              purchases={purchases}
              filteredPurchases={filteredPurchases}
              purchaseStatusMap={purchaseStatusMap}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              setEditingId={setEditingId}
              setPurchaseForm={setPurchaseForm}
              setShowPurchaseModal={setShowPurchaseModal}
              setSelectedPurchaseForPrint={setSelectedPurchaseForPrint}
              handleDeletePurchase={handleDeletePurchase}
            />
          )}

          {activeTab === 'customers' && (
            <CustomersTab
              customers={customers}
              partyOutstanding={partyOutstanding}
              setEditingId={setEditingId}
              setCustomerForm={setCustomerForm}
              setShowCustomerModal={setShowCustomerModal}
            />
          )}

          {activeTab === 'suppliers' && (
            <SuppliersTab
              suppliers={suppliers}
              partyOutstanding={partyOutstanding}
              setEditingId={setEditingId}
              setSupplierForm={setSupplierForm}
              setShowSupplierModal={setShowSupplierModal}
            />
          )}

          {activeTab === 'payments' && (
            <PaymentsTab
              payments={payments}
              setPaymentForm={setPaymentForm}
              setShowPaymentModal={setShowPaymentModal}
              setSelectedPaymentForPrint={setSelectedPaymentForPrint}
              handleDeletePayment={handleDeletePayment}
              onOpenReconciliation={() => setShowReconciliationModal(true)}
              setEditingId={setEditingId}
            />
          )}

          {activeTab === 'stock' && (
            <StockTab
              items={items}
              filteredItems={filteredItems}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              setEditingId={setEditingId}
              setItemForm={setItemForm}
              setShowItemModal={setShowItemModal}
            />
          )}

          {activeTab === 'stock-ledger' && (
            <StockLedgerTab
              stockLedger={stockLedger}
              items={items}
              stockItemFilter={stockItemFilter}
              setStockItemFilter={setStockItemFilter}
            />
          )}

          {activeTab === 'production' && (
            <ProductionTab
              items={items}
              activeCompany={activeCompany}
              user={user}
            />
          )}

          {activeTab === 'accounts' && (
            <AccountsTab
              glEntries={glEntries}
              allPartyNames={allPartyNames}
              glAccountFilter={glAccountFilter}
              setGlAccountFilter={setGlAccountFilter}
              glPartyFilter={glPartyFilter}
              setGlPartyFilter={setGlPartyFilter}
              fromDate={fromDate}
              setFromDate={setFromDate}
              toDate={toDate}
              setToDate={setToDate}
              totalDebit={totalDebit}
              totalCredit={totalCredit}
              closingBalance={closingBalance}
              setShowLedgerPrintModal={setShowLedgerPrintModal}
              onNewJournalEntry={() => setShowJournalModal(true)}
            />
          )}

          {activeTab === 'gst' && <GSTTab gstData={gstData} setShowGSTPrintModal={setShowGstModal} />}

          {activeTab === 'reports' && (
            <ReportsTab
              finance={finance}
              loading={loading}
              loadError={loadError}
              setShowFinancePrintModal={setShowFinancePrintModal}
              onDrillDown={(accountName: string) => {
                setGlAccountFilter(accountName);
                setActiveTab('accounts');
              }}
            />
          )}

          {activeTab === 'ReturnsTab' && <ReturnsTab />}

          {activeTab === 'approvals' && (
            <ApprovalsTab invoices={invoices} purchases={purchases} onRefresh={() => void loadData()} />
          )}

          {activeTab === 'users_management' && <UserManagementTab />}
        </div>
      </main>

      {/* Customer Modal with Compliance Lock for Sales Users */}
      {showCustomerModal && (() => {
        const isSalesUser = String(user?.role || '').toUpperCase().replace(/\s+/g, '_') === 'SALES_USER';
        const isCustomerCoreLocked = Boolean(editingId && isSalesUser);

        return (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}>
            <div style={{
              background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '520px', padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', maxHeight: '90vh', overflowY: 'auto'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: '#0f172a' }}>
                  {editingId ? (isSalesUser ? 'Update Customer Contact & Address' : 'Edit Customer') : 'New Customer'}
                </h2>
                <button
                  onClick={() => setShowCustomerModal(false)}
                  style={{ background: '#fee2e2', color: '#dc2626', border: 'none', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  ✕
                </button>
              </div>

              {isCustomerCoreLocked && (
                <div style={{
                  background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e',
                  padding: '8px 12px', borderRadius: '6px', fontSize: '11px', marginBottom: '14px', lineHeight: '1.4'
                }}>
                  <strong>GST Compliance Lock:</strong> Sales Users can only update phone, email, and dispatch address. Legal Name and GSTIN can only be modified by a Manager or Admin.
                </div>
              )}

              <form onSubmit={handleSaveCustomer} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>
                    Customer Name * {isCustomerCoreLocked && <span style={{ color: '#b45309' }}>(Locked)</span>}
                  </label>
                  <input
                    type="text"
                    required
                    disabled={isCustomerCoreLocked}
                    value={customerForm.customer_name}
                    onChange={e => setCustomerForm({ ...customerForm, customer_name: e.target.value })}
                    placeholder="e.g. Acme Corp / John Doe"
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box',
                      background: isCustomerCoreLocked ? '#f1f5f9' : '#fff',
                      color: isCustomerCoreLocked ? '#64748b' : '#0f172a',
                      cursor: isCustomerCoreLocked ? 'not-allowed' : 'text'
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Customer Type</label>
                    <select
                      disabled={isCustomerCoreLocked}
                      value={customerForm.customer_type}
                      onChange={e => setCustomerForm({ ...customerForm, customer_type: e.target.value as any })}
                      style={{
                        width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box',
                        background: isCustomerCoreLocked ? '#f1f5f9' : '#fff',
                        color: isCustomerCoreLocked ? '#64748b' : '#0f172a',
                        cursor: isCustomerCoreLocked ? 'not-allowed' : 'pointer'
                      }}
                    >
                      <option value="Individual">Individual (B2C / Retail)</option>
                      <option value="Company">Company (B2B)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Tax / GST Category</label>
                    <select
                      disabled={isCustomerCoreLocked}
                      value={customerForm.gst_category}
                      onChange={e => {
                        const cat = e.target.value;
                        setCustomerForm({
                          ...customerForm,
                          gst_category: cat as any,
                          gstin: cat === 'Unregistered' ? '' : customerForm.gstin
                        });
                      }}
                      style={{
                        width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box',
                        background: isCustomerCoreLocked ? '#f1f5f9' : '#fff',
                        color: isCustomerCoreLocked ? '#64748b' : '#0f172a',
                        cursor: isCustomerCoreLocked ? 'not-allowed' : 'pointer'
                      }}
                    >
                      <option value="Unregistered">Unregistered</option>
                      <option value="Registered Regular">Registered Regular</option>
                      <option value="Registered Composition">Registered Composition</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>
                    Tax ID / GSTIN {isCustomerCoreLocked ? <span style={{ color: '#b45309' }}>(Locked)</span> : <span style={{ fontWeight: 'normal', color: '#94a3b8' }}>(Optional - Leave blank for B2C)</span>}
                  </label>
                  <input
                    type="text"
                    maxLength={15}
                    disabled={isCustomerCoreLocked}
                    value={customerForm.gstin || ''}
                    onChange={e => {
                      const val = e.target.value.toUpperCase();
                      setCustomerForm({
                        ...customerForm,
                        gstin: val,
                        gst_category: val.length > 0 ? 'Registered Regular' : customerForm.gst_category
                      });
                    }}
                    placeholder="e.g. 24AAAAA0000A1Z5"
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box',
                      background: isCustomerCoreLocked ? '#f1f5f9' : '#fff',
                      color: isCustomerCoreLocked ? '#64748b' : '#0f172a',
                      cursor: isCustomerCoreLocked ? 'not-allowed' : 'text'
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Mobile Number</label>
                    <input
                      type="text"
                      value={customerForm.mobile_no || ''}
                      onChange={e => setCustomerForm({ ...customerForm, mobile_no: e.target.value })}
                      placeholder="e.g. 9876543210"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Email Address</label>
                    <input
                      type="email"
                      value={customerForm.email || ''}
                      onChange={e => setCustomerForm({ ...customerForm, email: e.target.value })}
                      placeholder="client@example.com"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>City</label>
                    <input
                      type="text"
                      value={customerForm.city || ''}
                      onChange={e => setCustomerForm({ ...customerForm, city: e.target.value })}
                      placeholder="e.g. Ahmedabad / North Bay"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Postal Code / PIN</label>
                    <input
                      type="text"
                      value={customerForm.postal_code || ''}
                      onChange={e => setCustomerForm({ ...customerForm, postal_code: e.target.value })}
                      placeholder="e.g. 380001"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Address (Street / Building)</label>
                  <textarea
                    rows={2}
                    value={customerForm.address || ''}
                    onChange={e => setCustomerForm({ ...customerForm, address: e.target.value })}
                    placeholder="e.g. Suite 400, Financial District"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', resize: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setShowCustomerModal(false)}
                    style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
                  >
                    {editingId ? 'Update Customer' : 'Save Customer'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Supplier Modal */}
      {showSupplierModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '520px', padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', maxHeight: '90vh', overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: '#0f172a' }}>
                {editingId ? 'Edit Supplier' : 'New Supplier'}
              </h2>
              <button
                onClick={() => setShowSupplierModal(false)}
                style={{ background: '#fee2e2', color: '#dc2626', border: 'none', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Supplier / Vendor Name *</label>
                <input
                  type="text"
                  required
                  value={supplierForm.supplier_name}
                  onChange={e => setSupplierForm({ ...supplierForm, supplier_name: e.target.value })}
                  placeholder="e.g. Apex Industrial Supplies"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Supplier Type</label>
                  <select
                    value={supplierForm.supplier_type}
                    onChange={e => setSupplierForm({ ...supplierForm, supplier_type: e.target.value as any })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', background: '#fff', boxSizing: 'border-box' }}
                  >
                    <option value="Company">Company (B2B)</option>
                    <option value="Individual">Individual / Proprietor</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Tax / GST Category</label>
                  <select
                    value={supplierForm.gst_category}
                    onChange={e => {
                      const cat = e.target.value;
                      setSupplierForm({
                        ...supplierForm,
                        gst_category: cat as any,
                        gstin: cat === 'Unregistered' ? '' : supplierForm.gstin
                      });
                    }}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', background: '#fff', boxSizing: 'border-box' }}
                  >
                    <option value="Registered Regular">Registered Regular</option>
                    <option value="Registered Composition">Registered Composition</option>
                    <option value="Unregistered">Unregistered</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>
                  Tax ID / GSTIN <span style={{ fontWeight: 'normal', color: '#94a3b8' }}>(Optional - Leave blank if unregistered)</span>
                </label>
                <input
                  type="text"
                  maxLength={15}
                  value={supplierForm.gstin || ''}
                  onChange={e => {
                    const val = e.target.value.toUpperCase();
                    setSupplierForm({
                      ...supplierForm,
                      gstin: val,
                      gst_category: val.length > 0 ? 'Registered Regular' : supplierForm.gst_category
                    });
                  }}
                  placeholder="e.g. 24AAAAA0000A1Z5"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Mobile Number</label>
                  <input
                    type="text"
                    value={supplierForm.mobile_no || ''}
                    onChange={e => setSupplierForm({ ...supplierForm, mobile_no: e.target.value })}
                    placeholder="e.g. 9876543210"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Email Address</label>
                  <input
                    type="email"
                    value={supplierForm.email || ''}
                    onChange={e => setSupplierForm({ ...supplierForm, email: e.target.value })}
                    placeholder="vendor@example.com"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>City</label>
                  <input
                    type="text"
                    value={supplierForm.city || ''}
                    onChange={e => setSupplierForm({ ...supplierForm, city: e.target.value })}
                    placeholder="e.g. Ahmedabad / New York"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Postal Code / PIN</label>
                  <input
                    type="text"
                    value={supplierForm.postal_code || ''}
                    onChange={e => setSupplierForm({ ...supplierForm, postal_code: e.target.value })}
                    placeholder="e.g. 400001"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Address (Street / Building)</label>
                <textarea
                  rows={2}
                  value={supplierForm.address || ''}
                  onChange={e => setSupplierForm({ ...supplierForm, address: e.target.value })}
                  placeholder="e.g. 101, Industrial Estate, Ring Road"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', resize: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowSupplierModal(false)}
                  style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
                >
                  {editingId ? 'Update Supplier' : 'Save Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Entry Modal */}
      {showPaymentModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: '10px', padding: '24px', width: '520px', maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px' }}>{editingId ? 'Edit Payment Entry' : 'Payment Entry'}</h3>
              <button onClick={() => { setShowPaymentModal(false); setEditingId(null); }} style={{ background: '#fee2e2', border: 'none', color: '#ef4444', padding: '4px', borderRadius: '4px', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSavePayment} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>Payment Type</label>
                  <select
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px' }}
                    value={paymentForm.payment_type}
                    onChange={e => {
                      const type = e.target.value as 'Receive' | 'Pay';
                      setPaymentForm(prev => ({
                        ...prev,
                        payment_type: type,
                        party_type: type === 'Receive' ? 'Customer' : 'Supplier',
                        party_name: '',
                        reference_no: ''
                      }));
                    }}
                  >
                    <option value="Receive">Receive (From Customer)</option>
                    <option value="Pay">Pay (To Supplier)</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px', fontWeight: '600' }}>Mode</label>
                  <select
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px' }}
                    value={paymentForm.mode_of_payment}
                    onChange={e => setPaymentForm({ ...paymentForm, mode_of_payment: e.target.value as any })}
                  >
                    <option value="Bank">Bank Transfer / Wire</option>
                    <option value="Cash">Cash</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '600' }}>Party Name *</label>
                <select
                  required
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px' }}
                  value={paymentForm.party_name}
                  onChange={e => setPaymentForm({ ...paymentForm, party_name: e.target.value })}
                >
                  <option value="">-- Choose Party --</option>
                  {paymentForm.payment_type === 'Receive'
                    ? customers.map(c => <option key={c.id} value={c.customer_name}>{c.customer_name}</option>)
                    : suppliers.map(s => <option key={s.id} value={s.supplier_name}>{s.supplier_name}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '600' }}>Amount ({currencySymbol}) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }}
                  value={paymentForm.paid_amount}
                  onChange={e => setPaymentForm({ ...paymentForm, paid_amount: e.target.value })}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '600' }}>
                  Against Invoice / Bill <span style={{ fontWeight: 'normal', color: '#64748b' }}>(Leave blank for direct / advance payment)</span>
                </label>
                <select
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', background: '#fff', boxSizing: 'border-box' }}
                  value={paymentForm.reference_no?.startsWith('INV-') || paymentForm.reference_no?.startsWith('PUR-') ? paymentForm.reference_no : ''}
                  onChange={e => {
                    const selRef = e.target.value;
                    let dueAmount = '0';

                    if (paymentForm.payment_type === 'Receive') {
                      const inv = invoices.find(i => i.invoice_number === selRef);
                      if (inv) {
                        const statusInfo = salesStatusMap[inv.id || 0];
                        dueAmount = (statusInfo ? statusInfo.balance : parseFloat(String(inv.grand_total))).toFixed(2);
                      }
                    } else {
                      const bill = purchases.find(p => p.bill_number === selRef);
                      if (bill) {
                        const statusInfo = purchaseStatusMap[bill.id || 0];
                        dueAmount = (statusInfo ? statusInfo.balance : parseFloat(String(bill.grand_total))).toFixed(2);
                      }
                    }

                    setPaymentForm(prev => ({
                      ...prev,
                      reference_no: selRef,
                      paid_amount: dueAmount !== '0' ? dueAmount : prev.paid_amount,
                      remarks: selRef ? `Payment against ${selRef}` : prev.remarks
                    }));
                  }}
                >
                  <option value="">-- Direct / Advance Payment (No Reference) --</option>
                  {paymentForm.payment_type === 'Receive'
                    ? invoices
                        .filter(inv => inv.customer_name === paymentForm.party_name && inv.status === 'Approved')
                        .map(inv => {
                          const info = salesStatusMap[inv.id || 0];
                          if (info && info.status === 'Paid') return null;
                          const bal = info ? info.balance : parseFloat(String(inv.grand_total));
                          return (
                            <option key={inv.id} value={inv.invoice_number}>
                              {inv.invoice_number} (Due: {currencySymbol} {bal.toFixed(2)})
                            </option>
                          );
                        })
                    : purchases
                        .filter(pur => pur.supplier_name === paymentForm.party_name && pur.status === 'Approved')
                        .map(pur => {
                          const info = purchaseStatusMap[pur.id || 0];
                          if (info && info.status === 'Paid') return null;
                          const bal = info ? info.balance : parseFloat(String(pur.grand_total));
                          return (
                            <option key={pur.id} value={pur.bill_number}>
                              {pur.bill_number} (Due: {currencySymbol} {bal.toFixed(2)})
                            </option>
                          );
                        })}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '600' }}>Reference / UTR / Cheque No (Optional)</label>
                <input
                  placeholder="e.g. WIRE-89472 / CHQ-1002"
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }}
                  value={paymentForm.reference_no?.startsWith('INV-') || paymentForm.reference_no?.startsWith('PUR-') ? '' : paymentForm.reference_no}
                  onChange={e => setPaymentForm({ ...paymentForm, reference_no: e.target.value })}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '600' }}>Remarks / Narration</label>
                <input
                  placeholder="e.g. Settlement for INV-0001"
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }}
                  value={paymentForm.remarks || ''}
                  onChange={e => setPaymentForm({ ...paymentForm, remarks: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button type="button" onClick={() => { setShowPaymentModal(false); setEditingId(null); }} style={{ padding: '8px 14px', borderRadius: '6px', border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontWeight: '600' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#0284c7', color: '#fff', cursor: 'pointer', fontWeight: '600' }}>
                  {editingId ? 'Update Payment' : 'Save Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Item Modal */}
      {showItemModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: '10px', padding: '24px', width: '420px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px' }}>{editingId ? 'Edit Item' : 'Create New Item'}</h3>
              <button onClick={() => setShowItemModal(false)} style={{ background: '#fee2e2', border: 'none', color: '#ef4444', padding: '4px', borderRadius: '4px', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveItem} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div><label style={{ fontSize: '12px', fontWeight: '600' }}>Item Code</label><input required style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }} value={itemForm.item_code} onChange={e => setItemForm({ ...itemForm, item_code: e.target.value })} /></div>
              <div><label style={{ fontSize: '12px', fontWeight: '600' }}>Item Name</label><input required style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }} value={itemForm.item_name} onChange={e => setItemForm({ ...itemForm, item_name: e.target.value })} /></div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}><label style={{ fontSize: '12px', fontWeight: '600' }}>Purchase / Cost Rate ({currencySymbol})</label><input type="number" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }} value={itemForm.standard_rate} onChange={e => setItemForm({ ...itemForm, standard_rate: e.target.value })} /></div><div style={{ flex: 1 }}><label style={{ fontSize: '12px', fontWeight: '600' }}>Selling Rate ({currencySymbol})</label><input type="number" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }} value={(itemForm as any).selling_rate ?? ''} onChange={e => setItemForm({ ...itemForm, selling_rate: e.target.value } as any)} /></div>
                <div style={{ flex: 1 }}><label style={{ fontSize: '12px', fontWeight: '600' }}>Stock</label><input type="number" readOnly disabled style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box', background: '#f1f5f9', color: '#64748b' }} value={itemForm.current_stock} /></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowItemModal(false)} style={{ padding: '8px 14px', borderRadius: '6px', border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontWeight: '600' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#0284c7', color: '#fff', cursor: 'pointer', fontWeight: '600' }}>{editingId ? 'Update Item' : 'Save Item'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sales Invoice Modal */}
      {showInvoiceModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: '10px', padding: '24px', width: '780px', maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px' }}>{editingId ? 'Edit Sales Invoice' : 'Create Sales Invoice'}</h3>
              <button onClick={() => setShowInvoiceModal(false)} style={{ background: '#fee2e2', border: 'none', color: '#ef4444', padding: '4px', borderRadius: '4px', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveInvoice} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}><label style={{ fontSize: '12px', fontWeight: '600' }}>Invoice #</label><input required disabled={!!editingId} style={{ ...fieldStyle, background: editingId ? '#f1f5f9' : '#fff' }} value={invoiceForm.invoice_number} onChange={e => setInvoiceForm({ ...invoiceForm, invoice_number: e.target.value })} /></div>
                <div style={{ flex: 1 }}><label style={{ fontSize: '12px', fontWeight: '600' }}>Date</label><input type="date" required style={fieldStyle} value={invoiceForm.posting_date} onChange={e => setInvoiceForm({ ...invoiceForm, posting_date: e.target.value })} /></div>
                <div style={{ flex: 1 }}><label style={{ fontSize: '12px', fontWeight: '600' }}>Due Date</label><input type="date" required style={fieldStyle} value={invoiceForm.due_date} onChange={e => setInvoiceForm({ ...invoiceForm, due_date: e.target.value })} /></div>
                <div style={{ width: '110px' }}><label style={{ fontSize: '12px', fontWeight: '600' }}>Tax / GST %</label><select style={fieldStyle} value={invoiceForm.tax_rate} onChange={e => setInvoiceForm({ ...invoiceForm, tax_rate: e.target.value })}>{GST_SLABS.map(s => (<option key={s} value={s}>{s}%</option>))}</select></div>
              </div>
              <div><label style={{ fontSize: '12px', fontWeight: '600' }}>Customer</label><select required style={fieldStyle} value={invoiceForm.customer_id} onChange={e => setInvoiceForm({ ...invoiceForm, customer_id: e.target.value })}><option value="">-- Choose Customer --</option>{customers.map(c => (<option key={c.id} value={c.id}>{c.customer_name}</option>))}</select></div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>Line Items</label>
                <LineItemsEditor
                  lines={invoiceForm.lines}
                  items={items}
                  showStock={true}
                  currencySymbol={currencySymbol}
                  onChange={lines => setInvoiceForm(prev => ({ ...prev, lines }))}
                />
              </div>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span>Net Total</span><strong>{currencySymbol} {invoiceNet.toFixed(2)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span>Tax ({invoiceForm.tax_rate}%)</span><strong>{currencySymbol} {invoiceTax.toFixed(2)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                <span style={{ fontSize: '13px' }}>Adjustment (+/-) <span style={{ fontSize: '11px', color: '#64748b' }}>(Freight / Round-off)</span></span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  style={{ ...fieldStyle, width: '130px', textAlign: 'right', padding: '5px 8px' }}
                  value={(invoiceForm as any).adjustment ?? ''}
                  onChange={e => setInvoiceForm({ ...invoiceForm, adjustment: e.target.value } as any)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '6px', marginTop: '6px', fontSize: '15px' }}>
                <strong>Grand Total</strong><strong style={{ color: '#0369a1' }}>{currencySymbol} {(invoiceNet + invoiceTax + invoiceAdj).toFixed(2)}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowInvoiceModal(false)} style={{ padding: '8px 14px', borderRadius: '6px', border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontWeight: '600' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#0284c7', color: '#fff', cursor: 'pointer', fontWeight: '600' }}>{editingId ? 'Update Invoice' : 'Submit Invoice'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Purchase Bill Modal */}
      {showPurchaseModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: '10px', padding: '24px', width: '780px', maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px' }}>{editingId ? 'Edit Purchase Bill' : 'Record Purchase Bill'}</h3>
              <button onClick={() => setShowPurchaseModal(false)} style={{ background: '#fee2e2', border: 'none', color: '#ef4444', padding: '4px', borderRadius: '4px', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSavePurchase} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}><label style={{ fontSize: '12px', fontWeight: '600' }}>Bill #</label><input required disabled={!!editingId} style={{ ...fieldStyle, background: editingId ? '#f1f5f9' : '#fff' }} value={purchaseForm.bill_number} onChange={e => setPurchaseForm({ ...purchaseForm, bill_number: e.target.value })} /></div>
                <div style={{ flex: 1 }}><label style={{ fontSize: '12px', fontWeight: '600' }}>Posting Date</label><input type="date" required style={fieldStyle} value={purchaseForm.posting_date} onChange={e => setPurchaseForm({ ...purchaseForm, posting_date: e.target.value })} /></div>
                <div style={{ flex: 1 }}><label style={{ fontSize: '12px', fontWeight: '600' }}>Due Date</label><input type="date" required style={fieldStyle} value={purchaseForm.due_date} onChange={e => setPurchaseForm({ ...purchaseForm, due_date: e.target.value })} /></div>
                <div style={{ width: '110px' }}><label style={{ fontSize: '12px', fontWeight: '600' }}>Tax / GST %</label><select style={fieldStyle} value={purchaseForm.tax_rate} onChange={e => setPurchaseForm({ ...purchaseForm, tax_rate: e.target.value })}>{GST_SLABS.map(s => (<option key={s} value={s}>{s}%</option>))}</select></div>
              </div>
              <div><label style={{ fontSize: '12px', fontWeight: '600' }}>Select Supplier *</label><select required style={fieldStyle} value={purchaseForm.supplier_id} onChange={e => setPurchaseForm({ ...purchaseForm, supplier_id: e.target.value })}><option value="">-- Choose Supplier --</option>{suppliers.map(s => (<option key={s.id} value={s.id}>{s.supplier_name}</option>))}</select></div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>Line Items</label>
                <LineItemsEditor
                  priceMode="buying"
                  lines={purchaseForm.lines}
                  items={items}
                  showStock={false}
                  currencySymbol={currencySymbol}
                  onChange={lines => setPurchaseForm(prev => ({ ...prev, lines }))}
                />
              </div>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span>Net Total</span><strong>{currencySymbol} {purchaseNet.toFixed(2)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span>Input Tax ({purchaseForm.tax_rate}%)</span><strong>{currencySymbol} {purchaseTax.toFixed(2)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '6px', fontSize: '15px' }}>
                  <strong>Total Payable</strong><strong style={{ color: '#0369a1' }}>{currencySymbol} {(purchaseNet + purchaseTax).toFixed(2)}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowPurchaseModal(false)} style={{ padding: '8px 14px', borderRadius: '6px', border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontWeight: '600' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#0284c7', color: '#fff', cursor: 'pointer', fontWeight: '600' }}>{editingId ? 'Update Bill' : 'Submit Bill'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedInvoiceForPrint && (
        <InvoicePrintModal
          invoice={selectedInvoiceForPrint}
          customer={customers.find(c => c.id === selectedInvoiceForPrint.customer || c.customer_name === selectedInvoiceForPrint.customer_name)}
          itemsMaster={items}
          company={activeCompany}
          onClose={() => setSelectedInvoiceForPrint(null)}
        />
      )}

      {selectedPurchaseForPrint && (
        <PurchaseBillPrintModal
          bill={selectedPurchaseForPrint}
          supplier={suppliers.find(s => s.id === selectedPurchaseForPrint.supplier || s.supplier_name === selectedPurchaseForPrint.supplier_name)}
          itemsMaster={items}
          company={activeCompany} 
          onClose={() => setSelectedPurchaseForPrint(null)}
        />
      )}

      {selectedPaymentForPrint && (
        <PaymentPrintModal
          payment={selectedPaymentForPrint}
          company={activeCompany}
          onClose={() => setSelectedPaymentForPrint(null)}
        />
      )}

      {showLedgerPrintModal && (
        <LedgerPrintModal
          entries={glEntries}
          accountFilter={glAccountFilter}
          partyFilter={glPartyFilter}
          totalDebit={totalDebit}
          totalCredit={totalCredit}
          closingBalance={closingBalance}
          company={activeCompany}
          onClose={() => setShowLedgerPrintModal(false)}
        />
      )}

      <JournalEntryModal
        isOpen={showJournalModal}
        onClose={() => setShowJournalModal(false)}
        onSave={handleSaveJournalEntry}
        allPartyNames={allPartyNames}
      />

      <PaymentReconciliationModal
        isOpen={showReconciliationModal}
        onClose={() => setShowReconciliationModal(false)}
        customers={customers}
        suppliers={suppliers}
        onReconciliationDone={() => void loadData()}
      />

      {showFinancePrintModal && finance && (
        <FinancialReportPrintModal 
          finance={finance}
          company={activeCompany} 
          companyName={activeCompany?.name}
          onClose={() => setShowFinancePrintModal(false)} 
        />
      )}

      {showGstModal && (
        <GSTPrintModal 
          data={gstData} 
          companyName={activeCompany?.name || 'TallyBIZ Enterprise'}
          onClose={() => setShowGstModal(false)} 
        />
      )}
      <UserProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />

      {/* Tally Style Quit Confirmation Popup */}
      <QuitConfirmModal
        isOpen={showQuitModal}
        onConfirm={() => {
          setShowQuitModal(false);
          handleCleanLogout();
        }}
        onCancel={() => setShowQuitModal(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainERPApp />
    </AuthProvider>
  );
}