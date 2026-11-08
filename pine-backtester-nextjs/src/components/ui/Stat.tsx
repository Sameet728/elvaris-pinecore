import React from 'react';
import { Info } from 'lucide-react';
import { Tooltip } from './Tooltip';

export interface StatProps {
  label: string;
  value: React.ReactNode;
  subLabel?: React.ReactNode;
  delta?: {
    value: string;
    isPositive?: boolean;
    isNeutral?: boolean;
  };
  tooltip?: string;
  className?: string;
  variant?: 'default' | 'profit' | 'loss' | 'brand';
}

export const Stat: React.FC<StatProps> = ({
  label,
  value,
  subLabel,
  delta,
  tooltip,
  className = '',
  variant = 'default',
}) => {
  const valueColor = {
    default: 'text-[#0E1520]',
    profit: 'text-[#0A7A55]',
    loss: 'text-[#C0223A]',
    brand: 'text-[#2B59FF]',
  }[variant];

  return (
    <div className={`flex flex-col gap-1 p-3.5 sm:p-4 rounded-xl bg-white border border-[#E2E5EA] shadow-2xs ${className}`}>
      <div className="flex items-center justify-between gap-1.5 text-xs text-[#475266] font-medium">
        <span>{label}</span>
        {tooltip && (
          <Tooltip content={tooltip}>
            <button
              type="button"
              className="text-[#6B7587] hover:text-[#0E1520] transition-colors cursor-help inline-flex p-0.5 rounded"
              aria-label={`Definition of ${label}`}
            >
              <Info size={13} />
            </button>
          </Tooltip>
        )}
      </div>

      <div className="flex items-baseline gap-2 mt-0.5">
        <span className={`text-xl sm:text-2xl font-bold tracking-tight tabular-nums font-mono ${valueColor}`}>
          {value}
        </span>
        {delta && (
          <span
            className={`text-xs font-semibold font-mono tabular-nums px-1.5 py-0.5 rounded ${delta.isNeutral
                ? 'bg-[#F0F2F5] text-[#475266]'
                : delta.isPositive
                  ? 'bg-[#EBF7F2] text-[#0A7A55]'
                  : 'bg-[#FDF0F2] text-[#C0223A]'
              }`}
          >
            {delta.value}
          </span>
        )}
      </div>

      {subLabel && (
        <div className="text-[11px] text-[#6B7587] font-mono leading-tight mt-0.5">
          {subLabel}
        </div>
      )}
    </div>
  );
};


