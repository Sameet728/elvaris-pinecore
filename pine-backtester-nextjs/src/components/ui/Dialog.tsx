'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 'md',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const widthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  }[maxWidth];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        className={`w-full bg-white rounded-2xl border border-[#CBD1DA] shadow-xl overflow-hidden flex flex-col max-h-[90vh] ${widthClasses}`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E5EA]">
          <div>
            <h2 className="text-base font-semibold text-[#0E1520]">{title}</h2>
            {description && (
              <p className="text-xs text-[#6B7587] mt-0.5">{description}</p>
            )}
          </div>
          <IconButton icon={<X size={16} />} label="Close dialog" onClick={onClose} size="sm" />
        </div>

        <div className="p-5 overflow-y-auto flex-1 text-sm text-[#475266]">
          {children}
        </div>

        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 py-3.5 bg-[#F0F2F5]/60 border-t border-[#E2E5EA]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export const DialogContent: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={className}>{children}</div>
);

