'use client';

import React from 'react';

export interface NumberFieldProps {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
  disabled?: boolean;
}

export const NumberField: React.FC<NumberFieldProps> = ({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  prefix,
  className = '',
  disabled,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parseFloat(e.target.value);
    if (!isNaN(parsed)) {
      if (min !== undefined && parsed < min) onChange(min);
      else if (max !== undefined && parsed > max) onChange(max);
      else onChange(parsed);
    } else {
      onChange(0);
    }
  };

  return (
    <div className={`flex flex-col gap-1 w-full text-left ${className}`}>
      {label && (
        <label className="text-xs font-medium text-[#475266]">{label}</label>
      )}
      <div className="relative flex items-center w-full">
        {prefix && (
          <span className="absolute left-2.5 text-xs text-[#6B7587] font-mono pointer-events-none">
            {prefix}
          </span>
        )}
        <input
          type="number"
          value={isNaN(value) ? '' : value}
          onChange={handleChange}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          className={`w-full h-9 rounded-lg bg-white border border-[#CBD1DA] hover:border-[#9FAAB9] text-sm font-mono tabular-nums text-[#0E1520] transition-all duration-150 disabled:bg-[#F0F2F5] disabled:cursor-not-allowed ${prefix ? 'pl-7' : 'pl-3'
            } ${suffix ? 'pr-9' : 'pr-3'
            } focus:border-[#2B59FF] focus:ring-2 focus:ring-[#2B59FF]/20 outline-hidden`}
        />
        {suffix && (
          <span className="absolute right-2.5 text-xs text-[#6B7587] font-mono pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
};


