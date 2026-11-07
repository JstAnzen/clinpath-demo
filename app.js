const SESSION_ID = 'clinpath-' + Math.random().toString(36).substring(2, 9);
const STORAGE_KEY = 'clinpath_ai_progress_v5';

let selectedSpecialty = 'Cardiology';
let selectedSupportLevel = 'Beginner';
let activeGuidedQuestions = [];

// Views
const setupView = document.getElementById('setupView');
const interviewView = document.getElementById('interviewView');
const reviewView = document.getElementById('reviewView');
const progressView = document.getElementById('progressView');

// Nav & Status
const navPracticeBtn = document.getElementById('navPracticeBtn');
const navProgressBtn = document.getElementById('navProgressBtn');
const brandHomeBtn = document.getElementById('brandHomeBtn');
const aiStatusPill = document.getElementById('aiStatusPill');
const aiStatusDot = document.getElementById('aiStatusDot');
const statusText = document.getElementById('statusText');

// Setup Elements
const specialtyListContainer = document.getElementById('specialtyListContainer');
const supportLevelList = document.getElementById('supportLevelList');
const startConsultationBtn = document.getElementById('startConsultationBtn');

// Interview Elements
const activeDeptBadge = document.getElementById('activeDeptBadge');
const activeCaseTitle = document.getElementById('activeCaseTitle');
const activePatientPersona = document.getElementById('activePatientPersona');
const activeSupportBadge = document.getElementById('activeSupportBadge');
const backToSetupBtn = document.getElementById('backToSetupBtn');

const vBp = document.getElementById('vBp');
const vHr = document.getElementById('vHr');
const vRr = document.getElementById('vRr');
const vTemp = document.getElementById('vTemp');
const vSpo2 = document.getElementById('vSpo2');

const questionsCountBadge = document.getElementById('questionsCountBadge');
const chatMessages = document.getElementById('chatMessages');
const guidedQuestionsBox = document.getElementById('guidedQuestionsBox');
const guidedQuestionsChips = document.getElementById('guidedQuestionsChips');
const hintSupportBox = document.getElementById('hintSupportBox');
const requestHintBtn = document.getElementById('requestHintBtn');
const hintsListContainer = document.getElementById('hintsListContainer');
const advancedNoticeBox = document.getElementById('advancedNoticeBox');

const chatInputForm = document.getElementById('chatInputForm');
const chatQuestionInput = document.getElementById('chatQuestionInput');
const sendQuestionBtn = document.getElementById('sendQuestionBtn');

const observationsInput = document.getElementById('observationsInput');
const differentialsInput = document.getElementById('differentialsInput');
const diagnosisInput = document.getElementById('diagnosisInput');
const submitConsultationBtn = document.getElementById('submitConsultationBtn');

window.addEventListener('DOMContentLoaded', async () => {
  localStorage.removeItem('clinpath_learning_record_v2');
  localStorage.removeItem('clinpath_ai_progress_v3');
  localStorage.removeItem('clinpath_ai_progress_v4');
  await checkAiConnection();
  bindEvents();
});

async function checkAiConnection() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.online) {
      aiStatusPill.classList.remove('offline');
      aiStatusDot.classList.remove('offline');
      statusText.textContent = `AI Connected · ${data.model}`;
    } else {
      aiStatusPill.classList.add('offline');
      aiStatusDot.classList.add('offline');
      statusText.textContent = 'AI Disconnected (Run Ollama)';
    }
  } catch (err) {
    aiStatusPill.classList.add('offline');
    aiStatusDot.classList.add('offline');
    statusText.textContent = 'AI Disconnected';
  }
}

function showView(viewName) {
  setupView.classList.add('hidden');
  interviewView.classList.add('hidden');
  reviewView.classList.add('hidden');
  progressView.classList.add('hidden');

  navPracticeBtn.classList.remove('active');
  navProgressBtn.classList.remove('active');

  if (viewName === 'setup') {
    setupView.classList.remove('hidden');
    navPracticeBtn.classList.add('active');
  } else if (viewName === 'interview') {
    interviewView.classList.remove('hidden');
    navPracticeBtn.classList.add('active');
  } else if (viewName === 'review') {
    reviewView.classList.remove('hidden');
    navPracticeBtn.classList.add('active');
  } else if (viewName === 'progress') {
    renderProgressDashboard();
    progressView.classList.remove('hidden');
    navProgressBtn.classList.add('active');
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function bindEvents() {
  navPracticeBtn.addEventListener('click', () => showView('setup'));
  brandHomeBtn.addEventListener('click', () => showView('setup'));
  navProgressBtn.addEventListener('click', () => showView('progress'));
  document.getElementById('backToPracticeBtn').addEventListener('click', () => showView('setup'));
  document.getElementById('continuePracticeCard').addEventListener('click', () => showView('setup'));
  backToSetupBtn.addEventListener('click', () => showView('setup'));

  specialtyListContainer.querySelectorAll('.radio-card').forEach(card => {
    card.addEventListener('click', () => {
      selectedSpecialty = card.dataset.specialty;
      specialtyListContainer.querySelectorAll('.radio-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      card.querySelector('input').checked = true;
    });
  });

  supportLevelList.querySelectorAll('.radio-card').forEach(card => {
    card.addEventListener('click', () => {
      selectedSupportLevel = card.dataset.level;
      supportLevelList.querySelectorAll('.radio-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      card.querySelector('input').checked = true;
    });
  });

  startConsultationBtn.addEventListener('click', async () => {
    startConsultationBtn.disabled = true;
    startConsultationBtn.textContent = `⏳ MedGemma is generating a new ${selectedSpecialty} patient...`;

    try {
      const res = await fetch('/api/start-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: SESSION_ID,
          specialty: selectedSpecialty,
          supportLevel: selectedSupportLevel
        })
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to generate AI case.');
        return;
      }
      await checkAiConnection();
      launchInterviewWorkspace(data);
    } catch (err) {
      alert('Could not reach local server. Ensure node server.js and Ollama are running.');
    } finally {
      startConsultationBtn.disabled = false;
      startConsultationBtn.textContent = '✨ Generate AI Patient & Start Consultation →';
    }
  });

  chatInputForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = chatQuestionInput.value.trim();
    if (!q) return;
    chatQuestionInput.value = '';
    await sendQuestionToPatient(q, false);
  });

  requestHintBtn.addEventListener('click', async () => {
    requestHintBtn.disabled = true;
    try {
      const res = await fetch('/api/hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: SESSION_ID })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'No hints remaining.');
        return;
      }
      const note = document.createElement('div');
      note.className = 'hint-note';
      note.textContent = `Clue ${data.hintsUsed}: ${data.hint}`;
      hintsListContainer.appendChild(note);

      const left = data.maxHints - data.hintsUsed;
      requestHintBtn.textContent = left > 0 ? `Request a hint (${left} left)` : 'All 5 hints used';
      requestHintBtn.disabled = left <= 0;
    } catch (err) {
      requestHintBtn.disabled = false;
    }
  });

  submitConsultationBtn.addEventListener('click', submitAndEvaluate);

  document.getElementById('reviewNewCaseBtn').addEventListener('click', () => showView('setup'));
  document.getElementById('reviewToProgressBtn').addEventListener('click', () => showView('progress'));

  document.getElementById('clearProgressBtn').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    renderProgressDashboard();
    showView('setup');
  });
}

function launchInterviewWorkspace(data) {
  const c = data.caseData;
  questionsCountBadge.textContent = '0 valid questions';

  activeDeptBadge.textContent = c.departmentTag;
  activeCaseTitle.textContent = c.title;
  activePatientPersona.textContent = c.patient;

  const levelLabels = {
    Beginner: 'Beginner · Guided learning',
    Intermediate: 'Intermediate · Hint based',
    Advanced: 'Advanced · Independent reasoning'
  };
  activeSupportBadge.textContent = levelLabels[data.supportLevel] || data.supportLevel;

  vBp.textContent = c.vitals.bp;
  vHr.textContent = c.vitals.hr;
  vRr.textContent = c.vitals.rr;
  vTemp.textContent = c.vitals.temp;
  vSpo2.textContent = c.vitals.spo2;

  chatMessages.innerHTML = '';
  hintsListContainer.innerHTML = '';
  observationsInput.value = '';
  differentialsInput.value = '';
  diagnosisInput.value = '';

  appendChatBubble('patient', c.opening);

  guidedQuestionsBox.classList.add('hidden');
  hintSupportBox.classList.add('hidden');
  advancedNoticeBox.classList.add('hidden');

  if (data.supportLevel === 'Beginner') {
    activeGuidedQuestions = [...(c.guidedQuestions || [])];
    guidedQuestionsBox.classList.remove('hidden');
    renderGuidedQuestionChips();
  } else if (data.supportLevel === 'Intermediate') {
    hintSupportBox.classList.remove('hidden');
    requestHintBtn.disabled = false;
    requestHintBtn.textContent = 'Request a hint (5 left)';
  } else {
    advancedNoticeBox.classList.remove('hidden');
  }

  showView('interview');
}

function renderGuidedQuestionChips() {
  guidedQuestionsChips.innerHTML = '';
  if (activeGuidedQuestions.length === 0) {
    guidedQuestionsChips.innerHTML = '<span class="muted-small">All starter guided questions used. Now type your own clinical follow-up questions below to earn up to 5/5 History Taking credit!</span>';
    return;
  }

  activeGuidedQuestions.forEach((qText, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'guided-chip-btn';
    btn.textContent = `→ "${qText}"`;
    btn.addEventListener('click', async () => {
      activeGuidedQuestions.splice(index, 1);
      renderGuidedQuestionChips();
      await sendQuestionToPatient(qText, true);
    });
    guidedQuestionsChips.appendChild(btn);
  });
}

// Always uses the normal chat-bubble style (no red error styling)
function appendChatBubble(role, text) {
  const div = document.createElement('div');
  div.className = `chat-bubble ${role}`;
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendQuestionToPatient(questionText, isGuided) {
  appendChatBubble('doctor', questionText);

  sendQuestionBtn.disabled = true;
  sendQuestionBtn.textContent = 'MedGemma thinking...';

  try {
    const res = await fetch('/api/patient', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: SESSION_ID,
        message: questionText,
        isGuidedQuestion: isGuided
      })
    });
    const data = await res.json();
    if (!res.ok) {
      appendChatBubble('patient', data.error || 'Error communicating with local AI.');
      return;
    }

    appendChatBubble('patient', data.reply);
    questionsCountBadge.textContent = `${data.validQuestionsCount || 0} valid question(s)`;
  } catch (err) {
    appendChatBubble('patient', 'Connection error with local MedGemma.');
  } finally {
    sendQuestionBtn.disabled = false;
    sendQuestionBtn.textContent = 'Ask patient';
    chatQuestionInput.focus();
  }
}

async function submitAndEvaluate() {
  submitConsultationBtn.disabled = true;
  submitConsultationBtn.textContent = '⏳ MedGemma is generating your Consultation Review...';

  try {
    const res = await fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: SESSION_ID,
        observations: observationsInput.value,
        differentials: differentialsInput.value,
        diagnosis: diagnosisInput.value
      })
    });
    const report = await res.json();
    if (!res.ok) {
      alert(report.error || 'Evaluation failed.');
      return;
    }
    saveEncounterToProgress(report);
    renderConsultationReview(report);
    showView('review');
  } finally {
    submitConsultationBtn.disabled = false;
    submitConsultationBtn.textContent = 'Complete consultation & generate MedGemma review';
  }
}

function safeScoreNumber(v) {
  if (v && typeof v === 'object') {
    return Number(v.score ?? v.val ?? v.value ?? 0);
  }
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function renderConsultationReview(r) {
  document.getElementById('reviewSupportSummaryPill').textContent =
    `${r.supportLevel} · ${r.supportActionsUsed} support action(s)`;

  const vbox = document.getElementById('verificationBox');
  const vpill = document.getElementById('verificationStatusPill');

  if (r.diagnosisCorrect) {
    vbox.classList.add('correct');
    vpill.classList.add('correct');
    vpill.textContent = 'VERIFIED DIAGNOSTIC FORMULATION';
  } else {
    vbox.classList.remove('correct');
    vpill.classList.remove('correct');
    vpill.textContent = 'INCORRECT DIAGNOSTIC FORMULATION';
  }

  document.getElementById('reviewDefinitiveDiagnosis').textContent =
    `Definitive Diagnosis: ${r.definitiveDiagnosis}`;
  document.getElementById('reviewSubmittedImpression').textContent = r.submittedImpression;
  document.getElementById('reviewClinicalSituation').textContent = r.clinicalSituation;

  const anchorsList = document.getElementById('reviewAnchorsList');
  anchorsList.innerHTML = '';
  r.anchors.forEach(a => {
    const li = document.createElement('li');
    li.textContent = a;
    anchorsList.appendChild(li);
  });

  const ruleOutsList = document.getElementById('reviewRuleOutsList');
  ruleOutsList.innerHTML = '';
  r.ruleOuts.forEach(ro => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${ro.name}:</strong> ${ro.reason}`;
    ruleOutsList.appendChild(li);
  });

  // Fixed: uses p.val (never prints [object Object]/5)
  const s = r.scores || {};
  const pillsRow = document.getElementById('competencyPillsRow');
  const pillDefs = [
    { val: safeScoreNumber(s.historyTaking), label: 'History taking' },
    { val: safeScoreNumber(s.observation), label: 'Observation' },
    { val: safeScoreNumber(s.clinicalReasoning), label: 'Clinical reasoning' },
    { val: safeScoreNumber(s.differentialDiagnoses), label: 'Differential diagnoses' },
    { val: safeScoreNumber(s.finalConclusion), label: 'Final conclusion' },
    { val: safeScoreNumber(s.communication), label: 'Communication' },
    { val: safeScoreNumber(s.independentApplication), label: 'Independent application' }
  ];
  pillsRow.innerHTML = pillDefs
    .map(p => `<div class="comp-pill"><strong>${p.val}/5</strong> ${p.label}</div>`)
    .join('');

  document.getElementById('fbWhatWell').textContent = r.whatYouDidWell;
  document.getElementById('fbWhatMissed').textContent = r.whatYouMissed;
  document.getElementById('fbQuestionsCouldAsk').textContent = r.questionsCouldHaveAsked;
  document.getElementById('fbReasoningReview').textContent = r.clinicalReasoningReview;
  document.getElementById('fbDifferentialReview').textContent = r.differentialReview;
  document.getElementById('fbLearningGoals').textContent = r.learningGoals;
  document.getElementById('fbSummaryText').textContent = r.summaryText;
  document.getElementById('fbSuggestedNext').textContent = r.suggestedNextStep;
}

// ============================================================================
// PROGRESS RECORD (0 TO 5 SCALE, ZERO NEGATIVE MARKS)
// ============================================================================
function getStoredProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

function saveEncounterToProgress(report) {
  const s = report.scores || {};
  const records = getStoredProgress();
  records.push({
    supportLevel: report.supportLevel,
    supportActionsUsed: report.supportActionsUsed,
    scores: {
      historyTaking: safeScoreNumber(s.historyTaking),
      observation: safeScoreNumber(s.observation),
      clinicalReasoning: safeScoreNumber(s.clinicalReasoning),
      differentialDiagnoses: safeScoreNumber(s.differentialDiagnoses),
      finalConclusion: safeScoreNumber(s.finalConclusion),
      communication: safeScoreNumber(s.communication),
      independentApplication: safeScoreNumber(s.independentApplication)
    }
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function renderProgressDashboard() {
  const records = getStoredProgress();
  const totalCases = records.length;
  const advRecords = records.filter(r => r.supportLevel === 'Advanced');

  document.getElementById('kpiCasesCompleted').textContent = totalCases;
  document.getElementById('kpiAdvancedCases').textContent = advRecords.length;

  if (advRecords.length > 0) {
    const avgInd =
      advRecords.reduce((acc, r) => acc + safeScoreNumber(r.scores.independentApplication), 0) / advRecords.length;
    document.getElementById('kpiIndependenceIndex').textContent = `${avgInd.toFixed(1)} / 5`;
    document.getElementById('advancedTrajectoryBox').textContent =
      `Completed ${advRecords.length} Advanced session(s) with an average independent reasoning indicator of ${avgInd.toFixed(1)} / 5.`;
  } else {
    document.getElementById('kpiIndependenceIndex').textContent = '—';
    document.getElementById('advancedTrajectoryBox').textContent =
      'Complete cases in Advanced mode to populate your independent reasoning trajectory.';
  }

  const levels = [
    { key: 'Beginner', sub: 'Guided suggestions' },
    { key: 'Intermediate', sub: 'Optional clues' },
    { key: 'Advanced', sub: 'Independent practice' }
  ];

  const levelGrid = document.getElementById('levelBreakdownGrid');
  levelGrid.innerHTML = levels
    .map(lvl => {
      const subset = records.filter(r => r.supportLevel === lvl.key);
      const count = subset.length;
      if (count === 0) {
        return `
          <div class="kpi-card">
            <div class="radio-title">${lvl.key}</div>
            <div class="kpi-sub">${lvl.sub}</div>
            <div style="margin-top:8px;font-size:0.9rem;"><strong>0</strong> encounter(s)</div>
            <div style="font-size:0.9rem;"><strong>No data</strong> reasoning score</div>
            <div class="kpi-sub">Average clues: <strong>—</strong></div>
          </div>
        `;
      }
      const avgReason = (
        subset.reduce((a, b) => a + safeScoreNumber(b.scores.clinicalReasoning), 0) / count
      ).toFixed(1);
      const avgClues = (
        subset.reduce((a, b) => a + (b.supportActionsUsed || 0), 0) / count
      ).toFixed(1);
      return `
        <div class="kpi-card">
          <div class="radio-title">${lvl.key}</div>
          <div class="kpi-sub">${lvl.sub}</div>
          <div style="margin-top:8px;font-size:0.9rem;"><strong>${count}</strong> encounter(s)</div>
          <div style="font-size:0.9rem;"><strong>${avgReason} / 5</strong> reasoning score</div>
          <div class="kpi-sub">Average clues: <strong>${avgClues}</strong></div>
        </div>
      `;
    })
    .join('');

  const skillKeys = [
    { key: 'historyTaking', label: 'History taking' },
    { key: 'observation', label: 'Observation' },
    { key: 'clinicalReasoning', label: 'Clinical reasoning' },
    { key: 'differentialDiagnoses', label: 'Differential diagnoses' },
    { key: 'finalConclusion', label: 'Final conclusion' },
    { key: 'communication', label: 'Communication' },
    { key: 'independentApplication', label: 'Independent application' }
  ];

  const skillsContainer = document.getElementById('skillsBarsContainer');
  skillsContainer.innerHTML = skillKeys
    .map(sk => {
      if (totalCases === 0) {
        return `
          <div class="skill-row">
            <div class="skill-name">${sk.label}</div>
            <div class="skill-bar-track">
              <div class="skill-bar-fill" style="width: 0%"></div>
            </div>
            <div class="skill-meta">0.0 / 5 · No sessions recorded yet.</div>
          </div>
        `;
      }
      const avg = records.reduce((a, b) => a + safeScoreNumber(b.scores[sk.key]), 0) / totalCases;
      const pct = Math.min(100, Math.round((avg / 5) * 100));
      const statusLabel =
        avg >= 3.2 ? 'Developing competency.' : 'Priority focus area for further practice.';
      return `
        <div class="skill-row">
          <div class="skill-name">${sk.label}</div>
          <div class="skill-bar-track">
            <div class="skill-bar-fill" style="width: ${pct}%"></div>
          </div>
          <div class="skill-meta">${avg.toFixed(1)} / 5 · ${statusLabel}</div>
        </div>
      `;
    })
    .join('');
}