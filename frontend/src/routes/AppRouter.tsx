import { lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'
import AdminRoute from './AdminRoute'

const DashboardLayout = lazy(() => import('../layouts/DashboardLayout'))
const DashboardPage = lazy(() => import('../pages/dashboard/DashboardPage'))
const InvoiceListPage = lazy(() => import('../pages/invoices/InvoiceListPage'))
const InvoiceEditorPage = lazy(() => import('../pages/invoices/InvoiceEditorPage'))
const PaymentsPage = lazy(() => import('../pages/payments/PaymentsPage'))
const ClientsPage = lazy(() => import('../pages/clients/ClientsPage'))
const SettingsPage = lazy(() => import('../pages/settings/SettingsPage'))
const SignInPage = lazy(() => import('../pages/auth/SignInPage'))
const SignUpPage = lazy(() => import('../pages/auth/SignUpPage'))
const HomePage = lazy(() => import('../pages/home/HomePage'))
const AdminLayout = lazy(() => import('../layouts/AdminLayout'))
const AdminOverviewPage = lazy(() => import('../pages/admin/AdminOverviewPage'))
const AdminUsersPage = lazy(() => import('../pages/admin/AdminUsersPage'))
const AdminOrganizationsPage = lazy(() => import('../pages/admin/AdminOrganizationsPage'))
const AdminInvoicesPage = lazy(() => import('../pages/admin/AdminInvoicesPage'))
const AdminPaymentsPage = lazy(() => import('../pages/admin/AdminPaymentsPage'))
const AdminLoginPage = lazy(() => import('../pages/admin/AdminLoginPage'))

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

