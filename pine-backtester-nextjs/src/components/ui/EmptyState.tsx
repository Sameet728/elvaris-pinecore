import React from 'react';

export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center rounded-xl bg-white border border-[#E2E5EA] ${className}`}
    >
      <div className="w-12 h-12 rounded-xl bg-[#F0F2F5] text-[#475266] flex items-center justify-center mb-3">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-[#0E1520]">{title}</h3>
      {description && (
        <p className="text-xs text-[#6B7587] max-w-sm mt-1 leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};

