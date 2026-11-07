# Clinical Reasoning Practice Demo

A small, local demo of the project idea. It uses plain HTML, CSS, browser JavaScript, and Node.js. It has no package dependencies.

## Start the demo

1. Install Node.js 20 or newer if it is not already installed.
2. Open PowerShell in this `demo` folder.
3. Run `node server.js`.
4. Open `http://localhost:3000` in your browser.

Without an API key, the demo uses a small scripted patient and a rule-based educational review. This lets you explore the screens without paying for an AI API.

## Turn on AI replies (optional)

Keep the API key on the server. In PowerShell, set it for the current terminal and start the app:

```powershell
$env:OPENAI_API_KEY = "your-api-key"
node server.js
```

You can change the default model by setting `OPENAI_MODEL` to a model enabled for your API account. The server calls the OpenAI Responses API. Never put the API key in `app.js` or browser code.

## What the demo includes

- Two fictional cases: a medical history and a psychological history.
- Beginner, Intermediate, and Advanced modes with different in-session support.
- One shared patient simulation for all modes.
- An editable observation notebook and final diagnosis/reasoning submission.
- Post-case feedback across history, observations, reasoning, alternatives, diagnosis, communication, and independence.
- A local progress dashboard, assistance tracking, and optional next-step recommendations.
- Browser local storage for the learner's notes and demo progress.

## Important demo limits

The scripted mode is only a prototype, and the automatic feedback is a simple heuristic. AI feedback should be reviewed with an educator before classroom use. Use only fictional cases. This learning demo is not a real-world diagnostic or treatment tool.
