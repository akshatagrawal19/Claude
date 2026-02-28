'use strict';

/**
 * Web crawler — JavaScript port of backend/crawler.py.
 *
 * fetchPage()  — fetch a single URL, parse HTML with cheerio, return a page object.
 * Crawler      — BFS crawler with depth/domain limits.
 *
 * Requires Node.js 18+ (native fetch) and the `cheerio` package.
 */

const { load } = require('cheerio');
const crypto = require('crypto');

const USER_AGENT = 'SearchEngineBot/1.0 (+https://searchengine.local/bot)';

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function extractText($) {
  $('script, style, nav, footer, header, aside').remove();
  return ($('body').text() || $.text()).replace(/\s+/g, ' ').trim();
}

function extractDescription($, text) {
  const content =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content');
  if (content) return content.trim();
  return text.slice(0, 200).trim();
}

function extractLinks($, baseUrl) {
  const links = [];
  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    if (!href || /^(javascript:|mailto:|#)/i.test(href)) return;
    try {
      const abs = new URL(href, baseUrl);
      abs.hash = '';
      if (abs.protocol === 'http:' || abs.protocol === 'https:') {
        links.push(abs.toString());
      }
    } catch {
      // malformed href — skip
    }
  });
  return links;
}

// ---------------------------------------------------------------------------
// fetchPage
// ---------------------------------------------------------------------------

/**
 * Fetch a single URL and return a page object, or null on failure.
 * @param {string} url
 * @param {number} timeout  milliseconds
 * @returns {Promise<object|null>}
 */
async function fetchPage(url, timeout = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timer);

    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return null;

    const html = await resp.text();
    const $ = load(html);

    const title = ($('title').first().text() || url).trim();
    const text = extractText($);
    const description = extractDescription($, text);
    const links = extractLinks($, resp.url);
    const contentHash = crypto.createHash('md5').update(html).digest('hex');

    return { url: resp.url, title, description, text, links, statusCode: resp.status, contentHash };
  } catch (err) {
    clearTimeout(timer);
    console.warn('fetchPage failed:', url, err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// BFS Crawler
// ---------------------------------------------------------------------------

class Crawler {
  /**
   * @param {object} opts
   * @param {number} [opts.maxPages=500]
   * @param {number} [opts.maxDepth=3]
   * @param {number} [opts.delayMs=1000]
   * @param {string[]|null} [opts.allowedDomains=null]  null = unrestricted
   */
  constructor({ maxPages = 500, maxDepth = 3, delayMs = 1000, allowedDomains = null } = {}) {
    this.maxPages = maxPages;
    this.maxDepth = maxDepth;
    this.delayMs = delayMs;
    this.allowedDomains = allowedDomains;
  }

  _allowed(url) {
    if (!this.allowedDomains) return true;
    const { hostname } = new URL(url);
    return this.allowedDomains.some(d => hostname === d || hostname.endsWith('.' + d));
  }

  /**
   * BFS crawl from seedUrls.
   * @param {string[]} seedUrls
   * @param {function(object): void} [onPage]  callback per fetched page
   * @returns {Promise<object[]>}
   */
  async crawl(seedUrls, onPage = null) {
    const visited = new Set();
    const queue = []; // [{url, depth}]
    const pages = [];

    for (const url of seedUrls) {
      queue.push({ url, depth: 0 });
      visited.add(url);
    }

    while (queue.length && pages.length < this.maxPages) {
      const { url, depth } = queue.shift();
      if (!this._allowed(url)) continue;

      console.info(`Crawling [depth=${depth}] ${url}`);
      const page = await fetchPage(url);
      if (!page) continue;

      pages.push(page);
      if (onPage) onPage(page);

      if (depth < this.maxDepth) {
        for (const link of page.links) {
          if (!visited.has(link) && this._allowed(link)) {
            visited.add(link);
            queue.push({ url: link, depth: depth + 1 });
          }
        }
      }

      if (this.delayMs > 0) await new Promise(r => setTimeout(r, this.delayMs));
    }

    console.info(`Crawl complete. Pages fetched: ${pages.length}`);
    return pages;
  }
}

module.exports = { fetchPage, Crawler };
