// The Gazette Experiment - Admin Dashboard Controller

(function() {
  'use strict';

  const dom = {
    statTotalParticipants: document.getElementById('statTotalParticipants'),
    statCompletedParticipants: document.getElementById('statCompletedParticipants'),
    statTotalEvents: document.getElementById('statTotalEvents'),
    statTotalSurveys: document.getElementById('statTotalSurveys'),
    statMinTime: document.getElementById('statMinTime'),
    
    cond1Count: document.getElementById('cond1Count'),
    cond1Completed: document.getElementById('cond1Completed'),
    cond2Count: document.getElementById('cond2Count'),
    cond2Completed: document.getElementById('cond2Completed'),
    cond3Count: document.getElementById('cond3Count'),
    cond3Completed: document.getElementById('cond3Completed'),

    participantsTableBody: document.getElementById('participantsTableBody'),
    btnRefreshStats: document.getElementById('btnRefreshStats')
  };

  async function loadAdminStats() {
    try {
      const res = await fetch('/api/admin/stats');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      const { stats } = data;

      // Stats counters
      const totalParticipants = stats.recentParticipants.length;
      const completedCount = stats.recentParticipants.filter(p => p.status === 'completed').length;
      
      dom.statTotalParticipants.textContent = totalParticipants;
      dom.statCompletedParticipants.textContent = `${completedCount} completed`;
      dom.statTotalEvents.textContent = stats.totalEvents;
      dom.statTotalSurveys.textContent = stats.totalSurveys;
      dom.statMinTime.textContent = `${stats.config.min_exploration_seconds || 120}s`;

      // Condition balance
      const condCounts = { 1: { total: 0, comp: 0 }, 2: { total: 0, comp: 0 }, 3: { total: 0, comp: 0 } };
      stats.conditionStats.forEach(c => {
        if (condCounts[c.condition]) {
          condCounts[c.condition].total = c.total_participants;
          condCounts[c.condition].comp = c.completed_count;
        }
      });

      dom.cond1Count.textContent = condCounts[1].total;
      dom.cond1Completed.textContent = `${condCounts[1].comp} finished`;

      dom.cond2Count.textContent = condCounts[2].total;
      dom.cond2Completed.textContent = `${condCounts[2].comp} finished`;

      dom.cond3Count.textContent = condCounts[3].total;
      dom.cond3Completed.textContent = `${condCounts[3].comp} finished`;

      // Table Render
      dom.participantsTableBody.innerHTML = '';
      if (stats.recentParticipants.length === 0) {
        dom.participantsTableBody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">
              No participants recorded yet. Run a preview session to see live telemetry!
            </td>
          </tr>
        `;
        return;
      }

      const condLabels = {
        1: 'C1: Baseline',
        2: 'C2: Badges',
        3: 'C3: Transparency'
      };

      stats.recentParticipants.forEach(p => {
        const row = document.createElement('tr');
        const isComp = p.status === 'completed';
        const statusClass = isComp ? 'completed' : 'in_progress';
        const statusText = isComp ? 'Completed' : (p.status || 'In Progress');

        row.innerHTML = `
          <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.8rem;">#${p.id}</td>
          <td style="font-family: 'JetBrains Mono', monospace; color: #cbd5e1;">${p.prolific_id}</td>
          <td><strong>${condLabels[p.condition] || p.condition}</strong></td>
          <td><span class="badge-status ${statusClass}">${statusText}</span></td>
          <td style="color: var(--text-muted); font-size: 0.8rem;">${formatDate(p.created_at)}</td>
          <td style="color: var(--text-muted); font-size: 0.8rem;">${p.completed_at ? formatDate(p.completed_at) : '—'}</td>
        `;
        dom.participantsTableBody.appendChild(row);
      });

    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }

  function formatDate(isoStr) {
    if (!isoStr) return '—';
    // If string from SQLite is in 'YYYY-MM-DD HH:MM:SS' UTC format, append 'T' and 'Z' to parse as UTC
    let dateStr = String(isoStr).trim();
    if (!dateStr.endsWith('Z') && !dateStr.includes('+') && dateStr.includes(' ')) {
      dateStr = dateStr.replace(' ', 'T') + 'Z';
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? isoStr : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + d.toLocaleDateString();
  }

  dom.btnRefreshStats.addEventListener('click', loadAdminStats);

  // Initial load
  loadAdminStats();

  // Auto-refresh every 15s
  setInterval(loadAdminStats, 15000);

})();
