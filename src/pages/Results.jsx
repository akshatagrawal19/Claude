import { useEffect, useState, useCallback } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import SearchBox from "../components/SearchBox";
import ResultItem from "../components/ResultItem";

const PER_PAGE = 10;

function Logo() {
  return (
    <Link to="/" className="results-logo">
      <span className="logo-n">N</span>
      <span className="logo-e">e</span>
      <span className="logo-x">x</span>
      <span className="logo-u">u</span>
      <span className="logo-s">s</span>
    </Link>
  );
}

export default function Results() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));

  const [allResults, setAllResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Index URL widget state
  const [indexUrl, setIndexUrl] = useState("");
  const [indexStatus, setIndexStatus] = useState(null);

  const navigate = useNavigate();

  // Fetch results whenever query changes
  useEffect(() => {
    if (!query) {
      setAllResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/search?q=${encodeURIComponent(query)}&n=50`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setAllResults(data.results || []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [query]);

  // Reset to page 1 when query changes
  useEffect(() => {
    if (searchParams.get("page") && searchParams.get("page") !== "1") {
      setSearchParams({ q: query, page: "1" }, { replace: true });
    }
  }, [query]); // eslint-disable-line

  const handleSearch = useCallback(
    (q) => navigate(`/search?q=${encodeURIComponent(q)}`),
    [navigate]
  );

  const goPage = (n) => setSearchParams({ q: query, page: String(n) });

  const pageResults = allResults.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const total = allResults.length;
  const hasPrev = page > 1;
  const hasNext = page * PER_PAGE < total;

  const submitUrl = async () => {
    if (!indexUrl.trim()) return;
    setIndexStatus({ type: "loading", msg: "Indexing…" });
    try {
      const res = await fetch("/api/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: indexUrl.trim() }),
      });
      const data = await res.json();
      if (data.status === "indexed") {
        setIndexStatus({ type: "ok", msg: `✅ Indexed: ${data.title}` });
        setIndexUrl("");
      } else {
        setIndexStatus({ type: "err", msg: `❌ ${data.error || "Unknown error"}` });
      }
    } catch {
      setIndexStatus({ type: "err", msg: "❌ Network error" });
    }
  };

  return (
    <div className="results-body">
      {/* ── Header ────────────────────────────────────── */}
      <header className="results-header">
        <Logo />
        <SearchBox compact initialValue={query} onSearch={handleSearch} />
        <nav className="results-nav-right">
          <a href="/api/stats" className="nav-link" target="_blank" rel="noopener">Stats</a>
        </nav>
      </header>

      {/* ── Filter bar ────────────────────────────────── */}
      <div className="filter-bar">
        <span className="filter-tab active">All</span>
      </div>

      {/* ── Body ──────────────────────────────────────── */}
      <div className="results-container">
        <main className="results-main">

          {loading && <p className="result-count">Searching…</p>}
          {error && <p className="result-count error-text">Error: {error}</p>}

          {!loading && !error && query && (
            <p className="result-count">
              About <strong>{total}</strong> result{total !== 1 ? "s" : ""} for{" "}
              <em>{query}</em>
            </p>
          )}

          {!loading && !error && pageResults.length > 0 && (
            <ol className="result-list">
              {pageResults.map((r) => (
                <ResultItem key={r.url} {...r} />
              ))}
            </ol>
          )}

          {!loading && !error && query && pageResults.length === 0 && (
            <div className="no-results">
              <div className="no-results-icon">🔍</div>
              <h2>No results for <em>{query}</em></h2>
              <p>Try different keywords, or add a page to the index below.</p>
              <div className="no-results-tips">
                <h3>Suggestions:</h3>
                <ul>
                  <li>Check your spelling</li>
                  <li>Try more general keywords</li>
                  <li>Add pages via the index widget below</li>
                </ul>
              </div>
              <Link to="/" className="btn-primary">Back to Search</Link>
            </div>
          )}

          {/* Pagination */}
          {(hasPrev || hasNext) && (
            <nav className="pagination">
              {hasPrev && (
                <button className="page-btn" onClick={() => goPage(page - 1)}>
                  ← Previous
                </button>
              )}
              <span className="page-info">Page {page}</span>
              {hasNext && (
                <button className="page-btn" onClick={() => goPage(page + 1)}>
                  Next →
                </button>
              )}
            </nav>
          )}

        </main>
      </div>

      {/* ── Add URL widget ─────────────────────────────── */}
      <div className="index-widget">
        <details>
          <summary>➕ Add a URL to the index</summary>
          <div className="index-form">
            <input
              type="url"
              value={indexUrl}
              onChange={(e) => setIndexUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitUrl()}
              placeholder="https://example.com"
              className="index-input"
            />
            <button onClick={submitUrl} className="btn-primary small">
              Index it
            </button>
            {indexStatus && (
              <span
                className="index-status"
                style={{ color: indexStatus.type === "ok" ? "#188038" : indexStatus.type === "err" ? "#d93025" : "#5f6368" }}
              >
                {indexStatus.msg}
              </span>
            )}
          </div>
        </details>
      </div>

      <footer className="results-footer">
        <Link to="/" className="footer-link">Nexus Search</Link>
        <a href="#" className="footer-link">Privacy</a>
        <a href="#" className="footer-link">Terms</a>
      </footer>
    </div>
  );
}
