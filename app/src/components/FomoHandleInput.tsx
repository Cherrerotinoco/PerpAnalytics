import { useState, useRef, useEffect, useCallback, useId } from 'react';
import {
  fetchFomoSuggestions,
  avatarColor,
  avatarInitial,
  HandleSuggestion,
} from '../utils/fomoSuggest';

/**
 * FOMO username field with autocomplete over already-cached handles.
 *
 * Suggestions are free (they come from our own cache), but the request is still
 * debounced: one query per keystroke would be wasted work and would eat into the
 * server's per-minute request allowance for no benefit.
 */

const DEBOUNCE_MS = 250;

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Fired when a suggestion is picked, so the parent can search immediately. */
  onPick: (suggestion: HandleSuggestion) => void;
  /**
   * A handle the parent has already resolved — from a recent-user chip or a
   * shared `?user=` link. Suggesting against it would be a request whose only
   * possible answer is the thing already on screen.
   */
  settledHandle?: string | null;
  inputId?: string;
  disabled?: boolean;
}

export const FomoHandleInput = ({
  value,
  onChange,
  onPick,
  settledHandle = null,
  inputId = 'wallet',
  disabled,
}: Props) => {
  const [suggestions, setSuggestions] = useState<HandleSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const wrapRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Set while a suggestion is being applied, so the resulting value change does
  // not immediately re-open the list with the thing just chosen.
  const justPickedRef = useRef(false);
  const listboxId = useId();

  // ── Debounced fetch ────────────────────────────────────────────────────────
  useEffect(() => {
    if (justPickedRef.current) {
      justPickedRef.current = false;
      return;
    }
    const q = value.trim().replace(/^@/, '');
    if (!q || q.toLowerCase() === settledHandle?.toLowerCase()) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      fetchFomoSuggestions(q, { signal: controller.signal })
        .then((items) => {
          setSuggestions(items);
          setActiveIndex(-1);
          // A single exact match is not worth a dropdown over.
          const onlyExact = items.length === 1 && items[0].handle.toLowerCase() === q.toLowerCase();
          setOpen(items.length > 0 && !onlyExact);
        })
        .catch(() => {
          // Aborted or offline: autocomplete simply stays quiet.
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value, settledHandle]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // ── Close on outside click ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const pick = useCallback(
    (suggestion: HandleSuggestion) => {
      justPickedRef.current = true;
      onChange(suggestion.handle);
      setOpen(false);
      setSuggestions([]);
      setActiveIndex(-1);
      onPick(suggestion);
    },
    [onChange, onPick]
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) {
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((i) => (i + delta + suggestions.length) % suggestions.length);
      return;
    }
    if (e.key === 'Enter' && activeIndex >= 0) {
      // Only swallow Enter when a suggestion is highlighted, so the form can
      // still be submitted normally with whatever has been typed.
      e.preventDefault();
      pick(suggestions[activeIndex]);
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div className="tc-handle-input-wrap" ref={wrapRef}>
      <span className="tc-handle-prefix" aria-hidden="true">
        @
      </span>
      <input
        id={inputId}
        type="text"
        name="fomo-user"
        className="tc-input tc-handle-input"
        placeholder="FOMO username…"
        required
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
      />

      {open && suggestions.length > 0 && (
        <ul className="tc-suggest-list" id={listboxId} role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s.handle}
              id={`${listboxId}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={`tc-suggest-item${i === activeIndex ? ' tc-suggest-item--active' : ''}`}
              // mousedown, not click: the input's blur would close the list first.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span
                className="tc-suggest-avatar"
                style={{ backgroundColor: avatarColor(s.handle) }}
              >
                {avatarInitial(s.handle)}
              </span>
              <span className="tc-suggest-handle">@{s.handle}</span>
              <span className="tc-suggest-meta">{s.evm ? 'perps' : 'spot'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default FomoHandleInput;
