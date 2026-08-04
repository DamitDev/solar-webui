import { Link, useLocation } from 'react-router-dom';
import { ReactNode } from 'react';
import { Activity, Server, Target, Gauge, Key, Database, LogOut } from 'lucide-react';
import { useRoutingEventsContext } from '@/context/RoutingEventsContext';

function NavItem({ to, icon, label, active }: { to: string; icon: ReactNode; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
        active ? 'bg-nord-10 text-nord-6 font-medium' : 'text-nord-4 hover:bg-nord-2'
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}

export function Navigation() {
  const location = useLocation();
  let isConnected = false;
  try {
    const ctx = useRoutingEventsContext();
    isConnected = ctx.routingConnected;
  } catch {}

  return (
    <nav className="bg-nord-1 border-b border-nord-3 px-6 py-3">
      <div className="flex items-center gap-6 min-w-0">
        {/* Logo — pinned */}
        <div className="flex items-center gap-2 mr-8 shrink-0">
          <Activity className="text-nord-8" size={24} />
          <span className="font-bold text-xl text-nord-6">Solar</span>
        </div>

        {/* Link strip — scrolls internally on narrow viewports */}
        <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto no-scrollbar">
          <NavItem
            to="/routing"
            icon={<Activity size={18} />}
            label="Routing"
            active={location.pathname === '/routing'}
          />
          <NavItem
            to="/gateway"
            icon={<Activity size={18} />}
            label="Gateway"
            active={location.pathname === '/gateway'}
          />
          <NavItem
            to="/hosts"
            icon={<Server size={18} />}
            label="Hosts & Instances"
            active={location.pathname === '/hosts'}
          />
          <NavItem
            to="/intents"
            icon={<Target size={18} />}
            label="Intents"
            active={location.pathname.startsWith('/intents')}
          />
          <NavItem
            to="/resources"
            icon={<Gauge size={18} />}
            label="Resources"
            active={location.pathname === '/resources'}
          />
          <NavItem
            to="/endpoints"
            icon={<Key size={18} />}
            label="Endpoints"
            active={location.pathname === '/endpoints'}
          />
          <NavItem
            to="/catalog"
            icon={<Database size={18} />}
            label="Catalog"
            active={location.pathname === '/catalog'}
          />
        </div>

        {/* Status + logout — pinned */}
        <div className="ml-auto flex items-center gap-4 text-xs shrink-0">
          <div className="flex items-center gap-2">
            <span className={isConnected ? 'text-nord-14' : 'text-nord-11'}>●</span>
            <span className="text-nord-4">Event Stream</span>
          </div>
          <form method="post" action="/auth/logout">
            <button
              type="submit"
              className="flex items-center gap-1 rounded-md px-2 py-1 text-nord-4 transition-colors hover:bg-nord-2 hover:text-nord-6"
            >
              <LogOut size={14} />
              Logout
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
