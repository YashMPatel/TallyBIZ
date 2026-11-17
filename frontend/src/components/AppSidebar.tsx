import React from 'react';
import {
  ShoppingCart,
  ShoppingBag,
  Users,
  Truck,
  Package,
  BookOpen,
  CreditCard,
  PieChart,
  Layers,
  Factory,
  CheckCircle,
  Wallet,
  Landmark,
  Building2,
} from 'lucide-react';

interface AppSidebarProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  user: any;
  pendingApprovalsCount: number;
  activeUnitType?: string;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  activeTab,
  setActiveTab,
  user,
  pendingApprovalsCount,
  activeUnitType = 'ALL',
}) => {
  const roleUpper = String(user?.role || '').trim().toUpperCase().replace(/\s+/g, '_');
  const isSalesUser = roleUpper === 'SALES_USER';
  const isAdmin = roleUpper === 'ADMIN' || Boolean(user?.is_superuser || user?.is_staff);
  const isManager = roleUpper === 'MANAGER';

  const unitMode = String(activeUnitType || 'ALL').toUpperCase();
  const isAll = unitMode === 'ALL';
  const isHO = unitMode === 'HO';
  const isTrading = unitMode === 'TRADING';
  const isMfg = unitMode === 'MANUFACTURING';

  const btnStyle = (tabName: string, accent = '#38bdf8') => ({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '7px 10px',
    borderRadius: '6px',
    border: 'none',
    background: activeTab === tabName ? '#1e293b' : 'transparent',
    color: activeTab === tabName ? accent : '#cbd5e1',
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontSize: '12px',
    fontWeight: activeTab === tabName ? 700 : 500,
    width: '100%',
    boxSizing: 'border-box' as const,
  });

  return (
    <aside
      className="no-print"
      style={{
        width: '250px',
        background: '#090d16',
        color: '#f8fafc',
        padding: '16px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        height: '100vh',
        boxSizing: 'border-box',
      }}
    >
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#38bdf8', margin: '0 0 4px 8px' }}>
          TallyBIZ ERP
        </h2>
        <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {isMfg ? 'FACTORY / PRODUCTION DESK' : isTrading ? 'SALES & PURCHASE DESK' : isHO ? 'HEAD OFFICE (CEO / CA VIEW)' : 'CONSOLIDATED OWNER VIEW'}
        </span>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px', overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
        {/* HEAD OFFICE & OWNER: Approvals Hub */}
        {(isHO || isAll) && (isAdmin || isManager) && (
          <button
            onClick={() => setActiveTab('approvals')}
            style={{
              ...btnStyle('approvals', '#f59e0b'),
              justifyContent: 'space-between',
              color: activeTab === 'approvals' ? '#f59e0b' : '#fbbf24',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <CheckCircle size={16} /> <span>Approvals Hub</span>
            </div>
            {pendingApprovalsCount > 0 && (
              <span style={{ background: '#ef4444', color: '#ffffff', fontSize: '10px', fontWeight: 'bold', padding: '1px 6px', borderRadius: '10px' }}>
                {pendingApprovalsCount}
              </span>
            )}
          </button>
        )}

        {/* TRADING & CONSOLIDATED: Selling, Buying, Customers, Suppliers, Returns */}
        {(isTrading || isHO || isAll) && (
          <>
            <button onClick={() => setActiveTab('selling')} style={btnStyle('selling')}>
              <ShoppingCart size={16} /> Selling (Invoices &amp; Orders)
            </button>
            {!isSalesUser && (
              <button onClick={() => setActiveTab('buying')} style={btnStyle('buying')}>
                <ShoppingBag size={16} /> Buying (Bills &amp; Requests)
              </button>
            )}
            <button onClick={() => setActiveTab('customers')} style={btnStyle('customers')}>
              <Users size={16} /> Customers
            </button>
            {!isSalesUser && (
              <button onClick={() => setActiveTab('suppliers')} style={btnStyle('suppliers')}>
                <Truck size={16} /> Suppliers
              </button>
            )}
            <button onClick={() => setActiveTab('ReturnsTab')} style={btnStyle('ReturnsTab')}>
              <CreditCard size={16} /> Credit &amp; Debit Notes
            </button>
          </>
        )}

        {/* MANUFACTURING & CONSOLIDATED: Production, BOM & Sales Production Requests */}
        {(isMfg || isHO || isAll) && (
          <button onClick={() => setActiveTab('production')} style={btnStyle('production', '#34d399')}>
            <Factory size={16} /> {isMfg ? 'Production, MRP & Requests' : 'Production & BOM'}
          </button>
        )}

        {/* TRADING, MANUFACTURING & CONSOLIDATED: Stock & Stock Movement */}
        {(isTrading || isMfg || isHO || isAll) && (
          <>
            <button onClick={() => setActiveTab('stock')} style={btnStyle('stock')}>
              <Package size={16} /> {isMfg ? 'Factory Stock & Dispatch' : 'Stock (Items)'}
            </button>
            {!isSalesUser && (
              <button onClick={() => setActiveTab('stock-ledger')} style={btnStyle('stock-ledger')}>
                <Layers size={16} /> Stock Movement Ledger
              </button>
            )}
          </>
        )}

        {/* ALL DIVISIONS: Unit Petty Cash, Counter Receipts, Scrap Cash & Salary/Expense Requests */}
        <button onClick={() => setActiveTab('petty_cash')} style={btnStyle('petty_cash', '#a78bfa')}>
          <Wallet size={16} /> {isHO ? 'Unit Petty Cash & Requests' : 'Petty Cash & Requests'}
        </button>

        {/* HEAD OFFICE & CONSOLIDATED ONLY: Central Payments, Bank Accounts, Partners/Loans, GL, P&L, GST, Users */}
        {(isHO || isAll) && !isSalesUser && (
          <>
            <button onClick={() => setActiveTab('payments')} style={btnStyle('payments')}>
              <CreditCard size={16} /> Payments (HO Central)
            </button>
            <button onClick={() => setActiveTab('bank_accounts')} style={btnStyle('bank_accounts')}>
              <Building2 size={16} /> Bank Accounts (Statements)
            </button>
            <button onClick={() => setActiveTab('capital_loans')} style={btnStyle('capital_loans')}>
              <Landmark size={16} /> Partners, Capital &amp; Loans
            </button>
            <button onClick={() => setActiveTab('accounts')} style={btnStyle('accounts')}>
              <BookOpen size={16} /> General Ledger
            </button>
            <button onClick={() => setActiveTab('reports')} style={btnStyle('reports')}>
              <PieChart size={16} /> Profit &amp; Loss / Balance Sheet
            </button>
            <button onClick={() => setActiveTab('gst')} style={btnStyle('gst')}>
              <PieChart size={16} /> GST Returns (GSTR-1/3B)
            </button>
          </>
        )}

        {(isHO || isAll) && isAdmin && (
          <button onClick={() => setActiveTab('users_management')} style={btnStyle('users_management')}>
            <Users size={16} /> Users &amp; Permissions
          </button>
        )}
      </nav>
    </aside>
  );
};
