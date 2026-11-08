'use client';

import React from 'react';

export interface SegmentItem {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

export interface SegmentedControlProps {
  items: SegmentItem[];
  value: string;
  onChange: (id: string) => void;
  size?: 'sm' | 'md';
  className?: string;
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  items,
  value,
  onChange,
  size = 'md',
  className = '',
}) => {
  return (
    <div
      role="radiogroup"
      className={`inline-flex items-center bg-[#F0F2F5] border border-[#E2E5EA] p-0.5 rounded-lg select-none ${className}`}
    >
      {items.map((item) => {
        const isSelected = item.id === value;
        return (
          <button
            key={item.id}
            role="radio"
            aria-checked={isSelected}
            type="button"
            onClick={() => onChange(item.id)}
            className={`flex items-center gap-1.5 font-medium transition-all rounded-md cursor-pointer ${size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-xs sm:text-sm'
              } ${isSelected
                ? 'bg-white text-[#0E1520] font-semibold shadow-2xs'
                : 'text-[#475266] hover:text-[#0E1520] hover:bg-white/40'
              }`}
          >
            {item.icon && <span className="shrink-0">{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};


