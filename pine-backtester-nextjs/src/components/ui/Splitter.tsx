'use client';

import React, { useState, useEffect, useRef } from 'react';

export interface SplitterProps {
  direction?: 'horizontal' | 'vertical';
  initialPrimarySize?: number; // e.g. 60 (for 60%)
  minPrimarySize?: number; // e.g. 25
  maxPrimarySize?: number; // e.g. 80
  storageKey?: string;
  primaryChild: React.ReactNode;
  secondaryChild: React.ReactNode;
  className?: string;
}

export const Splitter: React.FC<SplitterProps> = ({
  direction = 'vertical',
  initialPrimarySize = 60,
  minPrimarySize = 25,
  maxPrimarySize = 80,
  storageKey,
  primaryChild,
  secondaryChild,
  className = '',
}) => {
  const [size, setSize] = useState<number>(() => {
    if (storageKey && typeof window !== 'undefined') {
      const saved = localStorage.getItem(`splitter_${storageKey}`);
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= minPrimarySize && parsed <= maxPrimarySize) {
          return parsed;
        }
      }
    }
    return initialPrimarySize;
  });
  const isDraggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = direction === 'vertical' ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      let newPercent = 50;

      if (direction === 'vertical') {
        const offset = moveEvent.clientY - rect.top;
        newPercent = (offset / rect.height) * 100;
      } else {
        const offset = moveEvent.clientX - rect.left;
        newPercent = (offset / rect.width) * 100;
      }

      newPercent = Math.max(minPrimarySize, Math.min(maxPrimarySize, newPercent));
      setSize(newPercent);
      if (storageKey) {
        localStorage.setItem(`splitter_${storageKey}`, newPercent.toString());
      }
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = 'unset';
      document.body.style.userSelect = 'unset';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const isVertical = direction === 'vertical';

  return (
    <div
      ref={containerRef}
      className={`flex ${isVertical ? 'flex-col' : 'flex-row'} w-full h-full min-h-0 overflow-hidden ${className}`}
    >
      <div
        style={{
          [isVertical ? 'height' : 'width']: `${size}%`,
        }}
        className="min-h-0 min-w-0 overflow-hidden"
      >
        {primaryChild}
      </div>

      <div
        onMouseDown={handleMouseDown}
        className={`group shrink-0 flex items-center justify-center select-none bg-[#E2E5EA] hover:bg-[#2B59FF] transition-colors ${isVertical
            ? 'h-1.5 w-full cursor-row-resize'
            : 'w-1.5 h-full cursor-col-resize'
          }`}
      >
        <div
          className={`rounded-full bg-[#CBD1DA] group-hover:bg-white transition-colors ${isVertical ? 'h-0.5 w-8' : 'w-0.5 h-8'
            }`}
        />
      </div>

      <div
        style={{
          [isVertical ? 'height' : 'width']: `${100 - size}%`,
        }}
        className="min-h-0 min-w-0 overflow-hidden flex-1"
      >
        {secondaryChild}
      </div>
    </div>
  );
};


