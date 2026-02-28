"""
Web Crawler - Fetches and parses web pages for indexing.
Supports BFS crawling with depth limits and domain restrictions.
"""

import re
import time
import logging
import hashlib
import urllib.parse
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": (
        "SearchEngineBot/1.0 (+https://searchengine.local/bot)"
    )
}


@dataclass
class CrawledPage:
    url: str
    title: str
    description: str
    text: str
    links: list[str]
    status_code: int
    content_hash: str
    crawled_at: float = field(default_factory=time.time)


def _extract_text(soup: BeautifulSoup) -> str:
    """Extract visible text from a parsed page, removing scripts/styles."""
    for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
        tag.decompose()
    return " ".join(soup.get_text(separator=" ").split())


def _extract_description(soup: BeautifulSoup, text: str) -> str:
    """Return meta description or first 200 chars of body text."""
    meta = soup.find("meta", attrs={"name": re.compile("^description$", re.I)})
    if meta and meta.get("content"):
        return meta["content"].strip()
    return text[:200].strip()


def _extract_links(soup: BeautifulSoup, base_url: str) -> list[str]:
    """Return absolute URLs found in anchor tags."""
    links = []
    for tag in soup.find_all("a", href=True):
        href = tag["href"].strip()
        if href.startswith(("javascript:", "mailto:", "#")):
            continue
        absolute = urllib.parse.urljoin(base_url, href)
        parsed = urllib.parse.urlparse(absolute)
        if parsed.scheme in ("http", "https"):
            # Drop query fragments
            clean = urllib.parse.urlunparse(parsed._replace(fragment=""))
            links.append(clean)
    return links


def fetch_page(url: str, timeout: int = 10) -> Optional[CrawledPage]:
    """Fetch a single URL and return a CrawledPage, or None on failure."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=timeout, allow_redirects=True)
        content_type = resp.headers.get("content-type", "")
        if "text/html" not in content_type:
            return None

        soup = BeautifulSoup(resp.text, "lxml")
        title = soup.title.string.strip() if soup.title and soup.title.string else url
        text = _extract_text(soup)
        description = _extract_description(soup, text)
        links = _extract_links(soup, resp.url)
        content_hash = hashlib.md5(resp.text.encode()).hexdigest()

        return CrawledPage(
            url=resp.url,
            title=title,
            description=description,
            text=text,
            links=links,
            status_code=resp.status_code,
            content_hash=content_hash,
        )
    except Exception as exc:
        logger.warning("Failed to fetch %s: %s", url, exc)
        return None


class Crawler:
    """BFS web crawler with configurable depth and domain restrictions."""

    def __init__(
        self,
        max_pages: int = 500,
        max_depth: int = 3,
        delay: float = 1.0,
        allowed_domains: Optional[list[str]] = None,
    ):
        self.max_pages = max_pages
        self.max_depth = max_depth
        self.delay = delay
        self.allowed_domains = allowed_domains  # None = no restriction

    def _allowed(self, url: str) -> bool:
        if not self.allowed_domains:
            return True
        host = urllib.parse.urlparse(url).netloc
        return any(host == d or host.endswith("." + d) for d in self.allowed_domains)

    def crawl(self, seed_urls: list[str], on_page=None):
        """
        BFS crawl starting from seed_urls.

        on_page: optional callback(CrawledPage) called for each crawled page.
        Returns list of CrawledPage objects.
        """
        visited: set[str] = set()
        queue: deque[tuple[str, int]] = deque()
        pages: list[CrawledPage] = []

        for url in seed_urls:
            queue.append((url, 0))
            visited.add(url)

        while queue and len(pages) < self.max_pages:
            url, depth = queue.popleft()

            if not self._allowed(url):
                continue

            logger.info("Crawling [depth=%d] %s", depth, url)
            page = fetch_page(url)

            if page is None:
                continue

            pages.append(page)
            if on_page:
                on_page(page)

            if depth < self.max_depth:
                for link in page.links:
                    if link not in visited and self._allowed(link):
                        visited.add(link)
                        queue.append((link, depth + 1))

            time.sleep(self.delay)

        logger.info("Crawl complete. Pages fetched: %d", len(pages))
        return pages
