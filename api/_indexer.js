'use strict';

/**
 * TF-IDF search index — JavaScript port of backend/indexer.py.
 *
 * Scoring: cosine-sim(query_tfidf, doc_tfidf) + 0.1 * log(1 + inbound_links)
 */

const STOPWORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for',
  'of','with','by','from','as','is','was','are','were','be',
  'been','being','have','has','had','do','does','did','will',
  'would','could','should','may','might','shall','can','need',
  'this','that','these','those','it','its','i','you','he','she',
  'we','they','what','which','who','whom','when','where','why',
  'how','all','both','each','few','more','most','other','some',
  'such','no','not','only','same','so','than','too','very','s',
  'just','about','up','out','if',
]);

const WORD_RE = /[a-z0-9]+/g;

function tokenize(text) {
  const matches = text.toLowerCase().match(WORD_RE) || [];
  return matches.filter(t => !STOPWORDS.has(t) && t.length > 1);
}

class SearchIndex {
  constructor() {
    /** @type {Map<number, object>} doc_id → doc */
    this._docs = new Map();
    /** @type {Map<string, number>} url → doc_id */
    this._urlToId = new Map();
    /** @type {Map<string, Map<number, number>>} term → (doc_id → tf) */
    this._inverted = new Map();
    /** @type {Map<string, number>} term → document-frequency */
    this._df = new Map();
    this._nextId = 0;
    /** @type {Map<string, Set<string>>} url → outbound URLs */
    this._linkGraph = new Map();
  }

  /**
   * Add or update a page.
   * @param {string} url
   * @param {string} title
   * @param {string} description
   * @param {string} text
   * @param {string} contentHash  md5 of raw HTML (dedup guard)
   * @param {string[]} links      outbound URLs
   */
  addPage(url, title, description, text, contentHash, links = []) {
    if (this._urlToId.has(url)) {
      const existing = this._docs.get(this._urlToId.get(url));
      if (existing.contentHash === contentHash) return;
      this._remove(url);
    }

    const docId = this._nextId++;
    const doc = {
      docId, url, title, description, text,
      contentHash, inboundLinks: 0, indexedAt: Date.now(),
    };
    this._docs.set(docId, doc);
    this._urlToId.set(url, docId);

    // Build TF vector (title weighted ×3, description ×2)
    const corpus = `${title} ${title} ${title} ${description} ${description} ${text}`;
    const tokens = tokenize(corpus);
    const tfCounts = new Map();
    for (const t of tokens) tfCounts.set(t, (tfCounts.get(t) || 0) + 1);

    const total = tokens.length || 1;
    for (const [term, count] of tfCounts) {
      const tf = Math.log(1 + count / total);
      if (!this._inverted.has(term)) this._inverted.set(term, new Map());
      this._inverted.get(term).set(docId, tf);
      this._df.set(term, (this._df.get(term) || 0) + 1);
    }

    if (links.length) this._linkGraph.set(url, new Set(links));
    this._recomputeInbound();
  }

  _remove(url) {
    if (!this._urlToId.has(url)) return;
    const docId = this._urlToId.get(url);
    const doc = this._docs.get(docId);
    this._urlToId.delete(url);
    this._docs.delete(docId);

    const corpus = `${doc.title} ${doc.title} ${doc.title} ${doc.description} ${doc.description} ${doc.text}`;
    const seen = new Set();
    for (const token of tokenize(corpus)) {
      const postings = this._inverted.get(token);
      if (postings) {
        postings.delete(docId);
        if (!seen.has(token)) {
          this._df.set(token, Math.max(0, (this._df.get(token) || 1) - 1));
          seen.add(token);
        }
      }
    }
  }

  _recomputeInbound() {
    const inbound = new Map();
    for (const targets of this._linkGraph.values()) {
      for (const t of targets) {
        if (this._urlToId.has(t)) inbound.set(t, (inbound.get(t) || 0) + 1);
      }
    }
    for (const [url, count] of inbound) {
      const id = this._urlToId.get(url);
      if (id !== undefined) this._docs.get(id).inboundLinks = count;
    }
  }

  /**
   * @param {string} query
   * @param {number} topK
   * @returns {object[]}
   */
  search(query, topK = 10) {
    const tokens = tokenize(query);
    if (!tokens.length) return [];
    const nDocs = this._docs.size;
    if (!nDocs) return [];

    const queryWeight = new Map();
    for (const token of tokens) {
      const idf = Math.log((nDocs + 1) / ((this._df.get(token) || 0) + 1));
      queryWeight.set(token, (queryWeight.get(token) || 0) + idf);
    }

    const scores = new Map();
    for (const [token, qW] of queryWeight) {
      const postings = this._inverted.get(token);
      if (!postings) continue;
      const idf = Math.log((nDocs + 1) / ((this._df.get(token) || 0) + 1));
      for (const [docId, tf] of postings) {
        scores.set(docId, (scores.get(docId) || 0) + tf * idf * qW);
      }
    }

    for (const [docId, score] of scores) {
      const { inboundLinks } = this._docs.get(docId);
      scores.set(docId, score + 0.1 * Math.log(1 + inboundLinks));
    }

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([docId, score]) => {
        const { url, title, description, inboundLinks } = this._docs.get(docId);
        return { url, title, description, score: Math.round(score * 1e4) / 1e4, inbound_links: inboundLinks };
      });
  }

  stats() {
    return {
      total_documents: this._docs.size,
      total_terms: this._inverted.size,
      total_links_tracked: [...this._linkGraph.values()].reduce((s, v) => s + v.size, 0),
    };
  }
}

module.exports = { SearchIndex, tokenize };
