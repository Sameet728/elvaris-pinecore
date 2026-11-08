'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'brand' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      children,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const sizeClasses = {
      sm: 'h-8 px-2.5 text-xs gap-1.5 rounded-lg',
      md: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
      lg: 'h-11 px-5 text-base gap-2.5 rounded-xl',
    }[size];

    const variantClasses = {
      primary:
        'bg-[#2B59FF] text-white hover:bg-[#2047E0] active:bg-[#1A38B8] shadow-xs border border-transparent font-medium',
      brand:
        'bg-[#2B59FF] text-white hover:bg-[#2047E0] active:bg-[#1A38B8] shadow-xs border border-transparent font-medium',
      secondary:
        'bg-white text-[#0E1520] hover:bg-[#F0F2F5] active:bg-[#E9ECF1] border border-[#CBD1DA] shadow-2xs font-medium',
      ghost:
        'bg-transparent text-[#475266] hover:bg-[#F0F2F5] hover:text-[#0E1520] active:bg-[#E9ECF1] font-medium border border-transparent',
      danger:
        'bg-[#E0314A] text-white hover:bg-[#C0223A] active:bg-[#A3182E] shadow-xs border border-transparent font-medium',
      outline:
        'bg-white text-[#0E1520] hover:bg-[#F0F2F5] active:bg-[#E9ECF1] border border-[#CBD1DA] shadow-2xs font-medium',
    }[variant];

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`inline-flex items-center justify-center font-sans tracking-tight transition-all duration-150 select-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#2B59FF] focus-visible:outline-offset-2 ${sizeClasses} ${variantClasses} ${className}`}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-current" />
        ) : (
          leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>
        )}
        <span>{children}</span>
        {!isLoading && rightIcon && (
          <span className="inline-flex shrink-0">{rightIcon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

