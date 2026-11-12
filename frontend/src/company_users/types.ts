// Company Model Type
export interface Company {
  id: number;
  name: string;
  company_code: string;
  gstin?: string;
  pan?: string;
  address?: string;
  city?: string;
  state?: string;
  state_code?: string;
  pincode?: string;
  email?: string;
  phone?: string;
  bank_name?: string;
  bank_account_no?: string;
  bank_ifsc?: string;
  bank_branch?: string;
  is_active: boolean;
}

// User Profile Type
export interface OrgUserProfile {
  phone?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  address?: string;
  is_approved: boolean;
  approved_at?: string;
  active_company?: number;
  active_company_name?: string;
  active_company_code?: string;
}

// User Detail Type
export interface AppUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_superuser: boolean;
  profile?: OrgUserProfile;
}

// User Company Access / Roles Type
export interface UserCompanyAccess {
  id: number;
  user: number;
  username: string;
  user_full_name: string;
  company: number;
  company_name: string;
  company_code: string;
  role: 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'MANAGER' | 'SALES_USER' | 'PURCHASE_USER' | 'ACCOUNTS_USER' | 'VIEWER';
  can_create_invoice: boolean;
  can_approve_invoice: boolean;
  can_delete_records: boolean;
  can_view_reports: boolean;
}