from flask import Flask, request, jsonify
from flask_cors import CORS
from agents import ceo_agent, run_pipeline
from gmail_sender import send_bulk_emails

app = Flask(__name__)
CORS(app)  # Allows your frontend dashboard to talk to this backend

# ─────────────────────────────────────────────
# ROUTE 1: CEO Agent generates task queue
# POST /generate-tasks
# Body: { "product": "500 units of steel valves..." }
# ─────────────────────────────────────────────
@app.route("/generate-tasks", methods=["POST"])
def generate_tasks():
    data = request.get_json()
    product = data.get("product", "").strip()

    if not product:
        return jsonify({"error": "Product description is required."}), 400

    try:
        tasks = ceo_agent(product)
        return jsonify({
            "success": True,
            "product": product,
            "tasks": tasks,
            "total": len(tasks)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────
# ROUTE 2: Run approved tasks (Sales + Marketing)
# POST /run-pipeline
# Body: { "product": "...", "approved_tasks": [...] }
# ─────────────────────────────────────────────
@app.route("/run-pipeline", methods=["POST"])
def run_pipeline_route():
    data = request.get_json()
    product = data.get("product", "").strip()
    approved_tasks = data.get("approved_tasks", [])
    should_send = data.get("send_emails", False)

    if not product:
        return jsonify({"error": "Product description is required."}), 400
    if not approved_tasks:
        return jsonify({"error": "No approved tasks provided."}), 400

    try:
        result = run_pipeline(product, approved_tasks)
        email_results = []

        if should_send and result["emails"]:
            print(f"\n[App] Sending {len(result['emails'])} emails via Gmail...")
            email_results = send_bulk_emails(result["emails"])
            sent_count = sum(1 for r in email_results if r["success"])
            print(f"[App] {sent_count} sent, {len(email_results) - sent_count} failed")

        return jsonify({
            "success": True,
            "buyers_found": result["buyers_found"],
            "buyers": result["buyers"],
            "emails_drafted": result["emails_drafted"],
            "emails": result["emails"],
            "emails_sent": len([r for r in email_results if r["success"]]),
            "email_results": email_results
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/send-emails", methods=["POST"])
def send_emails_route():
    data = request.get_json()
    emails = data.get("emails", [])
    if not emails:
        return jsonify({"error": "No emails provided."}), 400
    try:
        results = send_bulk_emails(emails)
        sent = sum(1 for r in results if r["success"])
        return jsonify({"success": True, "sent": sent, "failed": len(results) - sent, "results": results})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────
# ROUTE 3: Health check — confirm server is alive
# GET /health
# ─────────────────────────────────────────────
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "message": "BizOS backend is running."})


if __name__ == "__main__":
    print("=" * 50)
    print("  BizOS Backend starting on http://localhost:5000")
    print("=" * 50)
    app.run(debug=True, port=5000)