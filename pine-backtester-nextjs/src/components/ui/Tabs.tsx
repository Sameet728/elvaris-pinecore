'use client';

import React from 'react';

export interface TabItem {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
  size?: 'sm' | 'md';
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  className = '',
  size = 'md',
}) => {
  return (
    <div
      role="tablist"
      className={`flex items-center gap-1 border-b border-[#E2E5EA] overflow-x-auto no-scrollbar ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            className={`relative flex items-center gap-2 font-medium transition-all select-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-[#2B59FF] focus-visible:outline-offset-2 ${size === 'sm' ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'
              } ${isActive
                ? 'text-[#2B59FF] font-semibold'
                : 'text-[#475266] hover:text-[#0E1520] hover:bg-[#F0F2F5]/50'
              }`}
          >
            {tab.icon && (
              <span className={`shrink-0 ${isActive ? 'text-[#2B59FF]' : 'text-[#6B7587]'}`}>
                {tab.icon}
              </span>
            )}
            <span>{tab.label}</span>
            {tab.badge && <span className="ml-0.5">{tab.badge}</span>}
            {isActive && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2B59FF] rounded-t-full" />
            )}
          </button>
        );
      })}
    </div>
  );
};


