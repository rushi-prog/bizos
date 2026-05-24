from flask import Flask, request, jsonify
from flask_cors import CORS
from agents import ceo_agent, run_pipeline, marketing_agent
from gmail_sender import send_bulk_emails
from buyer_finder import find_real_buyers
import csv
import os
from datetime import datetime

app = Flask(__name__)
CORS(app)

# ── In-memory stores ──
activity_log = []
pipeline_stats = {"runs": 0, "total_buyers": 0, "total_emails_drafted": 0, "total_emails_sent": 0}

BUYERS_CSV = "buyers.csv"
CSV_FIELDS = ["contact_name", "contact_title", "company", "industry", "email", "phone", "location"]


def log_activity(agent, message, status="info"):
    activity_log.append({
        "timestamp": datetime.now().strftime("%H:%M:%S"),
        "agent": agent,
        "message": message,
        "status": status
    })
    if len(activity_log) > 200:
        activity_log.pop(0)


# ─────────────────────────────────────────────
# ROUTE 1: CEO Agent generates task queue
# ─────────────────────────────────────────────
@app.route("/generate-tasks", methods=["POST"])
def generate_tasks():
    data = request.get_json()
    product = data.get("product", "").strip()

    if not product:
        return jsonify({"error": "Product description is required."}), 400

    try:
        log_activity("CEO", f"Analyzing: {product[:60]}...", "working")
        tasks = ceo_agent(product)
        log_activity("CEO", f"Generated {len(tasks)} tasks", "success")
        return jsonify({
            "success": True,
            "product": product,
            "tasks": tasks,
            "total": len(tasks)
        })
    except Exception as e:
        log_activity("CEO", f"Error: {str(e)}", "error")
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────
# ROUTE 2: Run approved tasks (Sales + Marketing)
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
        log_activity("Sales", "Searching for buyers...", "working")
        log_activity("Marketing", "Preparing email drafts...", "working")

        result = run_pipeline(product, approved_tasks)
        email_results = []

        log_activity("Sales", f"Found {result['buyers_found']} buyers", "success")
        log_activity("Marketing", f"Drafted {result['emails_drafted']} emails", "success")

        pipeline_stats["runs"] += 1
        pipeline_stats["total_buyers"] += result["buyers_found"]
        pipeline_stats["total_emails_drafted"] += result["emails_drafted"]

        if should_send and result["emails"]:
            log_activity("Gmail", f"Sending {len(result['emails'])} emails...", "working")
            email_results = send_bulk_emails(result["emails"])
            sent_count = sum(1 for r in email_results if r["success"])
            pipeline_stats["total_emails_sent"] += sent_count
            log_activity("Gmail", f"{sent_count} sent, {len(email_results) - sent_count} failed",
                         "success" if sent_count > 0 else "error")

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
        log_activity("Pipeline", f"Error: {str(e)}", "error")
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────
# ROUTE 3: Send emails
# ─────────────────────────────────────────────
@app.route("/send-emails", methods=["POST"])
def send_emails_route():
    data = request.get_json()
    emails = data.get("emails", [])
    if not emails:
        return jsonify({"error": "No emails provided."}), 400
    try:
        log_activity("Gmail", f"Sending {len(emails)} emails...", "working")
        results = send_bulk_emails(emails)
        sent = sum(1 for r in results if r["success"])
        pipeline_stats["total_emails_sent"] += sent
        log_activity("Gmail", f"Sent {sent}/{len(emails)}", "success" if sent > 0 else "error")
        return jsonify({"success": True, "sent": sent, "failed": len(results) - sent, "results": results})
    except Exception as e:
        log_activity("Gmail", f"Error: {str(e)}", "error")
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────
# ROUTE 4: Get all buyers
# ─────────────────────────────────────────────
@app.route("/buyers", methods=["GET"])
def get_buyers():
    try:
        buyers = find_real_buyers("", limit=1000)
        return jsonify({"success": True, "buyers": buyers, "total": len(buyers)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────
# ROUTE 5: Add a buyer
# ─────────────────────────────────────────────
@app.route("/buyers/add", methods=["POST"])
def add_buyer():
    data = request.get_json()
    email = data.get("email", "").strip()
    if not email:
        return jsonify({"error": "Email is required."}), 400
    try:
        file_exists = os.path.exists(BUYERS_CSV) and os.path.getsize(BUYERS_CSV) > 0
        with open(BUYERS_CSV, "a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
            if not file_exists:
                writer.writeheader()
            writer.writerow({field: data.get(field, "").strip() for field in CSV_FIELDS})
        log_activity("System", f"Added buyer: {data.get('company', email)}", "success")
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────
# ROUTE 6: Delete a buyer
# ─────────────────────────────────────────────
@app.route("/buyers/delete", methods=["POST"])
def delete_buyer():
    data = request.get_json()
    email_to_delete = data.get("email", "").strip()
    if not email_to_delete:
        return jsonify({"error": "Email is required."}), 400
    try:
        rows = []
        fieldnames = CSV_FIELDS
        if os.path.exists(BUYERS_CSV):
            with open(BUYERS_CSV, newline="", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                fieldnames = reader.fieldnames or CSV_FIELDS
                for row in reader:
                    if row.get("email", "").strip().lower() != email_to_delete.lower():
                        rows.append(row)
        with open(BUYERS_CSV, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for row in rows:
                writer.writerow(row)
        log_activity("System", f"Removed buyer: {email_to_delete}", "success")
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────
# ROUTE 6b: Update a buyer
# ─────────────────────────────────────────────
@app.route("/buyers/update", methods=["POST"])
def update_buyer():
    data = request.get_json()
    old_email = data.get("old_email", "").strip()
    if not old_email:
        return jsonify({"error": "old_email is required."}), 400
    try:
        rows = []
        fieldnames = CSV_FIELDS
        if os.path.exists(BUYERS_CSV):
            with open(BUYERS_CSV, newline="", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                fieldnames = reader.fieldnames or CSV_FIELDS
                for row in reader:
                    if row.get("email", "").strip().lower() == old_email.lower():
                        # Replace with new data
                        for field in CSV_FIELDS:
                            if field in data:
                                row[field] = data[field].strip()
                    rows.append(row)
        with open(BUYERS_CSV, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for row in rows:
                writer.writerow(row)
        log_activity("System", f"Updated buyer: {data.get('company', old_email)}", "success")
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────
# ROUTE 7: Regenerate a single email
# ─────────────────────────────────────────────
@app.route("/regenerate-email", methods=["POST"])
def regenerate_email_route():
    data = request.get_json()
    product = data.get("product", "")
    buyer = data.get("buyer", {})
    task = data.get("task", "Draft a personalized cold email highlighting the product benefits")
    try:
        log_activity("Marketing", f"Regenerating email for {buyer.get('company', '?')}...", "working")
        email = marketing_agent(task, buyer, product)
        log_activity("Marketing", f"Regenerated email for {buyer.get('company', '?')}", "success")
        return jsonify({"success": True, "email": email})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────
# ROUTE 8: Activity log
# ─────────────────────────────────────────────
@app.route("/activity", methods=["GET"])
def get_activity():
    return jsonify({"success": True, "log": activity_log[-50:]})


# ─────────────────────────────────────────────
# ROUTE 9: Stats
# ─────────────────────────────────────────────
@app.route("/stats", methods=["GET"])
def get_stats():
    buyers = find_real_buyers("", limit=1000)
    return jsonify({
        "success": True,
        "buyers_in_db": len(buyers),
        **pipeline_stats
    })


# ─────────────────────────────────────────────
# ROUTE 10: Test Gmail connection
# ─────────────────────────────────────────────
@app.route("/test-gmail", methods=["GET"])
def test_gmail():
    try:
        from gmail_sender import get_gmail_service
        service = get_gmail_service()
        profile = service.users().getProfile(userId="me").execute()
        log_activity("Gmail", f"Connected as {profile.get('emailAddress')}", "success")
        return jsonify({
            "success": True,
            "email": profile.get("emailAddress"),
            "messages_total": profile.get("messagesTotal")
        })
    except Exception as e:
        log_activity("Gmail", f"Connection failed: {str(e)}", "error")
        return jsonify({"success": False, "error": str(e)})


# ─────────────────────────────────────────────
# ROUTE 11: Health check
# ─────────────────────────────────────────────
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "message": "BizOS backend is running."})


if __name__ == "__main__":
    print("=" * 50)
    print("  BizOS Backend starting on http://localhost:5000")
    print("=" * 50)
    app.run(debug=True, port=5000)