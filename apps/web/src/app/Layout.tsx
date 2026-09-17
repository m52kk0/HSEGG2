import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Compass, ListChecks, Search } from 'lucide-react';
import './layout.css';

const TABS = [
  { to: '/plan', label: 'Мой план', Icon: ListChecks },
  { to: '/search', label: 'Найти', Icon: Search },
];

/** Каркас: логотип слева, две вкладки — в шапке на десктопе, таб-баром на мобильном. */
export function Layout() {
  const { pathname } = useLocation();
  const isOnboarding = pathname.startsWith('/onboarding');

  return (
    <div className="app">
      <header className="header no-print">
        <div className="container header-inner">
          <NavLink to="/plan" className="logo" aria-label="Cursus — на главный экран">
            <Compass size={20} aria-hidden="true" />
            <span className="logo-text">Cursus</span>
          </NavLink>

          {!isOnboarding ? (
            <nav className="header-nav" aria-label="Основная навигация">
              {TABS.map(({ to, label }) => (
                <NavLink key={to} to={to} className="header-link">
                  {label}
                </NavLink>
              ))}
            </nav>
          ) : null}
        </div>
      </header>

      <main className="screen">
        <div className="container">
          <Outlet />
        </div>
      </main>

      {!isOnboarding ? (
        <nav className="tabbar no-print" aria-label="Основная навигация">
          {TABS.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className="tabbar-link">
              <Icon size={20} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
