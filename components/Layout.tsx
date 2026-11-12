import React, { useState } from 'react';
import { ViewMode } from '../types';
import { 
  LayoutDashboard, Table, BarChart3, Bell, Menu, UploadCloud, 
  Sun, Moon, Megaphone, ChevronLeft, ChevronRight, LogOut 
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  currentMode: ViewMode;
  setMode: (mode: ViewMode) => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, currentMode, setMode, isDarkMode, toggleTheme }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const NavItem = ({ mode, icon: Icon, label }: { mode: ViewMode, icon: any, label: string }) => (
    <button
      onClick={() => { setMode(mode); setSidebarOpen(false); }}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group relative ${
        currentMode === mode 
        ? 'bg-yellow-400 text-slate-900 font-medium shadow-md shadow-yellow-400/20' 
        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
      } ${collapsed ? 'justify-center' : ''}`}
      title={collapsed ? label : ''}
    >
      <Icon className={`w-5 h-5 min-w-[20px] transition-transform duration-200 ${collapsed ? 'group-hover:scale-110' : ''}`} />
      <span className={`transition-all duration-300 whitespace-nowrap overflow-hidden ${collapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>
        {label}
      </span>
      
      {/* Tooltip for collapsed state */}
      {collapsed && (
        <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap">
          {label}
        </div>
      )}
    </button>
  );

  return (
    <div className={`${isDarkMode ? 'dark' : ''} flex h-screen overflow-hidden`}>
      <div className="flex w-full h-full bg-gray-50 dark:bg-slate-900 transition-colors duration-300">
        
        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-20 lg:hidden backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={`
          fixed lg:static inset-y-0 left-0 z-30 bg-slate-900 dark:bg-slate-950 text-white transform transition-all duration-300 ease-in-out border-r border-slate-800 flex flex-col
          ${sidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'}
          ${collapsed ? 'lg:w-20' : 'lg:w-64'}
        `}>
          {/* Sidebar Header */}
          <div className={`p-4 h-16 border-b border-slate-800 flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="bg-yellow-400 p-2 rounded-lg flex-shrink-0">
                <BarChart3 className="text-slate-900 w-6 h-6" />
              </div>
              <div className={`transition-all duration-300 ${collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                <h1 className="text-lg font-bold tracking-wide text-white whitespace-nowrap">BLINKIT</h1>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider whitespace-nowrap leading-none">Seller Analytics</p>
              </div>
            </div>
            
            {/* Desktop Collapse Toggle */}
            <button 
              onClick={() => setCollapsed(!collapsed)}
              className={`hidden lg:flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ${collapsed ? 'absolute -right-3 top-20 bg-slate-800 border border-slate-700 shadow-md rounded-full w-6 h-6' : ''}`}
            >
               {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-5 h-5" />}
            </button>
          </div>

          {/* Navigation */}
          <nav className="p-4 space-y-2 flex-1 overflow-y-auto custom-scrollbar">
            <NavItem mode={ViewMode.DASHBOARD} icon={LayoutDashboard} label="Overview" />
            <NavItem mode={ViewMode.INVENTORY_LIST} icon={Table} label="Inventory Data" />
            <NavItem mode={ViewMode.ADS_ANALYTICS} icon={Megaphone} label="Ads Analytics" />
            <NavItem mode={ViewMode.DATA_IMPORT} icon={UploadCloud} label="Data Import" />
          </nav>

          {/* User Footer */}
          <div className="p-4 border-t border-slate-800">
            <div className={`flex items-center gap-3 transition-all duration-300 ${collapsed ? 'justify-center' : ''}`}>
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-yellow-400 to-yellow-600 flex items-center justify-center text-slate-900 font-bold shadow-lg flex-shrink-0">
                AK
              </div>
              <div className={`overflow-hidden transition-all duration-300 ${collapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>
                <p className="text-sm font-medium whitespace-nowrap">Ajay Kumar</p>
                <p className="text-xs text-slate-400 whitespace-nowrap">Analysis Lead</p>
              </div>
              {!collapsed && (
                <button className="ml-auto p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors">
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <header className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 h-16 flex items-center justify-between px-6 transition-colors shrink-0 z-20">
            <div className="flex items-center gap-4">
              <button 
                className="lg:hidden p-2 -ml-2 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="w-6 h-6" />
              </button>
              
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 dark:text-gray-400 hidden md:inline font-medium">Analytics Panel v2.0</span>
                <span className="px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-bold border border-green-200 dark:border-green-800 uppercase tracking-wide">
                  System Online
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button 
                onClick={toggleTheme}
                className="p-2 text-gray-400 hover:text-yellow-500 dark:text-gray-400 dark:hover:text-yellow-400 transition-colors rounded-full hover:bg-gray-50 dark:hover:bg-slate-700"
                title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
              >
                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              <button className="relative p-2 text-gray-400 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
                <Bell className="w-5 h-5" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white dark:border-slate-800 animate-pulse"></span>
              </button>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-4 lg:p-8 bg-gray-50 dark:bg-slate-900 transition-colors text-slate-800 dark:text-slate-100 relative">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};