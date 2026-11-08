'use client';

import React from 'react';
import { Tooltip } from './Tooltip';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      icon,
      label,
      variant = 'ghost',
      size = 'md',
      active = false,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const sizeClasses = {
      sm: 'w-7 h-7 text-xs rounded-md',
      md: 'w-8 h-8 text-sm rounded-lg',
      lg: 'w-10 h-10 text-base rounded-xl',
    }[size];

    const variantClasses = {
      primary: 'bg-[#2B59FF] text-white hover:bg-[#2047E0] border border-transparent',
      secondary:
        'bg-white text-[#0E1520] hover:bg-[#F0F2F5] active:bg-[#E9ECF1] border border-[#CBD1DA]',
      ghost: active
        ? 'bg-[#E8EEFF] text-[#2B59FF] font-semibold border border-[#C5D5FF]'
        : 'bg-transparent text-[#475266] hover:bg-[#F0F2F5] hover:text-[#0E1520] border border-transparent',
      danger: 'bg-transparent text-[#E0314A] hover:bg-[#FDF0F2] border border-transparent',
    }[variant];

    const btn = (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        disabled={disabled}
        className={`inline-flex items-center justify-center transition-all duration-150 select-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-[#2B59FF] focus-visible:outline-offset-2 ${sizeClasses} ${variantClasses} ${className}`}
        {...props}
      >
        {icon}
      </button>
    );

    return <Tooltip content={label}>{btn}</Tooltip>;
  }
);

IconButton.displayName = 'IconButton';

