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
// NON-REPEATING PATIENT PERSONA & CONDITION ROTATOR
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
// CORE MEDGEMMA CALLER (FOR JSON CASE GEN & FINAL EVALUATION)
// ============================================================================
async function callMedGemma(systemPrompt, userPrompt, timeoutMs = 25000, forceJson = false, temp = 0.7) {
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
                num_predict: forceJson ? 1050 : 300
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
2. NEVER reveal the diagnosis name ("${targetDiagnosis}") in "title", "patient", "opening", "guidedQuestions", or "hints".
3. Write 5 "guidedQuestions" and 5 "hints" tailored SPECIFICALLY to "${targetDiagnosis}".

Return ONLY valid JSON matching this exact structure:
{
  "title": "<3 to 5 word presenting complaint title without diagnosis name>",
  "patient": "${seed.fullName}, ${seed.age}-year-old ${seed.sex}, ${seed.occupation}, <visible demeanor>",
  "vitals": {
    "bp": "<realistic BP>",
    "hr": "<realistic HR>",
    "rr": "<realistic RR>",
    "temp": "<realistic Temp in °C>",
    "spo2": "<realistic SpO2 %>"
  },
  "opening": "<1 to 2 natural first-person sentences ${seed.fullName} says to the doctor when the consultation begins>",
  "hiddenHistory": "<Detailed paragraph of true symptoms for ${targetDiagnosis}, exact onset, character, aggravating/relieving factors, associated symptoms, pertinent negatives, and past medical history>",
  "clinicalSituation": "<2-sentence pathophysiological explanation of ${targetDiagnosis} in this patient>",
  "anchors": [
    "<Key pathognomonic finding 1>",
    "<Key pathognomonic finding 2>",
    "<Key pathognomonic finding 3>",
    "<Key pathognomonic finding 4>"
  ],
  "ruleOuts": [
    { "name": "<Lookalike Condition 1>", "reason": "Ruled out: <specific clinical reason>" },
    { "name": "<Lookalike Condition 2>", "reason": "Ruled out: <specific clinical reason>" },
    { "name": "<Lookalike Condition 3>", "reason": "Ruled out: <specific clinical reason>" }
  ],
  "guidedQuestions": [
    "<Direct question 1 the student doctor can ask the patient?>",
    "<Direct question 2 the student doctor can ask the patient?>",
    "<Direct question 3 the student doctor can ask the patient?>",
    "<Direct question 4 the student doctor can ask the patient?>",
    "<Direct question 5 the student doctor can ask the patient?>"
  ],
  "hints": [
    "<Coaching hint 1 specific to ${targetDiagnosis}>",
    "<Coaching hint 2 specific to ${targetDiagnosis}>",
    "<Coaching hint 3 specific to ${targetDiagnosis}>",
    "<Coaching hint 4 specific to ruling out lookalikes>",
    "<Coaching hint 5 on synthesizing the findings>"
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

        const rawHints = Array.isArray(parsed.hints) && parsed.hints.length > 0 ? parsed.hints : [];
        const cleanHints = guidedList.map((gq, idx) => {
            const candidate = rawHints[idx] || '';
            if (!candidate || candidate.startsWith('<')) {
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

// 2. Pure Unrestricted Chatbot Endpoint Using Ollama Native /api/chat
app.post('/api/patient', async (req, res) => {
    const { sessionId = 'default', message = '', isGuidedQuestion = false } = req.body;
    const session = sessions.get(sessionId);

    if (!session) {
        return res.status(400).json({ error: 'No active consultation session. Generate a patient first.' });
    }

    const c = session.caseData;
    const trimmedMsg = message.trim();

    if (isGuidedQuestion) {
        session.guidedQuestionsClicked += 1;
    } else {
        session.validSelfQuestions += 1;
    }

    session.history.push({ role: 'user', content: trimmedMsg });

    const systemMessage = {
        role: 'system',
        content: `You are roleplaying as a medical patient in a clinical consultation.
Your Persona: ${c.patient}
Your True Medical History & Symptoms: ${c.hidden}
Underlying Condition (do not state the diagnosis name directly): ${c.diagnosis}
Respond naturally in first person as this patient to whatever the user says.`
    };

    try {
        const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: ACTIVE_OLLAMA_MODEL,
                messages: [systemMessage, ...session.history],
                stream: false
            })
        });

        if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
        const data = await response.json();
        const cleanReply = (data.message?.content || '').trim();

        session.history.push({ role: 'assistant', content: cleanReply });

        return res.json({
            reply: cleanReply,
            validQuestionsCount: session.validSelfQuestions + session.guidedQuestionsClicked,
            modelUsed: ACTIVE_OLLAMA_MODEL
        });
    } catch (err) {
        return res.status(503).json({
            error: `Local MedGemma error: ${err.message}`
        });
    }
});

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
- Self-Written Questions Asked by Student: ${session.validSelfQuestions}
- Guided Questions Clicked: ${session.guidedQuestionsClicked}
- Clinical Hints Used: ${session.hintsUsed}

STUDENT WRITTEN SUBMISSIONS:
- Structured Observations: "${observations}"
- Differential Diagnoses: "${differentials}"
- Final Diagnosis Submitted: "${diagnosis}"

GRADING RULES (STRICTLY INTEGERS FROM 0 TO 5 — NO NEGATIVE MARKS):
1. Every score inside "scores" MUST be a plain integer number from 0 to 5 (0, 1, 2, 3, 4, or 5).
2. Set "diagnosisCorrect" to true ONLY if the Student's Final Diagnosis ("${diagnosis}") genuinely matches "${c.diagnosis}".

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
        const rawScores = parsed.scores || {};

        const cleanDiag = diagnosis.trim().toLowerCase();
        const trueDiagLower = c.diagnosis.toLowerCase();
        const keyTerms = trueDiagLower
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length >= 4 && !['acute', 'chronic', 'disorder', 'syndrome', 'episode', 'severe', 'primary'].includes(w));

        const verifiedCorrect = cleanDiag.length >= 3 && (
            Boolean(parsed.diagnosisCorrect) ||
            cleanDiag === trueDiagLower ||
            keyTerms.some(k => cleanDiag.includes(k))
        ) && keyTerms.some(k => cleanDiag.includes(k));

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
                historyTaking: clampScore0to5(rawScores.historyTaking, 0),
                observation: clampScore0to5(rawScores.observation, 0),
                clinicalReasoning: clampScore0to5(rawScores.clinicalReasoning, 0),
                differentialDiagnoses: clampScore0to5(rawScores.differentialDiagnoses, 0),
                finalConclusion: verifiedCorrect ? 5 : clampScore0to5(rawScores.finalConclusion, 0),
                communication: clampScore0to5(rawScores.communication, 0),
                independentApplication: clampScore0to5(rawScores.independentApplication, 0)
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