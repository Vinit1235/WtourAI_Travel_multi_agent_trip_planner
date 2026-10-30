(function() {
  'use strict';

  const API_BASE = '/api';
  let currentThreadId = null;

  const elements = {
    form: document.getElementById('travel-form'),
    input: document.getElementById('travel-query'),
    submitBtn: document.getElementById('submit-btn'),
    errorToast: document.getElementById('error-toast'),
    errorMessage: document.querySelector('.toast-message'),
    toastClose: document.querySelector('.toast-close'),
    resultsSection: document.getElementById('results'),
    loadingSection: document.getElementById('loading'),
    loadingStep: document.getElementById('loading-step'),
    loadingSteps: document.querySelectorAll('.loading-step'),
    copyBtn: document.getElementById('copy-btn'),
    newSearchBtn: document.getElementById('new-search-btn'),
    rawResponse: document.getElementById('raw-response'),
    rawContent: document.getElementById('raw-content'),
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
  let currentStepIndex = 0;

  function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorToast.hidden = false;
    setTimeout(() => hideError(), 8000);
  }

  function hideError() {
    elements.errorToast.hidden = true;
  }

  function setLoading(loading) {
    elements.submitBtn.classList.toggle('loading', loading);
    elements.submitBtn.disabled = loading || !elements.input.value.trim();
    elements.input.disabled = loading;
  }

  function showLoading() {
    elements.resultsSection.hidden = true;
    elements.loadingSection.hidden = false;
    currentStepIndex = 0;
    updateLoadingSteps();
    animateLoadingSteps();
  }

  function hideLoading() {
    elements.loadingSection.hidden = true;
  }

  function updateLoadingSteps() {
    elements.loadingSteps.forEach((step, index) => {
      step.classList.remove('active', 'completed');
      if (index < currentStepIndex) {
        step.classList.add('completed');
      } else if (index === currentStepIndex) {
        step.classList.add('active');
      }
    });
  }

  function animateLoadingSteps() {
    const stepLabels = [
      'Searching flights...',
      'Finding hostels...',
      'Creating itinerary...',
      'Finalizing plan...'
    ];

    elements.loadingStep.textContent = stepLabels[currentStepIndex] || 'Processing...';
    updateLoadingSteps();

    if (currentStepIndex < loadingStepsOrder.length - 1) {
      currentStepIndex++;
      setTimeout(animateLoadingSteps, 2000 + Math.random() * 1500);
    }
  }

  function showResults(data) {
    hideLoading();
    elements.resultsSection.hidden = false;

    const parsed = parseResponse(data.answer);
    renderContent(parsed);
    elements.rawContent.textContent = JSON.stringify(data, null, 2);
    elements.rawResponse.hidden = false;
    currentThreadId = data.thread_id;
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

    const sectionMap = {
      'trip summary': 'summary',
      'flight details': 'flights',
      'hostel suggestions': 'hostels',
      'day-to-day itinerary': 'itinerary',
      'itinerary': 'itinerary',
      'budget estimate': 'budget',
      'final tips': 'tips'
    };

    let currentSection = null;
    const lines = text.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      const lower = trimmed.toLowerCase();

      let matchedSection = null;
      for (const [key, value] of Object.entries(sectionMap)) {
        if (lower.includes(key) && (lower.startsWith(key) || lower.match(new RegExp(`^\\d+\\)\\s*${key}`)))) {
          matchedSection = value;
          break;
        }
      }

      if (matchedSection) {
        currentSection = matchedSection;
        continue;
      }

      if (currentSection && trimmed) {
        sections[currentSection] += line + '\n';
      }
    }

    if (Object.values(sections).every(s => !s.trim())) {
      sections.summary = text;
    }

    return sections;
  }

  function renderContent(sections) {
    for (const [key, element] of Object.entries(elements.contentSections)) {
      const content = sections[key]?.trim();
      if (content) {
        element.innerHTML = formatContent(content);
        element.closest('.card').style.display = '';
      } else {
        element.innerHTML = '<p class="empty-state">No data available</p>';
      }
    }
  }

  function formatContent(text) {
    return text
      .split('\n')
      .map(line => {
        const trimmed = line.trim();
        if (!trimmed) return '<br>';

        if (trimmed.match(/^\d+[\)\.]\s/)) {
          return `<li>${trimmed.replace(/^\d+[\)\.]\s/, '')}</li>`;
        }
        if (trimmed.match(/^[-*]\s/)) {
          return `<li>${trimmed.replace(/^[-*]\s/, '')}</li>`;
        }
        if (trimmed.match(/^[A-Z][A-Za-z\s]+:/) && !trimmed.includes('  ')) {
          return `<h4>${trimmed}</h4>`;
        }
        if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
          return `<p><strong>${trimmed.slice(2, -2)}</strong></p>`;
        }
        return `<p>${escapeHtml(trimmed)}</p>`;
      })
      .join('\n')
      .replace(/(<li>.*<\/li>)+/g, match => `<ul>${match}</ul>`)
      .replace(/<\/ul>\s*<ul>/g, '');
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const query = elements.input.value.trim();
    if (!query) return;

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
        throw new Error(data.detail || 'Failed to generate travel plan');
      }

      showResults(data);
    } catch (error) {
      hideLoading();
      showError(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    const texts = [];
    for (const [key, element] of Object.entries(elements.contentSections)) {
      const text = element.textContent.trim();
      if (text && !text.includes('No data available')) {
        const title = key.charAt(0).toUpperCase() + key.slice(1);
        texts.push(`${title.toUpperCase()}\n${text}`);
      }
    }

    const fullText = texts.join('\n\n');
    try {
      await navigator.clipboard.writeText(fullText);
      showToast('Copied to clipboard!', 'success');
    } catch {
      showToast('Failed to copy', 'error');
    }
  }

  function showToast(message, type) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = `
      <span class="toast-message">${escapeHtml(message)}</span>
      <button class="toast-close" aria-label="Dismiss">&times;</button>
    `;
    document.body.appendChild(toast);

    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    setTimeout(() => toast.remove(), 3000);
  }

  function handleNewSearch() {
    elements.form.reset();
    elements.resultsSection.hidden = true;
    elements.rawResponse.hidden = true;
    currentThreadId = null;
    elements.input.focus();
    setLoading(false);
  }

  function handleInput() {
    elements.submitBtn.disabled = !elements.input.value.trim();
  }

  function init() {
    elements.form.addEventListener('submit', handleSubmit);
    elements.input.addEventListener('input', handleInput);
    elements.toastClose.addEventListener('click', hideError);
    elements.copyBtn.addEventListener('click', handleCopy);
    elements.newSearchBtn.addEventListener('click', handleNewSearch);

    elements.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!elements.submitBtn.disabled) {
          handleSubmit(e);
        }
      }
    });

    elements.input.focus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();