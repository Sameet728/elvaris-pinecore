import React from 'react';

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

export const Kbd: React.FC<KbdProps> = ({ children, className = '', ...props }) => {
  return (
    <kbd
      className={`inline-flex items-center justify-center font-mono text-[11px] px-1.5 py-0.5 rounded-md bg-[#F0F2F5] text-[#475266] border border-[#CBD1DA] shadow-2xs font-semibold select-none ${className}`}
      {...props}
    >
      {children}
    </kbd>
  );
};

