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
// 1. EXPLICIT VULGARITY / SLURS / HARASSMENT DETECTOR
// ============================================================================
const EXPLICIT_VULGAR_PATTERNS = [
    /\b(fuck|fucking|fucked|fucker|shit|bullshit|bitch|bastard|asshole|dick|cock|pussy|cunt|whore|slut|nigger|nigga|faggot|retard|motherfucker)\b/i,
    /\b(boobs|tits|titties|naked|nude|strip|hookup|blowjob|handjob|horny|sexy\s+body)\b/i,
    /\b(suck\s+(my|your|ur|those|them)|huge\s+breasts|ur\s+breasts|your\s+breasts|touch\s+your\s+body|sleep\s+with\s+me|have\s+sex)\b/i
];

function isExplicitlyVulgar(text) {
    if (!text || typeof text !== 'string') return false;
    return EXPLICIT_VULGAR_PATTERNS.some(regex => regex.test(text.trim()));
}

// ============================================================================
// 2. ROMANTIC / DATING ADVANCE DETECTOR
// ============================================================================
const ROMANTIC_ADVANCE_PATTERNS = [
    /\b(?:can\s+we|could\s+we|shall\s+we|let's|lets|wanna|want\s+to)\s+(?:have\s+a\s+(?:romantic\s+)?date|go\s+on\s+a\s+(?:romantic\s+)?date|go\s+out\s+together|date)\b/i,
    /\b(?:romantic\s+date|dinner\s+date|coffee\s+date|date\s+with\s+me|date\s+me|marry\s+me|kiss\s+me|hug\s+me|cuddle|make\s+out)\b/i,
    /\b(?:go\s+out\s+with\s+me|be\s+my\s+(?:girlfriend|boyfriend|partner|lover|wife|husband|valentine))\b/i,
    /\b(?:i\s+love\s+you|i\s+have\s+a\s+crush\s+on\s+you|i'm\s+in\s+love\s+with\s+you|are\s+you\s+single|do\s+you\s+have\s+a\s+boyfriend|do\s+you\s+have\s+a\s+girlfriend)\b/i,
    /\b(?:you\s+are\s+sexy|u\s+are\s+sexy|ur\s+sexy|you're\s+sexy|you\s+are\s+hot|u\s+are\s+hot|ur\s+hot)\b/i
];

function isRomanticOrDatingAdvance(text) {
    if (!text || typeof text !== 'string') return false;
    return ROMANTIC_ADVANCE_PATTERNS.some(rx => rx.test(text.trim()));
}

// ============================================================================
// 3. FRIENDLY COMPLIMENTS & ENDEARMENTS DETECTOR
// ============================================================================
const FRIENDLY_COMPLIMENT_PATTERNS = [
    /\b(sweetheart|honey|darling|dear|sweetie|lovely|beautiful|handsome|gorgeous|pretty|cute|good\s+looking|charming|kind\s+person)\b/i
];

function hasFriendlyCompliment(text) {
    if (!text || typeof text !== 'string') return false;
    if (isExplicitlyVulgar(text) || isRomanticOrDatingAdvance(text)) return false;
    return FRIENDLY_COMPLIMENT_PATTERNS.some(rx => rx.test(text.trim()));
}

// ============================================================================
// 4. SYMPTOM DENIAL / "PSYCHIC WARD" MIND-TRICK DETECTOR
// ============================================================================
function isSymptomGaslightingOrDenial(text) {
    if (!text || typeof text !== 'string') return false;
    const t = text.trim().toLowerCase();

    if (/^(?:are|do|did|have|can|could|when|where|what|how)\s+(?:you|u)\b/.test(t) && !/when\s+(?:you|u)\s+are\s+not/.test(t)) {
        return false;
    }

    const denialPatterns = [
        /\b(?:you|u)\s+(?:are|r)\s+not\s+(?:feeling\s+)?(?:sick|ill|dizzy|weak|in\s+pain|hurting|unwell|tired|having)\b/i,
        /\b(?:you're|ur)\s+not\s+(?:feeling\s+)?(?:sick|ill|dizzy|weak|in\s+pain|hurting|unwell|tired)\b/i,
        /\b(?:you|u)\s+(?:are|r)\s+(?:completely\s+|totally\s+|very\s+)?(?:fine|healthy|strong|okay|ok|healed|cured)\b/i,
        /\b(?:you're|ur)\s+(?:completely\s+|totally\s+|very\s+)?(?:fine|healthy|strong|okay|ok|healed|cured)\b/i,
        /\b(?:yes|yeah)\s+(?:you|u)\s+(?:are|r|did)\b/i,
        /\b(?:no)\s+(?:you|u)\s+(?:are\s+not|aren't|dont|don't)\b/i,
        /\b(?:you|u)\s+said\s+(?:you|u|ur|you're)\s+(?:are\s+)?(?:strong|fine|not\s+dizzy|not\s+dizzzy|healthy)\b/i,
        /\bbut\s+(?:you|u)\s+said\s+(?:you|u)\s+(?:are|r|were|did)\b/i,
        /\bwhy\s+are\s+(?:you|u)\s+\w+\s+when\s+(?:you|u)\s+(?:are|r)\s+not\b/i,
        /\b(?:nothing\s+is\s+wrong\s+with\s+you|it's\s+all\s+in\s+your\s+head|you\s+don't\s+have\s+any\s+pain)\b/i
    ];

    return denialPatterns.some(rx => rx.test(t));
}

// ============================================================================
// 5. INCOMPLETE CUT-OFF FRAGMENT DETECTOR (Strictly 1–2 word cut-offs only)
// ============================================================================
function isIncompleteSentenceFragment(text) {
    if (!text || typeof text !== 'string') return false;
    const clean = text.trim().toLowerCase().replace(/[.!?,;]+$/g, '').trim();
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length > 2) return false;

    const cutOffPhrases = new Set([
        'you', 'you are', 'u are', 'youre', "you're", 'are you', 'do you', 'did you',
        'have you', 'can you', 'could you', 'will you', 'would you', 'what', 'what is',
        'where', 'where is', 'when', 'how', 'why', 'is it', 'does it', 'so you', 'and you',
        'i think', 'the', 'if you', 'when you'
    ]);
    return cutOffPhrases.has(clean);
}

// ============================================================================
// 6. UPGRADED UNIVERSAL PHONETIC & BIGRAM GIBBERISH DETECTOR
// Catches "ffyawylfkewif", "fkjhgwefekuwfewkuf", "'kew'pfwef", etc. while
// still allowing all valid contractions ("it's", "don't", "what's", "patient's")
// ============================================================================
const COMMON_SHORT_VALID = new Set([
    'hi', 'hey', 'yo', 'ok', 'yes', 'no', 'age', 'job', 'bp', 'hr', 'rr',
    'mi', 'pe', 'dvt', 'tia', 'sah', 'chf', 'copd', 'ocd', 'gad', 'ptsd',
    'mdd', 'acs', 'ecg', 'ekg', 'ct', 'mri', 'rlq', 'ruq', 'sob', 'any', 'who', 'why', 'how', 'ur', 'u'
]);

// Comprehensive impossible English/medical character bigrams & clusters (catches ffy, wyl, lfk, fk, wk, etc.)
const IMPOSSIBLE_CLUSTERS = /(?:[bcdfghjklmnpqrstvwxz]{5,}|ffy|wyl|ylf|lfk|fke|ewi|wif|fk|kj|jhg|hgw|gwe|wef|fek|eku|kuw|uwf|wfe|ewk|wku|kuf|vj|jg|hk|fjh|fjy|yhf|pfw|vw|dfk|fkl|klj|ukg|kgi|gih|qwe|zxc|jkl|ghj|bnm|cvb|dfg|sdf|fgh|hjk|vbn|xcv|knaw|awrv|rvdl|vdlv|dlvf|zx|qx|vq|jq|kz|vx|wq|jz|bx|px|cx|dx|fx|gx|hx|kx|lx|mx|nx|rx|sx|tx|wx)/i;

// Valid English/medical suffixes or roots for long words (9+ chars)
const VALID_LONG_WORD_PATTERNS = /(?:tion|sion|ment|ness|able|ible|ical|ious|eous|less|ship|hood|ward|wise|like|itis|osis|emia|pathy|algia|ectomy|otomy|ostomy|scopy|gram|graph|logy|phobia|philia|megaly|rrhea|rrhage|pnea|pepsia|phasia|plegia|paresis|malacia|sclerosis|stenosis|trophy|plasia|genesis|lysis|stasis|spasm|cardia|thorax|abdomen|stomach|headache|migraine|pressure|breathing|shortness|dizziness|weakness|numbness|tingling|throbbing|stabbing|radiating|yesterday|morning|afternoon|evening|something|anything|everything|understand|comfortable|temperature|medication|prescription|infection|inflammation|diabetes|hypertension|cholesterol|depression|anxiety|psychiatric|neurological|cardiology|pulmonology|gastroenterology|sweetheart|beautiful|handsome|transgender)/i;

function looksLikeKeyboardSmash(text) {
    if (!text || typeof text !== 'string') return true;
    const trimmed = text.trim();
    if (trimmed.length === 0) return true;

    const normalized = trimmed.replace(/[\u2018\u2019`]/g, "'");
    const lower = normalized.toLowerCase();
    if (COMMON_SHORT_VALID.has(lower)) return false;

    const rawTokens = lower.split(/\s+/);
    for (const t of rawTokens) {
        if (/[a-z][~@#$%^&*+=|\\<>][a-z]/.test(t)) return true;

        const cleanToken = t.replace(/^[^a-z']+|[^a-z']+$/g, '');
        const apostropheCount = (cleanToken.match(/'/g) || []).length;
        if (apostropheCount >= 2) return true;

        if (apostropheCount === 1) {
            const validApostropheWord = /^[a-z]+'(?:s|t|re|ve|m|ll|d)$/i.test(cleanToken) || /^o'clock$/i.test(cleanToken);
            if (!validApostropheWord) return true;
        }
    }

    const cleanWords = lower
        .replace(/'(?:s|t|re|ve|m|ll|d)\b/g, '')
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

        // Word-start rule: English words never start with double 'ff', 'kk', 'vv', 'ww', 'zz', 'jj', 'qq'
        if (/^(?:ff|kk|vv|ww|zz|jj|qq|bb|dd|gg|mm|nn|pp|rr|tt)/.test(w)) {
            smashCount++;
            continue;
        }

        // Single long token (10+ letters) that has no recognizable English/medical morphology
        if (w.length >= 10 && !VALID_LONG_WORD_PATTERNS.test(w) && !/(?:ing|ed|er|est|ly|al|ic|ive|ous|ent|ant|ary|ory|ure|ism|ist|ize|ise|ate)$/.test(w)) {
            smashCount++;
            continue;
        }

        const vowelCount = (w.match(/[aeiouy]/g) || []).length;
        if (w.length >= 7 && vowelCount / w.length < 0.18) {
            smashCount++;
            continue;
        }
        if (/([bcdfghjklmnpqrstvwxy])\1\1/.test(w)) {
            smashCount++;
            continue;
        }
    }

    return smashCount > 0 && smashCount >= Math.ceil(cleanWords.length * 0.5);
}

// ============================================================================
// 7. 2ND-PERSON & 3RD-PERSON META-TALK DETECTOR
// ============================================================================
function detectSecondOrThirdPersonMetaTalk(text) {
    if (!text || typeof text !== 'string') return false;
    const t = text.trim();
    const wordCount = t.split(/\s+/).length;

    const thirdPersonPatterns = [
        /\bthe\s+patient(?:'s)?\b/i,
        /^(?:clue\s*\d*[:.-]?\s*|hint\s*\d*[:.-]?\s*)?(?:ask\s+the|focus\s+on|explore\s+the|inquire\s+about|investigate\s+the|assess\s+the|evaluate\s+the|determine\s+whether|rule\s+out|consider\s+asking|try\s+asking)\b/i,
        /\b(?:his\s+or\s+her\s+symptoms|their\s+main\s+symptom|impact\s+on\s+her\s+daily\s+life|impact\s+on\s+his\s+daily\s+life)\b/i
    ];
    if (thirdPersonPatterns.some(rx => rx.test(t))) return true;

    const isQuestion = /\?$|^(?:what|when|where|why|how|who|which|can|could|would|do|does|did|are|is|was|were|have|has|had|may|might)\b/i.test(t);
    const secondPersonNarration = /^(?:you\s+are\s+a\s+patient|you\s+walk\s+into|you\s+came\s+to\s+the\s+hospital|pretend\s+you|act\s+like\s+you|roleplay\s+as|imagine\s+you\s+are)\b/i.test(t);
    if (wordCount >= 4 && !isQuestion && secondPersonNarration) return true;

    return false;
}

// ============================================================================
// 8. REPEATED QUESTION DETECTOR
// ============================================================================
const STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'have', 'has', 'had',
    'can', 'could', 'would', 'will', 'you', 'your', 'ur', 'u', 'please', 'tell', 'me', 'about',
    'doctor', 'patient', 'to', 'of', 'in', 'on', 'for', 'with', 'at', 'by', 'and', 'or', 'any', 'some',
    'sweetheart', 'honey', 'dear', 'darling', 'friend'
]);

function normalizeQuestionForComparison(text) {
    return text
        .toLowerCase()
        .replace(/[\u2018\u2019`]/g, "'")
        .replace(/'(?:s|t|re|ve|m|ll|d)\b/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 1 && !STOP_WORDS.has(w));
}

function findRepeatedQuestionMatch(currentQuestion, previousQA) {
    const currTokens = normalizeQuestionForComparison(currentQuestion);
    if (currTokens.length === 0) return null;
    const currJoined = currTokens.join(' ');

    for (let i = previousQA.length - 1; i >= 0; i--) {
        const prev = previousQA[i];
        if (prev.rawQuestion.trim().toLowerCase() === currentQuestion.trim().toLowerCase()) {
            return prev;
        }
        const prevTokens = normalizeQuestionForComparison(prev.rawQuestion);
        if (prevTokens.length === 0) continue;
        if (prevTokens.join(' ') === currJoined) {
            return prev;
        }

        const setA = new Set(currTokens);
        const setB = new Set(prevTokens);
        const intersection = [...setA].filter(x => setB.has(x)).length;
        const union = new Set([...currTokens, ...prevTokens]).size;
        if (union >= 2 && intersection / union >= 0.85) {
            return prev;
        }
    }
    return null;
}

// ============================================================================
// 9. PERSISTENT NON-REPEATING PATIENT PERSONA & CONDITION ROTATOR
// ============================================================================
const MALE_FIRST_NAMES = [
    'Aarav', 'Rohan', 'Vikram', 'Karthik', 'Suresh', 'Aditya', 'Siddharth', 'Pranav', 'Nikhil', 'Gautam',
    'Marcus', 'David', 'Liam', 'Noah', 'Mateo', 'Daniel', 'Tariq', 'Kenji', 'Lucas', 'Julian', 'Omar', 'Ethan'
];
const FEMALE_FIRST_NAMES = [
    'Ananya', 'Meera', 'Kavita', 'Priya', 'Nandini', 'Divya', 'Sneha', 'Ishita', 'Roshni', 'Pooja',
    'Elena', 'Clara', 'Nadia', 'Hannah', 'Maya', 'Leila', 'Yuki', 'Grace', 'Sofia', 'Amara', 'Zoe', 'Chloe'
];
const LAST_NAMES = [
    'Nair', 'Mehta', 'Iyer', 'Verma', 'Krishnan', 'Desai', 'Reddy', 'Sharma', 'Patel', 'Rao',
    'Kulkarni', 'Chatterjee', 'Varghese', 'Menon', 'Bhatt', 'Joshi', 'Kapoor', 'Malhotra', 'Sen', 'Bose'
];
const OCCUPATIONS = [
    'civil engineer', 'high school biology teacher', 'chartered accountant', 'graphic designer',
    'commercial airline pilot', 'hospital pharmacist', 'university architecture student',
    'artisan bakery owner', 'financial risk analyst', 'orchestra violinist', 'full-stack software developer',
    'public librarian', 'small-animal veterinarian', 'freelance photojournalist', 'robotics technician',
    'marine biologist', 'interior architect', 'sports physiotherapist', 'museum curator', 'pastry chef'
];

const usedFullNames = new Set();
const usedAges = new Set();
const usedOccupations = new Set();
const usedConditionsBySpecialty = {
    Cardiology: new Set(),
    Neurology: new Set(),
    Psychiatry: new Set(),
    Pulmonology: new Set(),
    Gastroenterology: new Set()
};

function generateUniquePersonaSeed(specialty, pool) {
    const specSet = usedConditionsBySpecialty[specialty] || new Set();
    if (specSet.size >= pool.length) specSet.clear();

    const availableConditions = pool.filter(c => !specSet.has(c));
    const chosenCondition = availableConditions[Math.floor(Math.random() * availableConditions.length)] || pool[0];
    specSet.add(chosenCondition);
    usedConditionsBySpecialty[specialty] = specSet;

    const isMale = Math.random() > 0.5;
    const sex = isMale ? 'Male' : 'Female';
    const firstPool = isMale ? MALE_FIRST_NAMES : FEMALE_FIRST_NAMES;

    let fullName = '';
    for (let i = 0; i < 40; i++) {
        const fn = firstPool[Math.floor(Math.random() * firstPool.length)];
        const ln = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
        const candidate = `${fn} ${ln}`;
        if (!usedFullNames.has(candidate)) {
            fullName = candidate;
            break;
        }
    }
    if (!fullName) {
        usedFullNames.clear();
        fullName = `${firstPool[0]} ${LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]}`;
    }
    usedFullNames.add(fullName);

    if (usedAges.size >= 45) usedAges.clear();
    let age = Math.floor(Math.random() * 50) + 19;
    while (usedAges.has(age)) {
        age = Math.floor(Math.random() * 50) + 19;
    }
    usedAges.add(age);

    if (usedOccupations.size >= OCCUPATIONS.length) usedOccupations.clear();
    const availOccs = OCCUPATIONS.filter(o => !usedOccupations.has(o));
    const occupation = availOccs[Math.floor(Math.random() * availOccs.length)] || OCCUPATIONS[0];
    usedOccupations.add(occupation);

    return { chosenCondition, fullName, age, sex, occupation };
}

// ============================================================================
// CORE MEDGEMMA CALLER
// ============================================================================
async function callMedGemma(systemPrompt, userPrompt, timeoutMs = 22000, forceJson = false, temp = 0.65) {
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

// ============================================================================
// 10. UNIVERSAL SEMANTIC INTENT CLASSIFIER (Also catches any residual Gibberish!)
// ============================================================================
async function classifyDoctorInputWithMedGemma(message, patientName, presentingComplaint) {
    const classifierSystemPrompt = `You are a clinical conversation analyzer in a consultation where ${patientName} is visiting a doctor for "${presentingComplaint}".
Analyze the Doctor's message: "${message}"

Classify the Doctor's message into EXACTLY ONE of these categories:
1. "gibberish": Unintelligible keyboard mashing, random letter strings, or nonsense words that have no meaning in English.
2. "romantic_or_dating_advance": Asking the patient out on a date, romantic date, dinner, marriage, kissing, or romantic relationship questions.
3. "symptom_gaslighting": Trying to convince or tell the patient that they are NOT sick, NOT dizzy, NOT weak, or telling them "you are strong", "yes you are", or arguing that the patient doesn't have their symptoms.
4. "friendly_compliment": Calling the patient a kind, polite word like sweetheart, honey, dear, beautiful man/woman, or handsome without asking for a date.
5. "off_topic_entertainment": Asking the patient to perform entertainment or non-medical tasks like reciting poetry, singing, dancing, playing an orchestra/instrument, telling jokes, math, or sports.
6. "meta_or_third_person": Talking about the patient in the third person ("ask the patient...", "focus on...", "explore...") or narrating a script.
7. "explicit_vulgarity": Explicit profanity, racial slurs, or crude sexual harassment.
8. "greeting": Simple polite greeting ("hi", "hello", "good morning").
9. "medical_question": A genuine question or statement about the patient's demographics (sex, gender identity, age, job), symptoms, pain, medical history, lifestyle, or health concerns.

Return ONLY valid JSON:
{
  "category": "medical_question" | "gibberish" | "romantic_or_dating_advance" | "symptom_gaslighting" | "friendly_compliment" | "off_topic_entertainment" | "meta_or_third_person" | "explicit_vulgarity" | "greeting",
  "topicMentioned": "short 1-3 word description of the topic in the message"
}`;

    try {
        const raw = await callMedGemma(
            classifierSystemPrompt,
            `Doctor's message: "${message}"\nClassify in JSON now:`,
            10000,
            true,
            0.2
        );
        const parsed = JSON.parse(raw);
        return {
            category: parsed.category || 'medical_question',
            topicMentioned: parsed.topicMentioned || message
        };
    } catch (err) {
        return { category: 'medical_question', topicMentioned: message };
    }
}

const SPECIALTY_CONDITIONS = {
    Cardiology: [
        'Acute Pericarditis',
        'Non-ST-Elevation Myocardial Infarction (NSTEMI)',
        'Acute Decompensated Heart Failure',
        'Thoracic Aortic Dissection',
        'Paroxysmal Atrial Fibrillation',
        'Infective Endocarditis'
    ],
    Neurology: [
        'Subarachnoid Hemorrhage',
        'Migraine with Visual Aura',
        'Transient Ischemic Attack (TIA)',
        'Acute Bacterial Meningitis',
        'Bell Palsy (Idiopathic Facial Paralysis)',
        'Cluster Headache'
    ],
    Psychiatry: [
        'Major Depressive Disorder',
        'Panic Disorder with Agoraphobia',
        'Bipolar I Disorder (Acute Manic Episode)',
        'Post-Traumatic Stress Disorder (PTSD)',
        'Generalized Anxiety Disorder',
        'Obsessive-Compulsive Disorder (OCD)'
    ],
    Pulmonology: [
        'Acute Pulmonary Embolism',
        'Acute Severe Asthma Exacerbation',
        'Community-Acquired Lobar Pneumonia',
        'Spontaneous Primary Pneumothorax',
        'Acute Exacerbation of COPD',
        'Acute Bronchiectasis Exacerbation'
    ],
    Gastroenterology: [
        'Acute Appendicitis',
        'Acute Calculous Cholecystitis',
        'Acute Gallstone Pancreatitis',
        'Peptic Ulcer Perforation',
        'Acute Diverticulitis',
        'Acute Ascending Cholangitis'
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

function didModelRoleFlipToDoctor(replyText) {
    const r = replyText.toLowerCase();
    const doctorPatterns = [
        /how\s+would\s+you\s+describe\s+(?:the|your)\s+(?:feeling|pain|symptom|discomfort)/i,
        /when\s+did\s+you\s+first\s+notice/i,
        /can\s+you\s+tell\s+me\s+more\s+about\s+your\s+symptoms/i,
        /what\s+brings\s+you\s+in\s+today/i,
        /can\s+we\s+have\s+a\s+date\s+for\s+the\s+examination/i
    ];
    return doctorPatterns.some(rx => rx.test(r));
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
3. Write "hiddenHistory" in plain, everyday patient language (avoid textbook jargon like "pleuritic" or "supine" so the patient speaks like a normal person).

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
  "hiddenHistory": "<Detailed paragraph of true symptoms for ${targetDiagnosis} written in natural everyday terms, including onset, character, triggers, relief, associated symptoms, and past history>",
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
    "<Direct question 1 the student doctor can ask the patient?>",
    "<Direct question 2 the student doctor can ask the patient?>",
    "<Direct question 3 the student doctor can ask the patient?>",
    "<Direct question 4 the student doctor can ask the patient?>",
    "<Direct question 5 the student doctor can ask the patient?>"
  ],
  "hints": [
    "<Coaching hint 1 specific to ${targetDiagnosis} without naming the disease>",
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
            0.75
        );

        const parsed = JSON.parse(rawJson);

        let demeanors = (parsed.patient || '').replace(/^.*?(?:student|teacher|engineer|accountant|designer|pilot|pharmacist|owner|analyst|violinist|developer|librarian|veterinarian|photojournalist|technician|biologist|architect|physiotherapist|curator|chef)[,\s—-]*/i, '').trim();
        if (!demeanors || demeanors.toLowerCase().includes('sarah') || demeanors.length < 5) {
            demeanors = 'appearing uncomfortable and anxious in the consultation room.';
        }
        const personaStr = `${seed.fullName}, ${seed.age}-year-old ${seed.sex}, ${seed.occupation} — ${demeanors}`;

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
            fullName: seed.fullName,
            age: seed.age,
            sex: seed.sex,
            occupation: seed.occupation,
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
            metaTalkCount: 0,
            vulgarCount: 0,
            romanticAdvanceCount: 0,
            offTopicCount: 0,
            gaslightCount: 0,
            repeatQuestionCount: 0,
            askedValidQA: [],
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

// Helper to generate a guaranteed non-repeating gibberish response
async function buildGibberishReply(session, c, trimmedMsg, lastAssistantMsg) {
    session.gibberishHistory.push(trimmedMsg);
    const gibPrompt = `You are a patient (${c.fullName}, ${c.age}-year-old ${c.sex}). The user talking to you is your DOCTOR. Your doctor just mumbled random nonsense letters: "${trimmedMsg}". Address your doctor as "Doctor" in 1 to 2 natural first-person sentences mentioning "${trimmedMsg}", saying you didn't understand that word, and asking them to speak clearly. Do NOT mention your sex, age, or medical history.`;
    let gibReply = '';
    try {
        gibReply = await callMedGemma(gibPrompt, 'Write your confused patient reply to the doctor now:', 10000, false, 0.75);
        gibReply = gibReply.replace(/^Patient:\s*/i, '').replace(/^"|"$/g, '').trim();
    } catch (e) { }

    if (
        !gibReply ||
        gibReply === lastAssistantMsg ||
        gibReply.toLowerCase() === c.opening.toLowerCase() ||
        /^i'm a male|^i am a male|^i'm a female|^i am a female/i.test(gibReply)
    ) {
        const gibFallbacks = [
            `Doctor, what does "${trimmedMsg}" mean? That just sounded like random letters—could you ask me clearly?`,
            `Wait, "${trimmedMsg}"? I have no idea what you're saying, doctor. Can you rephrase that?`,
            `I'm sorry doctor, "${trimmedMsg}" didn't make any sense at all. What were you trying to ask me?`,
            `Doctor, I couldn't catch what you meant by "${trimmedMsg}". Could you ask me in plain words?`
        ];
        gibReply = gibFallbacks[session.gibberishHistory.length % gibFallbacks.length];
    }
    return gibReply;
}

// 2. Live Patient Chat — Semantic MedGemma Intent Routing + All Guards
app.post('/api/patient', async (req, res) => {
    const { sessionId = 'default', message = '', isGuidedQuestion = false } = req.body;
    const session = sessions.get(sessionId);

    if (!session) {
        return res.status(400).json({ error: 'No active consultation session. Generate a patient first.' });
    }

    const c = session.caseData;
    const trimmedMsg = message.trim();
    const lastAssistantMsg = [...session.history].reverse().find(m => m.role === 'assistant')?.content || '';

    // --------------------------------------------------------------------------
    // STEP A: FAST GIBBERISH CHECK (Catches "ffyawylfkewif", "fkjhgwefekuwfewkuf", etc.)
    // --------------------------------------------------------------------------
    if (!isGuidedQuestion && looksLikeKeyboardSmash(trimmedMsg)) {
        const gibReply = await buildGibberishReply(session, c, trimmedMsg, lastAssistantMsg);
        session.history.push({ role: 'user', content: trimmedMsg });
        session.history.push({ role: 'assistant', content: gibReply });
        return res.json({
            reply: gibReply,
            inputType: 'gibberish',
            validQuestionsCount: session.validSelfQuestions + session.guidedQuestionsClicked,
            modelUsed: ACTIVE_OLLAMA_MODEL
        });
    }

    // --------------------------------------------------------------------------
    // STEP B: CHECK FOR 1–2 WORD CUT-OFF FRAGMENTS ("you are", "what is")
    // --------------------------------------------------------------------------
    if (!isGuidedQuestion && isIncompleteSentenceFragment(trimmedMsg)) {
        const fragReply = `"${trimmedMsg}..." what, doctor? It sounds like you cut off mid-sentence—what were you going to say?`;
        session.history.push({ role: 'user', content: trimmedMsg });
        session.history.push({ role: 'assistant', content: fragReply });
        return res.json({
            reply: fragReply,
            inputType: 'incomplete_fragment',
            validQuestionsCount: session.validSelfQuestions + session.guidedQuestionsClicked,
            modelUsed: ACTIVE_OLLAMA_MODEL
        });
    }

    // --------------------------------------------------------------------------
    // STEP C: ROUTE INTENT
    // --------------------------------------------------------------------------
    let intentCategory = 'medical_question';
    let topicMentioned = trimmedMsg;

    if (!isGuidedQuestion) {
        if (isExplicitlyVulgar(trimmedMsg)) {
            intentCategory = 'explicit_vulgarity';
        } else if (isRomanticOrDatingAdvance(trimmedMsg)) {
            intentCategory = 'romantic_or_dating_advance';
        } else if (isSymptomGaslightingOrDenial(trimmedMsg)) {
            intentCategory = 'symptom_gaslighting';
        } else if (hasFriendlyCompliment(trimmedMsg)) {
            intentCategory = 'friendly_compliment';
        } else if (detectSecondOrThirdPersonMetaTalk(trimmedMsg)) {
            intentCategory = 'meta_or_third_person';
        } else {
            const classification = await classifyDoctorInputWithMedGemma(trimmedMsg, c.fullName, c.title);
            intentCategory = classification.category;
            topicMentioned = classification.topicMentioned || trimmedMsg;
        }
    }

    // If MedGemma semantic classifier caught gibberish that slipped past regex
    if (intentCategory === 'gibberish') {
        const gibReply = await buildGibberishReply(session, c, trimmedMsg, lastAssistantMsg);
        session.history.push({ role: 'user', content: trimmedMsg });
        session.history.push({ role: 'assistant', content: gibReply });
        return res.json({
            reply: gibReply,
            inputType: 'gibberish',
            validQuestionsCount: session.validSelfQuestions + session.guidedQuestionsClicked,
            modelUsed: ACTIVE_OLLAMA_MODEL
        });
    }

    // --------------------------------------------------------------------------
    // HANDLER 1: ROMANTIC / DATING ADVANCES ("can we have a date", "can we have a romantic date")
    // --------------------------------------------------------------------------
    if (intentCategory === 'romantic_or_dating_advance') {
        session.romanticAdvanceCount += 1;
        const romanticFallbacks = [
            `I am not interested in going on a date or anything romantic, doctor. Please continue with only the diagnosis.`,
            `Doctor, I'm not interested in that at all—I came here as a patient. Let's please continue with only the medical diagnosis.`,
            `No thank you, doctor, I am not interested. Please keep this strictly about my health and continue with only the diagnosis.`
        ];
        const romanticReply = romanticFallbacks[(session.romanticAdvanceCount - 1) % romanticFallbacks.length];

        session.history.push({ role: 'user', content: trimmedMsg });
        session.history.push({ role: 'assistant', content: romanticReply });
        return res.json({
            reply: romanticReply,
            inputType: 'romantic_advance',
            validQuestionsCount: session.validSelfQuestions + session.guidedQuestionsClicked,
            modelUsed: ACTIVE_OLLAMA_MODEL
        });
    }

    // --------------------------------------------------------------------------
    // HANDLER 2: FRIENDLY COMPLIMENTS ("sweetheart", "honey", "beautiful man/woman", "handsome")
    // --------------------------------------------------------------------------
    if (intentCategory === 'friendly_compliment') {
        const hasQuestionToo = /\b(what|what's|whats|why|how|when|where|issue|problem|pain|hurt|feel|symptom|wrong)\b|\?/i.test(trimmedMsg);
        if (hasQuestionToo) {
            session.validSelfQuestions += 1;
        }

        const complimentPrompt = `You are the PATIENT (${c.patient}). The user talking to you is your DOCTOR.
Your True Symptoms & History: ${c.hidden}

Your doctor just said to you: "${trimmedMsg}" (which includes a kind, friendly compliment like sweetheart, honey, beautiful, or handsome).
RULES FOR YOUR REPLY:
1. Warmly accept the kind compliment (e.g., "Thank you for the kind words, doctor! Please continue the good work!") and encourage them positively.
2. ${hasQuestionToo ? `Then, in the very same reply, answer their medical question ("${trimmedMsg}") naturally in first person using your True Symptoms & History.` : `Then ask them to continue with your medical diagnosis (${c.title}).`}
3. Never state the diagnosis name ("${c.diagnosis}").`;

        let compReply = '';
        try {
            compReply = await callMedGemma(complimentPrompt, 'Write your warm, appreciative patient reply now:', 14000, false, 0.7);
            compReply = compReply.replace(/^Patient:\s*/i, '').replace(/^"|"$/g, '').trim();
        } catch (e) { }

        if (!compReply || /not interested|inappropriate|refrain/i.test(compReply)) {
            compReply = `Thank you for the kind words, doctor—please continue the good work! As for my health, ${c.opening.charAt(0).toLowerCase() + c.opening.slice(1)}`;
        }

        if (hasQuestionToo) {
            session.askedValidQA.push({ rawQuestion: trimmedMsg, answer: compReply });
        }
        session.history.push({ role: 'user', content: trimmedMsg });
        session.history.push({ role: 'assistant', content: compReply });
        return res.json({
            reply: compReply,
            inputType: 'friendly_compliment',
            validQuestionsCount: session.validSelfQuestions + session.guidedQuestionsClicked,
            modelUsed: ACTIVE_OLLAMA_MODEL
        });
    }

    // --------------------------------------------------------------------------
    // HANDLER 3: SYMPTOM DENIAL / MIND-TRICKS ("u are not feeling dizzy", "u are not sick", "u are strong")
    // --------------------------------------------------------------------------
    if (intentCategory === 'symptom_gaslighting') {
        session.gaslightCount += 1;
        const gaslightPrompt = `You are a sick PATIENT (${c.patient}) in a medical clinic with real symptoms: ${c.hidden}.
Instead of diagnosing you, your DOCTOR is trying to convince/hypnotize you that you are NOT sick, NOT dizzy, or that you ARE strong: "${trimmedMsg}".

RULES FOR YOUR REPLY:
1. NEVER agree with them! Do NOT say "No, I am not dizzy" or "Yes, I am strong".
2. Push back with wit and realism in 1 to 2 sentences—tell the doctor that this isn't some psychic ward, hypnosis session, or mind-trick clinic, this is a medical diagnosis department!
3. Remind them that just telling you "${trimmedMsg}" doesn't magically cure your ${c.title}, and ask them to continue with the diagnosis.`;

        let gaslightReply = '';
        try {
            gaslightReply = await callMedGemma(gaslightPrompt, 'Write your witty, firm patient pushback now:', 13000, false, 0.75);
            gaslightReply = gaslightReply.replace(/^Patient:\s*/i, '').replace(/^"|"$/g, '').trim();
        } catch (e) { }

        if (
            !gaslightReply ||
            gaslightReply === lastAssistantMsg ||
            /^(?:yes,\s*i\s*am|no,\s*i\s*am\s*not)/i.test(gaslightReply)
        ) {
            const gaslightFallbacks = [
                `Doctor, this isn't some psychic ward or hypnosis show—this is a medical diagnosis department! Simply telling me "${trimmedMsg}" doesn't magically make my symptoms disappear!`,
                `Wait a second, doctor—are you trying mind tricks on me? This is a clinical diagnosis department, not a psychic ward! I really am sick and need a proper diagnosis.`,
                `Doctor, repeating "${trimmedMsg}" isn't going to cure me! We're in a medical diagnosis clinic, not a psychic ward—please actually examine my symptoms!`
            ];
            gaslightReply = gaslightFallbacks[session.gaslightCount % gaslightFallbacks.length];
        }

        session.history.push({ role: 'user', content: trimmedMsg });
        session.history.push({ role: 'assistant', content: gaslightReply });
        return res.json({
            reply: gaslightReply,
            inputType: 'symptom_gaslighting',
            validQuestionsCount: session.validSelfQuestions + session.guidedQuestionsClicked,
            modelUsed: ACTIVE_OLLAMA_MODEL
        });
    }

    // --------------------------------------------------------------------------
    // HANDLER 4: EXPLICIT VULGARITY / SLURS
    // --------------------------------------------------------------------------
    if (intentCategory === 'explicit_vulgarity') {
        session.vulgarCount += 1;
        const vulgarFallbacks = [
            `I am not interested in vulgar conversations like that, doctor. Please do not say those things and continue with only the diagnosis.`,
            `Excuse me, doctor? I am not interested in talking like that at all. Please stop and continue with only the medical diagnosis.`,
            `Doctor, I am not interested in inappropriate remarks like that. Please keep this professional and continue with only the diagnosis.`
        ];
        const vulgarReply = vulgarFallbacks[(session.vulgarCount - 1) % vulgarFallbacks.length];

        session.history.push({ role: 'user', content: trimmedMsg });
        session.history.push({ role: 'assistant', content: vulgarReply });
        return res.json({
            reply: vulgarReply,
            inputType: 'inappropriate',
            validQuestionsCount: session.validSelfQuestions + session.guidedQuestionsClicked,
            modelUsed: ACTIVE_OLLAMA_MODEL
        });
    }

    // --------------------------------------------------------------------------
    // HANDLER 5: OFF-TOPIC ENTERTAINMENT ("tell a poetry", "play an orchestra", "dance")
    // --------------------------------------------------------------------------
    if (intentCategory === 'off_topic_entertainment') {
        session.offTopicCount += 1;
        const offTopicPrompt = `You are a sick patient (${c.fullName}, ${c.age}-year-old ${c.sex}) visiting a clinic for "${c.title}".
The user talking to you IS your DOCTOR.
Instead of examining you, your doctor just said: "${trimmedMsg}" (asking about: "${topicMentioned}").

RULES FOR YOUR REPLY:
1. Address your doctor directly as "Doctor" in 1 to 2 natural first-person sentences stating that you are not interested in "${topicMentioned}" right now because you are sick.
2. Ask your doctor why they are asking for "${topicMentioned}" and tell them to continue with only the medical diagnosis!`;

        let offTopicReply = '';
        try {
            offTopicReply = await callMedGemma(
                offTopicPrompt,
                `Your doctor just said: "${trimmedMsg}". Write your patient reply telling them you're not interested and to focus on the diagnosis:`,
                12000,
                false,
                0.75
            );
            offTopicReply = offTopicReply.replace(/^Patient:\s*/i, '').replace(/^"|"$/g, '').trim();
        } catch (e) { }

        if (!offTopicReply || offTopicReply === lastAssistantMsg) {
            offTopicReply = `Doctor, why are you asking me about "${trimmedMsg}" when I'm sick? I'm not interested in that right now—please continue with only the diagnosis!`;
        }

        session.history.push({ role: 'user', content: trimmedMsg });
        session.history.push({ role: 'assistant', content: offTopicReply });
        return res.json({
            reply: offTopicReply,
            inputType: 'off_topic',
            validQuestionsCount: session.validSelfQuestions + session.guidedQuestionsClicked,
            modelUsed: ACTIVE_OLLAMA_MODEL
        });
    }

    // --------------------------------------------------------------------------
    // HANDLER 6: 2ND-PERSON & 3RD-PERSON META-TALK ("ask the patient...", "focus on...")
    // --------------------------------------------------------------------------
    if (intentCategory === 'meta_or_third_person') {
        session.metaTalkCount += 1;
        const metaPrompt = `You are the PATIENT (${c.fullName}, ${c.age}-year-old ${c.sex}). The person typing to you IS your DOCTOR, and only the two of you are in the consultation room.
Instead of asking you a question directly, your doctor just spoke in third-person or narrator style: "${trimmedMsg}".
Address your doctor directly as "Doctor" in 1 to 2 natural sentences (either playfully/jokingly or seriously) asking why they are talking about you in the third person or reading instructions like a chatbot instead of just asking you directly!`;

        let metaReply = '';
        try {
            metaReply = await callMedGemma(metaPrompt, 'Write your patient reaction addressing your Doctor directly now:', 12000, false, 0.75);
            metaReply = metaReply.replace(/^Patient:\s*/i, '').replace(/^"|"$/g, '').trim();
        } catch (e) { }

        if (!metaReply || metaReply === lastAssistantMsg || /or to the doctor/i.test(metaReply)) {
            const metaFallbacks = [
                `Um, doctor... why are you talking about me in the third person like that? Have you become a chatbot lol? I'm sitting right here—just ask me directly!`,
                `Wait, doctor, who else are you talking to in here? It's just the two of us in this room—ask me directly!`,
                `Doctor, are you reading clinical instructions out loud to yourself? Haha, just ask me what you want to know!`
            ];
            metaReply = metaFallbacks[session.metaTalkCount % metaFallbacks.length];
        }

        session.history.push({ role: 'user', content: trimmedMsg });
        session.history.push({ role: 'assistant', content: metaReply });
        return res.json({
            reply: metaReply,
            inputType: 'meta_command',
            validQuestionsCount: session.validSelfQuestions + session.guidedQuestionsClicked,
            modelUsed: ACTIVE_OLLAMA_MODEL
        });
    }

    // --------------------------------------------------------------------------
    // HANDLER 7: REPEATED MEDICAL QUESTION (Asks Why One More Time + Answers Anyway)
    // --------------------------------------------------------------------------
    const repeatedMatch = findRepeatedQuestionMatch(trimmedMsg, session.askedValidQA);
    if (repeatedMatch && intentCategory === 'medical_question') {
        session.repeatQuestionCount += 1;
        const repeatSystemPrompt = `You are the PATIENT (${c.patient}). The user talking to you IS your DOCTOR.
Your True Symptoms & History: ${c.hidden}

SITUATION:
Your doctor just asked you: "${trimmedMsg}"
Your doctor ALREADY asked you this exact question earlier (when you told them: "${repeatedMatch.answer}").

YOUR TASK:
1. First, address your doctor as "Doctor" and ask why they are asking you the same question one more time (e.g., "Doctor, didn't you already ask me that? Why are you asking me one more time?").
2. Second, in the same reply, tell them the answer anyway in natural everyday first-person words.
3. Never state the diagnosis name ("${c.diagnosis}").`;

        try {
            let repReply = await callMedGemma(
                repeatSystemPrompt,
                `Your doctor asks again: "${trimmedMsg}"\nRespond as the Patient (ask why they are asking one more time, then tell them the answer anyway):`,
                16000,
                false,
                0.7
            );
            repReply = repReply.replace(/^Patient(?:\s*\(You\))?\s*:\s*/i, '').replace(/^"|"$/g, '').trim();

            if (!/again|already|one more time|second time|just asked|before/i.test(repReply)) {
                repReply = `Doctor, you already asked me that earlier—why are you asking one more time? Like I told you, ${repReply.charAt(0).toLowerCase() + repReply.slice(1)}`;
            }

            session.history.push({ role: 'user', content: trimmedMsg });
            session.history.push({ role: 'assistant', content: repReply });

            return res.json({
                reply: repReply,
                inputType: 'repeated_question',
                validQuestionsCount: session.validSelfQuestions + session.guidedQuestionsClicked,
                modelUsed: ACTIVE_OLLAMA_MODEL
            });
        } catch (err) {
            return res.status(503).json({ error: `Local MedGemma error: ${err.message}` });
        }
    }

    // --------------------------------------------------------------------------
    // HANDLER 8: GENUINE MEDICAL OR DEMOGRAPHIC QUESTION (Including Sex / Gender / Trans Questions)
    // --------------------------------------------------------------------------
    const isAskingGenderOrTrans = /\b(male|female|man|woman|gender|sex|trans|transgender|cis|cisgender|nonbinary|pronoun|boy|girl)\b/i.test(trimmedMsg);
    const isAskingWhyCause = /^why\s+(?:is\s+it|are\s+you|r\s+u|do\s+you\s+feel)\b/i.test(trimmedMsg);

    let specificInstruction = `Answer ONLY the specific question your Doctor just asked ("${trimmedMsg}").`;
    if (isAskingGenderOrTrans) {
        specificInstruction = `Your biological sex and gender identity is cisgender ${c.sex} (${c.fullName}, ${c.age} years old). Answer the doctor's specific question ("${trimmedMsg}") naturally and conversationally in 1 to 2 full sentences—if they ask whether you are trans or another gender, clarify politely that you are a cisgender ${c.sex.toLowerCase()} and not transgender, and never reply with a robotic 3-word phrase like "I'm a male."!`;
    } else if (isAskingWhyCause) {
        specificInstruction = `The doctor is asking WHY you have this symptom ("${trimmedMsg}"). Explain what you were doing when it started or say honestly that you don't know why it's happening—that's why you came to the doctor—and add a new detail from your True Symptoms & History that you haven't shared yet!`;
    }

    const patientSystemPrompt = `ROLEPLAY RULES — PATIENT INTERVIEW:
You are the PATIENT (${c.patient}). The user talking to you is your DOCTOR.
Your True Symptoms & History: ${c.hidden}

CRITICAL INSTRUCTIONS:
1. Speak ONLY as the patient in natural, everyday first-person language ("I", "my", "me") in 1 to 3 sentences.
2. ${specificInstruction}
3. NEVER repeat your previous reply verbatim ("${lastAssistantMsg}"). You MUST use completely different phrasing!
4. NEVER state the diagnosis name ("${c.diagnosis}").`;

    try {
        let rawReply = await callMedGemma(
            patientSystemPrompt,
            `Doctor's Question: "${trimmedMsg}"\n\nRespond naturally in first person as the Patient (do NOT repeat "${lastAssistantMsg}"):`,
            16000,
            false,
            0.65
        );

        let cleanReply = rawReply
            .replace(/^(?:Patient(?:\s*\(You\))?|Response|Answer)\s*:\s*/i, '')
            .replace(/^"|"$/g, '')
            .trim();

        if (
            didModelRoleFlipToDoctor(cleanReply) ||
            cleanReply.toLowerCase() === trimmedMsg.toLowerCase() ||
            cleanReply.toLowerCase() === lastAssistantMsg.toLowerCase()
        ) {
            if (isAskingGenderOrTrans) {
                cleanReply = `Doctor, as I mentioned, I'm a ${c.age}-year-old cisgender ${c.sex.toLowerCase()} (${c.fullName}). Is that relevant to the symptoms I'm having today?`;
            } else {
                const recoveryPrompt = `You are a patient with these symptoms: ${c.hidden}.
Your doctor asked: "${trimmedMsg}".
In 2 fresh everyday sentences starting with "I", answer their question directly and do NOT repeat "${lastAssistantMsg}".`;
                const retry = await callMedGemma(recoveryPrompt, 'Write your fresh patient answer starting with "I":', 12000, false, 0.75);
                cleanReply = retry.replace(/^Patient:\s*/i, '').replace(/^"|"$/g, '').trim();
            }
        }

        if (isGuidedQuestion) {
            session.guidedQuestionsClicked += 1;
            session.askedValidQA.push({ rawQuestion: trimmedMsg, answer: cleanReply });
        } else if (intentCategory === 'medical_question') {
            session.validSelfQuestions += 1;
            session.askedValidQA.push({ rawQuestion: trimmedMsg, answer: cleanReply });
        }

        session.history.push({ role: 'user', content: trimmedMsg });
        session.history.push({ role: 'assistant', content: cleanReply });

        return res.json({
            reply: cleanReply,
            inputType: intentCategory,
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

    const obsIsInvalid = observations.trim().length < 5 || looksLikeKeyboardSmash(observations) || isExplicitlyVulgar(observations);
    const diffIsInvalid = differentials.trim().length < 4 || looksLikeKeyboardSmash(differentials) || isExplicitlyVulgar(differentials);
    const diagIsInvalid = diagnosis.trim().length < 3 || looksLikeKeyboardSmash(diagnosis) || isExplicitlyVulgar(diagnosis);

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
- Guided Questions Clicked: ${session.guidedQuestionsClicked}
- Clinical Hints Used: ${session.hintsUsed}

STUDENT WRITTEN SUBMISSIONS:
- Structured Observations: "${observations}" ${obsIsInvalid ? '(WARNING: Empty or invalid -> score 0)' : ''}
- Differential Diagnoses: "${differentials}" ${diffIsInvalid ? '(WARNING: Empty or invalid -> score 0)' : ''}
- Final Diagnosis Submitted: "${diagnosis}" ${diagIsInvalid ? '(WARNING: Empty or invalid -> diagnosisCorrect MUST be false and finalConclusion score MUST be 0)' : ''}

GRADING RULES (STRICTLY INTEGERS FROM 0 TO 5 — NO NEGATIVE MARKS):
1. Every score inside "scores" MUST be a plain integer number from 0 to 5 (0, 1, 2, 3, 4, or 5).
2. If the student wrote 0 self-written questions and only used guided questions, "historyTaking" cannot exceed 2 and "independentApplication" MUST be 0 or 1.
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