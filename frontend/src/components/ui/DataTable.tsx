import React, { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
  render?: (row: T, index: number) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedId?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
  isCompact?: boolean;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  selectedId,
  emptyTitle = 'No data records found',
  emptyDescription = 'There are no active records matching this operational view.',
  className,
  isCompact = false,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortKey(null);
      }
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const sortedData = useMemo(() => {
    if (!sortKey) return data;

    return [...data].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortKey];
      const bVal = (b as Record<string, unknown>)[sortKey];

      if (aVal === bVal) return 0;
      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();

      return sortDirection === 'asc'
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr);
    });
  }, [data, sortKey, sortDirection]);

  if (data.length === 0) {
    return (
      <div className="p-6 border border-command-border rounded-[2px] bg-command-panel">
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  return (
    <div className={cn('w-full overflow-x-auto border border-command-border rounded-[2px]', className)}>
      <table className="w-full text-left border-collapse select-none">
        <thead className="sticky top-0 z-10">
          <tr className="bg-command-bg border-b border-command-border text-[10px] font-mono font-semibold text-command-muted uppercase tracking-wider">
            {columns.map((col) => (
              <th
                key={col.key}
                style={{ width: col.width }}
                className={cn(
                  'px-2.5 py-1.5 font-medium',
                  col.sortable && 'cursor-pointer hover:text-command-primary',
                  col.align === 'center' && 'text-center',
                  col.align === 'right' && 'text-right',
                )}
                onClick={() => col.sortable && handleSort(col.key)}
              >
                <div
                  className={cn(
                    'inline-flex items-center gap-1.5',
                    col.align === 'center' && 'justify-center',
                    col.align === 'right' && 'justify-end',
                  )}
                >
                  <span>{col.label}</span>
                  {col.sortable && (
                    <span className="text-command-subdued">
                      {sortKey === col.key ? (
                        sortDirection === 'asc' ? (
                          <ArrowUp className="w-3 h-3 text-command-primary" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-command-primary" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-40" />
                      )}
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-command-border/40 text-xs font-mono tabular-nums">
          {sortedData.map((row, index) => {
            const rowId = keyExtractor(row);
            const isSelected = selectedId === rowId;

            return (
              <tr
                key={rowId}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  'transition-none',
                  isSelected
                    ? 'bg-command-raised border-l-[3px] border-l-command-primary text-command-heading'
                    : 'bg-command-panel/70 hover:bg-command-raised/50 text-command-text',
                  onRowClick && 'cursor-pointer',
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      isCompact ? 'px-2 py-1' : 'px-2.5 py-1.5',
                      col.align === 'center' && 'text-center',
                      col.align === 'right' && 'text-right',
                    )}
                  >
                    {col.render ? (
                      col.render(row, index)
                    ) : (
                      <span className="text-xs">
                        {String((row as Record<string, unknown>)[col.key] ?? '—')}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
