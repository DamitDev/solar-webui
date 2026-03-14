import { createBrowserRouter, RouterProvider, Navigate, Link, useLocation, Outlet } from 'react-router-dom';
import { Dashboard } from './components/Dashboard';
import { RoutingGraph } from './components/RoutingGraph';
import { GatewayDashboard } from './components/GatewayDashboard';
import { EndpointsDashboard } from './components/EndpointsDashboard';
import { Activity, Server, Key } from 'lucide-react';
import { RoutingEventsProvider } from './context/RoutingEventsContext';
import { useRoutingEventsContext } from './context/RoutingEventsContext';

function Navigation() {
  const location = useLocation();
  let isConnected = false;
  try {
    const ctx = useRoutingEventsContext();
    isConnected = ctx.routingConnected;
  } catch {}

  return (
    <nav className="bg-nord-1 border-b border-nord-3 px-6 py-3">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 mr-8">
          <Activity className="text-nord-8" size={24} />
          <span className="font-bold text-xl text-nord-6">Solar</span>
        </div>
        <Link
          to="/routing"
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            location.pathname === '/routing'
              ? 'bg-nord-10 text-nord-6 font-medium'
              : 'text-nord-4 hover:bg-nord-2'
          }`}
        >
          <Activity size={18} />
          Routing
        </Link>
        <Link
          to="/gateway"
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            location.pathname === '/gateway'
              ? 'bg-nord-10 text-nord-6 font-medium'
              : 'text-nord-4 hover:bg-nord-2'
          }`}
        >
          <Activity size={18} />
          Gateway
        </Link>
        <Link
          to="/hosts"
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            location.pathname === '/hosts'
              ? 'bg-nord-10 text-nord-6 font-medium'
              : 'text-nord-4 hover:bg-nord-2'
          }`}
        >
          <Server size={18} />
          Hosts & Instances
        </Link>
        <Link
          to="/endpoints"
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            location.pathname === '/endpoints'
              ? 'bg-nord-10 text-nord-6 font-medium'
              : 'text-nord-4 hover:bg-nord-2'
          }`}
        >
          <Key size={18} />
          Endpoints
        </Link>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <span className={isConnected ? 'text-nord-14' : 'text-nord-11'}>●</span>
          <span className="text-nord-4">Event Stream</span>
        </div>
      </div>
    </nav>
  );
}

function Layout() {
  return (
      <RoutingEventsProvider>
        <div className="min-h-screen bg-nord-0">
          <Navigation />
        <Outlet />
        </div>
      </RoutingEventsProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Navigate to="/routing" replace /> },
      { path: '/routing', element: <RoutingGraph /> },
      { path: '/gateway', element: <GatewayDashboard /> },
      { path: '/hosts', element: <Dashboard /> },
      { path: '/endpoints', element: <EndpointsDashboard /> },
    ],
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;

