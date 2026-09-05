'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  itemLabel?: string;
  showPageNumbers?: boolean;
  disabled?: boolean;
  className?: string;
}

export function Pagination({
  currentPage,
  totalItems,
  pageSize,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
  itemLabel = 'items',
  showPageNumbers = true,
  disabled = false,
  className = '',
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = totalItems === 0 ? 0 : (validPage - 1) * pageSize + 1;
  const endIndex = Math.min(validPage * pageSize, totalItems);

  // Generate page numbers with smart ellipsis
  const pageNumbers: (number | string)[] = [];
  if (showPageNumbers) {
    const delta = 1;
    const range: number[] = [];
    for (
      let i = Math.max(2, validPage - delta);
      i <= Math.min(totalPages - 1, validPage + delta);
      i++
    ) {
      range.push(i);
    }

    if (validPage - delta > 2) {
      range.unshift(-1); // ellipsis placeholder
    }
    if (validPage + delta < totalPages - 1) {
      range.push(-2); // ellipsis placeholder
    }

    range.unshift(1);
    if (totalPages > 1) {
      range.push(totalPages);
    }

    // Deduplicate in case totalPages is small
    const seen = new Set<number>();
    for (const p of range) {
      if (p < 0 || !seen.has(p)) {
        if (p > 0) seen.add(p);
        pageNumbers.push(p < 0 ? '…' : p);
      }
    }
  }

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 bg-slate-900/60 rounded-xl border border-slate-800 text-xs text-slate-400 ${className}`}
    >
      {/* Left: Item count & optional page size selector */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-slate-400">
          Showing <strong className="text-slate-200">{startIndex}</strong>–
          <strong className="text-slate-200">{endIndex}</strong> of{' '}
          <strong className="text-slate-200">{totalItems}</strong> {itemLabel}
        </span>

        {onPageSizeChange && pageSizeOptions && pageSizeOptions.length > 0 && (
          <div className="flex items-center space-x-1.5 pl-2 border-l border-slate-800">
            <span className="text-slate-500 text-[11px]">Per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
              }}
              disabled={disabled}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 text-xs font-semibold focus:outline-none focus:border-blue-500 transition cursor-pointer disabled:opacity-50"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt} / page
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right: Page navigation buttons */}
      <div className="flex items-center space-x-1.5">
        <button
          onClick={() => onPageChange(validPage - 1)}
          disabled={validPage <= 1 || disabled}
          className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-slate-100 text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
          title="Previous page"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Previous</span>
        </button>

        {showPageNumbers ? (
          <div className="flex items-center space-x-1">
            {pageNumbers.map((p, idx) => {
              if (typeof p === 'string') {
                return (
                  <span key={`ellipsis-${idx}`} className="text-slate-600 px-1 text-xs select-none">
                    {p}
                  </span>
                );
              }
              const isCurrent = validPage === p;
              return (
                <button
                  key={p}
                  onClick={() => onPageChange(p)}
                  disabled={disabled}
                  className={`min-w-8 h-7 px-2 rounded-lg text-xs font-bold transition ${isCurrent
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                >
                  {p}
                </button>
              );
            })}
          </div>
        ) : (
          <span className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 font-mono text-slate-300">
            Page {validPage} of {totalPages}
          </span>
        )}

        <button
          onClick={() => onPageChange(validPage + 1)}
          disabled={validPage >= totalPages || disabled}
          className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-slate-100 text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
          title="Next page"
        >
          <span>Next</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
