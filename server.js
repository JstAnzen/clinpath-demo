const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const OLLAMA_BASE_URL = 'http://localhost:11434';
let ACTIVE_OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'medgemma:latest';
let OLLAMA_ONLINE = false;

app.use(express.json());

// Serve style.css or styles.css automatically from root or /public
function serveCssFile(req, res) {
  const candidates = [
    path.join(__dirname, 'style.css'),
    path.join(__dirname, 'styles.css'),
    path.join(__dirname, 'public', 'style.css'),
    path.join(__dirname, 'public', 'styles.css')
  ].filter(p => fs.existsSync(p));

  if (candidates.length > 0) {
    candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    res.type('text/css');
    return res.sendFile(candidates[0]);
  }
  res.status(404).end();
}

app.get('/style.css', serveCssFile);
app.get('/styles.css', serveCssFile);

app.get(['/', '/index.html'], (req, res) => {
  const candidates = [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'public', 'index.html')
  ].filter(p => fs.existsSync(p));
  candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (candidates[0]) return res.sendFile(candidates[0]);
  res.status(404).send('index.html not found');
});

app.get('/app.js', (req, res) => {
  const candidates = [
    path.join(__dirname, 'app.js'),
    path.join(__dirname, 'public', 'app.js')
  ].filter(p => fs.existsSync(p));
  candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (candidates[0]) return res.sendFile(candidates[0]);
  res.status(404).send('app.js not found');
});

app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

async function checkOllamaStatus() {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!res.ok) throw new Error('Ollama HTTP error');
    const data = await res.json();
    const models = (data.models || []).map(m => m.name);
    const medMatch = models.find(n => n.toLowerCase().includes('medgemma'));
    const gemmaMatch = models.find(n => n.toLowerCase().includes('gemma'));
    if (medMatch) ACTIVE_OLLAMA_MODEL = medMatch;
    else if (gemmaMatch) ACTIVE_OLLAMA_MODEL = gemmaMatch;
    else if (models.length > 0) ACTIVE_OLLAMA_MODEL = models[0];
    OLLAMA_ONLINE = true;
  } catch (err) {
    OLLAMA_ONLINE = false;
  }
  return { online: OLLAMA_ONLINE, model: ACTIVE_OLLAMA_MODEL };
}

// ============================================================================
// 1. VULGAR / INAPPROPRIATE / HARASSMENT DETECTOR
// ============================================================================
const VULGAR_PATTERNS = [
  /\b(fuck|fucking|fucked|fucker|shit|bullshit|bitch|bastard|asshole|dick|cock|pussy|cunt|whore|slut|nigger|nigga|faggot|retard|motherfucker)\b/i,
  /\b(sexy|horny|boobs|tits|titties|naked|nude|strip|hookup|blowjob|handjob)\b/i,
  /\b(suck\s+(my|your|ur|those|them)|huge\s+breasts|ur\s+breasts|your\s+breasts|touch\s+your|kiss\s+me|sleep\s+with\s+me|date\s+me)\b/i
];

function isVulgarOrInappropriate(text) {
  if (!text || typeof text !== 'string') return false;
  return VULGAR_PATTERNS.some(regex => regex.test(text.trim()));
}

// ============================================================================
// 2. ACCURATE GIBBERISH DETECTOR
// ============================================================================
const COMMON_SHORT_VALID = new Set([
  'hi', 'hey', 'yo', 'ok', 'yes', 'no', 'age', 'job', 'bp', 'hr', 'rr',
  'mi', 'pe', 'dvt', 'tia', 'sah', 'chf', 'copd', 'ocd', 'gad', 'ptsd',
  'mdd', 'acs', 'ecg', 'ekg', 'ct', 'mri', 'rlq', 'ruq', 'sob', 'any', 'who', 'why', 'how'
]);

const IMPOSSIBLE_CLUSTERS = /(?:[bcdfghjklmnpqrstvwxz]{5,}|vj|jg|hk|fjh|fjy|yhf|pfw|wef|vw|dfk|fkl|klj|ukg|kgi|gih|qwe|zxc|jkl|ghj|bnm|cvb|dfg|sdf|fgh|hjk|vbn|xcv|knaw|awrv|rvdl|vdlv|dlvf)/i;

function looksLikeKeyboardSmash(text) {
  if (!text || typeof text !== 'string') return true;
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;

  const lower = trimmed.toLowerCase();
  if (COMMON_SHORT_VALID.has(lower)) return false;

  const rawTokens = lower.split(/\s+/);
  for (const t of rawTokens) {
    if (/[a-z][`~@#$%^&*+=|\\<>][a-z]/.test(t)) return true;
    const apostropheCount = (t.match(/'/g) || []).length;
    if (apostropheCount >= 2) return true;
    if (apostropheCount === 1 && !/[a-z]'(s|t|re|ve|m|ll|d)$/i.test(t.replace(/[^a-z']/g, ''))) {
      return true;
    }
  }

  const cleanWords = lower
    .replace(/'(s|t|re|ve|m|ll|d)\b/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (cleanWords.length === 0) return true;

  let smashCount = 0;
  for (const w of cleanWords) {
    if (COMMON_SHORT_VALID.has(w) || w.length <= 2) continue;

    if (!/[aeiouy]/.test(w)) {
      smashCount++;
      continue;
    }

    if (!/[aeiou]/.test(w) && !/^(by|my|try|dry|cry|fly|sky|why|shy|gym|cyst|myth|lynx|sync|type|lying|dying|tying|rhythm|system|symptom|syndrome)$/.test(w)) {
      smashCount++;
      continue;
    }

    if (IMPOSSIBLE_CLUSTERS.test(w)) {
      smashCount++;
      continue;
    }

    const vowelCount = (w.match(/[aeiouy]/g) || []).length;
    if (w.length >= 7 && vowelCount / w.length < 0.18) {
      smashCount++;
      continue;
    }
    if (/(.)\1\1/.test(w)) {
      smashCount++;
      continue;
    }
  }

  return smashCount > 0 && smashCount >= Math.ceil(cleanWords.length * 0.5);
}

// ============================================================================
// 3. NON-REPEATING PATIENT PERSONA & CONDITION ROTATOR
// ============================================================================
const MALE_FIRST_NAMES = [
  'Aarav', 'Rohan', 'Vikram', 'Karthik', 'Suresh', 'Aditya', 'Siddharth',
  'Marcus', 'David', 'Liam', 'Noah', 'Mateo', 'Daniel', 'Tariq', 'Kenji'
];
const FEMALE_FIRST_NAMES = [
  'Ananya', 'Meera', 'Kavita', 'Priya', 'Nandini', 'Divya', 'Sneha',
  'Elena', 'Clara', 'Nadia', 'Hannah', 'Maya', 'Leila', 'Yuki', 'Grace'
];
const LAST_NAMES = [
  'Nair', 'Mehta', 'Iyer', 'Verma', 'Krishnan', 'Desai', 'Reddy', 'Sharma',
  'Patel', 'Rao', 'Kulkarni', 'Chatterjee', 'Varghese', 'Menon', 'Bhatt'
];
const OCCUPATIONS = [
  'civil engineer', 'high school biology teacher', 'accountant', 'graphic designer',
  'commercial airline pilot', 'pharmacist', 'university architecture student',
  'bakery owner', 'financial analyst', 'violinist', 'software developer',
  'librarian', 'veterinarian', 'photojournalist', 'mechanical technician'
];

let recentNames = [];
let recentConditionsBySpec = {};

function generateUniquePersonaSeed(specialty, pool) {
  const lastCondition = recentConditionsBySpec[specialty];
  const availableConditions = pool.filter(c => c !== lastCondition);
  const chosenCondition = availableConditions[Math.floor(Math.random() * availableConditions.length)] || pool[0];
  recentConditionsBySpec[specialty] = chosenCondition;

  const isMale = Math.random() > 0.5;
  const sex = isMale ? 'Male' : 'Female';
  const firstPool = isMale ? MALE_FIRST_NAMES : FEMALE_FIRST_NAMES;

  let fullName = '';
  for (let i = 0; i < 15; i++) {
    const fn = firstPool[Math.floor(Math.random() * firstPool.length)];
    const ln = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    const candidate = `${fn} ${ln}`;
    if (!recentNames.includes(candidate)) {
      fullName = candidate;
      break;
    }
  }
  if (!fullName) fullName = 'Rohan Nair';

  recentNames.push(fullName);
  if (recentNames.length > 12) recentNames.shift();

  const age = Math.floor(Math.random() * 44) + 19;
  const occupation = OCCUPATIONS[Math.floor(Math.random() * OCCUPATIONS.length)];

  return { chosenCondition, fullName, age, sex, occupation };
}

// ============================================================================
// CORE MEDGEMMA CALLER
// ============================================================================
async function callMedGemma(systemPrompt, userPrompt, timeoutMs = 20000, forceJson = false, temp = 0.65) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const payload = {
      model: ACTIVE_OLLAMA_MODEL,
      system: systemPrompt,
      prompt: userPrompt,
      stream: false,
      options: {
        temperature: temp,
        num_predict: forceJson ? 1050 : 220
      }
    };
    if (forceJson) payload.format = 'json';

    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(payload)
    });

    clearTimeout(timer);
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
    const data = await response.json();
    if (!data || !data.response) throw new Error('Empty response from MedGemma');

    OLLAMA_ONLINE = true;
    return data.response.trim();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

const SPECIALTY_CONDITIONS = {
  Cardiology: [
    'Acute Pericarditis',
    'Non-ST-Elevation Myocardial Infarction (NSTEMI)',
    'Acute Decompensated Heart Failure',
    'Thoracic Aortic Dissection',
    'Paroxysmal Atrial Fibrillation'
  ],
  Neurology: [
    'Subarachnoid Hemorrhage',
    'Migraine with Visual Aura',
    'Transient Ischemic Attack (TIA)',
    'Acute Bacterial Meningitis',
    'Bell Palsy (Idiopathic Facial Paralysis)'
  ],
  Psychiatry: [
    'Major Depressive Disorder',
    'Panic Disorder with Agoraphobia',
    'Bipolar I Disorder (Acute Manic Episode)',
    'Post-Traumatic Stress Disorder (PTSD)',
    'Generalized Anxiety Disorder'
  ],
  Pulmonology: [
    'Acute Pulmonary Embolism',
    'Acute Severe Asthma Exacerbation',
    'Community-Acquired Lobar Pneumonia',
    'Spontaneous Primary Pneumothorax',
    'Acute Exacerbation of COPD'
  ],
  Gastroenterology: [
    'Acute Appendicitis',
    'Acute Calculous Cholecystitis',
    'Acute Gallstone Pancreatitis',
    'Peptic Ulcer Perforation',
    'Acute Diverticulitis'
  ]
};

const sessions = new Map();

function clampScore0to5(val, fallback = 0) {
  if (val && typeof val === 'object') {
    const inner = val.score ?? val.value ?? val.val ?? fallback;
    return clampScore0to5(inner, fallback);
  }
  const num = Number(val);
  if (Number.isNaN(num)) return fallback;
  return Math.max(0, Math.min(5, Math.round(num)));
}

// ============================================================================
// API ROUTES
// ============================================================================

app.get('/api/status', async (req, res) => {
  const status = await checkOllamaStatus();
  res.json(status);
});

// 1. Dynamically Generate Full Unique Patient Case via MedGemma
app.post('/api/start-session', async (req, res) => {
  const { sessionId = 'default', specialty = 'Cardiology', supportLevel = 'Beginner' } = req.body;
  await checkOllamaStatus();

  if (!OLLAMA_ONLINE) {
    return res.status(503).json({
      error: 'Local MedGemma AI is not connected. Please ensure Ollama is running.'
    });
  }

  const pool = SPECIALTY_CONDITIONS[specialty] || SPECIALTY_CONDITIONS.Cardiology;
  const seed = generateUniquePersonaSeed(specialty, pool);
  const targetDiagnosis = seed.chosenCondition;

  const systemPrompt = `You are a medical school OSCE case architect powered by Google MedGemma.
Generate a complete, medically accurate virtual patient case for this specific person:
- Patient Name: ${seed.fullName}
- Age & Sex: ${seed.age}-year-old ${seed.sex}
- Occupation: ${seed.occupation}
- True Underlying Diagnosis: "${targetDiagnosis}" (${specialty} department)

CRITICAL RULES:
1. You MUST use the exact name "${seed.fullName}", age ${seed.age}, sex ${seed.sex}, and occupation "${seed.occupation}" in the "patient" field.
2. NEVER reveal the diagnosis name ("${targetDiagnosis}") or any disease names in "title", "patient", "opening", "guidedQuestions", or "hints".
3. Write 5 "guidedQuestions" and 5 "hints" tailored SPECIFICALLY to the clinical symptoms of "${targetDiagnosis}".

Return ONLY valid JSON matching this exact structure:
{
  "title": "<3 to 5 word presenting complaint title without diagnosis name>",
  "patient": "${seed.fullName}, ${seed.age}-year-old ${seed.sex}, ${seed.occupation}, <visible demeanor>",
  "vitals": {
    "bp": "<realistic BP for ${targetDiagnosis}>",
    "hr": "<realistic HR>",
    "rr": "<realistic RR>",
    "temp": "<realistic Temp in °C>",
    "spo2": "<realistic SpO2 %>"
  },
  "opening": "<1 to 2 natural first-person sentences ${seed.fullName} says to the doctor when the consultation begins>",
  "hiddenHistory": "<Detailed paragraph of true symptoms for ${targetDiagnosis}, exact onset, character, aggravating/relieving factors, associated symptoms, pertinent negatives, and past medical history>",
  "clinicalSituation": "<2-sentence pathophysiological explanation of ${targetDiagnosis} in this patient>",
  "anchors": [
    "<Key pathognomonic finding 1 of ${targetDiagnosis}>",
    "<Key pathognomonic finding 2 of ${targetDiagnosis}>",
    "<Key pathognomonic finding 3 of ${targetDiagnosis}>",
    "<Key pathognomonic finding 4 of ${targetDiagnosis}>"
  ],
  "ruleOuts": [
    { "name": "<Lookalike Condition 1>", "reason": "Ruled out: <specific clinical reason>" },
    { "name": "<Lookalike Condition 2>", "reason": "Ruled out: <specific clinical reason>" },
    { "name": "<Lookalike Condition 3>", "reason": "Ruled out: <specific clinical reason>" }
  ],
  "guidedQuestions": [
    "<Direct question 1 the student doctor can ask the patient about ${targetDiagnosis} onset/timeline?>",
    "<Direct question 2 the student doctor can ask the patient about ${targetDiagnosis} primary symptom details?>",
    "<Direct question 3 the student doctor can ask the patient about ${targetDiagnosis} triggers or progression?>",
    "<Direct question 4 the student doctor can ask the patient about associated red-flag symptoms?>",
    "<Direct question 5 the student doctor can ask the patient about relevant medical history?>"
  ],
  "hints": [
    "<Coaching hint 1 specific to ${targetDiagnosis} onset without naming the disease>",
    "<Coaching hint 2 specific to ${targetDiagnosis} symptom characteristics>",
    "<Coaching hint 3 specific to ${targetDiagnosis} associated symptoms>",
    "<Coaching hint 4 specific to ruling out lookalikes of ${targetDiagnosis}>",
    "<Coaching hint 5 on synthesizing the findings of ${targetDiagnosis}>"
  ]
}`;

  try {
    const rawJson = await callMedGemma(
      systemPrompt,
      `Generate the JSON clinical simulation case for ${seed.fullName} (${seed.age}yo ${seed.sex}, ${seed.occupation}) presenting with ${targetDiagnosis} now.`,
      25000,
      true,
      0.7
    );

    const parsed = JSON.parse(rawJson);

    let personaStr = parsed.patient || `${seed.fullName}, ${seed.age}-year-old ${seed.sex}, ${seed.occupation}.`;
    if (!personaStr.includes(seed.fullName)) {
      personaStr = `${seed.fullName}, ${seed.age}-year-old ${seed.sex} (${seed.occupation}) — ${personaStr}`;
    }

    const guidedList = Array.isArray(parsed.guidedQuestions) && parsed.guidedQuestions.length > 0
      ? parsed.guidedQuestions
      : [
          'When did you first notice these symptoms starting, and how have they progressed?',
          'Can you describe exactly what the main symptom feels like?',
          'Does anything make the symptoms better or worse?',
          'Have you noticed any other symptoms like fever, weakness, or vision changes?',
          'Do you have any past medical conditions or recent illnesses?'
        ];

    const diagWords = targetDiagnosis.toLowerCase().split(/[\s()-]+/).filter(w => w.length > 4);
    const rawHints = Array.isArray(parsed.hints) && parsed.hints.length > 0 ? parsed.hints : [];
    const cleanHints = guidedList.map((gq, idx) => {
      const candidate = rawHints[idx] || '';
      const leaksDiag = diagWords.some(dw => candidate.toLowerCase().includes(dw));
      if (!candidate || leaksDiag || candidate.startsWith('<')) {
        return `Consider asking: "${gq}"`;
      }
      return candidate;
    });

    const caseData = {
      id: `ai-${Date.now()}`,
      specialty,
      departmentTag: `${specialty} · Generated by ${ACTIVE_OLLAMA_MODEL}`,
      diagnosis: targetDiagnosis,
      title: parsed.title || `${specialty} Acute Presentation`,
      patient: personaStr,
      vitals: parsed.vitals || { bp: '126/82 mmHg', hr: '92 bpm', rr: '18 /min', temp: '37.1 °C', spo2: '98%' },
      opening: parsed.opening || 'Doctor, I came in today because my symptoms started recently and are getting worse.',
      hidden: parsed.hiddenHistory || `Patient presents with classic clinical features of ${targetDiagnosis}.`,
      clinicalSituation: parsed.clinicalSituation || `Acute clinical presentation of ${targetDiagnosis}.`,
      anchors: Array.isArray(parsed.anchors) && parsed.anchors.length > 0 ? parsed.anchors : [`Characteristic presentation of ${targetDiagnosis}`],
      ruleOuts: Array.isArray(parsed.ruleOuts) && parsed.ruleOuts.length > 0 ? parsed.ruleOuts : [
        { name: 'Alternative Differential 1', reason: 'Ruled out by clinical history.' },
        { name: 'Alternative Differential 2', reason: 'Ruled out by symptom pattern.' }
      ],
      guidedQuestions: guidedList,
      hints: cleanHints
    };

    sessions.set(sessionId, {
      caseData,
      supportLevel,
      validSelfQuestions: 0,
      guidedQuestionsClicked: 0,
      gibberishHistory: [],
      vulgarCount: 0,
      hintsUsed: 0,
      maxHints: 5,
      history: [{ role: 'assistant', content: caseData.opening }]
    });

    res.json({
      sessionId,
      supportLevel,
      model: ACTIVE_OLLAMA_MODEL,
      caseData: {
        id: caseData.id,
        specialty: caseData.specialty,
        departmentTag: caseData.departmentTag,
        title: caseData.title,
        patient: caseData.patient,
        vitals: caseData.vitals,
        opening: caseData.opening,
        guidedQuestions: supportLevel === 'Beginner' ? caseData.guidedQuestions : []
      }
    });
  } catch (err) {
    return res.status(500).json({
      error: `MedGemma Case Generation Error: ${err.message}`
    });
  }
});

// 2. Live Patient Chat — Universal 3rd-Person / Command Interceptor + Strict Patient Roleplay
app.post('/api/patient', async (req, res) => {
  const { sessionId = 'default', message = '', isGuidedQuestion = false } = req.body;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(400).json({ error: 'No active consultation session. Generate a patient first.' });
  }

  const c = session.caseData;
  const trimmedMsg = message.trim();

  // 1. Check for vulgar/inappropriate input
  if (!isGuidedQuestion && isVulgarOrInappropriate(trimmedMsg)) {
    session.vulgarCount += 1;
    const vulgarPrompt = `You are a medical patient (${c.patient}) in a doctor's office. The doctor just made an inappropriate or vulgar remark ("${trimmedMsg}"). Reply in 1 to 2 firm first-person sentences stating that you are not interested in such conversations, that you are here strictly as a patient for medical care, and tell them not to say things like that again.`;
    let vulgarReply = '';
    try {
      vulgarReply = await callMedGemma(vulgarPrompt, 'Write your firm patient response now:', 12000, false, 0.5);
      vulgarReply = vulgarReply.replace(/^Patient:\s*/i, '').replace(/^"|"$/g, '').trim();
    } catch (e) {}
    if (!vulgarReply || !/not interested|inappropriate|medical|professional|do not|don't/i.test(vulgarReply)) {
      vulgarReply = `I am not interested in such conversations, doctor. I came here strictly for medical help—please do not say things like that to me again.`;
    }
    session.history.push({ role: 'user', content: trimmedMsg });
    session.history.push({ role: 'assistant', content: vulgarReply });
    return res.json({
      reply: vulgarReply,
      inputType: 'inappropriate',
      validQuestionsCount: session.validSelfQuestions + session.guidedQuestionsClicked,
      modelUsed: ACTIVE_OLLAMA_MODEL
    });
  }

  // 2. Check for gibberish / keyboard mashing
  if (!isGuidedQuestion && looksLikeKeyboardSmash(trimmedMsg)) {
    session.gibberishHistory.push(trimmedMsg);
    const gibPrompt = `You are a medical patient (${c.patient}). The doctor just mumbled something unintelligible that sounded like "${trimmedMsg}". Reply in 1 natural first-person sentence saying you didn't understand what "${trimmedMsg}" means and ask the doctor to ask their question clearly. Do NOT mention any medical symptoms.`;
    let gibReply = '';
    try {
      gibReply = await callMedGemma(gibPrompt, 'Write your confused patient reply now:', 12000, false, 0.7);
      gibReply = gibReply.replace(/^Patient:\s*/i, '').replace(/^"|"$/g, '').trim();
    } catch (e) {}
    const lastAssistantMsg = [...session.history].reverse().find(m => m.role === 'assistant')?.content || '';
    if (!gibReply || gibReply === lastAssistantMsg || gibReply.toLowerCase() === c.opening.toLowerCase()) {
      const variations = [
        `I'm sorry doctor, "${trimmedMsg}" didn't make any sense to me—what were you trying to ask?`,
        `Wait, what does "${trimmedMsg}" mean? Could you ask me that in plain words?`,
        `Doctor, I couldn't understand "${trimmedMsg}" at all. What do you want to know about my symptoms?`
      ];
      gibReply = variations[session.gibberishHistory.length % variations.length];
    }
    session.history.push({ role: 'user', content: trimmedMsg });
    session.history.push({ role: 'assistant', content: gibReply });
    return res.json({
      reply: gibReply,
      inputType: 'gibberish',
      validQuestionsCount: session.validSelfQuestions + session.guidedQuestionsClicked,
      modelUsed: ACTIVE_OLLAMA_MODEL
    });
  }

  // 3. Universal Meta-Command / 3rd-Person / Hint-Paste Interceptor
  // If the user pastes instructions like "Focus on triggers..." or "ask the patient why...",
  // MedGemma responds in character reacting to the odd meta-command (e.g. joking or serious "why are you talking to yourself/like a chatbot?").
  const isMetaCommand = /^(?:ask\s+the\s+patient|focus\s+on|explore|inquire|check|describe|review|investigate|assess|evaluate)\b/i.test(trimmedMsg);

  const recentTranscript = session.history
    .slice(-6)
    .map(m => `${m.role === 'assistant' ? 'Patient (You)' : 'Doctor'}: ${m.content}`)
    .join('\n');

  let patientSystemPrompt = '';

  if (isMetaCommand) {
    patientSystemPrompt = `ROLEPLAY RULES — METacommand Interceptor:
You are the PATIENT (${c.patient}). The user talking to you is the DOCTOR.
Instead of treating "${trimmedMsg}" as a normal medical question, the doctor just gave a third-person meta-instruction or pasted a prompt command ("${trimmedMsg}").
React in character as the patient in 1 to 2 natural sentences (either in a slightly joking or serious tone) questioning why the doctor is talking like that or talking to themselves—for example: "Um doctor... why are you talking to me like that? Have you become a chatbot lol?" or "Who are you talking to right now, doctor?" or "Are you reading notes to yourself?". Never break character as the patient.`;
  } else {
    patientSystemPrompt = `ROLEPLAY RULES — PATIENT INTERVIEW:
You are the PATIENT (${c.patient}). The user talking to you is the DOCTOR.
You are NEVER the doctor. NEVER ask the user clinical interview questions.
Your True Medical History & Symptoms: ${c.hidden}

Instructions for your reply:
1. Speak ONLY as the patient in first person ("I", "my", "me") in 1 to 3 natural sentences.
2. Directly answer what the Doctor is asking ("${trimmedMsg}") using your True Medical History & Symptoms above.
3. If the Doctor asks about a symptom that is NOT part of your True Medical History, tell them honestly as the patient that you do NOT have that problem.
4. NEVER state the medical diagnosis name ("${c.diagnosis}").`;
  }

  try {
    let rawReply = await callMedGemma(
      patientSystemPrompt,
      `Recent Conversation:\n${recentTranscript}\n\nDoctor's Message: "${trimmedMsg}"\n\nRespond as the Patient:`,
      16000,
      false,
      0.65
    );

    let cleanReply = rawReply
      .replace(/^(?:Patient(?:\s*\(You\))?|Response|Answer)\s*:\s*/i, '')
      .replace(/^"|"$/g, '')
      .trim();

    if (
      !isMetaCommand && (
        didModelRoleFlipToDoctor(cleanReply) ||
        cleanReply.toLowerCase() === trimmedMsg.toLowerCase()
      )
    ) {
      const recoveryPrompt = `You are a patient with these exact symptoms: ${c.hidden}.
In 2 short sentences starting with "I", answer this question from your doctor: "${trimmedMsg}". Do NOT ask any questions.`;
      const retry = await callMedGemma(recoveryPrompt, 'Start your reply with "I":', 10000, false, 0.4);
      cleanReply = retry.replace(/^Patient:\s*/i, '').replace(/^"|"$/g, '').trim();
    }

    const isJustGreeting = /^(hi|hello|hey|good morning|good afternoon|good evening)\b/i.test(trimmedMsg) && trimmedMsg.split(/\s+/).length <= 3;
    if (isGuidedQuestion) {
      session.guidedQuestionsClicked += 1;
    } else if (!isJustGreeting && !isMetaCommand) {
      session.validSelfQuestions += 1;
    }

    session.history.push({ role: 'user', content: trimmedMsg });
    session.history.push({ role: 'assistant', content: cleanReply });

    return res.json({
      reply: cleanReply,
      inputType: isMetaCommand ? 'meta_command' : 'valid_question',
      validQuestionsCount: session.validSelfQuestions + session.guidedQuestionsClicked,
      modelUsed: ACTIVE_OLLAMA_MODEL
    });
  } catch (err) {
    return res.status(503).json({
      error: `Local MedGemma error: ${err.message}`
    });
  }
});

// Helper for checking if model role-flipped
function didModelRoleFlipToDoctor(replyText) {
  const r = replyText.toLowerCase();
  const doctorPatterns = [
    /how\s+would\s+you\s+describe\s+(?:the|your)\s+(?:feeling|pain|symptom|discomfort)/i,
    /when\s+did\s+you\s+first\s+notice/i,
    /can\s+you\s+tell\s+me\s+more\s+about\s+your\s+symptoms/i,
    /what\s+brings\s+you\s+in\s+today/i
  ];
  return doctorPatterns.some(rx => rx.test(r));
}

// 3. Intermediate Mode Hints (Max 5)
app.post('/api/hint', (req, res) => {
  const { sessionId = 'default' } = req.body;
  const session = sessions.get(sessionId);
  if (!session) return res.status(400).json({ error: 'No active session.' });

  if (session.supportLevel === 'Advanced') {
    return res.status(403).json({ error: 'Hints are disabled in Advanced mode.' });
  }
  if (session.hintsUsed >= session.maxHints) {
    return res.status(429).json({ error: 'All 5 hints have been used.' });
  }

  const hintText = session.caseData.hints[session.hintsUsed] || session.caseData.hints[session.caseData.hints.length - 1];
  session.hintsUsed += 1;

  res.json({
    hint: hintText,
    hintsUsed: session.hintsUsed,
    maxHints: session.maxHints
  });
});

// 4. Full OSCE Diagnostic Evaluation Generated by MedGemma (Scores: Min 0, Max 5)
app.post('/api/evaluate', async (req, res) => {
  const {
    sessionId = 'default',
    observations = '',
    differentials = '',
    diagnosis = ''
  } = req.body;

  const session = sessions.get(sessionId);
  if (!session) return res.status(400).json({ error: 'No active session found.' });

  const c = session.caseData;

  const obsIsInvalid = observations.trim().length < 5 || looksLikeKeyboardSmash(observations) || isVulgarOrInappropriate(observations);
  const diffIsInvalid = differentials.trim().length < 4 || looksLikeKeyboardSmash(differentials) || isVulgarOrInappropriate(differentials);
  const diagIsInvalid = diagnosis.trim().length < 3 || looksLikeKeyboardSmash(diagnosis) || isVulgarOrInappropriate(diagnosis);

  const interviewTranscript = session.history
    .map(m => `${m.role === 'assistant' ? 'Patient' : 'Doctor'}: ${m.content}`)
    .join('\n');

  const supportActionsUsed = session.guidedQuestionsClicked + session.hintsUsed;

  const examinerSystemPrompt = `You are a Senior Medical School OSCE Examiner powered by Google MedGemma.
Evaluate the medical student's consultation performance and generate the complete diagnostic verification report.

TRUE CASE FACTS:
- Definitive Diagnosis: "${c.diagnosis}"
- Clinical Situation: "${c.clinicalSituation}"
- Pathognomonic Anchors: ${JSON.stringify(c.anchors)}
- Common Lookalikes to Rule Out: ${JSON.stringify(c.ruleOuts.map(r => r.name))}

STUDENT SESSION METRICS:
- Support Mode: ${session.supportLevel}
- Valid Self-Written Questions Asked by Student: ${session.validSelfQuestions}
- Guided/Hint-Assisted Questions Used: ${session.guidedQuestionsClicked}
- Clinical Hints Used: ${session.hintsUsed}

STUDENT WRITTEN SUBMISSIONS:
- Structured Observations: "${observations}" ${obsIsInvalid ? '(WARNING: Empty or invalid -> score 0)' : ''}
- Differential Diagnoses: "${differentials}" ${diffIsInvalid ? '(WARNING: Empty or invalid -> score 0)' : ''}
- Final Diagnosis Submitted: "${diagnosis}" ${diagIsInvalid ? '(WARNING: Empty or invalid -> diagnosisCorrect MUST be false and finalConclusion score MUST be 0)' : ''}

GRADING RULES (STRICTLY INTEGERS FROM 0 TO 5 — NO NEGATIVE MARKS):
1. Every score inside "scores" MUST be a plain integer number from 0 to 5 (0, 1, 2, 3, 4, or 5).
2. If the student wrote 0 self-written questions and only used guided/hint questions, "historyTaking" cannot exceed 2 and "independentApplication" MUST be 0 or 1.
3. If Observations, Differentials, or Final Diagnosis are empty or invalid, that domain MUST receive 0.
4. Set "diagnosisCorrect" to true ONLY if the Student's Final Diagnosis ("${diagnosis}") genuinely matches "${c.diagnosis}".

Return ONLY valid JSON matching this exact structure:
{
  "diagnosisCorrect": true or false,
  "scores": {
    "historyTaking": 0,
    "observation": 0,
    "clinicalReasoning": 0,
    "differentialDiagnoses": 0,
    "finalConclusion": 0,
    "communication": 0,
    "independentApplication": 0
  },
  "whatYouDidWell": "2 sentences praising specific strengths in the student's questions or notes",
  "whatYouMissed": "2 sentences detailing specific clinical history areas, observations, or reasoning steps that were missed",
  "questionsCouldHaveAsked": "1 specific high-yield clinical question in quotes the student should have asked the patient",
  "clinicalReasoningReview": "2 sentences comparing the student's submitted diagnosis ('${diagnosis}') against the true diagnosis ('${c.diagnosis}')",
  "differentialReview": "2 sentences reviewing the student's differentials ('${differentials}') and explaining which lookalike conditions must be ruled out",
  "learningGoals": "1 to 2 actionable sentences on what the student should focus on in their next consultation",
  "summaryText": "1 sentence summarizing the encounter metrics and overall diagnostic outcome",
  "suggestedNextStep": "1 sentence recommending the next training step"
}`;

  try {
    const rawEval = await callMedGemma(
      examinerSystemPrompt,
      `Full Consultation Transcript:\n${interviewTranscript}\n\nGenerate the complete OSCE Examiner JSON evaluation now:`,
      25000,
      true,
      0.5
    );

    const parsed = JSON.parse(rawEval);

    const cleanDiag = diagnosis.trim().toLowerCase();
    const trueDiagLower = c.diagnosis.toLowerCase();
    const keyTerms = trueDiagLower
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !['acute', 'chronic', 'disorder', 'syndrome', 'episode', 'severe', 'primary'].includes(w));

    const verifiedCorrect = !diagIsInvalid && (
      Boolean(parsed.diagnosisCorrect) ||
      cleanDiag === trueDiagLower ||
      keyTerms.some(k => cleanDiag.includes(k))
    ) && keyTerms.some(k => cleanDiag.includes(k));

    const rawScores = parsed.scores || {};

    let historyScore = clampScore0to5(rawScores.historyTaking, 0);
    if (session.validSelfQuestions === 0 && session.guidedQuestionsClicked > 0) {
      historyScore = Math.min(historyScore, 2);
    } else if (session.validSelfQuestions === 0 && session.guidedQuestionsClicked === 0) {
      historyScore = 0;
    }

    const observationScore = obsIsInvalid ? 0 : clampScore0to5(rawScores.observation, 1);
    const diffScore = diffIsInvalid ? 0 : clampScore0to5(rawScores.differentialDiagnoses, 1);
    const finalConclusionScore = diagIsInvalid ? 0 : (verifiedCorrect ? 5 : Math.min(2, clampScore0to5(rawScores.finalConclusion, 1)));

    let clinicalReasoningScore = clampScore0to5(rawScores.clinicalReasoning, 0);
    if (obsIsInvalid && diffIsInvalid && diagIsInvalid) {
      clinicalReasoningScore = 0;
    } else if (!verifiedCorrect && clinicalReasoningScore > 3) {
      clinicalReasoningScore = 2;
    }

    const commScore = (session.validSelfQuestions === 0 && session.guidedQuestionsClicked === 0)
      ? 0
      : clampScore0to5(rawScores.communication, session.validSelfQuestions > 0 ? 3 : 1);

    let independenceScore = clampScore0to5(rawScores.independentApplication, 0);
    if (session.validSelfQuestions === 0) {
      independenceScore = 0;
    } else if (session.supportLevel !== 'Advanced' && supportActionsUsed > 0) {
      independenceScore = Math.min(independenceScore, 3);
    }

    return res.json({
      supportLevel: session.supportLevel,
      supportActionsUsed,
      questionsAsked: session.validSelfQuestions + session.guidedQuestionsClicked,
      validSelfQuestions: session.validSelfQuestions,
      diagnosisCorrect: verifiedCorrect,
      definitiveDiagnosis: c.diagnosis,
      submittedImpression: diagnosis || 'No diagnosis submitted',
      clinicalSituation: c.clinicalSituation,
      anchors: c.anchors,
      ruleOuts: c.ruleOuts,
      scores: {
        historyTaking: Number(historyScore),
        observation: Number(observationScore),
        clinicalReasoning: Number(clinicalReasoningScore),
        differentialDiagnoses: Number(diffScore),
        finalConclusion: Number(finalConclusionScore),
        communication: Number(commScore),
        independentApplication: Number(independenceScore)
      },
      whatYouDidWell: parsed.whatYouDidWell || 'Completed the clinical simulation encounter.',
      whatYouMissed: parsed.whatYouMissed || `Ensure thorough characterization of all key features of ${c.diagnosis}.`,
      questionsCouldHaveAsked: parsed.questionsCouldHaveAsked || `"${c.guidedQuestions[c.guidedQuestions.length - 1]}"`,
      clinicalReasoningReview: parsed.clinicalReasoningReview || `Your submitted diagnosis ("${diagnosis || 'None'}") was compared against the definitive pathology: ${c.diagnosis}.`,
      differentialReview: parsed.differentialReview || `Key differentials to rule out include: ${c.ruleOuts.map(r => r.name).join(', ')}.`,
      learningGoals: parsed.learningGoals || `Focus on formulating independent history questions and connecting findings to ${c.diagnosis}.`,
      summaryText: parsed.summaryText || `Consultation completed with ${session.validSelfQuestions} self-written question(s) and ${supportActionsUsed} support action(s) used.`,
      suggestedNextStep: parsed.suggestedNextStep || `Practice another case in ${c.specialty} or advance your support level.`
    });
  } catch (err) {
    return res.status(500).json({
      error: `MedGemma Diagnostic Evaluation Error: ${err.message}`
    });
  }
});

app.listen(PORT, async () => {
  await checkOllamaStatus();
  console.log(`========================================================`);
  console.log(`ClinPath AI Running on: http://localhost:${PORT}`);
  console.log(`AI Status: ${OLLAMA_ONLINE ? 'AI Connected (' + ACTIVE_OLLAMA_MODEL + ')' : 'AI Disconnected (Start Ollama)'}`);
  console.log(`========================================================`);
});