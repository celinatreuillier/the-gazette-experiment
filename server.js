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
    const minSeconds = parseInt(getConfig('min_exploration_seconds') || '60', 10);
    const completionCode = getConfig('prolific_completion_code') || 'C173R72D';
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

    const completionCode = getConfig('prolific_completion_code') || 'C173R72D';
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
      // Attention Checks
      'pre_attention_check', 'pre_attention_check_passed',
      'post_attention_check', 'post_attention_check_passed',
      'all_attention_checks_passed',
      // Pre-Survey Q1: News Frequency
      'pre_q1_news_frequency',
      // Pre-Survey Q2: Topic Interests (1-5)
      'pre_q2_topic_politics', 'pre_q2_topic_economy', 'pre_q2_topic_sports', 'pre_q2_topic_science', 'pre_q2_topic_lifestyle',
      // Pre-Survey Q3: News App Experience & Trust (1-5)
      'pre_q3_curated_editors', 'pre_q3_personalized_algo', 'pre_q3_trend_algo', 'pre_q3_trust_recommended',
      // Pre-Survey Q5: Online Recommendation Frequency (1-5)
      'pre_q5_recommendation_frequency',
      // Pre-Survey Q6: Recommender System Understanding (1-5)
      'pre_q6_recommender_system_understanding',
      // Post-Survey Questions
      'post_q1_notice_icons',
      'post_q1b_icons_indicated',
      'post_q1c_icon_meaning_test',
      'post_q2_clarity_why_recommended',
      'post_q2_confidence_system_ability',
      'post_q2_rely_as_reliable_source',
      'post_q2_overall_selection_trustworthy',
      'post_q2_selected_fair_way',
      'post_q2_steer_what_i_read',
      'post_q2_matched_personal_interests',
      'post_q2_control_over_content',
      'post_q2_satisfied_experience',
      'post_q3_click_factors',
      'post_q4_icons_influenced_selection',
      'post_q4_icons_influence_details',
      'post_q5_open_feedback'
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

      let preAttentionCheck = '', preAttentionPassed = '';
      let postAttentionCheck = '', postAttentionPassed = '';
      let preQ1 = '', preQ5Recommendation = '', preQ6Understanding = '';
      let preQ2 = { politics: '', economy: '', sports: '', science: '', lifestyle: '' };
      let preQ3 = { curated_editors: '', personalized_algo: '', trend_algo: '', trust_recommended: '' };

      let post = {
        notice_icons: '',
        icons_indicated: '',
        icon_meaning_test: '',
        clarity_why_recommended: '',
        confidence_system_ability: '',
        rely_as_reliable_source: '',
        overall_selection_trustworthy: '',
        selected_fair_way: '',
        steer_what_i_read: '',
        matched_personal_interests: '',
        control_over_content: '',
        satisfied_experience: '',
        click_factors: '',
        icons_influenced_selection: '',
        icons_influence_details: '',
        open_feedback: ''
      };

      pSurveys.forEach(s => {
        try {
          const parsed = JSON.parse(s.answers_json);
          if (s.survey_type === 'pre_survey') {
            preQ1 = parsed.news_frequency || '';
            preQ5Recommendation = parsed.recommendation_frequency || '';
            preQ6Understanding = parsed.recommender_system_understanding || parsed.recommender_understanding || '';
            preAttentionCheck = parsed.pre_attention_check || '';
            if (preAttentionCheck !== '') {
              preAttentionPassed = String(preAttentionCheck) === '4' ? 1 : 0;
            }

            // Q2 Topics (5 Interface Categories)
            preQ2.politics = parsed.topic_politics || '';
            preQ2.economy = parsed.topic_economy || '';
            preQ2.sports = parsed.topic_sports || '';
            preQ2.science = parsed.topic_science || parsed.topic_science_tech || '';
            preQ2.lifestyle = parsed.topic_lifestyle || '';

            // Q3 Statements (News App Experience & Trust)
            preQ3.curated_editors = parsed.curated_editors_valuable || '';
            preQ3.personalized_algo = parsed.personalized_algo_valuable || '';
            preQ3.trend_algo = parsed.trend_algo_valuable || '';
            preQ3.trust_recommended = parsed.trust_recommended_news || '';
          } else if (s.survey_type === 'post_survey') {
            postAttentionCheck = parsed.post_attention_check || '';
            if (postAttentionCheck !== '') {
              postAttentionPassed = String(postAttentionCheck) === '3' ? 1 : 0;
            }

            post.notice_icons = parsed.notice_icons || '';
            post.icons_indicated = parsed.icons_indicated || '';
            post.icon_meaning_test = parsed.icon_meaning_test || '';
            post.clarity_why_recommended = parsed.post_clarity_why_recommended || '';
            post.confidence_system_ability = parsed.post_confidence_system_ability || '';
            post.rely_as_reliable_source = parsed.post_rely_as_reliable_source || '';
            post.overall_selection_trustworthy = parsed.post_overall_selection_trustworthy || '';
            post.selected_fair_way = parsed.post_selected_fair_way || '';
            post.steer_what_i_read = parsed.post_steer_what_i_read || '';
            post.matched_personal_interests = parsed.post_matched_personal_interests || '';
            post.control_over_content = parsed.post_control_over_content || '';
            post.satisfied_experience = parsed.post_satisfied_experience || '';
            post.click_factors = Array.isArray(parsed.click_factors) ? parsed.click_factors.join('; ') : (parsed.click_factors || '');
            post.icons_influenced_selection = parsed.icons_influenced_selection || '';
            post.icons_influence_details = parsed.icons_influence_details || '';
            post.open_feedback = parsed.open_feedback || parsed.post_open_feedback || '';
          }
        } catch (err) {}
      });

      let allAttentionPassed = '';
      if (preAttentionPassed !== '' || postAttentionPassed !== '') {
        const preOk = preAttentionPassed === '' || preAttentionPassed === 1;
        const postOk = postAttentionPassed === '' || postAttentionPassed === 1;
        allAttentionPassed = (preAttentionPassed === 1 && postAttentionPassed === 1) ? 1 : 0;
      }

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
        // Attention Checks
        escapeCsv(preAttentionCheck),
        escapeCsv(preAttentionPassed),
        escapeCsv(postAttentionCheck),
        escapeCsv(postAttentionPassed),
        escapeCsv(allAttentionPassed),
        // Pre-Survey Q1
        escapeCsv(preQ1),
        // Pre-Survey Q2 (5 Topics)
        escapeCsv(preQ2.politics), escapeCsv(preQ2.economy), escapeCsv(preQ2.sports), escapeCsv(preQ2.science), escapeCsv(preQ2.lifestyle),
        // Pre-Survey Q3 (News App Experience)
        escapeCsv(preQ3.curated_editors), escapeCsv(preQ3.personalized_algo), escapeCsv(preQ3.trend_algo), escapeCsv(preQ3.trust_recommended),
        // Pre-Survey Q5
        escapeCsv(preQ5Recommendation),
        // Pre-Survey Q6
        escapeCsv(preQ6Understanding),
        // Post-Survey Questions
        escapeCsv(post.notice_icons),
        escapeCsv(post.icons_indicated),
        escapeCsv(post.icon_meaning_test),
        escapeCsv(post.clarity_why_recommended),
        escapeCsv(post.confidence_system_ability),
        escapeCsv(post.rely_as_reliable_source),
        escapeCsv(post.overall_selection_trustworthy),
        escapeCsv(post.selected_fair_way),
        escapeCsv(post.steer_what_i_read),
        escapeCsv(post.matched_personal_interests),
        escapeCsv(post.control_over_content),
        escapeCsv(post.satisfied_experience),
        escapeCsv(post.click_factors),
        escapeCsv(post.icons_influenced_selection),
        escapeCsv(post.icons_influence_details),
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
