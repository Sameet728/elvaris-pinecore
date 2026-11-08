'use client';

import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  error?: string;
  label?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ leftIcon, rightIcon, error, label, className = '', disabled, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1 w-full text-left">
        {label && (
          <label className="text-xs font-medium text-[#475266]">{label}</label>
        )}
        <div className="relative flex items-center w-full">
          {leftIcon && (
            <span className="absolute left-2.5 text-[#6B7587] pointer-events-none shrink-0">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            disabled={disabled}
            className={`w-full h-9 rounded-lg bg-white border text-sm text-[#0E1520] placeholder-[#6B7587] transition-all duration-150 disabled:bg-[#F0F2F5] disabled:cursor-not-allowed ${leftIcon ? 'pl-8' : 'pl-3'
              } ${rightIcon ? 'pr-8' : 'pr-3'} ${error
                ? 'border-[#E0314A] focus:border-[#E0314A] focus:ring-2 focus:ring-[#E0314A]/20'
                : 'border-[#CBD1DA] hover:border-[#9FAAB9] focus:border-[#2B59FF] focus:ring-2 focus:ring-[#2B59FF]/20'
              } outline-hidden ${className}`}
            {...props}
          />
          {rightIcon && (
            <span className="absolute right-2.5 text-[#6B7587] shrink-0">
              {rightIcon}
            </span>
          )}
        </div>
        {error && <span className="text-[11px] text-[#C0223A] font-medium">{error}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';


