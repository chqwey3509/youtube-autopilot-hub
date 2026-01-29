import React from 'react';
import { Tab } from '../types';

interface LayoutProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ activeTab, onTabChange, children }) => {
  const tabs = [
    { id: Tab.DASHBOARD, label: 'Simulator Dashboard', icon: '⚡' },
    { id: Tab.SCRIPT, label: 'Python Script', icon: '🐍' },
    { id: Tab.ASSISTANT, label: 'AI Assistant', icon: '🤖' },
  ];

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-xl font-bold bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">
            AutoPilot Hub
          </h1>
          <p className="text-xs text-slate-500 mt-1">YouTube Automation V3</p>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span className="font-medium text-sm">{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span className="text-xs font-mono text-green-400">System Online</span>
            </div>
            <p className="text-xs text-slate-500">v1.0.4 • Stable</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
};

export default Layout;