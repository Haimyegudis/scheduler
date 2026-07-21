'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { COLOR_TOKENS, COLOR_CLASSES, type ColorToken } from '@/lib/cellColors';
import { useT, type DictKey } from '@/lib/i18n';

// Small presentational popover for picking a preset cell color on the admin board.
// Rendered through a portal at a fixed viewport position (captured from the trigger
// button's bounding rect when opened) so it never gets clipped by the board's
// horizontally-scrolling container, and closes on outside click / Escape / scroll.
export default function ColorPopover({
  anchorRect,
  pendingColor,
  colorNameKeys,
  onPick,
  onClear,
  onApplyRow,
  onClearRow,
  onApplyColumn,
  onClearColumn,
  onClose,
}: {
  anchorRect: { top: number; bottom: number; left: number; right: number };
  pendingColor: string | null;
  colorNameKeys: Record<ColorToken, DictKey>;
  onPick: (token: ColorToken) => void;
  onClear: () => void;
  onApplyRow: () => void;
  onClearRow: () => void;
  onApplyColumn: () => void;
  onClearColumn: () => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const width = 200;
    const margin = 8;
    let left = anchorRect.left;
    if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin;
    if (left < margin) left = margin;
    setPos({ top: anchorRect.bottom + 6, left });
  }, [anchorRect]);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  if (!pos || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={popRef}
      role="dialog"
      aria-label={t('colorPickerLabel')}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: 200 }}
      className="z-50 space-y-1.5 rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-xl backdrop-blur-sm animate-fade-up"
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-600">{t('colorPickerLabel')}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('closeLabel')}
          className="rounded p-0.5 leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          ✕
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1.5 py-1">
        {COLOR_TOKENS.map(tok => (
          <button
            key={tok}
            type="button"
            aria-label={t(colorNameKeys[tok])}
            onClick={() => onPick(tok)}
            className={`h-7 w-7 rounded-lg ${COLOR_CLASSES[tok]} transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 ${
              pendingColor === tok ? 'ring-2 ring-brand-600 ring-offset-1' : ''
            }`}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={onClear}
        className="w-full rounded-lg px-2 py-1 text-start text-slate-600 hover:bg-slate-100"
      >
        {t('clearColorBtn')}
      </button>
      <hr className="border-slate-100" />
      <button
        type="button"
        disabled={!pendingColor}
        onClick={onApplyRow}
        className="w-full rounded-lg px-2 py-1 text-start text-slate-600 hover:bg-slate-100 disabled:opacity-40"
      >
        {t('applyRowColorBtn')}
      </button>
      <button
        type="button"
        onClick={onClearRow}
        className="w-full rounded-lg px-2 py-1 text-start text-slate-600 hover:bg-slate-100"
      >
        {t('clearRowColorBtn')}
      </button>
      <hr className="border-slate-100" />
      <button
        type="button"
        disabled={!pendingColor}
        onClick={onApplyColumn}
        className="w-full rounded-lg px-2 py-1 text-start text-slate-600 hover:bg-slate-100 disabled:opacity-40"
      >
        {t('applyColumnColorBtn')}
      </button>
      <button
        type="button"
        onClick={onClearColumn}
        className="w-full rounded-lg px-2 py-1 text-start text-slate-600 hover:bg-slate-100"
      >
        {t('clearColumnColorBtn')}
      </button>
    </div>,
    document.body
  );
}
