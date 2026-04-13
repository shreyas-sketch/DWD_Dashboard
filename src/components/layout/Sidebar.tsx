'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  Users,
  LogOut,
  Layers,
  Menu,
  X,
  Zap,
  Sun,
  Moon,
  UserCog,
  BarChart2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { UserRole } from '@/types';

interface NavItem {
  label: string;
  href?: string;
  icon: React.ReactNode;
  roles: UserRole[];
  children?: { label: string; href: string; roles: UserRole[] }[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: <LayoutDashboard size={18} />,
    roles: ['admin', 'backend_manager', 'backend_assist', 'calling_assist'],
  },
  {
    label: 'Programs',
    href: '/dashboard/master/programs',
    icon: <BookOpen size={18} />,
    roles: ['admin', 'backend_manager'],
  },
  {
    label: 'Assign Data',
    href: '/dashboard/assign-data',
    icon: <ClipboardList size={18} />,
    roles: ['admin', 'backend_manager', 'backend_assist', 'calling_assist'],
  },
  {
    label: 'Manage Batch',
    href: '/dashboard/manage-batch',
    icon: <Layers size={18} />,
    roles: ['admin', 'backend_manager', 'backend_assist'],
  },
  {
    label: 'Users',
    href: '/dashboard/users',
    icon: <Users size={18} />,
    roles: ['admin'],
  },
  {
    label: 'Reports',
    href: '/dashboard/report',
    icon: <BarChart2 size={18} />,
    roles: ['admin', 'backend_manager'],
  },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return null;

  const filteredNav = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/8">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Zap size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-100">Mudita</p>
            <p className="text-xs text-slate-500">Backend System</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {filteredNav.map((item) => (
          <Link
            key={item.href}
            href={item.href!}
            onClick={() => setMobileOpen(false)}
            className={cn(
              'sidebar-item',
              pathname === item.href && 'active',
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>

      {/* User info */}
      <div className="p-3 border-t border-white/8">
        <Link
          href="/dashboard/profile"
          onClick={() => setMobileOpen(false)}
          className={cn('flex items-center gap-3 px-2 py-2 mb-1 rounded-xl hover:bg-white/5 transition-all cursor-pointer', pathname === '/dashboard/profile' && 'bg-white/5')}
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
            {user.displayName?.charAt(0).toUpperCase() ?? 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-200 truncate">{user.displayName}</p>
            <p className="text-xs text-slate-500 capitalize truncate">
              {user.role.replace(/_/g, ' ')}
            </p>
          </div>
          <UserCog size={14} className="text-slate-500" />
        </Link>
        <button
          onClick={toggleTheme}
          className="sidebar-item w-full mb-0.5"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>
        <button
          onClick={() => logout()}
          className="sidebar-item w-full text-red-400 hover:text-red-300 hover:bg-red-500/10"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 glass border-r border-white/8 fixed h-full z-30">
        <SidebarContent />
      </aside>

      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-4 left-4 z-40 p-2 glass rounded-xl"
      >
        <Menu size={20} className="text-slate-300" />
      </button>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 glass flex flex-col h-full">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-200"
            >
              <X size={18} />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}
    </>
  );
}
