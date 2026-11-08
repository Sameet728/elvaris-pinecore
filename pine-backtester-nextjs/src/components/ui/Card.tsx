import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'surface' | 'subtle' | 'bordered';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({
  variant = 'surface',
  padding = 'md',
  children,
  className = '',
  ...props
}) => {
  const variantClasses = {
    surface: 'bg-white border border-[#E2E5EA] shadow-2xs',
    subtle: 'bg-[#F0F2F5] border border-[#E2E5EA]',
    bordered: 'bg-transparent border border-[#CBD1DA]',
  }[variant];

  const paddingClasses = {
    none: 'p-0',
    sm: 'p-3',
    md: 'p-4 sm:p-5',
    lg: 'p-6 sm:p-7',
  }[padding];

  return (
    <div
      className={`rounded-xl transition-all duration-150 ${variantClasses} ${paddingClasses} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

