import { useState } from "react";
import { useNavigate } from "react-router-dom";
import SearchBox from "../components/SearchBox";

function Logo({ size = "large" }) {
  return (
    <div className={`logo-wrap ${size}`}>
      <span className="logo-n">N</span>
      <span className="logo-e">e</span>
      <span className="logo-x">x</span>
      <span className="logo-u">u</span>
      <span className="logo-s">s</span>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const [luckyLoading, setLuckyLoading] = useState(false);

  const handleSearch = (q) => {
    navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  const handleLucky = async () => {
    // Read current input value from URL params or local state isn't ideal here,
    // so we grab it from the DOM as a one-off (SearchBox owns the value).
    const input = document.querySelector(".search-input");
    const q = input?.value?.trim();
    if (!q) return;
    setLuckyLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&n=1`);
      const data = await res.json();
      if (data.results?.length > 0) {
        window.open(data.results[0].url, "_blank", "noopener,noreferrer");
      } else {
        navigate(`/search?q=${encodeURIComponent(q)}`);
      }
    } catch {
      navigate(`/search?q=${encodeURIComponent(q)}`);
    } finally {
      setLuckyLoading(false);
    }
  };

  return (
    <div className="home-body">
      <header className="home-header">
        <nav>
          <a href="#" className="nav-link">About</a>
          <a href="/api/stats" className="nav-link" target="_blank" rel="noopener">Stats</a>
        </nav>
      </header>

      <main className="home-main">
        <Logo />
        <p className="tagline">The open search engine</p>

        <SearchBox autoFocus onSearch={handleSearch} />

        <div className="home-btns">
          <button className="btn-primary" onClick={() => document.querySelector("form")?.requestSubmit?.() || handleSearch(document.querySelector(".search-input")?.value || "")}>
            Nexus Search
          </button>
          <button className="btn-secondary" onClick={handleLucky} disabled={luckyLoading}>
            {luckyLoading ? "Loading…" : "I'm Feeling Lucky"}
          </button>
        </div>
      </main>

      <footer className="home-footer">
        <div className="footer-left">United States</div>
        <div className="footer-links">
          <a href="#" className="footer-link">Privacy</a>
          <a href="#" className="footer-link">Terms</a>
          <a href="/api/stats" className="footer-link" target="_blank" rel="noopener">Index Stats</a>
        </div>
      </footer>
    </div>
  );
}
