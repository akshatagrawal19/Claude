"""
Search Index - TF-IDF based document indexer with PageRank-style scoring.

Documents are stored in memory (with optional JSON persistence) and ranked
using a combination of TF-IDF cosine similarity and inbound-link count.
"""

import json
import math
import time
import logging
import os
import re
from collections import defaultdict
from dataclasses import dataclass, asdict
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Simple tokeniser (no NLTK dependency at runtime for portability)
# ---------------------------------------------------------------------------

STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
    "been", "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "shall", "can", "need",
    "this", "that", "these", "those", "it", "its", "i", "you", "he", "she",
    "we", "they", "what", "which", "who", "whom", "when", "where", "why",
    "how", "all", "both", "each", "few", "more", "most", "other", "some",
    "such", "no", "not", "only", "same", "so", "than", "too", "very", "s",
    "just", "about", "up", "out", "if",
}

_WORD_RE = re.compile(r"[a-z0-9]+")


def tokenize(text: str) -> list[str]:
    tokens = _WORD_RE.findall(text.lower())
    return [t for t in tokens if t not in STOPWORDS and len(t) > 1]


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class Document:
    doc_id: int
    url: str
    title: str
    description: str
    text: str
    content_hash: str
    inbound_links: int = 0
    indexed_at: float = 0.0


@dataclass
class SearchResult:
    url: str
    title: str
    description: str
    score: float
    inbound_links: int


# ---------------------------------------------------------------------------
# Index
# ---------------------------------------------------------------------------

class SearchIndex:
    """
    Inverted index with TF-IDF scoring.

    Scoring formula (per query term t, document d):
        tf(t,d)  = log(1 + count(t in d))
        idf(t)   = log(N / df(t))
        tfidf    = tf * idf
    Final score = cosine_similarity(query_vec, doc_vec)
                + 0.1 * log(1 + inbound_links)
    """

    def __init__(self, persist_path: Optional[str] = None):
        self.persist_path = persist_path
        self._docs: dict[int, Document] = {}           # doc_id -> Document
        self._url_to_id: dict[str, int] = {}           # url -> doc_id
        self._inverted: dict[str, dict[int, float]] = defaultdict(dict)  # term -> {doc_id: tf}
        self._df: dict[str, int] = defaultdict(int)    # term -> document frequency
        self._next_id: int = 0
        self._link_graph: dict[str, set[str]] = defaultdict(set)  # url -> outbound URLs

    # ------------------------------------------------------------------
    # Indexing
    # ------------------------------------------------------------------

    def add_page(self, url: str, title: str, description: str,
                 text: str, content_hash: str, links: Optional[list[str]] = None):
        """Add or update a page in the index."""
        # Skip duplicates by URL (update if content changed)
        if url in self._url_to_id:
            existing_doc = self._docs[self._url_to_id[url]]
            if existing_doc.content_hash == content_hash:
                return  # Unchanged content
            self._remove(url)

        doc_id = self._next_id
        self._next_id += 1

        doc = Document(
            doc_id=doc_id,
            url=url,
            title=title,
            description=description,
            text=text,
            content_hash=content_hash,
            indexed_at=time.time(),
        )
        self._docs[doc_id] = doc
        self._url_to_id[url] = doc_id

        # Build TF for this document
        tokens = tokenize(title * 3 + " " + description * 2 + " " + text)
        tf_counts: dict[str, int] = defaultdict(int)
        for token in tokens:
            tf_counts[token] += 1

        total = len(tokens) or 1
        for term, count in tf_counts.items():
            tf = math.log(1 + count / total)
            self._inverted[term][doc_id] = tf
            self._df[term] += 1

        # Register outbound links for PageRank approximation
        if links:
            self._link_graph[url] = set(links)
        self._recompute_inbound()

    def _remove(self, url: str):
        if url not in self._url_to_id:
            return
        doc_id = self._url_to_id.pop(url)
        doc = self._docs.pop(doc_id)
        tokens = tokenize(doc.title * 3 + " " + doc.description * 2 + " " + doc.text)
        seen = set()
        for token in tokens:
            if token in self._inverted and doc_id in self._inverted[token]:
                del self._inverted[token][doc_id]
                if token not in seen:
                    self._df[token] = max(0, self._df[token] - 1)
                    seen.add(token)

    def _recompute_inbound(self):
        """Count inbound links for each indexed URL."""
        inbound: dict[str, int] = defaultdict(int)
        for _, targets in self._link_graph.items():
            for t in targets:
                if t in self._url_to_id:
                    inbound[t] += 1
        for url, count in inbound.items():
            if url in self._url_to_id:
                self._docs[self._url_to_id[url]].inbound_links = count

    # ------------------------------------------------------------------
    # Searching
    # ------------------------------------------------------------------

    def search(self, query: str, top_k: int = 10) -> list[SearchResult]:
        """Return top_k results for the query, ranked by TF-IDF + link score."""
        tokens = tokenize(query)
        if not tokens:
            return []

        n_docs = len(self._docs)
        if n_docs == 0:
            return []

        scores: dict[int, float] = defaultdict(float)
        query_weight: dict[str, float] = defaultdict(float)

        # Build query TF-IDF vector
        for token in tokens:
            idf = math.log((n_docs + 1) / (self._df.get(token, 0) + 1))
            query_weight[token] += idf

        # Score documents
        for token, q_w in query_weight.items():
            if token not in self._inverted:
                continue
            for doc_id, tf in self._inverted[token].items():
                idf = math.log((n_docs + 1) / (self._df.get(token, 0) + 1))
                scores[doc_id] += tf * idf * q_w

        # Add link-popularity bonus
        for doc_id, score in scores.items():
            doc = self._docs[doc_id]
            scores[doc_id] = score + 0.1 * math.log(1 + doc.inbound_links)

        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:top_k]

        results = []
        for doc_id, score in ranked:
            doc = self._docs[doc_id]
            results.append(SearchResult(
                url=doc.url,
                title=doc.title,
                description=doc.description,
                score=round(score, 4),
                inbound_links=doc.inbound_links,
            ))
        return results

    # ------------------------------------------------------------------
    # Stats
    # ------------------------------------------------------------------

    def stats(self) -> dict:
        return {
            "total_documents": len(self._docs),
            "total_terms": len(self._inverted),
            "total_links_tracked": sum(len(v) for v in self._link_graph.values()),
        }

    # ------------------------------------------------------------------
    # Persistence (JSON)
    # ------------------------------------------------------------------

    def save(self):
        if not self.persist_path:
            return
        data = {
            "next_id": self._next_id,
            "docs": {str(k): asdict(v) for k, v in self._docs.items()},
            "inverted": {t: {str(did): tf for did, tf in docs.items()}
                         for t, docs in self._inverted.items()},
            "df": dict(self._df),
            "link_graph": {url: list(links) for url, links in self._link_graph.items()},
        }
        os.makedirs(os.path.dirname(self.persist_path), exist_ok=True)
        with open(self.persist_path, "w") as f:
            json.dump(data, f)
        logger.info("Index saved to %s", self.persist_path)

    def load(self):
        if not self.persist_path or not os.path.exists(self.persist_path):
            return
        with open(self.persist_path) as f:
            data = json.load(f)
        self._next_id = data["next_id"]
        self._docs = {int(k): Document(**v) for k, v in data["docs"].items()}
        self._url_to_id = {doc.url: doc.doc_id for doc in self._docs.values()}
        self._inverted = {t: {int(did): tf for did, tf in docs.items()}
                          for t, docs in data["inverted"].items()}
        self._df = defaultdict(int, {t: c for t, c in data["df"].items()})
        self._link_graph = {url: set(links) for url, links in data["link_graph"].items()}
        logger.info("Index loaded: %d documents", len(self._docs))
