# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
BizOS is an AI Sales Command Center that uses multiple AI agents (CEO, Sales, Marketing) to generate sales tasks, find buyers, and draft personalized cold emails. The backend is a Flask API (`app.py`) and the frontend is a single-page application (`index.html`, `styles.css`, `app.js`).

## Development Commands

### Setup
1. Create a virtual environment (if not already present):
   ```bash
   python -m venv .venv
   ```
2. Activate the virtual environment:
   - Windows: `.venv\Scripts\activate`
   - macOS/Linux: `source .venv/bin/activate`
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

### Running the Backend
Start the Flask development server:
```bash
python app.py
```
The server runs on `http://localhost:5000` by default.

### Running the Frontend
The frontend is served statically by the Flask app. No separate frontend build step is required. Access the UI at `http://localhost:5000` when the backend is running.

### Testing
Simple test scripts are available:
- `test.py`: Tests the `/generate-tasks` endpoint.
- Manual testing: Use the provided `index.html` interface or tools like `curl`/Postman.

Example test call:
```bash
curl -X POST http://localhost:5000/generate-tasks -H "Content-Type: application/json" -d '{"product": "500 units of industrial steel valves"}'
```

### Linting/Formatting
No specific linting/formatting tools are configured in this repository. You may add tools like `flake8`, `black`, or `eslint` as needed.

## Code Architecture & Structure

### Backend (`app.py`)
- **Framework**: Flask with CORS enabled.
- **Routes**:
  - `/generate-tasks` (POST): Uses `ceo_agent` to break down a product description into sales tasks.
  - `/run-pipeline` (POST): Executes approved tasks (finds buyers via `find_real_buyers`, drafts emails via `marketing_agent`), optionally sends emails via Gmail.
  - `/send-emails` (POST): Sends a list of pre-drafted emails via Gmail.
  - `/buyers` (GET): Returns all buyers from the CSV database.
  - `/buyers/add` (POST): Adds a new buyer to `buyers.csv`.
  - `/buyers/delete` (POST): Deletes a buyer by email.
  - `/buyers/update` (POST): Updates a buyer's information.
  - `/regenerate-email` (POST): Regenerates an email for a specific buyer and task.
  - `/activity` (GET): Returns recent activity logs (in-memory).
  - `/stats` (GET): Returns pipeline statistics and buyer count.
  - `/test-gmail` (GET): Tests Gmail API connection.
  - `/health` (GET): Simple health check.
- **In-Memory Stores**:
  - `activity_log`: Recent agent actions (limited to 200 entries).
  - `pipeline_stats`: Counters for pipeline runs, buyers found, emails drafted/sent.
- **Dependencies**:
  - `agents.py`: Contains `ceo_agent`, `marketing_agent`, and `run_pipeline` functions.
  - `buyer_finder.py`: Contains `find_real_buyers` function (searches buyers.csv).
  - `gmail_sender.py`: Contains Gmail API functions (`send_bulk_emails`, `get_gmail_service`).
  - `credentials.json` and `token.json`: Store Gmail OAuth credentials (not committed; see `.gitignore`).

### Frontend
- **`index.html`**: Single-page application with sidebar navigation and multiple views (Dashboard, Buyers, Emails, Activity, Settings).
- **`styles.css`**: Styling for the UI.
- **`app.js`**: Client-side logic:
  - Communicates with the Flask backend via fetch/AJAX.
  - Updates UI based on API responses.
  - Handles user interactions (form submissions, button clicks, etc.).
  - Manages modals, toasts, and state.

### Data Flow
1. User enters a product brief on the Dashboard and clicks "Generate Tasks".
2. Frontend POSTs to `/generate-tasks`; backend uses `ceo_agent` to create a task list.
3. User reviews and approves tasks (via UI), then clicks to run the pipeline.
4. Frontend POSTs to `/run-pipeline` with approved tasks and product.
5. Backend:
   - Uses `find_real_buyers` to search `buyers.csv` for relevant contacts.
   - Uses `marketing_agent` to draft personalized emails for each buyer/task.
   - Optionally sends emails via Gmail if `send_emails` flag is true.
6. Results (buyers, emails, sending status) are returned to frontend and displayed in the Emails and Activity views.
7. Buyer management (add/update/delete) persists to `buyers.csv`.

### Key Notes
- The application is designed for local development and testing. For production deployment (e.g., to AWS), consider:
  - Using a production WSGI server (e.g., Gunicorn) instead of Flask's development server.
  - Securing sensitive credentials (Gmail OAuth) using AWS Secrets Manager or environment variables.
  - Deploying the Flask app to a service like AWS Elastic Beanstalk, EC2, or Lambda (with API Gateway).
  - Serving static assets (HTML, CSS, JS) via Amazon S3 and CloudFront or through the Flask app.
- The CSV-based buyer database (`buyers.csv`) is simple but not scalable; consider migrating to a database (e.g., PostgreSQL on AWS RDS) for production.
- Gmail integration requires OAuth 2.0 credentials; ensure `credentials.json` is present and `token.json` is generated via the OAuth flow.
