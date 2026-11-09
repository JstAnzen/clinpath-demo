# ClinPath Clinical Reasoning Practice Demo

A local, fictional clinical history-taking tutor using HTML, CSS, browser JavaScript, Node.js, and local Ollama/MedGemma. The agent workflow supports Cardiology, Neurology, Psychiatry & Psychology, Pulmonology, and Gastroenterology & Surgery.

## Start the demo

1. Install Node.js 20 or newer if it is not already installed.
2. Open PowerShell in this `demo` folder.
3. Run `node server.js`.
4. Open the URL printed in the terminal (normally `http://localhost:3000`). If that port is already occupied, the server tries the next available port and prints its URL.

Ollama must be running with a compatible local model for the patient interview and consultation review.

## Connect MedGemma for patient dialogue and feedback

Start Ollama and make sure a MedGemma model is installed. The app checks Ollama at `http://localhost:11434` and uses `medgemma:latest` by default. You can choose another local Ollama model with `OLLAMA_MODEL`:

```powershell
$env:OLLAMA_MODEL = "medgemma:latest"
node server.js
```

The dataset case is selected locally by the Node server. MedGemma is used for simulated patient replies and the case review.

## Educator-approved case gate

The server only makes a case available when its row has `Review Status` exactly `Approved`, a non-empty `Reviewer` and `Reviewer Qualification`, and all required profile, history, answer-key, alternative, source, and source-date fields. A qualified educator must perform the review and enter the approval. The app does not mark cases approved on its own. Availability is shown separately for each specialty and difficulty.

The supplied workbooks currently mark their cases as drafts requiring clinician review. Until an educator reviews and approves cases, the app will show zero available cases for that specialty and keep its session start disabled. This is intentional; it does not treat draft cases as reviewed.

## Agent workflow

1. The learner chooses a specialty and support level. The server checks and reads only that specialty's workbook, then selects one approved case at that level.
2. MedGemma creates original patient-facing opening and guided-question wording from case facts, without receiving the answer key.
3. After each learner message, a bounded planner chooses one allowed action. The server validates the action and any fact keys, then runs an allowlisted tool such as revealing up to two relevant patient facts, presenting an explicitly requested hint, asking for clarification, prompting a summary, or requesting a provisional assessment.
4. Patient replies receive only the selected case's patient-facing facts that have been revealed so far. The answer key is held for the evaluation request after submission.
5. The session tracks questions, revealed fact fields, hints, notes, and assessment. It allows at most 30 learner turns, 30 minutes, and three agent steps per turn.
6. After submission, feedback covers seven separate areas with a 0–4 rubric and a `Not enough evidence` option. Examples must be verifiable against the learner's transcript or notes. Hint use alone is not penalized.

The browser never receives the full workbook or answer key before evaluation. The interview shows the selected case ID, source title, and review status. The feedback shows the source title, source date, reviewer, and source link.

## What the demo includes

- Five source workbooks are connected: Cardiology, Neurology, Psychiatry & Psychology, Pulmonology, and Gastroenterology & Surgery. The server loads only the selected specialty's workbook for a session.
- Beginner, Intermediate, and Advanced modes with different in-session support.
- Agent-directed, dataset-grounded patient simulation using local MedGemma.
- An editable observation notebook and final diagnosis/reasoning submission.
- Post-case feedback across history, observations, reasoning, alternatives, diagnosis, communication, and independence.
- A local progress dashboard, assistance tracking, and optional next-step recommendations.
- Browser local storage for the learner's notes and demo progress.

## Important demo limits

This is an educational simulator for fictional cases, not a tool for diagnosing or treating real people. MedGemma can still produce inaccurate dialogue or feedback; educator review is required before cases are used for teaching. Do not enter real patient information. If a message describes a real urgent situation, the tutor directs the learner to professional or emergency care.
