'use client';

import React from 'react';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  subLabel?: string;
  disabled?: boolean;
  className?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  label,
  subLabel,
  disabled = false,
  className = '',
}) => {
  return (
    <label
      className={`inline-flex items-center gap-3 select-none cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''
        } ${className}`}
    >
      <div className="relative inline-flex items-center">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-9 h-5 bg-[#CBD1DA] peer-focus:outline-hidden peer-focus:ring-2 peer-focus:ring-[#2B59FF]/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#2B59FF]" />
      </div>
      {(label || subLabel) && (
        <div className="flex flex-col text-left">
          {label && <span className="text-sm font-medium text-[#0E1520]">{label}</span>}
          {subLabel && <span className="text-xs text-[#6B7587]">{subLabel}</span>}
        </div>
      )}
    </label>
  );
};


