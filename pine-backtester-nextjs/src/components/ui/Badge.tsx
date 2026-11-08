import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'profit' | 'loss' | 'warn' | 'neutral' | 'brand';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'md',
  children,
  className = '',
  ...props
}) => {
  const sizeClasses = {
    sm: 'text-[11px] px-1.5 py-0.5 rounded-md font-medium',
    md: 'text-xs px-2.5 py-1 rounded-lg font-medium',
  }[size];

  const variantClasses = {
    profit: 'bg-[#EBF7F2] text-[#0A7A55] border border-[#BDE8D6]',
    loss: 'bg-[#FDF0F2] text-[#C0223A] border border-[#F8C8CE]',
    warn: 'bg-[#FEF8EC] text-[#9A6200] border border-[#FBE3B8]',
    neutral: 'bg-[#F0F2F5] text-[#475266] border border-[#E2E5EA]',
    brand: 'bg-[#E8EEFF] text-[#2B59FF] border border-[#C5D5FF]',
  }[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-sans leading-none tracking-tight whitespace-nowrap ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};

