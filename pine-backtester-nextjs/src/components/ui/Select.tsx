'use client';

import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  label?: string;
  error?: string;
}

export const Select: React.FC<SelectProps> = ({
  options,
  label,
  error,
  value,
  onChange,
  className = '',
  disabled,
  ...props
}) => {
  return (
    <div className="flex flex-col gap-1 w-full text-left">
      {label && (
        <label className="text-xs font-medium text-[#475266]">{label}</label>
      )}
      <div className="relative flex items-center w-full">
        <select
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={`w-full h-9 rounded-lg bg-white border border-[#CBD1DA] hover:border-[#9FAAB9] text-sm text-[#0E1520] pl-3 pr-8 appearance-none transition-all duration-150 disabled:bg-[#F0F2F5] disabled:cursor-not-allowed focus:border-[#2B59FF] focus:ring-2 focus:ring-[#2B59FF]/20 outline-hidden cursor-pointer ${className}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="absolute right-2.5 text-[#6B7587] pointer-events-none"
        />
      </div>
      {error && <span className="text-[11px] text-[#C0223A] font-medium">{error}</span>}
    </div>
  );
};

