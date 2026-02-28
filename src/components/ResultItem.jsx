export default function ResultItem({ url, title, description, score, inbound_links }) {
  let displayUrl;
  try {
    const parsed = new URL(url);
    displayUrl = parsed.hostname + parsed.pathname.replace(/\/$/, "");
  } catch {
    displayUrl = url;
  }

  return (
    <li className="result-item">
      <div className="result-url-row">
        <span className="result-favicon">🌐</span>
        <span className="result-domain">{displayUrl}</span>
      </div>
      <a className="result-title" href={url} target="_blank" rel="noopener noreferrer">
        {title}
      </a>
      <p className="result-snippet">{description}</p>
      <div className="result-meta">
        <span className="score-badge">Score: {score}</span>
        {inbound_links > 0 && (
          <span className="link-badge">
            ⬆ {inbound_links} link{inbound_links !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </li>
  );
}
