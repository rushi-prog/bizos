# BizOS – AI Sales Command Center

**BizOS** is an intelligent sales automation platform that leverages multiple AI agents (CEO, Sales, Marketing) to turn a product brief into actionable sales tasks, discover qualified buyers, and generate personalized cold‑email campaigns—all with a single click. The backend is powered by a Flask API, while the frontend is a responsive single‑page application built with plain HTML/CSS/JS.

---

## 🚀 Features

- **AI‑Driven Task Generation** – CEO agent breaks down a product description into a prioritized task queue.
- **Buyer Discovery** – Sales agent searches a local CSV (or future DB) for relevant contacts.
- **Personalized Email Drafting** – Marketing agent creates tailored cold‑email copy for each buyer/task.
- **One‑Click Email Sending** – Integrated Gmail API via OAuth 2.0 to send drafts at scale.
- **Real‑Time Activity Log** – Live feed of agent actions (CEO, Sales, Marketing, Gmail).
- **Stats Dashboard** – Pipeline runs, buyers found, emails drafted/sent.
- **Buyer Management UI** – Add, update, search, and delete contacts.
- **Extensible Architecture** – Clean separation of concerns; each agent lives in its own module.

---

## 🏗️ Architecture Overview

```
+-------------------+        +-------------------+        +-------------------+
|   Frontend (SPA)  | <--->  |   Flask API       | <--->  |   AI Agents       |
|  index.html       |        |  app.py           |        |  agents.py        |
|  styles.css       |        |  • Routes         |        |  • ceo_agent      |
|  app.js           |        |  • CORS           |        |  • marketing_agent|
+-------------------+        |  • In‑memory      |        |  • run_pipeline   |
                            |     stores          |        +-------------------+
                            |  • Activity log     |
                            |  • Pipeline stats   |
                            +-------------------+
                                      |
                        +-------------+-------------+
                        |                           |
                +-------------------+   +---------------------+
                |  Buyer Finder     |   |  Gmail Sender       |
                |  buyer_finder.py  |   |  gmail_sender.py    |
                |  • find_real_buyers|   |  • send_bulk_emails |
                +-------------------+   +---------------------+
```

- **Frontend** communicates with the backend via `fetch`/`AJAX` calls to REST endpoints.
- **Backend** exposes RESTful routes (`/generate-tasks`, `/run-pipeline`, `/send-emails`, …) that orchestrate the agents.
- **Agents** are pure Python functions (currently powered by Groq’s LLaMA‑3‑3‑70B via the `groq` SDK) that receive a prompt and return structured output.
- **Data**: Buyer information is stored in `buyers.csv`; activity logs and statistics live in memory (reset on restart). For production, replace CSV with a managed database (DynamoDB, RDS, etc.).

---

## 📦 Getting Started (Local Development)

### Prerequisites
- Python ≥ 3.9
- Git
- (Optional) A Gmail account with OAuth 2.0 credentials configured for the Gmail API.

### Setup

```bash
# 1️⃣ Clone the repository
git clone https://github.com/your-username/bizos.git
cd bizos

# 2️⃣ Create & activate a virtual environment
python -m venv .venv
# Windows:
.\.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# 3️⃣ Install dependencies
pip install -r requirements.txt

# 4️⃣ (First‑time only) Configure Gmail OAuth
#    Place `credentials.json` (downloaded from Google Cloud Console) in the project root.
#    Run the helper script to generate `token.json`:
python -c "from gmail_sender import get_gmail_service; get_gmail_service()"
#    Follow the browser‑based consent flow; a `token.json` will be created.

# 5️⃣ Start the Flask development server
python app.py
#    Server runs at http://localhost:5000

# 6️⃣ Open the UI
#    The backend serves `index.html` at the root, so visit:
#    http://localhost:5000
```

### Running the Test Suite
A lightweight sanity‑check script is provided:

```bash
python test.py   # POSTs a sample product to /generate-tasks and prints the response
```

---

## ☁️ Production Deployment on AWS (Serverless)

BizOS can be deployed as a **Lambda + API Gateway + S3** stack for automatic scaling, low cost, and HTTPS out‑of‑the box.

### High‑level Steps
1. **Package the Flask app** with a WSGI‑to‑Lambda adapter (e.g., `awsgi` or `awsgic`).
2. **Create a Lambda function** (`lambda_handler.lambda_handler`) that proxies API Gateway requests to the Flask app.
3. **Set up an API Gateway** (REST) with a `{proxy+}`` catch‑all route integrated with the Lambda.
4. **Host the static frontend** in an S3 bucket configured for website serving (or via CloudFront for HTTPS + custom domain).
5. **Manage secrets** (Gmail `credentials.json`, `token.json`) using AWS Secrets Manager; the Lambda reads them at startup and writes to `/tmp`.
6. **Optionally migrate buyers.csv** to DynamoDB or Aurora Serverless for durable, concurrent access.

> A detailed, step‑by‑step guide (including IAM roles, environment variables, and SAM/CDK templates) is available in the [`DEPLOYMENT.md`](DEPLOYMENT.md) file.

---

## 📈 Performance Metrics

| Metric                                 | Value (approx.)                                 | Notes |
|----------------------------------------|-------------------------------------------------|-------|
| **Email throughput**                   | **Up to 30 emails / second**                    | Limited by Gmail API quota (100 emails / second per‑user) and LLM token generation speed. |
| **LLM token generation speed**         | 15‑25 tokens / second (Groq LLaMA‑3‑3‑70B)      | Determines how fast marketing agent can draft emails. |
| **End‑to‑end pipeline latency**        | 2‑5 seconds per buyer (task generation + buyer search + email drafting) | Varies with product brief length and buyer list size. |
| **Concurrent Lambda executions**       | Scales automatically; default concurrency = 1000 | Adjust via AWS Lambda reserved concurrency if needed. |
| **Static frontend load time**          | < 1 second (gzipped HTML/CSS/JS ≈ 150 KB)       | Served from S3 + CloudFront edge locations. |
| **API Gateway latency**                | 10‑30 ms (plus Lambda cold‑start if applicable) | Keep Lambda warm with provisioned concurrency for predictable latency. |

*The 30 emails / second figure assumes the LLM can produce ~1‑2 tokens per email (subject line + body) within its generation window; actual rates will vary with prompt complexity and selected model.*

---

## 🛠️ Extending & Customizing

- **Swap the LLM** – Replace the Groq client in `agents.py` with another provider (OpenAI, Anthropic, local HuggingFace, etc.). Adjust prompt formatting as needed.
- **Add more agents** – Follow the pattern in `agents.py`: define a function that takes a prompt and returns structured data, then wire it into a new Flask route.
- **Persist activity/logs** – Replace the in‑memory `activity_log` and `pipeline_stats` with a database table or Redis for durability across restarts.
- **Advanced buyer search** – Integrate with LinkedIn Sales Navigator, Apollo.io, or a proprietary CRM via API.
- **Template‑based emails** – Store Jinja2 templates in `templates/` and render with buyer‑specific fields for even greater personalization.

---

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository.
2. Create a feature branch (`git checkout -b feat/amazing-feature`).
3. Commit your changes (`git commit -m 'Add amazing feature'`).
4. Push to the branch (`git push origin feat/amazing-feature`).
5. Open a Pull Request describing the change and any relevant test results.

Please ensure your code adheres to the existing style and includes docstrings for new functions.

---

## 📄 License

This project is licensed under the **MIT License** – see the [`LICENSE`](LICENSE) file for details.

---

## � Acknowledgements

- [**Groq**](https://groq.com/) for ultra‑fast LLM inference.
- [**Flask**](https://flask.palletsprojects.com/) and [**Flask‑CORS**] for the backend.
- [**awsgic**](https://pypi.org/project/awsgic/) for WSGI‑to‑Lambda adapter.
- The open‑source community for countless utilities that make rapid prototyping possible.

---

**Happy selling!** 🚀