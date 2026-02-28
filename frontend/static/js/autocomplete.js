/**
 * Autocomplete / search-suggestions for Nexus Search.
 *
 * Provides query suggestions based on previously-searched terms stored in
 * localStorage, plus a small set of hard-coded popular suggestions.
 * No external API calls are made — everything is client-side.
 */

(function () {
  "use strict";

  const POPULAR = [
    "python programming",
    "machine learning",
    "artificial intelligence",
    "web development",
    "javascript tutorial",
    "open source projects",
    "cloud computing",
    "database design",
    "search engine algorithm",
    "data science",
    "neural networks",
    "api development",
    "cybersecurity",
    "linux commands",
    "git tutorial",
  ];

  const HISTORY_KEY = "nexus_search_history";
  const MAX_HISTORY = 30;

  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    } catch (_) {
      return [];
    }
  }

  function saveHistory(query) {
    const history = getHistory().filter((h) => h !== query);
    history.unshift(query);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  }

  function getSuggestions(input) {
    const q = input.trim().toLowerCase();
    if (!q) return [];
    const history = getHistory();
    const combined = [...new Set([...history, ...POPULAR])];
    return combined
      .filter((s) => s.toLowerCase().startsWith(q) && s.toLowerCase() !== q)
      .slice(0, 6);
  }

  const searchIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>`;

  function initAutocomplete(input) {
    if (!input) return;

    // Find or create list element
    const form = input.closest("form");
    if (!form) return;

    let list = form.querySelector(".suggestions-list");
    if (!list) {
      list = document.createElement("ul");
      list.className = "suggestions-list";
      list.setAttribute("role", "listbox");
      list.hidden = true;
      // Make form position:relative so list is anchored
      form.style.position = "relative";
      form.appendChild(list);
    }

    let activeIdx = -1;

    function renderSuggestions(suggestions) {
      list.innerHTML = "";
      activeIdx = -1;
      if (suggestions.length === 0) {
        list.hidden = true;
        return;
      }
      suggestions.forEach((s, i) => {
        const li = document.createElement("li");
        li.setAttribute("role", "option");
        li.innerHTML = `${searchIcon}<span>${escapeHtml(s)}</span>`;
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
          input.value = s;
          list.hidden = true;
          saveHistory(s);
          form.submit();
        });
        list.appendChild(li);
      });
      list.hidden = false;
    }

    function escapeHtml(str) {
      return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    input.addEventListener("input", () => {
      renderSuggestions(getSuggestions(input.value));
    });

    input.addEventListener("keydown", (e) => {
      const items = list.querySelectorAll("li");
      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIdx = Math.min(activeIdx + 1, items.length - 1);
        items.forEach((li, i) => li.classList.toggle("active", i === activeIdx));
        if (activeIdx >= 0) input.value = items[activeIdx].querySelector("span").textContent;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIdx = Math.max(activeIdx - 1, -1);
        items.forEach((li, i) => li.classList.toggle("active", i === activeIdx));
        if (activeIdx < 0) input.value = input.getAttribute("data-original") || "";
      } else if (e.key === "Escape") {
        list.hidden = true;
        activeIdx = -1;
      } else if (e.key === "Enter") {
        list.hidden = true;
      }
    });

    input.addEventListener("focus", () => {
      input.setAttribute("data-original", input.value);
      if (input.value.trim()) renderSuggestions(getSuggestions(input.value));
    });

    input.addEventListener("blur", () => {
      // Small delay so mousedown on a suggestion fires first
      setTimeout(() => { list.hidden = true; }, 150);
    });

    // Save history on form submit
    form.addEventListener("submit", () => {
      const q = input.value.trim();
      if (q) saveHistory(q);
    });
  }

  // Auto-init for homepage input
  document.addEventListener("DOMContentLoaded", () => {
    const homeInput = document.getElementById("homeQuery");
    if (homeInput) initAutocomplete(homeInput);
  });

  // Expose for results page
  window.initAutocomplete = initAutocomplete;
})();
