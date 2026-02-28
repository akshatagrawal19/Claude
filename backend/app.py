"""
Flask REST API for the search engine.

Endpoints:
  GET  /                       - Serve the homepage
  GET  /search?q=...&page=N    - Serve the results page
  GET  /api/search             - JSON search results
  POST /api/index              - Manually add a URL to the index
  POST /api/crawl              - Start a crawl from seed URLs
  GET  /api/stats              - Index statistics
  DELETE /api/index            - Clear the index
"""

import logging
import os
import threading
from functools import lru_cache

from flask import Flask, jsonify, render_template, request, abort
from flask_cors import CORS

from crawler import Crawler, fetch_page
from indexer import SearchIndex

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_DIR = os.path.join(BASE_DIR, "..", "frontend", "templates")
STATIC_DIR = os.path.join(BASE_DIR, "..", "frontend", "static")
INDEX_PATH = os.path.join(BASE_DIR, "..", "data", "index.json")

app = Flask(
    __name__,
    template_folder=TEMPLATE_DIR,
    static_folder=STATIC_DIR,
    static_url_path="/static",
)
CORS(app)

index = SearchIndex(persist_path=INDEX_PATH)
index.load()

# Seed data - pre-populate with some well-known pages so the engine has
# content to search from the first run (no live crawl required).
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
        "text": "Artificial intelligence (AI) is the intelligence of machines or software, as opposed to the intelligence of other beings, primarily humans. It is also the field of study in computer science that develops and studies intelligent machines. Artificial intelligence has undergone many cycles of optimism, followed by disappointment and loss of funding, followed by new approaches, success and renewed funding. AI was founded as an academic discipline in 1956. The field has had remarkable progress in recent years through deep learning, natural language processing, and large language models.",
        "links": [],
    },
    {
        "url": "https://en.wikipedia.org/wiki/JavaScript",
        "title": "JavaScript - Wikipedia",
        "description": "JavaScript (JS) is a lightweight, interpreted, or just-in-time compiled programming language with first-class functions.",
        "text": "JavaScript, often abbreviated as JS, is a programming language and core technology of the Web, alongside HTML and CSS. Ninety-nine percent of websites use JavaScript on the client side for webpage behavior, often incorporating third-party libraries. All major web browsers have a dedicated JavaScript engine to execute the code on users' devices. JavaScript is a multi-paradigm, dynamic language with types and operators, a standard library, and a core set of language objects. JavaScript is prototype-based and supports object-oriented, functional, and event-driven programming styles.",
        "links": [],
    },
    {
        "url": "https://en.wikipedia.org/wiki/Database",
        "title": "Database - Wikipedia",
        "description": "A database is an organized collection of structured information or data, typically stored electronically in a computer system.",
        "text": "A database is an organized collection of data or a type of data store based on the use of a database management system (DBMS), the software that interacts with end users, applications, and the database itself to capture and analyze the data. The DBMS additionally encompasses the core facilities provided to administer the database. The sum total of the database, the DBMS, and the associated applications can be referred to as a database system. Popular database systems include PostgreSQL, MySQL, SQLite, MongoDB, and Oracle.",
        "links": [],
    },
    {
        "url": "https://en.wikipedia.org/wiki/Cloud_computing",
        "title": "Cloud computing - Wikipedia",
        "description": "Cloud computing is the on-demand availability of computer system resources, especially data storage and computing power.",
        "text": "Cloud computing is the on-demand availability of computer system resources, especially data storage (cloud storage) and computing power, without direct active management by the user. Large clouds often have functions distributed over multiple locations, each location being a data center. Cloud computing relies on sharing of resources to achieve coherence and economies of scale. Providers typically use a pay-as-you-go model. Major cloud providers include Amazon Web Services, Microsoft Azure, and Google Cloud Platform.",
        "links": [],
    },
    {
        "url": "https://en.wikipedia.org/wiki/Internet",
        "title": "Internet - Wikipedia",
        "description": "The Internet is a global system of interconnected computer networks that uses the Internet protocol suite to communicate between networks and devices.",
        "text": "The Internet is a global system of interconnected computer networks that uses the Internet protocol suite (TCP/IP) to communicate between networks and devices. It is a network of networks that consists of private, public, academic, business, and government networks of local to global scope. The Internet carries a vast range of information resources and services, such as the interlinked hypertext documents and applications of the World Wide Web (WWW), electronic mail, telephony, and file sharing.",
        "links": [],
    },
    {
        "url": "https://en.wikipedia.org/wiki/Open_source",
        "title": "Open source - Wikipedia",
        "description": "Open source is source code that is made freely available for possible modification and redistribution.",
        "text": "Open source is source code that is made freely available for possible modification and redistribution. Products include permission to use the source code, design documents, or content of the product. The open-source model is a decentralized software development model that encourages open collaboration. A main principle of open-source software development is peer production, with products such as source code, blueprints, and documentation freely available to the public. Linux, Apache, Python, and many other widely-used projects are open source.",
        "links": [],
    },
    {
        "url": "https://en.wikipedia.org/wiki/Algorithm",
        "title": "Algorithm - Wikipedia",
        "description": "An algorithm is a finite sequence of mathematically rigorous instructions used to solve a problem or perform a computation.",
        "text": "In mathematics and computer science, an algorithm is a finite sequence of mathematically rigorous instructions, typically used to solve a class of specific problems or to perform a computation. Algorithms are used as specifications for performing calculations and data processing. By making use of artificial intelligence, algorithms can perform automated deductions and use mathematical tests to divert the code execution through various routes. Algorithms are fundamental to all of computing and computer science.",
        "links": [],
    },
]


def _seed_index():
    """Populate the index with built-in seed pages if empty."""
    if index.stats()["total_documents"] == 0:
        logger.info("Seeding index with %d pages...", len(SEED_PAGES))
        for page in SEED_PAGES:
            index.add_page(**page)
        index.save()
        logger.info("Seed complete.")


_seed_index()

# ---------------------------------------------------------------------------
# Web routes
# ---------------------------------------------------------------------------

@app.route("/")
def homepage():
    return render_template("index.html")


@app.route("/search")
def search_page():
    query = request.args.get("q", "").strip()
    page_num = max(1, int(request.args.get("page", 1)))
    results_per_page = 10

    if query:
        all_results = index.search(query, top_k=50)
        start = (page_num - 1) * results_per_page
        end = start + results_per_page
        page_results = all_results[start:end]
        total = len(all_results)
        has_prev = page_num > 1
        has_next = end < total
    else:
        page_results = []
        total = 0
        has_prev = has_next = False

    return render_template(
        "results.html",
        query=query,
        results=page_results,
        total=total,
        page=page_num,
        has_prev=has_prev,
        has_next=has_next,
        results_per_page=results_per_page,
    )


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------

@app.route("/api/search")
def api_search():
    query = request.args.get("q", "").strip()
    top_k = min(int(request.args.get("n", 10)), 50)
    if not query:
        return jsonify({"error": "Missing query parameter 'q'"}), 400

    results = index.search(query, top_k=top_k)
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
    """Manually submit a URL to be fetched and indexed."""
    data = request.get_json(force=True, silent=True) or {}
    url = (data.get("url") or "").strip()
    if not url:
        return jsonify({"error": "Missing 'url'"}), 400

    page = fetch_page(url)
    if page is None:
        return jsonify({"error": f"Could not fetch {url}"}), 400

    index.add_page(
        url=page.url,
        title=page.title,
        description=page.description,
        text=page.text,
        content_hash=page.content_hash,
        links=page.links,
    )
    index.save()
    return jsonify({"status": "indexed", "url": page.url, "title": page.title})


@app.route("/api/crawl", methods=["POST"])
def api_crawl():
    """Start an asynchronous crawl from seed URLs."""
    data = request.get_json(force=True, silent=True) or {}
    seeds = data.get("seeds", [])
    max_pages = min(int(data.get("max_pages", 20)), 100)
    max_depth = min(int(data.get("max_depth", 2)), 3)

    if not seeds:
        return jsonify({"error": "Provide a list of 'seeds'"}), 400

    def _crawl():
        crawler = Crawler(max_pages=max_pages, max_depth=max_depth, delay=0.5)

        def on_page(page):
            index.add_page(
                url=page.url,
                title=page.title,
                description=page.description,
                text=page.text,
                content_hash=page.content_hash,
                links=page.links,
            )

        crawler.crawl(seeds, on_page=on_page)
        index.save()
        logger.info("Background crawl finished. Index size: %d", index.stats()["total_documents"])

    thread = threading.Thread(target=_crawl, daemon=True)
    thread.start()

    return jsonify({
        "status": "crawl_started",
        "seeds": seeds,
        "max_pages": max_pages,
        "max_depth": max_depth,
    })


@app.route("/api/stats")
def api_stats():
    return jsonify(index.stats())


@app.route("/api/index", methods=["DELETE"])
def api_clear():
    global index
    index = SearchIndex(persist_path=INDEX_PATH)
    _seed_index()
    return jsonify({"status": "cleared"})


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
