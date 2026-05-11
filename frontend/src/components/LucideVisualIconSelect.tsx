import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { CategoryGlyph } from './categoryIconCatalog';
import { ALL_LUCIDE_ICON_ENTRIES } from '../lib/lucideDynamicRegistry';
import {
  getResolvedLucideIcon,
  isLucideIconCacheComplete,
  prefetchAllLucideIcons,
} from '../lib/lucideIconCache';
import { useTranslation } from 'react-i18next';

export function LucideVisualIconSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const normalized = value?.trim() || 'Tag';
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  /** Cuando está en true, los componentes SVG ya están resueltos en memoria (chunks locales del bundle). */
  const [cacheReady, setCacheReady] = useState(isLucideIconCacheComplete);

  const panelScrollRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const btnId = useId();
  const listId = useId();

  const filteredEntries = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return ALL_LUCIDE_ICON_ENTRIES;
    return ALL_LUCIDE_ICON_ENTRIES.filter(
      (row) =>
        row.pascal.toLowerCase().includes(q) || row.kebab.toLowerCase().includes(q.replace(/\s+/g, '-'))
    );
  }, [filter]);

  useEffect(() => {
    let alive = true;
    const finish = () => {
      prefetchAllLucideIcons().then(() => {
        if (alive) setCacheReady(true);
      });
    };

    if (isLucideIconCacheComplete()) {
      setCacheReady(true);
      return () => {
        alive = false;
      };
    }

    let idleHandle: number | undefined;
    let cancelTimeout: (() => void) | undefined;
    if (typeof window.requestIdleCallback === 'function') {
      idleHandle = window.requestIdleCallback(finish, { timeout: 3000 });
    } else {
      const id = window.setTimeout(finish, 450);
      cancelTimeout = () => window.clearTimeout(id);
    }
    return () => {
      alive = false;
      if (idleHandle !== undefined) window.cancelIdleCallback(idleHandle);
      cancelTimeout?.();
    };
  }, []);

  useEffect(() => {
    if (!cacheReady && open) {
      void prefetchAllLucideIcons().then(() => setCacheReady(true));
    }
  }, [open, cacheReady]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, []);

  useEffect(() => {
    if (!open) return;
    const panel = wrapperRef.current;
    if (!panel) return;
    const onPointerDownCapture = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && !panel.contains(t)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDownCapture, true);
    return () => document.removeEventListener('pointerdown', onPointerDownCapture, true);
  }, [open]);

  useEffect(() => {
    if (open && panelScrollRef.current) panelScrollRef.current.scrollTop = 0;
    if (!open) setFilter('');
  }, [open]);

  const glyphProps = useMemo<{ className?: string; strokeWidth?: number }>(
    () => ({
      className: 'h-6 w-6 shrink-0 pointer-events-none',
      strokeWidth: 1.8,
    }),
    []
  );

  const toggleOpen = () => {
    if (disabled) return;
    setOpen((v) => !v);
  };

  return (
    <div ref={wrapperRef} className="relative flex w-full flex-1 items-stretch gap-2">
      <div
        className="flex h-[42px] w-11 shrink-0 items-center justify-center rounded-lg border border-dark-600 bg-dark-800 text-dark-200"
        aria-hidden
      >
        <CategoryGlyph iconKey={normalized} className="h-5 w-5 shrink-0" strokeWidth={1.8} />
      </div>

      <div className="relative min-h-[42px] min-w-0 flex-1">
        <button
          id={btnId}
          type="button"
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? listId : undefined}
          onClick={toggleOpen}
          className="input flex w-full min-h-[42px] items-center justify-between gap-2 pr-10 text-left"
        >
          <span className="truncate tabular-nums text-dark-100">{normalized}</span>
          <ChevronDown
            className={[open ? 'rotate-180' : '', 'h-5 w-5 shrink-0 text-dark-400 transition-transform'].join(' ')}
            aria-hidden
          />
        </button>

        {open ? (
          <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-dark-600 bg-dark-900 shadow-2xl shadow-black/60">
            <div className="border-b border-dark-600 px-3 py-2">
              <input
                type="search"
                autoFocus
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t('common.iconSelect.searchPlaceholder')}
                className="w-full rounded-lg border border-dark-600 bg-dark-800 px-3 py-2 text-sm text-white placeholder-dark-500 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-600/60"
              />
            </div>
            <div
              ref={panelScrollRef}
              id={listId}
              role="listbox"
              aria-labelledby={btnId}
              className="max-h-[min(60vh,440px)] overflow-y-auto overscroll-contain px-3 py-3"
            >
              {!cacheReady ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-dark-400">
                  <div className="h-9 w-9 animate-spin rounded-full border-2 border-dark-600 border-t-primary-500" />
                  <span className="text-sm text-dark-400">{t('common.iconSelect.loading')}</span>
                </div>
              ) : (
                <>
                  <div className="mb-3 px-1 text-[0.7rem] text-dark-400">
                    {t('common.iconSelect.optionsCount', { count: filteredEntries.length })}
                  </div>
                  <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-9 lg:grid-cols-11">
                    {filteredEntries.map((row) => {
                      const Icon = getResolvedLucideIcon(row.kebab);
                      if (!Icon) return null;
                      const selected = normalized === row.pascal;
                      return (
                        <button
                          key={row.kebab}
                          type="button"
                          title={row.pascal}
                          aria-label={row.pascal}
                          aria-selected={selected}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            onChange(row.pascal);
                            setOpen(false);
                          }}
                          className={[
                            'rounded-md p-2 flex items-center justify-center transition-colors shrink-0',
                            selected
                              ? 'bg-primary-600 text-white ring-2 ring-primary-300'
                              : 'bg-dark-700 text-dark-200 hover:bg-dark-600',
                          ].join(' ')}
                        >
                          <Icon {...glyphProps} />
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
