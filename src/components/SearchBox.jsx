import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const POPULAR = [
  "python programming",
  "machine learning",
  "artificial intelligence",
  "web development",
  "javascript tutorial",
  "open source projects",
  "cloud computing",
  "database design",
  "search engine algorithm",
  "data science",
];

const HISTORY_KEY = "nexus_history";

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(q) {
  const h = getHistory().filter((x) => x !== q);
  h.unshift(q);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 20)));
}

function getSuggestions(input) {
  const q = input.trim().toLowerCase();
  if (!q) return [];
  return [...new Set([...getHistory(), ...POPULAR])]
    .filter((s) => s.toLowerCase().startsWith(q) && s.toLowerCase() !== q)
    .slice(0, 6);
}

// SearchIcon SVG inline
const SearchIcon = ({ size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

/**
 * Reusable search box.
 * Props:
 *   initialValue  – pre-filled query string
 *   autoFocus     – whether to focus on mount
 *   compact       – smaller variant used in the results header
 *   onSearch(q)   – called when user submits a query
 */
export default function SearchBox({ initialValue = "", autoFocus = false, compact = false, onSearch }) {
  const [value, setValue] = useState(initialValue);
  const [suggestions, setSuggestions] = useState([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Sync when initialValue changes (navigating between result pages)
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const submit = (q) => {
    const trimmed = (q ?? value).trim();
    if (!trimmed) return;
    saveHistory(trimmed);
    setOpen(false);
    if (onSearch) {
      onSearch(trimmed);
    } else {
      navigate(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  };

  const handleChange = (e) => {
    const v = e.target.value;
    setValue(v);
    const s = getSuggestions(v);
    setSuggestions(s);
    setActiveIdx(-1);
    setOpen(s.length > 0);
  };

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === "Enter") submit();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(activeIdx + 1, suggestions.length - 1);
      setActiveIdx(next);
      setValue(suggestions[next]);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = activeIdx - 1;
      if (prev < 0) {
        setActiveIdx(-1);
        setValue(initialValue);
      } else {
        setActiveIdx(prev);
        setValue(suggestions[prev]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Enter") {
      setOpen(false);
      submit();
    }
  };

  const handleBlur = () => {
    setTimeout(() => setOpen(false), 150);
  };

  return (
    <div className={`search-box-container ${compact ? "compact" : ""}`}>
      <div className={`search-box-wrap ${open ? "open" : ""}`}>
        <span className="search-icon">
          <SearchIcon size={compact ? 18 : 20} />
        </span>
        <input
          ref={inputRef}
          className="search-input"
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            const s = getSuggestions(value);
            setSuggestions(s);
            setOpen(s.length > 0);
          }}
          onBlur={handleBlur}
          placeholder={compact ? "Search" : "Search the web"}
          aria-label="Search"
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck="false"
        />
        {value && (
          <button
            className="clear-btn"
            onClick={() => { setValue(""); setSuggestions([]); setOpen(false); inputRef.current?.focus(); }}
            aria-label="Clear"
          >
            ✕
          </button>
        )}
        {compact && (
          <button className="search-submit-btn" onClick={() => submit()} aria-label="Search">
            <SearchIcon size={18} />
          </button>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul className="suggestions-list" role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === activeIdx}
              className={i === activeIdx ? "active" : ""}
              onMouseDown={() => { setValue(s); submit(s); }}
            >
              <SearchIcon size={15} />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
