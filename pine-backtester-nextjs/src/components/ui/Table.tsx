import React from 'react';

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  children: React.ReactNode;
}

export const Table: React.FC<TableProps> = ({ children, className = '', ...props }) => {
  return (
    <div className="w-full overflow-x-auto border border-[#E2E5EA] rounded-xl bg-white shadow-2xs">
      <table className={`w-full text-left text-xs border-collapse ${className}`} {...props}>
        {children}
      </table>
    </div>
  );
};

export const TableHeader: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <thead
      className={`sticky top-0 z-10 bg-[#F0F2F5] text-[#475266] uppercase tracking-wider text-[11px] font-semibold border-b border-[#E2E5EA] select-none ${className}`}
      {...props}
    >
      {children}
    </thead>
  );
};

export const TableBody: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <tbody className={`divide-y divide-[#E2E5EA] text-[#0E1520] ${className}`} {...props}>
      {children}
    </tbody>
  );
};

export const TableRow: React.FC<
  React.HTMLAttributes<HTMLTableRowElement> & { isSelected?: boolean }
> = ({ children, isSelected, className = '', ...props }) => {
  return (
    <tr
      className={`transition-colors duration-100 even:bg-[#F9FAFB] hover:bg-[#F0F2F5] ${isSelected ? 'bg-[#E8EEFF]! font-medium' : ''
        } ${className}`}
      {...props}
    >
      {children}
    </tr>
  );
};

export const TableHead: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <th className={`px-3.5 py-2.5 font-semibold ${className}`} {...props}>
      {children}
    </th>
  );
};

export const TableCell: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <td className={`px-3.5 py-2.5 text-xs whitespace-nowrap ${className}`} {...props}>
      {children}
    </td>
  );
};


