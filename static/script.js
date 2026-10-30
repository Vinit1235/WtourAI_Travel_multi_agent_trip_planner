(function () {
  'use strict';

  const API_BASE = '/api';
  const SECTION_TITLES = {
    summary: 'Trip summary',
    flights: 'Flight details',
    hostels: 'Hostel suggestions',
    itinerary: 'Day-to-day itinerary',
    budget: 'Budget estimate',
    tips: 'Final tips'
  };

  let currentThreadId = null;
  let lastQuery = '';
  let currentStepIndex = 0;
  let loadingTimer = null;

  const elements = {
    form: document.getElementById('travel-form'),
    input: document.getElementById('travel-query'),
    submitBtn: document.getElementById('submit-btn'),
    errorToast: document.getElementById('error-toast'),
    errorMessage: document.querySelector('#error-toast .toast-message'),
    toastClose: document.querySelector('#error-toast .toast-close'),
    resultsSection: document.getElementById('results'),
    resultsTitle: document.getElementById('results-title'),
    resultsQuery: document.getElementById('results-query'),
    loadingSection: document.getElementById('loading'),
    postcards: document.getElementById('postcards'),
    howItWorks: document.getElementById('how-it-works'),
    loadingStep: document.getElementById('loading-step'),
    loadingSteps: document.querySelectorAll('.loading-step'),
    copyBtn: document.getElementById('copy-btn'),
    newSearchBtn: document.getElementById('new-search-btn'),
    rawResponse: document.getElementById('raw-response'),
    rawContent: document.getElementById('raw-content'),
    postcardTriggers: document.querySelectorAll('.postcard'),
    contentSections: {
      summary: document.getElementById('summary-content'),
      flights: document.getElementById('flights-content'),
      hostels: document.getElementById('hostels-content'),
      itinerary: document.getElementById('itinerary-content'),
      budget: document.getElementById('budget-content'),
      tips: document.getElementById('tips-content')
    }
  };

  const loadingStepsOrder = ['flights', 'hostels', 'itinerary', 'final'];
  const loadingStepLabels = [
    'Checking flights and fares...',
    'Comparing hostels and locations...',
    'Drawing the day-by-day route...',
    'Checking the budget...'
  ];

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function scrollToElement(element, block) {
    if (!element) return;
    element.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: block || 'start'
    });
  }

  function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorToast.hidden = false;
    window.clearTimeout(showError.timer);
    showError.timer = window.setTimeout(hideError, 8000);
  }

  function hideError() {
    elements.errorToast.hidden = true;
  }

  function setLoading(loading) {
    elements.submitBtn.classList.toggle('loading', loading);
    elements.submitBtn.disabled = loading || !elements.input.value.trim();
    elements.input.disabled = loading;
    elements.form.setAttribute('aria-busy', String(loading));
  }

  function updateLoadingSteps() {
    elements.loadingSteps.forEach((step, index) => {
      step.classList.toggle('completed', index < currentStepIndex);
      step.classList.toggle('active', index === currentStepIndex);
    });
  }

  function animateLoadingSteps() {
    elements.loadingStep.textContent = loadingStepLabels[currentStepIndex] || 'Processing...';
    updateLoadingSteps();

    if (currentStepIndex < loadingStepsOrder.length - 1) {
      currentStepIndex += 1;
      loadingTimer = window.setTimeout(animateLoadingSteps, 2000 + Math.random() * 1500);
    }
  }

  function showLoading() {
    elements.resultsSection.hidden = true;
    elements.postcards.hidden = true;
    elements.howItWorks.hidden = true;
    elements.loadingSection.hidden = false;
    window.clearTimeout(loadingTimer);
    currentStepIndex = 0;
    animateLoadingSteps();
    window.requestAnimationFrame(() => scrollToElement(elements.loadingSection, 'center'));
  }

  function hideLoading() {
    window.clearTimeout(loadingTimer);
    elements.loadingSection.hidden = true;
  }

  function showResults(data) {
    hideLoading();
    elements.postcards.hidden = true;
    elements.howItWorks.hidden = true;
    elements.resultsSection.hidden = false;

    const parsed = parseResponse(data.answer || '');
    renderContent(parsed);

    elements.rawContent.textContent = JSON.stringify(data, null, 2);
    elements.rawResponse.hidden = false;
    elements.resultsQuery.textContent = lastQuery ? `Planned for: ${lastQuery}` : '';
    currentThreadId = data.thread_id;

    window.requestAnimationFrame(() => {
      elements.resultsTitle.focus({ preventScroll: true });
      scrollToElement(elements.resultsSection, 'start');
    });
  }

  function normalizeHeading(line) {
    return line
      .replace(/^[\s#>*-]+/, '')
      .replace(/[*_`]/g, '')
      .replace(/^\d+[).:]\s*/, '')
      .replace(/[:\s]+$/, '')
      .trim()
      .toLowerCase();
  }

  function parseResponse(text) {
    const sections = {
      summary: '',
      flights: '',
      hostels: '',
      itinerary: '',
      budget: '',
      tips: ''
    };

    const sectionKeys = {
      'trip summary': 'summary',
      summary: 'summary',
      'flight details': 'flights',
      flights: 'flights',
      'flight options': 'flights',
      'hostel suggestions': 'hostels',
      hostels: 'hostels',
      accommodation: 'hostels',
      stays: 'hostels',
      'day-to-day itinerary': 'itinerary',
      'day to day itinerary': 'itinerary',
      itinerary: 'itinerary',
      'budget estimate': 'budget',
      budget: 'budget',
      'budget breakdown': 'budget',
      costs: 'budget',
      'final tips': 'tips',
      tips: 'tips',
      'travel tips': 'tips'
    };

    let currentSection = null;

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const normalized = normalizeHeading(trimmed);
      const matchedSection = sectionKeys[normalized] || null;

      if (matchedSection) {
        currentSection = matchedSection;
        continue;
      }

      if (currentSection) {
        sections[currentSection] += line + '\n';
      }
    }

    if (Object.values(sections).every(section => !section.trim())) {
      sections.summary = text;
    }

    return sections;
  }

  function renderContent(sections) {
    for (const [key, element] of Object.entries(elements.contentSections)) {
      const content = (sections[key] || '').trim();
      const card = element.closest('.card');

      if (content) {
        element.innerHTML = formatContent(content);
        if (card) card.hidden = false;
      } else {
        element.innerHTML = '';
        if (card) card.hidden = true;
      }
    }
  }

  function formatContent(text) {
    const lines = escapeHtml(text).split('\n');
    let html = '';
    let listTag = null;

    function closeList() {
      if (listTag) {
        html += `</${listTag}>`;
        listTag = null;
      }
    }

    function openList(tag) {
      if (listTag !== tag) {
        closeList();
        html += `<${tag}>`;
        listTag = tag;
      }
    }

    function inline(value) {
      return value
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
    }

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        closeList();
        continue;
      }

      let match = line.match(/^#{1,4}\s+(.+)$/);
      if (match) {
        closeList();
        html += `<h4>${inline(match[1])}</h4>`;
        continue;
      }

      match = line.match(/^\*\*(.+)\*\*$/);
      if (match) {
        closeList();
        const headingText = match[1].trim();
        if (headingText.length <= 80 && !/[.!?]$/.test(headingText)) {
          html += `<h4>${inline(headingText)}</h4>`;
        } else {
          html += `<p><strong>${inline(headingText)}</strong></p>`;
        }
        continue;
      }

      if (/^day\s+\d+/i.test(line)) {
        closeList();
        html += `<h4>${inline(line)}</h4>`;
        continue;
      }

      match = line.match(/^[-*•]\s+(.+)$/);
      if (match) {
        openList('ul');
        html += `<li>${inline(match[1])}</li>`;
        continue;
      }

      match = line.match(/^\d+[.)]\s+(.+)$/);
      if (match) {
        openList('ol');
        html += `<li>${inline(match[1])}</li>`;
        continue;
      }

      if (line.length <= 70 && line.endsWith(':')) {
        closeList();
        html += `<h4>${inline(line.replace(/:\s*$/, ''))}</h4>`;
        continue;
      }

      closeList();
      html += `<p>${inline(line)}</p>`;
    }

    closeList();
    return html;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, character => {
      const entities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      };
      return entities[character];
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const query = elements.input.value.trim();
    if (!query) return;

    lastQuery = query;
    setLoading(true);
    hideError();
    showLoading();

    try {
      const response = await fetch(`${API_BASE}/travel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, thread_id: currentThreadId })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'That plan did not come through. Try again.');
      }

      showResults(data);
    } catch (error) {
      hideLoading();
      elements.postcards.hidden = false;
      elements.howItWorks.hidden = false;
      showError(error.message || 'Something went wrong while planning your trip.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    const parts = [];

    for (const [key, element] of Object.entries(elements.contentSections)) {
      const text = element.textContent.trim();
      if (text) {
        parts.push(`${SECTION_TITLES[key]}\n${text}`);
      }
    }

    if (!parts.length) {
      showToast('Nothing to copy yet. Plan a trip first.', 'error');
      return;
    }

    try {
      await navigator.clipboard.writeText(parts.join('\n\n'));
      showToast('Plan copied to clipboard.', 'success');
    } catch (error) {
      showToast('Copy failed. Your browser blocked clipboard access.', 'error');
    }
  }

  function showToast(message, type) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');

    const text = document.createElement('span');
    text.className = 'toast-message';
    text.textContent = message;

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.innerHTML = '&times;';
    close.addEventListener('click', () => toast.remove());

    toast.append(text, close);
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3500);
  }

  function handleNewSearch() {
    elements.form.reset();
    elements.resultsSection.hidden = true;
    elements.postcards.hidden = false;
    elements.howItWorks.hidden = false;
    elements.rawResponse.hidden = true;
    elements.resultsQuery.textContent = '';
    elements.rawContent.textContent = '';
    currentThreadId = null;
    lastQuery = '';
    setLoading(false);
    elements.input.focus();
    scrollToElement(elements.input, 'center');
  }

  function handleInput() {
    elements.submitBtn.disabled = !elements.input.value.trim();
  }

  function handlePostcard(event) {
    const query = event.currentTarget.dataset.query || '';
    elements.input.value = query;
    handleInput();
    elements.input.focus({ preventScroll: true });
    scrollToElement(elements.input, 'center');
  }

  function init() {
    elements.form.addEventListener('submit', handleSubmit);
    elements.input.addEventListener('input', handleInput);
    elements.toastClose.addEventListener('click', hideError);
    elements.copyBtn.addEventListener('click', handleCopy);
    elements.newSearchBtn.addEventListener('click', handleNewSearch);

    elements.postcardTriggers.forEach(postcard => {
      postcard.addEventListener('click', handlePostcard);
    });

    elements.input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (!elements.submitBtn.disabled) {
          handleSubmit(event);
        }
      }
    });

    handleInput();
    elements.input.focus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
