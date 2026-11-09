# ClinPath Clinical Reasoning Practice Demo

A local clinical reasoning practice app using HTML, CSS, browser JavaScript, and Node.js. The server reads the selected case directly from one of the five specialty workbooks in this folder.

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

## Dataset-backed workflow

1. Start the app and choose a specialty and learner support level.
2. When the learner starts the consultation, the server reads only that specialty's `.xlsx` workbook and selects one case matching the chosen difficulty.
3. The server loads that single case into the session.
4. The selected case's name, age, symptom facts, negatives, vitals, answer key, and differentials are stored in the session. MedGemma writes a new patient opening and rewrites the expected-question topics in original wording.
5. MedGemma roleplays the patient using that case history when the learner asks questions.
6. At submission, MedGemma evaluates the learner's notes against the selected case's answer key and diagnosis.

The browser does not receive the full workbook. The server returns the selected case's display fields and its case ID, source title, and review status. Dataset files must remain in this folder with their current filenames. All five files currently label their cases as draft and requiring clinician review; the app displays this status in the interview.

## What the demo includes

- Five specialty workbooks: cardiology, neurology, psychiatry/psychology, pulmonology, and gastroenterology.
- Beginner, Intermediate, and Advanced modes with different in-session support.
- Dataset-backed patient simulations, with MedGemma responses when Ollama is running.
- An editable observation notebook and final diagnosis/reasoning submission.
- Post-case feedback across history, observations, reasoning, alternatives, diagnosis, communication, and independence.
- A local progress dashboard, assistance tracking, and optional next-step recommendations.
- Browser local storage for the learner's notes and demo progress.

## Important demo limits

The workbooks mark the cases as synthetic drafts requiring clinician review. MedGemma-generated patient dialogue and feedback can be inaccurate and should be reviewed by an educator before classroom use. This learning demo is not a real-world diagnostic or treatment tool.
