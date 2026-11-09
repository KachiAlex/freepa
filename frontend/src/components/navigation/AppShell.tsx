import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
      <main className="main">
        <TopBar onMenuToggle={() => setSidebarOpen((value) => !value)} />
        <div className="content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default AppShell;
