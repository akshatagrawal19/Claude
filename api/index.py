"""
Vercel Python serverless handler — all /api/* routes.

Vercel routes /api/(.*) here via vercel.json rewrites.
Flask sees the original request path and dispatches normally.

Note: Vercel functions are stateless. The index is rebuilt from seed
data on each cold start. For persistence, swap SearchIndex for a
database-backed store (e.g. Vercel Postgres, Upstash Redis).
"""

import logging
import os
import sys

# Make private helpers importable when running inside /api
sys.path.insert(0, os.path.dirname(__file__))

from flask import Flask, jsonify, request
from flask_cors import CORS

from _indexer import SearchIndex
from _crawler import fetch_page, Crawler

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# ---------------------------------------------------------------------------
# Seed data (loaded once per cold start)
# ---------------------------------------------------------------------------

SEED_PAGES = [
    {
        "url": "https://en.wikipedia.org/wiki/Python_(programming_language)",
        "title": "Python (programming language) - Wikipedia",
        "description": "Python is a high-level, general-purpose programming language. Its design philosophy emphasizes code readability.",
        "text": "Python is a high-level, general-purpose programming language. Its design philosophy emphasizes code readability with the use of significant indentation. Python is dynamically typed and garbage-collected. It supports multiple programming paradigms including structured, object-oriented and functional programming. Python was created by Guido van Rossum and first released in 1991. Python consistently ranks among the most popular programming languages. Python is used extensively in data science, machine learning, web development, automation, and scientific computing.",
        "links": [],
    },
    {
        "url": "https://en.wikipedia.org/wiki/Machine_learning",
        "title": "Machine learning - Wikipedia",
        "description": "Machine learning is a subfield of artificial intelligence (AI) that gives systems the ability to automatically learn and improve from experience.",
        "text": "Machine learning (ML) is a field of study in artificial intelligence concerned with the development and study of statistical algorithms that can learn from data and generalize to unseen data, and so perform tasks without explicit instructions. Recently, generative artificial neural networks have been able to surpass many previous approaches in performance. Machine learning approaches have been applied to many fields including natural language processing, computer vision, speech recognition, email filtering, and medical diagnosis.",
        "links": [],
    },
    {
        "url": "https://en.wikipedia.org/wiki/Web_search_engine",
        "title": "Web search engine - Wikipedia",
        "description": "A web search engine is a software system designed to carry out web searches, which means to search the World Wide Web in a systematic way.",
        "text": "A web search engine or Internet search engine is a software system designed to carry out web searches. They search the World Wide Web in a systematic way for particular information specified in a textual web search query. The search results are generally presented in a line of results, often referred to as search engine results pages (SERPs). When a user enters a query into a search engine, the engine examines its index and provides a listing of best-matching web pages. Google, Bing, and DuckDuckGo are popular search engines.",
        "links": [],
    },
    {
        "url": "https://en.wikipedia.org/wiki/Artificial_intelligence",
        "title": "Artificial intelligence - Wikipedia",
        "description": "Artificial intelligence (AI) is the simulation of human intelligence processes by machines, especially computer systems.",
        "text": "Artificial intelligence (AI) is the intelligence of machines or software, as opposed to the intelligence of other beings, primarily humans. It is also the field of study in computer science that develops and studies intelligent machines. AI was founded as an academic discipline in 1956. The field has had remarkable progress in recent years through deep learning, natural language processing, and large language models.",
        "links": [],
    },
    {
        "url": "https://en.wikipedia.org/wiki/JavaScript",
        "title": "JavaScript - Wikipedia",
        "description": "JavaScript (JS) is a lightweight, interpreted, or just-in-time compiled programming language with first-class functions.",
        "text": "JavaScript, often abbreviated as JS, is a programming language and core technology of the Web, alongside HTML and CSS. Ninety-nine percent of websites use JavaScript on the client side for webpage behavior. JavaScript is prototype-based and supports object-oriented, functional, and event-driven programming styles.",
        "links": [],
    },
    {
        "url": "https://en.wikipedia.org/wiki/Database",
        "title": "Database - Wikipedia",
        "description": "A database is an organized collection of structured information or data, typically stored electronically in a computer system.",
        "text": "A database is an organized collection of data or a type of data store based on the use of a database management system (DBMS). Popular database systems include PostgreSQL, MySQL, SQLite, MongoDB, and Oracle.",
        "links": [],
    },
    {
        "url": "https://en.wikipedia.org/wiki/Cloud_computing",
        "title": "Cloud computing - Wikipedia",
        "description": "Cloud computing is the on-demand availability of computer system resources, especially data storage and computing power.",
        "text": "Cloud computing is the on-demand availability of computer system resources without direct active management by the user. Major cloud providers include Amazon Web Services, Microsoft Azure, and Google Cloud Platform.",
        "links": [],
    },
    {
        "url": "https://en.wikipedia.org/wiki/Internet",
        "title": "Internet - Wikipedia",
        "description": "The Internet is a global system of interconnected computer networks.",
        "text": "The Internet is a global system of interconnected computer networks that uses the Internet protocol suite (TCP/IP) to communicate between networks and devices. It carries information resources such as the World Wide Web, electronic mail, telephony, and file sharing.",
        "links": [],
    },
    {
        "url": "https://en.wikipedia.org/wiki/Open_source",
        "title": "Open source - Wikipedia",
        "description": "Open source is source code that is made freely available for possible modification and redistribution.",
        "text": "Open source is source code made freely available for modification and redistribution. The open-source model encourages open collaboration. Linux, Apache, Python, and many widely-used projects are open source.",
        "links": [],
    },
    {
        "url": "https://en.wikipedia.org/wiki/Algorithm",
        "title": "Algorithm - Wikipedia",
        "description": "An algorithm is a finite sequence of mathematically rigorous instructions used to solve a problem.",
        "text": "In mathematics and computer science, an algorithm is a finite sequence of instructions used to solve a class of problems or to perform a computation. Algorithms are fundamental to all of computing and computer science.",
        "links": [],
    },
]

# Build in-memory index (stateless — rebuilt on each cold start)
_index = SearchIndex()
for _page in SEED_PAGES:
    _index.add_page(**_page)
logger.info("Index ready: %d documents", _index.stats()["total_documents"])


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------

@app.route("/api/search")
def api_search():
    query = request.args.get("q", "").strip()
    top_k = min(int(request.args.get("n", 10)), 50)
    if not query:
        return jsonify({"error": "Missing query parameter 'q'"}), 400

    results = _index.search(query, top_k=top_k)
    return jsonify({
        "query": query,
        "total": len(results),
        "results": [
            {
                "url": r.url,
                "title": r.title,
                "description": r.description,
                "score": r.score,
                "inbound_links": r.inbound_links,
            }
            for r in results
        ],
    })


@app.route("/api/index", methods=["POST"])
def api_index():
    """Fetch a URL and add it to the in-memory index."""
    data = request.get_json(force=True, silent=True) or {}
    url = (data.get("url") or "").strip()
    if not url:
        return jsonify({"error": "Missing 'url'"}), 400

    page = fetch_page(url)
    if page is None:
        return jsonify({"error": f"Could not fetch {url}"}), 400

    _index.add_page(
        url=page.url,
        title=page.title,
        description=page.description,
        text=page.text,
        content_hash=page.content_hash,
        links=page.links,
    )
    return jsonify({"status": "indexed", "url": page.url, "title": page.title})


@app.route("/api/stats")
def api_stats():
    return jsonify(_index.stats())


# ---------------------------------------------------------------------------
# Vercel expects the WSGI app to be named `app`
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app.run(debug=True, port=5001)
