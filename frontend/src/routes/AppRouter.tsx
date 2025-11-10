import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'
import AdminRoute from './AdminRoute'
import DashboardLayout from '../layouts/DashboardLayout'
import DashboardPage from '../pages/dashboard/DashboardPage'
import InvoiceListPage from '../pages/invoices/InvoiceListPage'
import InvoiceEditorPage from '../pages/invoices/InvoiceEditorPage'
import PaymentsPage from '../pages/payments/PaymentsPage'
import ClientsPage from '../pages/clients/ClientsPage'
import SettingsPage from '../pages/settings/SettingsPage'
import SignInPage from '../pages/auth/SignInPage'
import SignUpPage from '../pages/auth/SignUpPage'
import HomePage from '../pages/home/HomePage'
import AdminLayout from '../layouts/AdminLayout'
import AdminOverviewPage from '../pages/admin/AdminOverviewPage'
import AdminUsersPage from '../pages/admin/AdminUsersPage'
import AdminOrganizationsPage from '../pages/admin/AdminOrganizationsPage'
import AdminInvoicesPage from '../pages/admin/AdminInvoicesPage'
import AdminPaymentsPage from '../pages/admin/AdminPaymentsPage'
import AdminLoginPage from '../pages/admin/AdminLoginPage'

function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/auth/sign-in" element={<SignInPage />} />
        <Route path="/auth/sign-up" element={<SignUpPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/app" element={<DashboardLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="invoices">
              <Route index element={<InvoiceListPage />} />
              <Route path="new" element={<InvoiceEditorPage mode="create" />} />
              <Route path=":invoiceId" element={<InvoiceEditorPage mode="edit" />} />
            </Route>
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="clients" element={<ClientsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminOverviewPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="organizations" element={<AdminOrganizationsPage />} />
            <Route path="invoices" element={<AdminInvoicesPage />} />
            <Route path="payments" element={<AdminPaymentsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default AppRouter

