'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Check, CircleDashed, HelpCircle, Search, X } from 'lucide-react';
import { calculateColumns, type WordStatus } from '../lib/progress';

export type WordEntry = { id: number; lemma: string; rank: number; zipf: number };
export type OverviewFilter = 'all' | 'unmarked' | 'known' | 'unknown';

const FILTERS: { id: OverviewFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unmarked', label: 'Unmarked' },
  { id: 'known', label: 'Known' },
  { id: 'unknown', label: 'Unknown' },
];

function statusName(status: WordStatus) {
  if (status === 1) return 'Known';
  if (status === 2) return 'Unknown';
  return 'Unmarked';
}

function StatusIcon({ status }: { status: WordStatus }) {
  if (status === 1) return <Check aria-hidden="true" size={15} strokeWidth={2.7} />;
  if (status === 2) return <HelpCircle aria-hidden="true" size={15} strokeWidth={2.4} />;
  return <CircleDashed aria-hidden="true" size={15} strokeWidth={2} />;
}

export function Overview({
  words,
  statuses,
  onOpenWord,
}: {
  words: WordEntry[];
  statuses: Uint8Array;
  onOpenWord: (index: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<OverviewFilter>('all');
  const [width, setWidth] = useState(900);
  const scrollRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = measureRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const filteredWords = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return words.filter((word) => {
      const status = statuses[word.id] as WordStatus;
      const matchesFilter =
        filter === 'all' ||
        (filter === 'unmarked' && status === 0) ||
        (filter === 'known' && status === 1) ||
        (filter === 'unknown' && status === 2);
      return matchesFilter && (!normalized || word.lemma.includes(normalized));
    });
  }, [filter, query, statuses, words]);

  const columns = calculateColumns(width, width < 560 ? 116 : 146, 12);
  const rowCount = Math.ceil(filteredWords.length / columns);
  // TanStack Virtual manages its own mutable measurement cache.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 92,
    initialRect: { width, height: 600 },
    overscan: 4,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const visibleRows =
    rowCount <= 10
      ? Array.from({ length: rowCount }, (_, index) => ({ index, key: index, start: index * 92 }))
      : virtualRows.length > 0
        ? virtualRows
        : Array.from({ length: Math.min(rowCount, 10) }, (_, index) => ({ index, key: index, start: index * 92 }));
  const totalHeight = rowCount <= 10 ? rowCount * 92 : virtualizer.getTotalSize();

  return (
    <section className="overview-panel" aria-labelledby="overview-title">
      <div className="overview-heading">
        <div>
          <p className="eyebrow">THE WHOLE GARDEN</p>
          <h1 id="overview-title">Your word map</h1>
          <p>Search, filter, or tap any word to update it.</p>
        </div>
        <p className="results-count"><strong>{filteredWords.length.toLocaleString()}</strong> words</p>
      </div>

      <div className="overview-tools">
        <label className="search-box">
          <Search aria-hidden="true" size={18} />
          <span className="sr-only">Search words</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a word…"
            type="search"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
              <X aria-hidden="true" size={16} />
            </button>
          )}
        </label>
        <div className="filter-tabs" aria-label="Filter words">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={filter === item.id ? 'active' : ''}
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overview-scroll" ref={scrollRef} tabIndex={0} aria-label="Vocabulary word list">
        <div ref={measureRef} className="overview-measure">
          {filteredWords.length === 0 ? (
            <div className="empty-results">
              <span aria-hidden="true">✿</span>
              <h2>No words found</h2>
              <p>Try another search or filter.</p>
            </div>
          ) : (
            <div className="virtual-canvas" style={{ height: totalHeight }}>
              {visibleRows.map((virtualRow) => {
                const start = virtualRow.index * columns;
                const rowWords = filteredWords.slice(start, start + columns);
                return (
                  <div
                    className="virtual-row"
                    key={virtualRow.key}
                    style={{
                      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {rowWords.map((word) => {
                      const status = statuses[word.id] as WordStatus;
                      return (
                        <button
                          type="button"
                          className={`word-tile status-${status}`}
                          key={word.id}
                          onClick={() => onOpenWord(word.id)}
                          aria-label={`${word.lemma}, rank ${word.rank}, ${statusName(status)}`}
                        >
                          <span className="tile-rank">#{word.rank.toLocaleString()}</span>
                          <strong>{word.lemma}</strong>
                          <span className="tile-status"><StatusIcon status={status} /> {statusName(status)}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
