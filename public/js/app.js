// The Gazette Experiment - Client-side State Machine & Telemetry Logger

(function () {
  'use strict';

  // Global State
  const state = {
    prolificId: null,
    studyId: null,
    sessionId: null,
    participantId: null,
    condition: 1, // 1: Control, 2: Badges, 3: Deep Transparency
    minExplorationSeconds: 120,
    explorationSecondsElapsed: 0,
    timerInterval: null,
    articles: [],
    currentArticle: null,
    articleOpenTime: null,
    articleActiveDwellMs: 0,
    articleLastActiveTime: null,
    maxScrollDepth: 0,
    activeCategory: 'all',
    currentStep: 1
  };

  // DOM Elements
  const dom = {
    prolificIdDisplay: document.getElementById('prolificIdDisplay'),
    conditionDisplay: document.getElementById('conditionDisplay'),
    conditionDebugWrap: document.getElementById('conditionDebugWrap'),
    progressStepper: document.getElementById('progressStepper'),

    // Views
    viewConsent: document.getElementById('view-consent'),
    viewPreSurvey: document.getElementById('view-pre-survey'),
    viewBriefing: document.getElementById('view-briefing'),
    viewApp: document.getElementById('view-app'),
    viewPostSurvey: document.getElementById('view-post-survey'),
    viewCompletion: document.getElementById('view-completion'),

    // Forms & Buttons
    formConsent: document.getElementById('formConsent'),
    formPreSurvey: document.getElementById('formPreSurvey'),
    formPostSurvey: document.getElementById('formPostSurvey'),
    btnLaunchApp: document.getElementById('btnLaunchApp'),
    btnProceedToPostSurvey: document.getElementById('btnProceedToPostSurvey'),

    // News App Elements
    liveAppDate: document.getElementById('liveAppDate'),    // Exploration Screen
    timerCounter: document.getElementById('timerCounter'),
    explorationTimerBadge: document.getElementById('explorationTimerBadge'),
    categoryTabs: document.getElementById('categoryTabs'),
    feedContent: document.getElementById('feedContent'),
    articleReaderView: document.getElementById('articleReaderView'),
    btnBackToFeed: document.getElementById('btnBackToFeed'),
    btnBottomBackToFeed: document.getElementById('btnBottomBackToFeed'),

    // Icon Guide & Header Info Popover
    briefingIconExplanation: document.getElementById('briefingIconExplanation'),
    headerInfoWrap: document.getElementById('headerInfoWrap'),
    btnInfoIcon: document.getElementById('btnInfoIcon'),
    infoLegendPopover: document.getElementById('infoLegendPopover'),
    legendPopoverContent: document.getElementById('legendPopoverContent'),

    // Article Reader Fields
    readerTitle: document.getElementById('readerTitle'),
    readerHeaderText: document.getElementById('readerHeaderText'),
    readerBadgeHook: document.getElementById('readerBadgeHook'),
    readerBodyText: document.getElementById('readerBodyText'),

    // Modal
    transparencyModalOverlay: document.getElementById('transparencyModalOverlay'),
    btnCloseTransparencyModal: document.getElementById('btnCloseTransparencyModal'),
    modalExplanationText: document.getElementById('modalExplanationText'),
    modalMetricsContainer: document.getElementById('modalMetricsContainer'),
    modalFactorsContainer: document.getElementById('modalFactorsContainer'),

    // Completion
    finalCompletionCode: document.getElementById('finalCompletionCode'),
    btnCopyCode: document.getElementById('btnCopyCode'),
    btnProlificRedirect: document.getElementById('btnProlificRedirect')
  };

  // Helper: SVG Icons for Condition 2 (c1_v3_icons)
  function getCondition2Icon(recoSource) {
    if (recoSource === 'algorithm') {
      return `<svg class="meta-icon icon-robot" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="3" r="1.3"></circle>
        <path d="M12 4.3V7"></path>
        <rect x="5" y="7" width="14" height="12" rx="3.5"></rect>
        <path d="M2 12h3"></path>
        <path d="M19 12h3"></path>
        <circle cx="9" cy="11.8" r="1.1" fill="currentColor"></circle>
        <circle cx="15" cy="11.8" r="1.1" fill="currentColor"></circle>
        <path d="M9.5 15.5h5"></path>
      </svg>`;
    } else {
      // editor -> user
      return `<svg class="meta-icon icon-user" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="7.5" r="3.5"></circle>
        <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0"></path>
      </svg>`;
    }
  }

  // Helper: SVG Icons for Condition 3 (c2_v2_icons)
  function getCondition3Icon(explanation) {
    switch (explanation) {
      case 'T':
        // Trending up line
        return `<svg class="meta-icon icon-trending" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline>
          <polyline points="16 7 22 7 22 13"></polyline>
        </svg>`;
      case 'C':
        // Community / crowd
        return `<svg class="meta-icon icon-crowd" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="7" r="2.8"></circle>
          <path d="M6.5 19a5.5 5.5 0 0 1 11 0"></path>
          <circle cx="5" cy="9" r="2"></circle>
          <path d="M1.5 18a4 4 0 0 1 3.5-2.5"></path>
          <circle cx="19" cy="9" r="2"></circle>
          <path d="M19 15.5a4 4 0 0 1 3.5 2.5"></path>
        </svg>`;
      case 'P':
        // Personal / user
        return `<svg class="meta-icon icon-user" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="7.5" r="3.5"></circle>
          <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0"></path>
        </svg>`;
      case 'A':
      default:
        // Algorithm / automated / gear
        return `<svg class="meta-icon icon-gear" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3.2"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>`;
    }
  }

  // Render Briefing Icon Explanations and Header Info Popover
  function renderConditionIconGuides(condition) {
    if (!dom.briefingIconExplanation || !dom.headerInfoWrap || !dom.legendPopoverContent) return;

    if (condition === 2) {
      // Condition 2: Source Icons (Robot vs. Person)
      dom.briefingIconExplanation.style.display = 'block';
      dom.briefingIconExplanation.innerHTML = `
        <div class="briefing-guide-card">
          <div class="briefing-guide-title">
            <span> Understanding the Recommendation Icons</span>
          </div>
          <p class="briefing-guide-subtitle">
            In <strong>The Gazette</strong>, each news article includes an icon indicating how it was selected:
          </p>
          <div class="briefing-icons-list">
            <div class="briefing-icon-item">
              <div class="briefing-icon-badge">${getCondition2Icon('algorithm')}</div>
              <div>
                <div class="briefing-icon-title">Algorithmically selected news</div>
                <div class="briefing-icon-desc">Automatically selected by a news recommendation algorithm.</div>
              </div>
            </div>
            <div class="briefing-icon-item">
              <div class="briefing-icon-badge">${getCondition2Icon('editor')}</div>
              <div>
                <div class="briefing-icon-title">News selected by the Editor-in-Chief</div>
                <div class="briefing-icon-desc">Manually selected by the Editor-in-Chief.</div>
              </div>
            </div>
          </div>
        </div>
      `;

      dom.headerInfoWrap.style.display = 'inline-flex';
      dom.legendPopoverContent.innerHTML = `
        <div class="legend-row">
          <div class="meta-icon">${getCondition2Icon('algorithm')}</div>
          <div class="legend-text-col">
            <div class="legend-label">Algorithm</div>
            <div class="legend-desc">Recommended automatically by an algorithm</div>
          </div>
        </div>
        <div class="legend-row">
          <div class="meta-icon">${getCondition2Icon('editor')}</div>
          <div class="legend-text-col">
            <div class="legend-label">Editor-in-Chief</div>
            <div class="legend-desc">Curated manually by the Editor-in-Chief</div>
          </div>
        </div>
      `;
    } else if (condition === 3) {
      // Condition 3: Explanation Icons (Trending, Community, Personal, Automated)
      dom.briefingIconExplanation.style.display = 'block';
      dom.briefingIconExplanation.innerHTML = `
        <div class="briefing-guide-card">
          <div class="briefing-guide-title">
            <span>Understanding the Recommendation Icons</span>
          </div>
          <p class="briefing-guide-subtitle">
            In <strong>The Gazette</strong>, each news article includes an icon explaining the algorithmic process of news selection:
          </p>
          <div class="briefing-icons-list">
            <div class="briefing-icon-item">
              <div class="briefing-icon-badge">${getCondition3Icon('T')}</div>
              <div>
                <div class="briefing-icon-title">Trending</div>
                <div class="briefing-icon-desc">Selected because the news is currently trending among other readers.</div>
              </div>
            </div>
            <div class="briefing-icon-item">
              <div class="briefing-icon-badge">${getCondition3Icon('C')}</div>
              <div>
                <div class="briefing-icon-title">Collaborative filtering</div>
                <div class="briefing-icon-desc">Selected based on the reading patterns of users with similar interests.</div>
              </div>
            </div>
            <div class="briefing-icon-item">
              <div class="briefing-icon-badge">${getCondition3Icon('P')}</div>
              <div>
                <div class="briefing-icon-title">Profile-based recommendation</div>
                <div class="briefing-icon-desc">Selected based on the reader's personal reading profile and preferences.</div>
              </div>
            </div>
            <div class="briefing-icon-item">
              <div class="briefing-icon-badge">${getCondition3Icon('A')}</div>
              <div>
                <div class="briefing-icon-title">Algorithmically selected news</div>
                <div class="briefing-icon-desc">Automatically selected by a news recommendation algorithm.</div>
              </div>
            </div>
          </div>
        </div>
      `;

      dom.headerInfoWrap.style.display = 'inline-flex';
      dom.legendPopoverContent.innerHTML = `
        <div class="legend-row">
          <div class="meta-icon">${getCondition3Icon('T')}</div>
          <div class="legend-text-col">
            <div class="legend-label">Trending</div>
            <div class="legend-desc">Trending news among readers</div>
          </div>
        </div>
        <div class="legend-row">
          <div class="meta-icon">${getCondition3Icon('C')}</div>
          <div class="legend-text-col">
            <div class="legend-label">Community</div>
            <div class="legend-desc">Accessed by similar readers</div>
          </div>
        </div>
        <div class="legend-row">
          <div class="meta-icon">${getCondition3Icon('P')}</div>
          <div class="legend-text-col">
            <div class="legend-label">Profile</div>
            <div class="legend-desc">Aligned with personal interests</div>
          </div>
        </div>
        <div class="legend-row">
          <div class="meta-icon">${getCondition3Icon('A')}</div>
          <div class="legend-text-col">
            <div class="legend-label">Algorithmic selection</div>
            <div class="legend-desc">Automatically selected by an algorithm</div>
          </div>
        </div>
      `;
    } else {
      // Condition 1: Control (no icons)
      dom.briefingIconExplanation.style.display = 'none';
      dom.briefingIconExplanation.innerHTML = '';
      dom.headerInfoWrap.style.display = 'none';
      dom.legendPopoverContent.innerHTML = '';
    }
  }

  // Helper: Get URL Query Parameters
  function getUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    let prolificId = urlParams.get('PROLIFIC_PID') || urlParams.get('prolific_pid') || urlParams.get('participant_id');
    const studyId = urlParams.get('STUDY_ID') || urlParams.get('study_id') || 'study_demo';
    const sessionId = urlParams.get('SESSION_ID') || urlParams.get('session_id') || 'sess_' + Math.random().toString(36).substr(2, 9);

    if (!prolificId) {
      // When testing locally without explicit Prolific query string, generate a fresh participant ID on each page refresh
      prolificId = 'test_user_' + Math.random().toString(36).substr(2, 7);
    }

    return { prolificId, studyId, sessionId };
  }

  // Telemetry Logging Helper
  async function logTelemetry(eventType, extra = {}) {
    if (!state.participantId && eventType !== 'pre_init') return;

    const payload = {
      participant_id: state.participantId,
      prolific_id: state.prolificId,
      condition: state.condition,
      event_type: eventType,
      article_id: extra.article_id !== undefined ? extra.article_id : (state.currentArticle ? state.currentArticle.id : null),
      duration_ms: extra.duration_ms || 0,
      scroll_percentage: extra.scroll_percentage || 0,
      metadata: extra.metadata || extra,
      client_timestamp: new Date().toISOString()
    };

    try {
      fetch('/api/telemetry/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(err => console.warn('Telemetry fetch error:', err));
    } catch (err) {
      console.warn('Telemetry log error:', err);
    }
  }

  // Switch Active Step View
  function showStep(stepNumber, viewElement) {
    state.currentStep = stepNumber;

    // Update View
    document.querySelectorAll('.study-view').forEach(v => v.classList.remove('active'));
    viewElement.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Update Progress Stepper
    for (let i = 1; i <= 5; i++) {
      const stepEl = document.getElementById(`step-${i}`);
      if (!stepEl) continue;
      stepEl.classList.remove('active', 'completed');
      if (i < stepNumber) {
        stepEl.classList.add('completed');
      } else if (i === stepNumber) {
        stepEl.classList.add('active');
      }
    }

    logTelemetry('step_navigation', { stepNumber, view: viewElement.id });
  }

  // Initialize Participant with Balanced Random Assignment
  async function initParticipant() {
    const params = getUrlParams();
    state.prolificId = params.prolificId;
    state.studyId = params.studyId;
    state.sessionId = params.sessionId;

    if (dom.prolificIdDisplay) {
      dom.prolificIdDisplay.textContent = state.prolificId;
    }

    try {
      // 1. Fetch study config
      const configRes = await fetch('/api/config');
      const configData = await configRes.json();
      if (configData.success) {
        state.minExplorationSeconds = configData.minExplorationSeconds;
        if (dom.timerCounter) {
          dom.timerCounter.textContent = formatTime(state.minExplorationSeconds);
        }
        if (dom.finalCompletionCode) {
          dom.finalCompletionCode.textContent = configData.prolificCompletionCode;
        }
        if (dom.btnProlificRedirect) {
          dom.btnProlificRedirect.href = configData.prolificCompletionUrl;
        }
      }

      // 2. Initialize participant record & balanced condition
      const initRes = await fetch('/api/participant/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prolific_id: state.prolificId,
          study_id: state.studyId,
          session_id: state.sessionId
        })
      });

      const initData = await initRes.json();
      if (initData.success) {
        state.participantId = initData.participant.id;
        state.condition = initData.participant.condition;

        const condNames = { 1: '1 (Control)', 2: '2 (Source Icons)', 3: '3 (Explanation Icons)' };
        if (dom.conditionDisplay) {
          dom.conditionDisplay.textContent = condNames[state.condition] || state.condition;
        }
        console.log(`[STUDY] Participant ${state.prolificId} assigned to Condition ${state.condition}`);

        // Render condition-specific icon guides in Phase 3 instructions & header popover
        renderConditionIconGuides(state.condition);
      }

      // 3. Fetch News articles for condition
      await loadNewsArticles();

    } catch (err) {
      console.error('Initialization error:', err);
    }
  }

  // Load News Articles
  async function loadNewsArticles() {
    try {
      const res = await fetch(`/api/news?condition=${state.condition}`);
      const data = await res.json();
      if (data.success) {
        state.articles = data.articles;
        renderFeed();
      }
    } catch (err) {
      console.error('Failed to load news articles:', err);
    }
  }

  // Render News Feed Cards (Matching the reference screenshots)
  function renderFeed() {
    dom.feedContent.innerHTML = '';

    state.articles.forEach(article => {
      const card = document.createElement('div');
      card.className = 'news-card';
      card.setAttribute('data-article-id', article.id);

      let badgeGroupHtml = '';
      if (state.condition === 2) {
        const iconSvg = getCondition2Icon(article.reco_source);
        badgeGroupHtml = `
          <div class="card-badge-group">
            ${iconSvg}
            <span class="topic-pill">${article.topic}</span>
          </div>
        `;
      } else if (state.condition === 3) {
        const iconSvg = getCondition3Icon(article.explanation);
        badgeGroupHtml = `
          <div class="card-badge-group">
            ${iconSvg}
            <span class="topic-pill">${article.topic}</span>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="card-header-row">
          <h2 class="card-title">${article.title}</h2>
          ${badgeGroupHtml}
        </div>
        <div class="card-subtitle">${article.header}</div>
        <div class="card-content-preview">${article.content}</div>
      `;

      // Handle card click
      card.addEventListener('click', () => {
        openArticle(article);
      });

      dom.feedContent.appendChild(card);
    });
  }

  // Format MM:SS
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // Start Exploration Timer
  function startExplorationTimer() {
    if (state.timerInterval) return;

    const targetSeconds = state.minExplorationSeconds;
    let remaining = targetSeconds;

    state.timerInterval = setInterval(() => {
      state.explorationSecondsElapsed++;
      remaining = Math.max(0, targetSeconds - state.explorationSecondsElapsed);

      if (remaining > 0) {
        dom.timerCounter.textContent = formatTime(remaining);
      } else {
        dom.timerCounter.textContent = '00:00 (Unlocked)';
        dom.explorationTimerBadge.classList.add('ready');
        dom.btnProceedToPostSurvey.removeAttribute('disabled');
        dom.btnProceedToPostSurvey.textContent = 'Continue to Survey ✅';
      }

      // Heartbeat telemetry log every 30s
      if (state.explorationSecondsElapsed % 30 === 0) {
        logTelemetry('timer_heartbeat', { secondsElapsed: state.explorationSecondsElapsed });
      }
    }, 1000);
  }

  // Open Full Article View
  function openArticle(article) {
    // Log previous article dwell if switching directly
    closeCurrentArticle();

    state.currentArticle = article;
    state.articleOpenTime = Date.now();
    state.articleLastActiveTime = Date.now();
    state.articleActiveDwellMs = 0;
    state.maxScrollDepth = 0;

    logTelemetry('article_click', {
      article_id: article.id,
      title: article.title,
      topic: article.topic
    });

    // Populate Reader
    dom.readerTitle.textContent = article.title;
    if (dom.readerHeaderText) {
      dom.readerHeaderText.textContent = article.header;
    }

    if (dom.readerBadgeHook) {
      dom.readerBadgeHook.innerHTML = '';
      if (state.condition === 2) {
        const iconSvg = getCondition2Icon(article.reco_source);
        dom.readerBadgeHook.innerHTML = `
          <div class="card-badge-group">
            ${iconSvg}
            <span class="topic-pill">${article.topic}</span>
          </div>
        `;
      } else if (state.condition === 3) {
        const iconSvg = getCondition3Icon(article.explanation);
        dom.readerBadgeHook.innerHTML = `
          <div class="card-badge-group">
            ${iconSvg}
            <span class="topic-pill">${article.topic}</span>
          </div>
        `;
      }
    }

    // Render Body Text
    dom.readerBodyText.innerHTML = '';
    const paragraphs = Array.isArray(article.content) ? article.content : [article.content];
    paragraphs.forEach(p => {
      const pEl = document.createElement('p');
      pEl.className = 'reader-body-paragraph';
      pEl.textContent = p;
      dom.readerBodyText.appendChild(pEl);
    });

    // Switch view inside phone
    dom.feedContent.style.display = 'none';
    dom.articleReaderView.classList.add('active');
    dom.articleReaderView.scrollTop = 0;
  }

  // Close Article Reader & Log Dwell Time + Scroll
  function closeCurrentArticle() {
    if (!state.currentArticle) return;

    if (state.articleLastActiveTime) {
      state.articleActiveDwellMs += (Date.now() - state.articleLastActiveTime);
    }

    logTelemetry('article_dwell', {
      article_id: state.currentArticle.id,
      duration_ms: Math.round(state.articleActiveDwellMs),
      scroll_percentage: Math.round(state.maxScrollDepth)
    });

    state.currentArticle = null;
    state.articleOpenTime = null;
    state.articleLastActiveTime = null;
    state.articleActiveDwellMs = 0;
    state.maxScrollDepth = 0;

    dom.articleReaderView.classList.remove('active');
    dom.feedContent.style.display = 'flex';
  }

  // Track Article Scroll Depth
  dom.articleReaderView.addEventListener('scroll', () => {
    if (!state.currentArticle) return;
    const el = dom.articleReaderView;
    const scrollTotal = el.scrollHeight - el.clientHeight;
    if (scrollTotal <= 0) return;
    const currentPct = (el.scrollTop / scrollTotal) * 100;
    if (currentPct > state.maxScrollDepth) {
      state.maxScrollDepth = Math.min(100, Math.round(currentPct));
    }
  });

  // Track Tab Visibility (Pause dwell time when user leaves tab)
  document.addEventListener('visibilitychange', () => {
    if (!state.currentArticle) return;
    if (document.hidden) {
      if (state.articleLastActiveTime) {
        state.articleActiveDwellMs += (Date.now() - state.articleLastActiveTime);
        state.articleLastActiveTime = null;
      }
    } else {
      state.articleLastActiveTime = Date.now();
    }
  });

  // Open Transparency Breakdown Modal (Condition 3)
  function openTransparencyModal(article) {
    if (!article.transparencyDetails) return;
    const t = article.transparencyDetails;

    logTelemetry('transparency_modal_open', { article_id: article.id });

    dom.modalExplanationText.textContent = t.explanation;

    // Metrics bars
    dom.modalMetricsContainer.innerHTML = '';
    const metricLabels = {
      topicAffinity: 'Topic Affinity / Reader Interest',
      recency: 'Publication Recency & Timeliness',
      sourceCredibility: 'Source Reliability & Verification',
      diversityScore: 'Content & Viewpoint Diversity',
      engagementVelocity: 'Reader Engagement Velocity'
    };

    Object.entries(t.metrics).forEach(([key, val]) => {
      const row = document.createElement('div');
      row.className = 'mini-bar-row';
      row.style.marginBottom = '0.5rem';
      row.style.fontSize = '0.82rem';
      row.innerHTML = `
        <span style="width: 45%;">${metricLabels[key] || key}</span>
        <div class="bar-track" style="width: 40%; height: 8px;">
          <div class="bar-fill" style="width: ${val}%;"></div>
        </div>
        <strong style="width: 15%; text-align: right; color: #fff;">${val}%</strong>
      `;
      dom.modalMetricsContainer.appendChild(row);
    });

    // Factors breakdown
    dom.modalFactorsContainer.innerHTML = '';
    t.factors.forEach(f => {
      const card = document.createElement('div');
      card.className = 'factor-card';
      card.innerHTML = `
        <div class="factor-header">
          <span style="color: #fff;">${f.name}</span>
          <span style="color: var(--primary-light); font-weight: 700;">${f.weight}</span>
        </div>
        <p class="factor-note">${f.note}</p>
      `;
      dom.modalFactorsContainer.appendChild(card);
    });

    dom.transparencyModalOverlay.classList.add('active');
  }

  function closeTransparencyModal() {
    dom.transparencyModalOverlay.classList.remove('active');
    logTelemetry('transparency_modal_close');
  }

  // ==========================================
  // EVENT LISTENERS & NAVIGATION HANDLERS
  // ==========================================

  // Step 1: Consent Form Submit
  if (dom.formConsent) {
    dom.formConsent.addEventListener('submit', (e) => {
      e.preventDefault();
      logTelemetry('consent_agreed');
      showStep(2, dom.viewPreSurvey);
    });
  }

  // Step 2: Pre-Survey Form Submit
  if (dom.formPreSurvey) {
    dom.formPreSurvey.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(dom.formPreSurvey);
      const answers = Object.fromEntries(formData.entries());

      try {
        await fetch('/api/survey/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            participant_id: state.participantId,
            prolific_id: state.prolificId,
            survey_type: 'pre_survey',
            answers
          })
        });
        showStep(3, dom.viewBriefing);
      } catch (err) {
        console.error('Error submitting pre-survey:', err);
      }
    });
  }

  // Step 3: Launch News App Exploration
  if (dom.btnLaunchApp) {
    dom.btnLaunchApp.addEventListener('click', () => {
      showStep(3, dom.viewApp);
      startExplorationTimer();
    });
  }

  // Category Filtering (if present)
  if (dom.categoryTabs) {
    dom.categoryTabs.addEventListener('click', (e) => {
      if (!e.target.classList.contains('category-pill')) return;
      document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
      e.target.classList.add('active');
      state.activeCategory = e.target.dataset.category;
      logTelemetry('category_tab_click', { category: state.activeCategory });
      renderFeed();
    });
  }

  // Back to Feed Buttons
  if (dom.btnBackToFeed) {
    dom.btnBackToFeed.addEventListener('click', closeCurrentArticle);
  }
  if (dom.btnBottomBackToFeed) {
    dom.btnBottomBackToFeed.addEventListener('click', closeCurrentArticle);
  }

  // Modal Close
  if (dom.btnCloseTransparencyModal) {
    dom.btnCloseTransparencyModal.addEventListener('click', closeTransparencyModal);
  }
  if (dom.transparencyModalOverlay) {
    dom.transparencyModalOverlay.addEventListener('click', (e) => {
      if (e.target === dom.transparencyModalOverlay) closeTransparencyModal();
    });
  }

  // Info Icon Legend Toggle & Outside Click
  if (dom.btnInfoIcon && dom.infoLegendPopover) {
    dom.btnInfoIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      dom.infoLegendPopover.classList.toggle('active');
      logTelemetry('info_icon_click', { condition: state.condition });
    });

    document.addEventListener('click', (e) => {
      if (dom.headerInfoWrap && !dom.headerInfoWrap.contains(e.target)) {
        dom.infoLegendPopover.classList.remove('active');
      }
    });
  }

  // Proceed from App to Post-Survey
  if (dom.btnProceedToPostSurvey) {
    dom.btnProceedToPostSurvey.addEventListener('click', () => {
      closeCurrentArticle();
      clearInterval(state.timerInterval);
      showStep(4, dom.viewPostSurvey);
    });
  }

  // Step 4: Post-Survey Form Submit
  if (dom.formPostSurvey) {
    dom.formPostSurvey.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(dom.formPostSurvey);
      const answers = Object.fromEntries(formData.entries());

      try {
        // 1. Submit survey answers
        await fetch('/api/survey/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            participant_id: state.participantId,
            prolific_id: state.prolificId,
            survey_type: 'post_survey',
            answers
          })
        });

        // 2. Mark study as completed
        const completeRes = await fetch('/api/participant/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            participant_id: state.participantId,
            prolific_id: state.prolificId
          })
        });

        const completeData = await completeRes.json();
        if (completeData.success) {
          if (dom.finalCompletionCode) {
            dom.finalCompletionCode.textContent = completeData.completionCode;
          }
          if (dom.btnProlificRedirect) {
            dom.btnProlificRedirect.href = completeData.completionUrl;
          }
        }

        showStep(5, dom.viewCompletion);
      } catch (err) {
        console.error('Error submitting post-survey:', err);
      }
    });
  }

  // Copy Completion Code Button
  if (dom.btnCopyCode) {
    dom.btnCopyCode.addEventListener('click', () => {
      const code = dom.finalCompletionCode ? dom.finalCompletionCode.textContent.trim() : '';
      navigator.clipboard.writeText(code).then(() => {
        dom.btnCopyCode.textContent = '✅ Copied!';
        setTimeout(() => { dom.btnCopyCode.textContent = '📋 Copy Code'; }, 2000);
      });
    });
  }

  // Set formatted current date in mobile header (if present)
  if (dom.liveAppDate) {
    const today = new Date();
    dom.liveAppDate.textContent = today.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric'
    });
  }

  // Kickoff Initialization
  initParticipant();

})();
