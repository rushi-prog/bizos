import os
import base64
import json
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# Gmail API scope — only sending permission
SCOPES = ["https://www.googleapis.com/auth/gmail.send"]

CREDENTIALS_FILE = "credentials.json"
TOKEN_FILE = "token.json"


def get_gmail_service():
    """
    Authenticates with Gmail via OAuth.
    First run: opens browser for you to log in.
    After that: uses saved token.json automatically.
    """
    creds = None

    # Load saved token if it exists
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)

    # If no valid token, do the OAuth login flow
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
            creds = flow.run_local_server(port=0)

        # Save token for next time
        with open(TOKEN_FILE, "w") as f:
            f.write(creds.to_json())

    service = build("gmail", "v1", credentials=creds)
    return service


def send_email(to: str, subject: str, body: str) -> dict:
    """
    Sends an email from your Gmail account.
    Returns success/failure status.
    """
    try:
        service = get_gmail_service()

        # Build the email
        message = MIMEMultipart()
        message["To"] = to
        message["Subject"] = subject
        message.attach(MIMEText(body, "plain"))

        # Encode and send
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
        result = service.users().messages().send(
            userId="me",
            body={"raw": raw}
        ).execute()

        print(f"[Gmail] Sent to {to} — Message ID: {result['id']}")
        return {"success": True, "message_id": result["id"], "to": to}

    except Exception as e:
        print(f"[Gmail] Failed to send to {to} — Error: {e}")
        return {"success": False, "error": str(e), "to": to}


def send_bulk_emails(emails: list) -> list:
    """
    Sends all drafted emails from the pipeline.
    emails = list of dicts with: to, subject, body
    Returns list of results.
    """
    results = []
    total = len(emails)

    print(f"\n[Gmail] Sending {total} emails...")

    for i, email in enumerate(emails, 1):
        print(f"[Gmail] Sending {i}/{total} → {email.get('to')}")
        result = send_email(
            to=email.get("to", ""),
            subject=email.get("subject", "Hello"),
            body=email.get("body", "")
        )
        results.append(result)

    sent = sum(1 for r in results if r["success"])
    failed = total - sent
    print(f"\n[Gmail] Done — {sent} sent, {failed} failed")
    return results


# ─────────────────────────────────────────────
# TEST — run this file directly to test Gmail
# ─────────────────────────────────────────────
if __name__ == "__main__":
    print("Testing Gmail connection...")
    print("A browser window will open — log in with your Gmail account.")
    print()

    result = send_email(
        to="opqp3883@gmail.com",  # sends a test email to yourself
        subject="BizOS Gmail Test",
        body="Hey! Your Gmail integration is working perfectly.\n\nBizOS is now ready to send cold emails automatically.\n\n— BizOS AI System"
    )

    if result["success"]:
        print("\n✅ Gmail is working! Check your inbox.")
    else:
        print("\n❌ Something went wrong:", result["error"])