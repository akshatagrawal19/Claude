'use strict';

/**
 * Express.js API handler — Vercel Node.js serverless function.
 *
 * Vercel routes /api/:path* here via vercel.json rewrites.
 * Express sees the original request path and dispatches normally.
 *
 * Note: Vercel functions are stateless. The index is rebuilt from seed
 * data on each cold start. For persistence, swap SearchIndex for a
 * database-backed store (e.g. Vercel Postgres, Upstash Redis, KV).
 */

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { SearchIndex } = require('./_indexer');
const { fetchPage } = require('./_crawler');

const app = express();
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Seed data (loaded once per cold start)
// ---------------------------------------------------------------------------

const SEED_PAGES = [
  {
    url: 'https://en.wikipedia.org/wiki/Python_(programming_language)',
    title: 'Python (programming language) - Wikipedia',
    description: 'Python is a high-level, general-purpose programming language. Its design philosophy emphasizes code readability.',
    text: 'Python is a high-level, general-purpose programming language. Its design philosophy emphasizes code readability with the use of significant indentation. Python is dynamically typed and garbage-collected. It supports multiple programming paradigms including structured, object-oriented and functional programming. Python was created by Guido van Rossum and first released in 1991. Python consistently ranks among the most popular programming languages. Python is used extensively in data science, machine learning, web development, automation, and scientific computing.',
    links: [],
  },
  {
    url: 'https://en.wikipedia.org/wiki/Machine_learning',
    title: 'Machine learning - Wikipedia',
    description: 'Machine learning is a subfield of artificial intelligence (AI) that gives systems the ability to automatically learn and improve from experience.',
    text: 'Machine learning (ML) is a field of study in artificial intelligence concerned with the development and study of statistical algorithms that can learn from data and generalize to unseen data, and so perform tasks without explicit instructions. Recently, generative artificial neural networks have been able to surpass many previous approaches in performance. Machine learning approaches have been applied to many fields including natural language processing, computer vision, speech recognition, email filtering, and medical diagnosis.',
    links: [],
  },
  {
    url: 'https://en.wikipedia.org/wiki/Web_search_engine',
    title: 'Web search engine - Wikipedia',
    description: 'A web search engine is a software system designed to carry out web searches, which means to search the World Wide Web in a systematic way.',
    text: 'A web search engine or Internet search engine is a software system designed to carry out web searches. They search the World Wide Web in a systematic way for particular information specified in a textual web search query. The search results are generally presented in a line of results, often referred to as search engine results pages (SERPs). When a user enters a query into a search engine, the engine examines its index and provides a listing of best-matching web pages. Google, Bing, and DuckDuckGo are popular search engines.',
    links: [],
  },
  {
    url: 'https://en.wikipedia.org/wiki/Artificial_intelligence',
    title: 'Artificial intelligence - Wikipedia',
    description: 'Artificial intelligence (AI) is the simulation of human intelligence processes by machines, especially computer systems.',
    text: 'Artificial intelligence (AI) is the intelligence of machines or software, as opposed to the intelligence of other beings, primarily humans. It is also the field of study in computer science that develops and studies intelligent machines. AI was founded as an academic discipline in 1956. The field has had remarkable progress in recent years through deep learning, natural language processing, and large language models.',
    links: [],
  },
  {
    url: 'https://en.wikipedia.org/wiki/JavaScript',
    title: 'JavaScript - Wikipedia',
    description: 'JavaScript (JS) is a lightweight, interpreted, or just-in-time compiled programming language with first-class functions.',
    text: 'JavaScript, often abbreviated as JS, is a programming language and core technology of the Web, alongside HTML and CSS. Ninety-nine percent of websites use JavaScript on the client side for webpage behavior. JavaScript is prototype-based and supports object-oriented, functional, and event-driven programming styles.',
    links: [],
  },
  {
    url: 'https://en.wikipedia.org/wiki/Database',
    title: 'Database - Wikipedia',
    description: 'A database is an organized collection of structured information or data, typically stored electronically in a computer system.',
    text: 'A database is an organized collection of data or a type of data store based on the use of a database management system (DBMS). Popular database systems include PostgreSQL, MySQL, SQLite, MongoDB, and Oracle.',
    links: [],
  },
  {
    url: 'https://en.wikipedia.org/wiki/Cloud_computing',
    title: 'Cloud computing - Wikipedia',
    description: 'Cloud computing is the on-demand availability of computer system resources, especially data storage and computing power.',
    text: 'Cloud computing is the on-demand availability of computer system resources without direct active management by the user. Major cloud providers include Amazon Web Services, Microsoft Azure, and Google Cloud Platform.',
    links: [],
  },
  {
    url: 'https://en.wikipedia.org/wiki/Internet',
    title: 'Internet - Wikipedia',
    description: 'The Internet is a global system of interconnected computer networks.',
    text: 'The Internet is a global system of interconnected computer networks that uses the Internet protocol suite (TCP/IP) to communicate between networks and devices. It carries information resources such as the World Wide Web, electronic mail, telephony, and file sharing.',
    links: [],
  },
  {
    url: 'https://en.wikipedia.org/wiki/Open_source',
    title: 'Open source - Wikipedia',
    description: 'Open source is source code that is made freely available for possible modification and redistribution.',
    text: 'Open source is source code made freely available for modification and redistribution. The open-source model encourages open collaboration. Linux, Apache, Python, and many widely-used projects are open source.',
    links: [],
  },
  {
    url: 'https://en.wikipedia.org/wiki/Algorithm',
    title: 'Algorithm - Wikipedia',
    description: 'An algorithm is a finite sequence of mathematically rigorous instructions used to solve a problem.',
    text: 'In mathematics and computer science, an algorithm is a finite sequence of instructions used to solve a class of problems or to perform a computation. Algorithms are fundamental to all of computing and computer science.',
    links: [],
  },
];

// Build in-memory index (rebuilt on each cold start — stateless serverless)
const index = new SearchIndex();
for (const { url, title, description, text, links } of SEED_PAGES) {
  const contentHash = crypto.createHash('md5').update(url).digest('hex');
  index.addPage(url, title, description, text, contentHash, links);
}
console.info(`Index ready: ${index.stats().total_documents} documents`);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/api/search', (req, res) => {
  const query = (req.query.q || '').trim();
  const topK = Math.min(parseInt(req.query.n || '10', 10), 50);

  if (!query) {
    return res.status(400).json({ error: "Missing query parameter 'q'" });
  }

  const results = index.search(query, topK);
  res.json({ query, total: results.length, results });
});

app.post('/api/index', async (req, res) => {
  const url = ((req.body || {}).url || '').trim();
  if (!url) {
    return res.status(400).json({ error: "Missing 'url'" });
  }

  const page = await fetchPage(url);
  if (!page) {
    return res.status(400).json({ error: `Could not fetch ${url}` });
  }

  index.addPage(page.url, page.title, page.description, page.text, page.contentHash, page.links);
  res.json({ status: 'indexed', url: page.url, title: page.title });
});

app.get('/api/stats', (_req, res) => {
  res.json(index.stats());
});

// ---------------------------------------------------------------------------
// Local dev entry point  (not used by Vercel)
// ---------------------------------------------------------------------------

if (require.main === module) {
  const PORT = process.env.PORT || 5001;
  app.listen(PORT, () => console.info(`API listening on http://localhost:${PORT}`));
}

// Vercel expects the Express app exported as module.exports
module.exports = app;
