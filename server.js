const express = require('express');
const cors = require('cors');
const path = require('path');
const { NEWS_ARTICLES } = require('./newsData');
const {
  getOrCreateParticipant,
  updateParticipantStatus,
  saveSurveyResponse,
  logTelemetryEvent,
  getConfig,
  getAdminStats,
  getAllDataForExport
} = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.text({ type: ['text/*', 'application/json'], limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper to filter news data according to experimental condition
function filterNewsForCondition(articles, condition) {
  const cond = Number(condition);
  return articles.map(art => {
    const base = {
      id: art.id,
      title: art.title,
      header: art.header,
      content: art.content,
      topic: art.topic
    };

    if (cond === 1) {
      // Condition 1: Control - Title, header, and content preview only
      return base;
    } else if (cond === 2) {
      // Condition 2: c1_v3_icons - Source badge (algorithm vs editor) + Topic pill
      return {
        ...base,
        reco_source: art.reco_source
      };
    } else if (cond === 3) {
      // Condition 3: c2_v2_icons - Explanation badge (T, C, P, A) + Topic pill
      return {
        ...base,
        explanation: art.explanation
      };
    }

    return base;
  });
}

// ==========================================
// API ROUTES
// ==========================================

// 1. Get study public configuration
app.get('/api/config', (req, res) => {
  try {
    const minSeconds = parseInt(getConfig('min_exploration_seconds') || '120', 10);
    const completionCode = getConfig('prolific_completion_code') || 'C19X8A9L';
    const completionUrl = getConfig('prolific_completion_url') || `https://app.prolific.com/submissions/complete?cc=${completionCode}`;

    res.json({
      success: true,
      minExplorationSeconds: minSeconds,
      prolificCompletionCode: completionCode,
      prolificCompletionUrl: completionUrl
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Initialize or fetch participant (Balanced Random Assignment)
app.post('/api/participant/init', (req, res) => {
  try {
    const { prolific_id, study_id, session_id } = req.body;
    if (!prolific_id) {
      return res.status(400).json({ success: false, error: 'prolific_id is required' });
    }

    const participant = getOrCreateParticipant(
      prolific_id.trim(),
      study_id ? study_id.trim() : '',
      session_id ? session_id.trim() : ''
    );

    // Log initialization event
    logTelemetryEvent({
      participant_id: participant.id,
      prolific_id: participant.prolific_id,
      condition: participant.condition,
      event_type: 'participant_init',
      metadata: { study_id, session_id, userAgent: req.headers['user-agent'] }
    });

    res.json({
      success: true,
      participant: {
        id: participant.id,
        prolific_id: participant.prolific_id,
        condition: participant.condition,
        status: participant.status
      }
    });
  } catch (err) {
    console.error('Init error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper: Fisher-Yates array shuffle for randomized news order
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 3. Get News Articles tailored for participant's condition (Randomized Order)
app.get('/api/news', (req, res) => {
  try {
    const condition = req.query.condition ? parseInt(req.query.condition, 10) : 1;
    const articles = filterNewsForCondition(NEWS_ARTICLES, condition);
    const randomizedArticles = shuffleArray(articles);
    res.json({ success: true, condition, articles: randomizedArticles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Save survey answers (pre_survey or post_survey)
app.post('/api/survey/submit', (req, res) => {
  try {
    const { participant_id, prolific_id, survey_type, answers } = req.body;
    if (!participant_id || !prolific_id || !survey_type || !answers) {
      return res.status(400).json({ success: false, error: 'Missing survey parameters' });
    }

    saveSurveyResponse(participant_id, prolific_id, survey_type, answers);

    // Update status based on survey type
    if (survey_type === 'pre_survey') {
      updateParticipantStatus(participant_id, 'pre_survey_done');
    } else if (survey_type === 'post_survey') {
      updateParticipantStatus(participant_id, 'post_survey_done');
    }

    logTelemetryEvent({
      participant_id,
      prolific_id,
      event_type: `survey_completed_${survey_type}`,
      metadata: { answer_keys: Object.keys(answers) }
    });

    res.json({ success: true, message: `${survey_type} saved successfully` });
  } catch (err) {
    console.error('Survey error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Log Telemetry Events (Batch or Single)
app.post('/api/telemetry/log', (req, res) => {
  try {
    let payload = req.body;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (e) {
        console.warn('Failed to parse string telemetry payload:', e);
      }
    }

    if (Array.isArray(payload)) {
      // Batch logging
      payload.forEach(evt => logTelemetryEvent(evt));
    } else if (payload && payload.event_type) {
      // Single event logging
      logTelemetryEvent(payload);
    } else {
      return res.status(400).json({ success: false, error: 'Invalid telemetry payload' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Telemetry error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Complete Study
app.post('/api/participant/complete', (req, res) => {
  try {
    const { participant_id, prolific_id } = req.body;
    if (!participant_id) {
      return res.status(400).json({ success: false, error: 'participant_id is required' });
    }

    updateParticipantStatus(participant_id, 'completed');

    logTelemetryEvent({
      participant_id,
      prolific_id,
      event_type: 'study_completed',
      metadata: { timestamp: new Date().toISOString() }
    });

    const completionCode = getConfig('prolific_completion_code') || 'C19X8A9L';
    const completionUrl = getConfig('prolific_completion_url') || `https://app.prolific.com/submissions/complete?cc=${completionCode}`;

    res.json({
      success: true,
      completionCode,
      completionUrl
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// RESEARCHER / ADMIN DASHBOARD & DATA EXPORT
// ==========================================

// Admin overview stats
app.get('/api/admin/stats', (req, res) => {
  try {
    const stats = getAdminStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper for CSV escaping
function escapeCsv(val) {
  if (val === null || val === undefined) return '""';
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  return `"${str.replace(/"/g, '""')}"`;
}

// Download Full CSV Dataset
app.get('/api/admin/export/csv', (req, res) => {
  try {
    const type = req.query.type || 'all'; // 'participants', 'surveys', 'events', or 'all'
    const { participants, surveys, events } = getAllDataForExport();

    if (type === 'participants') {
      const headers = ['id', 'prolific_id', 'study_id', 'session_id', 'condition', 'status', 'created_at', 'completed_at'];
      const rows = participants.map(p => headers.map(h => escapeCsv(p[h])).join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      res.header('Content-Type', 'text/csv');
      res.attachment(`prolific_participants_${Date.now()}.csv`);
      return res.send(csv);
    }

    if (type === 'surveys') {
      const headers = ['id', 'participant_id', 'prolific_id', 'survey_type', 'answers_json', 'created_at'];
      const rows = surveys.map(s => headers.map(h => escapeCsv(s[h])).join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      res.header('Content-Type', 'text/csv');
      res.attachment(`prolific_surveys_${Date.now()}.csv`);
      return res.send(csv);
    }

    if (type === 'events') {
      const headers = ['id', 'participant_id', 'prolific_id', 'condition', 'event_type', 'article_id', 'duration_ms', 'scroll_percentage', 'metadata_json', 'client_timestamp', 'created_at'];
      const rows = events.map(e => headers.map(h => escapeCsv(e[h])).join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      res.header('Content-Type', 'text/csv');
      res.attachment(`prolific_telemetry_events_${Date.now()}.csv`);
      return res.send(csv);
    }

    // Default: Combined flattened summary dataset for SPSS/R
    const headers = [
      'participant_id', 'prolific_id', 'study_id', 'session_id', 'condition', 'status', 'study_created_at', 'study_completed_at',
      'total_articles_clicked', 'total_dwell_time_seconds', 'avg_scroll_depth_pct', 'transparency_drawer_interactions',
      // Pre-Survey Q1: News Frequency
      'pre_q1_news_frequency',
      // Pre-Survey Q2: Topic Interests (1-5)
      'pre_q2_topic_politics', 'pre_q2_topic_economy', 'pre_q2_topic_health', 'pre_q2_topic_science_tech',
      'pre_q2_topic_environment', 'pre_q2_topic_education', 'pre_q2_topic_culture', 'pre_q2_topic_lifestyle',
      'pre_q2_topic_sports', 'pre_q2_topic_travel', 'pre_q2_topic_food', 'pre_q2_topic_crime',
      'pre_q2_topic_local', 'pre_q2_topic_international',
      // Pre-Survey Q3: Goals when choosing news (1-5)
      'pre_q3_goal_stay_updated', 'pre_q3_goal_understand_issue', 'pre_q3_goal_broader_perspective',
      'pre_q3_goal_entertaining', 'pre_q3_goal_inspiring_constructive', 'pre_q3_goal_follow_trends',
      // Pre-Survey Q4: Decision elements to open article (1-5)
      'pre_q4_decide_topic', 'pre_q4_decide_title', 'pre_q4_decide_short_desc', 'pre_q4_decide_source',
      'pre_q4_decide_useful', 'pre_q4_decide_original', 'pre_q4_decide_emotionally_engaging',
      // Pre-Survey Q5: Online Recommendation Frequency (1-5)
      'pre_q5_recommendation_frequency',
      // Post-Survey Questions (Q1 - Q13)
      'post_q1_realism',
      'post_q2_decision_ease',
      'post_q3_interesting',
      'post_q4_relevance',
      'post_q5_noticed_extra_info',
      'post_q6_extra_info_usefulness',
      'post_q7_extra_info_clarity',
      'post_q8_extra_info_trust',
      'post_q9_remember_editor',
      'post_q9_remember_algorithm',
      'post_q9_remember_explanation',
      'post_q9_remember_do_not_remember',
      'post_q9_remember_did_not_see',
      'post_q10_familiarity_recommendations',
      'post_q11_familiarity_gen_ai',
      'post_q12_frequency_gen_ai',
      'post_q13_open_feedback'
    ];

    // Compute aggregated metrics per participant
    const rows = participants.map(p => {
      const pEvents = events.filter(e => e.participant_id === p.id);
      const pSurveys = surveys.filter(s => s.participant_id === p.id);

      const clicks = pEvents.filter(e => e.event_type === 'article_click').length;
      const totalDwellMs = pEvents.filter(e => e.event_type === 'article_dwell').reduce((sum, e) => sum + (Number(e.duration_ms) || 0), 0);
      const scrollEvents = pEvents.filter(e => e.event_type === 'article_scroll');
      const avgScroll = scrollEvents.length > 0 ? (scrollEvents.reduce((s, e) => s + (Number(e.scroll_percentage) || 0), 0) / scrollEvents.length).toFixed(1) : 0;
      const transparencyClicks = pEvents.filter(e => e.event_type === 'transparency_modal_open').length;

      let preQ1 = '', preQ5 = '';
      let preQ2 = { politics: '', economy: '', health: '', science_tech: '', environment: '', education: '', culture: '', lifestyle: '', sports: '', travel: '', food: '', crime: '', local: '', international: '' };
      let preQ3 = { stay_updated: '', understand_issue: '', broader_perspective: '', entertaining: '', inspiring_constructive: '', follow_trends: '' };
      let preQ4 = { topic: '', title: '', short_desc: '', source: '', useful: '', original: '', emotionally_engaging: '' };

      let post = {
        realism: '',
        decision_ease: '',
        interesting: '',
        relevance: '',
        noticed_extra_info: '',
        extra_info_usefulness: '',
        extra_info_clarity: '',
        extra_info_trust: '',
        remember_editor: '',
        remember_algorithm: '',
        remember_explanation: '',
        remember_do_not_remember: '',
        remember_did_not_see: '',
        familiarity_recommendations: '',
        familiarity_gen_ai: '',
        frequency_gen_ai: '',
        open_feedback: ''
      };

      pSurveys.forEach(s => {
        try {
          const parsed = JSON.parse(s.answers_json);
          if (s.survey_type === 'pre_survey') {
            preQ1 = parsed.news_frequency || '';
            preQ5 = parsed.recommendation_frequency || '';

            // Q2 Topics
            preQ2.politics = parsed.topic_politics || '';
            preQ2.economy = parsed.topic_economy || '';
            preQ2.health = parsed.topic_health || '';
            preQ2.science_tech = parsed.topic_science_tech || '';
            preQ2.environment = parsed.topic_environment || '';
            preQ2.education = parsed.topic_education || '';
            preQ2.culture = parsed.topic_culture || '';
            preQ2.lifestyle = parsed.topic_lifestyle || '';
            preQ2.sports = parsed.topic_sports || '';
            preQ2.travel = parsed.topic_travel || '';
            preQ2.food = parsed.topic_food || '';
            preQ2.crime = parsed.topic_crime || '';
            preQ2.local = parsed.topic_local || '';
            preQ2.international = parsed.topic_international || '';

            // Q3 Goals
            preQ3.stay_updated = parsed.goal_stay_updated || '';
            preQ3.understand_issue = parsed.goal_understand_issue || '';
            preQ3.broader_perspective = parsed.goal_broader_perspective || '';
            preQ3.entertaining = parsed.goal_entertaining || '';
            preQ3.inspiring_constructive = parsed.goal_inspiring_constructive || '';
            preQ3.follow_trends = parsed.goal_follow_trends || '';

            // Q4 Decision Elements
            preQ4.topic = parsed.decide_topic || '';
            preQ4.title = parsed.decide_title || '';
            preQ4.short_desc = parsed.decide_short_desc || '';
            preQ4.source = parsed.decide_source || '';
            preQ4.useful = parsed.decide_useful || '';
            preQ4.original = parsed.decide_original || '';
            preQ4.emotionally_engaging = parsed.decide_emotionally_engaging || '';
          } else if (s.survey_type === 'post_survey') {
            post.realism = parsed.post_realism || '';
            post.decision_ease = parsed.post_decision_ease || '';
            post.interesting = parsed.post_interesting || '';
            post.relevance = parsed.post_relevance || '';
            post.noticed_extra_info = parsed.post_noticed_extra_info || '';
            post.extra_info_usefulness = parsed.post_extra_info_usefulness || '';
            post.extra_info_clarity = parsed.post_extra_info_clarity || '';
            post.extra_info_trust = parsed.post_extra_info_trust || '';
            post.remember_editor = parsed.remember_editor || '';
            post.remember_algorithm = parsed.remember_algorithm || '';
            post.remember_explanation = parsed.remember_explanation || '';
            post.remember_do_not_remember = parsed.remember_do_not_remember || '';
            post.remember_did_not_see = parsed.remember_did_not_see || '';
            post.familiarity_recommendations = parsed.post_familiarity_recommendations || '';
            post.familiarity_gen_ai = parsed.post_familiarity_gen_ai || '';
            post.frequency_gen_ai = parsed.post_frequency_gen_ai || '';
            post.open_feedback = parsed.post_open_feedback || '';
          }
        } catch (err) {}
      });

      return [
        escapeCsv(p.id),
        escapeCsv(p.prolific_id),
        escapeCsv(p.study_id),
        escapeCsv(p.session_id),
        escapeCsv(p.condition),
        escapeCsv(p.status),
        escapeCsv(p.created_at),
        escapeCsv(p.completed_at),
        escapeCsv(clicks),
        escapeCsv(Math.round(totalDwellMs / 1000)),
        escapeCsv(avgScroll),
        escapeCsv(transparencyClicks),
        // Pre-Survey Q1
        escapeCsv(preQ1),
        // Pre-Survey Q2
        escapeCsv(preQ2.politics), escapeCsv(preQ2.economy), escapeCsv(preQ2.health), escapeCsv(preQ2.science_tech),
        escapeCsv(preQ2.environment), escapeCsv(preQ2.education), escapeCsv(preQ2.culture), escapeCsv(preQ2.lifestyle),
        escapeCsv(preQ2.sports), escapeCsv(preQ2.travel), escapeCsv(preQ2.food), escapeCsv(preQ2.crime),
        escapeCsv(preQ2.local), escapeCsv(preQ2.international),
        // Pre-Survey Q3
        escapeCsv(preQ3.stay_updated), escapeCsv(preQ3.understand_issue), escapeCsv(preQ3.broader_perspective),
        escapeCsv(preQ3.entertaining), escapeCsv(preQ3.inspiring_constructive), escapeCsv(preQ3.follow_trends),
        // Pre-Survey Q4
        escapeCsv(preQ4.topic), escapeCsv(preQ4.title), escapeCsv(preQ4.short_desc), escapeCsv(preQ4.source),
        escapeCsv(preQ4.useful), escapeCsv(preQ4.original), escapeCsv(preQ4.emotionally_engaging),
        // Pre-Survey Q5
        escapeCsv(preQ5),
        // Post-Survey Q1 - Q13
        escapeCsv(post.realism),
        escapeCsv(post.decision_ease),
        escapeCsv(post.interesting),
        escapeCsv(post.relevance),
        escapeCsv(post.noticed_extra_info),
        escapeCsv(post.extra_info_usefulness),
        escapeCsv(post.extra_info_clarity),
        escapeCsv(post.extra_info_trust),
        escapeCsv(post.remember_editor),
        escapeCsv(post.remember_algorithm),
        escapeCsv(post.remember_explanation),
        escapeCsv(post.remember_do_not_remember),
        escapeCsv(post.remember_did_not_see),
        escapeCsv(post.familiarity_recommendations),
        escapeCsv(post.familiarity_gen_ai),
        escapeCsv(post.frequency_gen_ai),
        escapeCsv(post.open_feedback)
      ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    res.header('Content-Type', 'text/csv');
    res.attachment(`news_experiment_master_data_${Date.now()}.csv`);
    res.send(csv);
  } catch (err) {
    res.status(500).send('Error generating export: ' + err.message);
  }
});

// JSON Export
app.get('/api/admin/export/json', (req, res) => {
  try {
    const data = getAllDataForExport();
    res.json({ success: true, exportedAt: new Date().toISOString(), data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Route Direct
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Fallback to SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`📰 The Gazette Experiment Platform is running on`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   Admin Dashboard: http://localhost:${PORT}/admin`);
  console.log(`=================================================`);
});
