import { Outlet } from 'react-router-dom'
import Sidebar from '../components/navigation/Sidebar'
import TopBar from '../components/navigation/TopBar'

function DashboardLayout() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-shell__main">
        <TopBar />
        <main className="app-shell__content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default DashboardLayout

