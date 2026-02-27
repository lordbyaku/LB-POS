import { useState, useEffect, useCallback } from 'react';
import { supabase } from './lib/supabase';
import { getLicenseStatus } from './lib/license';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import NewOrderPage from './pages/NewOrderPage';
import ScanPage from './pages/ScanPage';
import ReportsPage from './pages/ReportsPage';
import LicensePage from './pages/LicensePage';
import AdminPage from './pages/AdminPage';
import ServicesPage from './pages/ServicesPage';
import SettingsPage from './pages/SettingsPage';
import ExpensePage from './pages/ExpensePage';
import InventoryPage from './pages/InventoryPage';
import LogsPage from './pages/LogsPage';
import CustomersPage from './pages/CustomersPage';
import WaLogsPage from './pages/WaLogsPage';
import VouchersPage from './pages/VouchersPage';
import CalendarPage from './pages/CalendarPage';
import Navbar from './components/Navbar';
import LicenseBanner from './components/LicenseBanner';

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [tenantId, setTenantId] = useState(null);
  const [licenseStatus, setLicenseStatus] = useState('kedaluwarsa');
  const [page, setPage] = useState('dashboard');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) initUser(session);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) initUser(session);
      else {
        setProfile(null);
        setTenantId(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function initUser(session) {
    if (!session?.user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // 1. Get profile (might return 406 if row doesn't exist yet)
      const { data: prof, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profileError) console.error('Profile fetch error:', profileError.message);

      // Handle case where profile row doesn't exist (e.g. after Auth signup but before upsert)
      const currentProfile = prof || {
        id: session.user.id,
        nama: session.user.user_metadata?.nama || session.user.email,
        global_role: 'kasir' // Default
      };
      setProfile(currentProfile);

      // 2. Get tenant & role
      const { data: ut, error: utError } = await supabase
        .from('user_tenants')
        .select('tenant_id, role')
        .eq('user_id', session.user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (utError) console.error('UserTenants fetch error:', utError.message);

      if (ut?.tenant_id) {
        setTenantId(ut.tenant_id);
        setProfile(prev => ({ ...prev, role: ut.role }));

        try {
          const status = await getLicenseStatus(ut.tenant_id);
          setLicenseStatus(status || 'kedaluwarsa');
        } catch (licErr) {
          console.error('License fetch error:', licErr);
        }
      } else {
        console.warn('No active tenant found for this user');
      }
    } catch (e) {
      console.error('Init user crash:', e);
    } finally {
      setLoading(false);
    }
  }

  const refreshLicense = useCallback(async () => {
    if (!tenantId) return;
    try {
      const status = await getLicenseStatus(tenantId);
      setLicenseStatus(status || 'kedaluwarsa');
    } catch (e) {
      console.error('Manual refresh failed:', e);
    }
  }, [tenantId]);

  // Expose to window for global access (e.g. from AdminPage)
  useEffect(() => {
    window.refreshLicenseStatus = refreshLicense;
    return () => { delete window.refreshLicenseStatus; };
  }, [refreshLicense]);

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner large" />
        <p>Memuat...</p>
      </div>
    );
  }

  if (!session) {
    return <LoginPage onLogin={(s) => setSession(s)} />;
  }

  const commonProps = { tenantId, licenseStatus, profile };

  const isGlobalAdmin = profile?.global_role === 'admin';

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-left">
          <span className="header-title" style={{ fontWeight: 'bold', letterSpacing: '1px' }}>LB POS INDONESIA</span>
        </div>
        <div className="header-right">
          {profile && <span className="header-user">{profile.nama || session.user.email}</span>}
          <button className="btn-logout" onClick={handleLogout} title="Logout">⏻</button>
        </div>
      </header>

      <LicenseBanner status={licenseStatus} />

      <main className="app-main">
        {page === 'dashboard' && <DashboardPage {...commonProps} onRefreshLicense={refreshLicense} />}
        {page === 'new-order' && <NewOrderPage {...commonProps} />}
        {page === 'scan' && <ScanPage {...commonProps} />}
        {page === 'reports' && <ReportsPage {...commonProps} />}
        {page === 'license' && <LicensePage {...commonProps} onRefreshLicense={refreshLicense} />}
        {page === 'services' && <ServicesPage {...commonProps} />}
        {page === 'settings' && <SettingsPage {...commonProps} />}
        {page === 'expenses' && <ExpensePage {...commonProps} />}
        {page === 'inventory' && <InventoryPage {...commonProps} />}
        {page === 'logs' && <LogsPage {...commonProps} />}
        {page === 'customers' && <CustomersPage {...commonProps} />}
        {page === 'wa-logs' && <WaLogsPage {...commonProps} />}
        {page === 'vouchers' && <VouchersPage {...commonProps} />}
        {page === 'calendar' && <CalendarPage {...commonProps} />}
        {page === 'admin' && isGlobalAdmin && <AdminPage {...commonProps} />}
      </main>

      <Navbar activePage={page} onNavigate={setPage} isGlobalAdmin={isGlobalAdmin} profile={profile} />
    </div>
  );
}
