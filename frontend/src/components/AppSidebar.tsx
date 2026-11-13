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
} from 'lucide-react';

interface AppSidebarProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  user: any;
  pendingApprovalsCount: number;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  activeTab,
  setActiveTab,
  user,
  pendingApprovalsCount,
}) => {
  const roleUpper = String(user?.role || '').trim().toUpperCase().replace(/\s+/g, '_');
  const isSalesUser = roleUpper === 'SALES_USER';
  const isAdmin = roleUpper === 'ADMIN';
  const isManager = roleUpper === 'MANAGER';

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
        <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '8px' }}>MODULAR ENGINE</span>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
        {/* 1. Approvals Hub (Admin & Manager Only) */}
        {(isAdmin || isManager) && (
          <button
            onClick={() => setActiveTab('approvals')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              borderRadius: '6px',
              border: 'none',
              background: activeTab === 'approvals' ? '#1e293b' : 'transparent',
              color: activeTab === 'approvals' ? '#f59e0b' : '#fbbf24',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '12px',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <CheckCircle size={16} /> <span>Approvals Hub</span>
            </div>
            {pendingApprovalsCount > 0 && (
              <span style={{ background: '#ef4444', color: '#ffffff', fontSize: '10px', fontWeight: 'bold', padding: '1px 6px', borderRadius: '10px', minWidth: '16px', textAlign: 'center' }}>
                {pendingApprovalsCount}
              </span>
            )}
          </button>
        )}

        {/* 2. Selling (Open for all) */}
        <button
          onClick={() => setActiveTab('selling')}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', borderRadius: '6px', border: 'none', background: activeTab === 'selling' ? '#1e293b' : 'transparent', color: activeTab === 'selling' ? '#38bdf8' : '#cbd5e1', cursor: 'pointer', textAlign: 'left', fontSize: '12px' }}
        >
          <ShoppingCart size={16} /> Selling (Invoices)
        </button>

        {/* 3. Buying (Sales User mate hidden) */}
        {!isSalesUser && (
          <button
            onClick={() => setActiveTab('buying')}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', borderRadius: '6px', border: 'none', background: activeTab === 'buying' ? '#1e293b' : 'transparent', color: activeTab === 'buying' ? '#38bdf8' : '#cbd5e1', cursor: 'pointer', textAlign: 'left', fontSize: '12px' }}
          >
            <ShoppingBag size={16} /> Buying (Bills)
          </button>
        )}

        {/* 4. Customers (Open for all) */}
        <button
          onClick={() => setActiveTab('customers')}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', borderRadius: '6px', border: 'none', background: activeTab === 'customers' ? '#1e293b' : 'transparent', color: activeTab === 'customers' ? '#38bdf8' : '#cbd5e1', cursor: 'pointer', textAlign: 'left', fontSize: '12px' }}
        >
          <Users size={16} /> Customers
        </button>

        {/* 5. Suppliers (Sales User mate hidden) */}
        {!isSalesUser && (
          <button
            onClick={() => setActiveTab('suppliers')}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', borderRadius: '6px', border: 'none', background: activeTab === 'suppliers' ? '#1e293b' : 'transparent', color: activeTab === 'suppliers' ? '#38bdf8' : '#cbd5e1', cursor: 'pointer', textAlign: 'left', fontSize: '12px' }}
          >
            <Truck size={16} /> Suppliers
          </button>
        )}

        {/* 6. Payments (Sales User mate hidden) */}
        {!isSalesUser && (
          <button
            onClick={() => setActiveTab('payments')}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', borderRadius: '6px', border: 'none', background: activeTab === 'payments' ? '#1e293b' : 'transparent', color: activeTab === 'payments' ? '#38bdf8' : '#cbd5e1', cursor: 'pointer', textAlign: 'left', fontSize: '12px' }}
          >
            <CreditCard size={16} /> Payments
          </button>
        )}

        {/* 7. Returns & Credit/Debit Notes */}
        <button
          onClick={() => setActiveTab('ReturnsTab')}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', borderRadius: '6px', border: 'none', background: activeTab === 'ReturnsTab' ? '#1e293b' : 'transparent', color: activeTab === 'ReturnsTab' ? '#38bdf8' : '#cbd5e1', cursor: 'pointer', textAlign: 'left', fontSize: '12px' }}
        >
          <CreditCard size={16} /> Credit &amp; Debit Notes
        </button>

        {/* 8. Stock Items */}
        <button
          onClick={() => setActiveTab('stock')}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', borderRadius: '6px', border: 'none', background: activeTab === 'stock' ? '#1e293b' : 'transparent', color: activeTab === 'stock' ? '#38bdf8' : '#cbd5e1', cursor: 'pointer', textAlign: 'left', fontSize: '12px' }}
        >
          <Package size={16} /> Stock (Items)
        </button>

        {/* 9. Stock Movement Ledger (Sales User mate hidden) */}
        {!isSalesUser && (
          <button
            onClick={() => setActiveTab('stock-ledger')}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', borderRadius: '6px', border: 'none', background: activeTab === 'stock-ledger' ? '#1e293b' : 'transparent', color: activeTab === 'stock-ledger' ? '#38bdf8' : '#cbd5e1', cursor: 'pointer', textAlign: 'left', fontSize: '12px' }}
          >
            <Layers size={16} /> Stock Movement Ledger
          </button>
        )}

        {/* 9B. Production & BOM */}
      <button
        onClick={() => setActiveTab('production')}
        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', borderRadius: '6px', border: 'none', background: activeTab === 'production' ? '#1e293b' : 'transparent', color: activeTab === 'production' ? '#38bdf8' : '#cbd5e1', cursor: 'pointer', textAlign: 'left', fontSize: '12px' }}
      >
        <Factory size={16} /> Production &amp; BOM
      </button>

      {/* 10. Accounts / General Ledger (Sales User mate hidden) */}
        {!isSalesUser && (
          <button
            onClick={() => setActiveTab('accounts')}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', borderRadius: '6px', border: 'none', background: activeTab === 'accounts' ? '#1e293b' : 'transparent', color: activeTab === 'accounts' ? '#38bdf8' : '#cbd5e1', cursor: 'pointer', textAlign: 'left', fontSize: '12px' }}
          >
            <BookOpen size={16} /> General Ledger
          </button>
        )}

        {/* 11. Reports (P&L / Balance Sheet) (Sales User mate hidden) */}
        {!isSalesUser && (
          <button
            onClick={() => setActiveTab('reports')}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', borderRadius: '6px', border: 'none', background: activeTab === 'reports' ? '#1e293b' : 'transparent', color: activeTab === 'reports' ? '#38bdf8' : '#cbd5e1', cursor: 'pointer', textAlign: 'left', fontSize: '12px' }}
          >
            <PieChart size={16} /> Profit &amp; Loss / Balance Sheet
          </button>
        )}

        {/* 12. GST Returns (Sales User mate hidden) */}
        {!isSalesUser && (
          <button
            onClick={() => setActiveTab('gst')}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', borderRadius: '6px', border: 'none', background: activeTab === 'gst' ? '#1e293b' : 'transparent', color: activeTab === 'gst' ? '#38bdf8' : '#cbd5e1', cursor: 'pointer', textAlign: 'left', fontSize: '12px' }}
          >
            <PieChart size={16} /> GST Returns (GSTR-1/3B)
          </button>
        )}

        {/* 13. Users & Permissions (Fakt Super Admin mate) */}
        {isAdmin && (
          <button
            onClick={() => setActiveTab('users_management')}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', borderRadius: '6px', border: 'none', background: activeTab === 'users_management' ? '#1e293b' : 'transparent', color: activeTab === 'users_management' ? '#38bdf8' : '#cbd5e1', cursor: 'pointer', textAlign: 'left', fontSize: '12px' }}
          >
            <Users size={16} /> Users &amp; Permissions
          </button>
        )}
      </nav>
    </aside>
  );
};