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
    minExplorationSeconds: 60,
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

    // Post-Survey Elements
    formPostSurvey: document.getElementById('formPostSurvey'),
    qNoticeIconsCard: document.getElementById('qNoticeIconsCard'),
    qIconsIndicatedCard: document.getElementById('qIconsIndicatedCard'),
    qIconMeaningCard: document.getElementById('qIconMeaningCard'),
    exampleIconDisplay: document.getElementById('exampleIconDisplay'),
    iconMeaningOptionsContainer: document.getElementById('iconMeaningOptionsContainer'),
    clickFactorsList: document.getElementById('clickFactorsList'),
    clickFactorsCounter: document.getElementById('clickFactorsCounter'),
    qIconsInfluenceCard: document.getElementById('qIconsInfluenceCard'),
    qIconsInfluenceDetailsWrap: document.getElementById('qIconsInfluenceDetailsWrap'),

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
            <span> Understanding the Icons</span>
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
            <span>Understanding the Icons</span>
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

  // Dynamic Condition-Specific Configuration for Post-Questionnaire
  function setupPostSurvey(condition) {
    const qIconMeaningCard = document.getElementById('qIconMeaningCard');
    const exampleIconDisplay = document.getElementById('exampleIconDisplay');
    const iconMeaningOptionsContainer = document.getElementById('iconMeaningOptionsContainer');
    const qIconsInfluenceCard = document.getElementById('qIconsInfluenceCard');
    const iconsInfluenceRadios = document.querySelectorAll('input[name="icons_influenced_selection"]');

    // Q3 condition-specific checkboxes
    const factorEditor = document.querySelector('.cond-factor-editor');
    const factorAlgorithm = document.querySelector('.cond-factor-algorithm');
    const factorExplanation = document.querySelector('.cond-factor-explanation');

    // Q1c icon test starts hidden for all conditions until participant selects Yes in 1a
    if (qIconMeaningCard) {
      qIconMeaningCard.style.display = 'none';
      const testRadios = qIconMeaningCard.querySelectorAll('input[type="radio"]');
      testRadios.forEach(r => { r.required = false; r.checked = false; });
    }

    if (condition === 1) {
      // Factors in Q3: hide condition-specific factors
      if (factorEditor) {
        factorEditor.style.display = 'none';
        const input = factorEditor.querySelector('input');
        if (input) { input.checked = false; input.disabled = true; }
      }
      if (factorAlgorithm) {
        factorAlgorithm.style.display = 'none';
        const input = factorAlgorithm.querySelector('input');
        if (input) { input.checked = false; input.disabled = true; }
      }
      if (factorExplanation) {
        factorExplanation.style.display = 'none';
        const input = factorExplanation.querySelector('input');
        if (input) { input.checked = false; input.disabled = true; }
      }

      // Q4: Hide icons influence card
      if (qIconsInfluenceCard) {
        qIconsInfluenceCard.style.display = 'none';
        iconsInfluenceRadios.forEach(r => { r.required = false; r.checked = false; });
      }
    } else if (condition === 2) {
      // Prepare Condition 2 Icon and Options for 1c (shown only if participant answers Yes to 1a)
      if (qIconMeaningCard) {
        if (exampleIconDisplay) {
          exampleIconDisplay.innerHTML = getCondition2Icon('algorithm');
        }
        if (iconMeaningOptionsContainer) {
          iconMeaningOptionsContainer.innerHTML = `
            <label class="likert-option">
              <input type="radio" name="icon_meaning_test" value="selected_by_algorithm">
              <span>The article was selected by an algorithm</span>
            </label>
            <label class="likert-option">
              <input type="radio" name="icon_meaning_test" value="selected_by_editor">
              <span>The article was selected by a human editor</span>
            </label>
            <label class="likert-option">
              <input type="radio" name="icon_meaning_test" value="trending">
              <span>The article is trending</span>
            </label>
            <label class="likert-option">
              <input type="radio" name="icon_meaning_test" value="personal_interests">
              <span>The article matches my personal interests</span>
            </label>
            <label class="likert-option">
              <input type="radio" name="icon_meaning_test" value="dont_know">
              <span>I don’t know</span>
            </label>
          `;
        }
      }

      // Factors in Q3: show editor and algorithm, hide explanation
      if (factorEditor) {
        factorEditor.style.display = '';
        const input = factorEditor.querySelector('input');
        if (input) { input.disabled = false; }
      }
      if (factorAlgorithm) {
        factorAlgorithm.style.display = '';
        const input = factorAlgorithm.querySelector('input');
        if (input) { input.disabled = false; }
      }
      if (factorExplanation) {
        factorExplanation.style.display = 'none';
        const input = factorExplanation.querySelector('input');
        if (input) { input.checked = false; input.disabled = true; }
      }

      // Q4: Show icons influence card
      if (qIconsInfluenceCard) {
        qIconsInfluenceCard.style.display = 'block';
        if (iconsInfluenceRadios.length > 0) {
          iconsInfluenceRadios[0].required = true;
        }
      }
    } else if (condition === 3) {
      // Prepare Condition 3 Icon and Options for 1c (shown only if participant answers Yes to 1a)
      if (qIconMeaningCard) {
        if (exampleIconDisplay) {
          exampleIconDisplay.innerHTML = getCondition3Icon('T');
        }
        if (iconMeaningOptionsContainer) {
          iconMeaningOptionsContainer.innerHTML = `
            <label class="likert-option">
              <input type="radio" name="icon_meaning_test" value="trending_among_readers">
              <span>The article is trending among readers</span>
            </label>
            <label class="likert-option">
              <input type="radio" name="icon_meaning_test" value="personal_interests">
              <span>The article matches my personal interests</span>
            </label>
            <label class="likert-option">
              <input type="radio" name="icon_meaning_test" value="similar_readers">
              <span>The article was recommended based on similar readers</span>
            </label>
            <label class="likert-option">
              <input type="radio" name="icon_meaning_test" value="selected_by_editor">
              <span>The article was selected by a human editor</span>
            </label>
            <label class="likert-option">
              <input type="radio" name="icon_meaning_test" value="dont_know">
              <span>I don’t know</span>
            </label>
          `;
        }
      }

      // Factors in Q3: show all
      if (factorEditor) {
        factorEditor.style.display = '';
        const input = factorEditor.querySelector('input');
        if (input) { input.disabled = false; }
      }
      if (factorAlgorithm) {
        factorAlgorithm.style.display = '';
        const input = factorAlgorithm.querySelector('input');
        if (input) { input.disabled = false; }
      }
      if (factorExplanation) {
        factorExplanation.style.display = '';
        const input = factorExplanation.querySelector('input');
        if (input) { input.disabled = false; }
      }

      // Q4: Show icons influence card
      if (qIconsInfluenceCard) {
        qIconsInfluenceCard.style.display = 'block';
        if (iconsInfluenceRadios.length > 0) {
          iconsInfluenceRadios[0].required = true;
        }
      }
    }

    // Check if 1a was already answered "Yes" (e.g. if setup is called after user selection)
    const active1aYes = document.querySelector('input[name="notice_icons"]:checked');
    if (active1aYes && active1aYes.value === 'yes' && (condition === 2 || condition === 3)) {
      if (qIconMeaningCard) {
        qIconMeaningCard.style.display = 'block';
        const firstMeaningRadio = qIconMeaningCard.querySelector('input[name="icon_meaning_test"]');
        if (firstMeaningRadio) firstMeaningRadio.required = true;
      }
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
        setupPostSurvey(state.condition);
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
        dom.btnProceedToPostSurvey.textContent = 'Continue to Survey';
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
      setupPostSurvey(state.condition);
      showStep(4, dom.viewPostSurvey);
    });
  }

  // Question 1 Notice Icons change
  const noticeIconsRadios = document.querySelectorAll('input[name="notice_icons"]');
  const qIconsIndicatedCard = document.getElementById('qIconsIndicatedCard');
  const iconsIndicatedRadios = document.querySelectorAll('input[name="icons_indicated"]');
  const qIconMeaningCard = document.getElementById('qIconMeaningCard');

  noticeIconsRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'yes') {
        // Show 1b
        if (qIconsIndicatedCard) {
          qIconsIndicatedCard.style.display = 'block';
        }
        if (iconsIndicatedRadios.length > 0) {
          iconsIndicatedRadios[0].required = true;
        }

        // Show 1c ONLY for Condition 2 and Condition 3
        if (state.condition === 2 || state.condition === 3) {
          if (qIconMeaningCard) {
            qIconMeaningCard.style.display = 'block';
            const meaningRadios = qIconMeaningCard.querySelectorAll('input[name="icon_meaning_test"]');
            if (meaningRadios.length > 0) {
              meaningRadios[0].required = true;
            }
          }
        } else {
          if (qIconMeaningCard) {
            qIconMeaningCard.style.display = 'none';
            const meaningRadios = qIconMeaningCard.querySelectorAll('input[name="icon_meaning_test"]');
            meaningRadios.forEach(r => {
              r.required = false;
              r.checked = false;
            });
          }
        }
      } else {
        // Participant selected 'no' or 'not_sure': hide 1b and 1c
        if (qIconsIndicatedCard) {
          qIconsIndicatedCard.style.display = 'none';
        }
        iconsIndicatedRadios.forEach(r => {
          r.required = false;
          r.checked = false;
        });

        if (qIconMeaningCard) {
          qIconMeaningCard.style.display = 'none';
          const meaningRadios = qIconMeaningCard.querySelectorAll('input[name="icon_meaning_test"]');
          meaningRadios.forEach(r => {
            r.required = false;
            r.checked = false;
          });
        }
      }
    });
  });

  // Question 3 Click Decision Factors (Max 3 Checkboxes Limiter & Counter)
  const clickFactorsList = document.getElementById('clickFactorsList');
  const clickFactorsCounter = document.getElementById('clickFactorsCounter');

  if (clickFactorsList) {
    clickFactorsList.addEventListener('change', () => {
      const allCheckboxes = Array.from(clickFactorsList.querySelectorAll('input[type="checkbox"]'));
      // Only consider visible checkboxes
      const visibleCheckboxes = allCheckboxes.filter(cb => {
        const item = cb.closest('.checkbox-item');
        return item && item.style.display !== 'none';
      });

      const checkedCount = visibleCheckboxes.filter(cb => cb.checked).length;

      if (clickFactorsCounter) {
        clickFactorsCounter.textContent = `(Selected: ${checkedCount}/3)`;
      }

      if (checkedCount >= 3) {
        visibleCheckboxes.forEach(cb => {
          if (!cb.checked) {
            cb.disabled = true;
            const item = cb.closest('.checkbox-item');
            if (item) item.classList.add('disabled');
          }
        });
      } else {
        visibleCheckboxes.forEach(cb => {
          cb.disabled = false;
          const item = cb.closest('.checkbox-item');
          if (item) item.classList.remove('disabled');
        });
      }
    });
  }

  // Question 4 Icons Influence Yes/No
  const iconsInfluenceRadios = document.querySelectorAll('input[name="icons_influenced_selection"]');
  const qIconsInfluenceDetailsWrap = document.getElementById('qIconsInfluenceDetailsWrap');
  const iconsInfluenceDetailsText = document.querySelector('textarea[name="icons_influence_details"]');

  iconsInfluenceRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'yes') {
        if (qIconsInfluenceDetailsWrap) {
          qIconsInfluenceDetailsWrap.style.display = 'block';
        }
      } else {
        if (qIconsInfluenceDetailsWrap) {
          qIconsInfluenceDetailsWrap.style.display = 'none';
        }
        if (iconsInfluenceDetailsText) {
          iconsInfluenceDetailsText.value = '';
        }
      }
    });
  });

  // Step 4: Post-Survey Form Submit
  if (dom.formPostSurvey) {
    dom.formPostSurvey.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Validate Question 3 (click factors): at least 1 must be selected
      const selectedFactors = Array.from(document.querySelectorAll('#clickFactorsList input[type="checkbox"]:checked'))
        .map(cb => cb.value);
      if (selectedFactors.length === 0) {
        alert('Please select at least 1 factor (up to 3) for Question 3.');
        const q3Card = document.getElementById('qClickFactorsCard');
        if (q3Card) {
          q3Card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }

      const formData = new FormData(dom.formPostSurvey);
      const answers = Object.fromEntries(formData.entries());
      answers.click_factors = selectedFactors;

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
