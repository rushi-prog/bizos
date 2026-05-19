import os
import re
import json
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
MODEL = "llama-3.3-70b-versatile"


def call_agent(system_prompt: str, user_message: str) -> str:
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        temperature=0.7,
        max_tokens=1500,
    )
    return response.choices[0].message.content


def clean_json(raw: str) -> str:
    """Cleans raw LLM output before JSON parsing."""
    raw = raw.strip()
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1] if len(parts) > 1 else raw
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()
    # Remove control characters that break JSON (keep \n \t \r)
    raw = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', raw)
    return raw.strip()


# ─────────────────────────────────────────────
# CEO AGENT
# ─────────────────────────────────────────────
CEO_PROMPT = """
You are the CEO Agent of a B2B sales automation company.
Your job is to analyze a product the user wants to sell and create a structured task queue.

When given a product description, respond with ONLY a JSON array of tasks. No extra text.
Each task must have:
- "priority": "High", "Med", or "Info"
- "agent": "Sales" or "Marketing"
- "task": a clear, specific instruction

Example output:
[
  {"priority": "High", "agent": "Sales", "task": "Find 10 SME companies in manufacturing that buy industrial valves"},
  {"priority": "High", "agent": "Marketing", "task": "Draft a cold email for industrial valve suppliers targeting procurement heads"},
  {"priority": "Med", "agent": "Sales", "task": "Find 5 MNC companies in infrastructure sector needing valve supplies"},
  {"priority": "Info", "agent": "Marketing", "task": "Write a follow-up email sequence of 2 emails for non-responders"}
]
"""

def ceo_agent(product: str) -> list:
    print(f"\n[CEO Agent] Analyzing product: {product}")
    raw = call_agent(CEO_PROMPT, f"Product to sell: {product}")
    tasks = json.loads(clean_json(raw))
    print(f"[CEO Agent] Generated {len(tasks)} tasks.")
    return tasks


# ─────────────────────────────────────────────
# SALES AGENT
# ─────────────────────────────────────────────
SALES_PROMPT = """
You are the Sales Agent of a B2B cold outreach system.
Your job is to find realistic potential buyer companies for a given product.

When given a sales task, respond with ONLY a JSON array of buyer companies. No extra text.
Each buyer must have:
- "company": company name
- "industry": their industry
- "contact_name": a realistic decision-maker name
- "contact_title": their job title (e.g. Procurement Manager, VP Supply Chain)
- "email": a realistic business email

Find a mix of SMEs and MNCs. Make them realistic for the product described.
"""

def sales_agent(task: str) -> list:
    print(f"\n[Sales Agent] Task: {task}")
    raw = call_agent(SALES_PROMPT, task)
    buyers = json.loads(clean_json(raw))
    print(f"[Sales Agent] Found {len(buyers)} buyers.")
    return buyers


# ─────────────────────────────────────────────
# MARKETING AGENT
# ─────────────────────────────────────────────
MARKETING_PROMPT = """
You are the Marketing Agent of a B2B cold outreach system.
Your job is to write highly personalized cold emails to potential buyers.

IMPORTANT: Respond with ONLY a valid JSON object. No extra text, no markdown.
The JSON must have exactly two keys:
- "subject": a short email subject line (single line, no newlines)
- "body": the full email body (plain text, under 200 words, use \\n for line breaks)

Rules for great cold emails:
- Address the buyer by first name
- Mention their company and industry specifically
- Focus on their pain point, not just your product
- End with a clear call to action (e.g. "Would a 15-min call work this week?")
- Do NOT use buzzwords like "synergy", "leverage", "cutting-edge"
- Sign off as: Your Name | BizOS Sourcing
"""

def marketing_agent(task: str, buyer: dict, product: str) -> dict:
    message = (
        f"Task: {task}\n"
        f"Product: {product}\n"
        f"Buyer Company: {buyer.get('company')}\n"
        f"Industry: {buyer.get('industry')}\n"
        f"Contact Name: {buyer.get('contact_name')}\n"
        f"Contact Title: {buyer.get('contact_title')}\n"
    )

    raw = call_agent(MARKETING_PROMPT, message)

    try:
        email = json.loads(clean_json(raw))
    except Exception:
        # Fallback — extract manually using regex
        subject_match = re.search(r'"subject"\s*:\s*"([^"]+)"', raw)
        body_match = re.search(r'"body"\s*:\s*"([\s\S]+?)"(?:\s*[,}])', raw)
        email = {
            "subject": subject_match.group(1) if subject_match else "Partnership Opportunity",
            "body": body_match.group(1).replace('\\n', '\n') if body_match else raw[:500]
        }

    email["to"] = buyer.get("email")
    email["buyer"] = buyer.get("company")
    print(f"[Marketing Agent] Email drafted for {buyer.get('company')}")
    return email


# ─────────────────────────────────────────────
# ORCHESTRATOR
# ─────────────────────────────────────────────
def run_pipeline(product: str, approved_tasks: list) -> dict:
    from buyer_finder import find_real_buyers

    all_buyers = []
    all_emails = []

    sales_tasks = [t for t in approved_tasks if t["agent"] == "Sales"]
    marketing_tasks = [t for t in approved_tasks if t["agent"] == "Marketing"]

    if sales_tasks:
        print(f"\n[Pipeline] Finding buyers from CSV...")
        all_buyers = find_real_buyers(product, limit=50)

        if not all_buyers:
            print("[Pipeline] No CSV buyers — using AI-generated buyers as fallback")
            for task_obj in sales_tasks:
                buyers = sales_agent(task_obj["task"])
                all_buyers.extend(buyers)

    if marketing_tasks and all_buyers:
        email_task = marketing_tasks[0]["task"]
        for buyer in all_buyers:
            if not buyer.get("email"):
                continue
            email = marketing_agent(email_task, buyer, product)
            all_emails.append(email)

    return {
        "buyers_found": len(all_buyers),
        "buyers": all_buyers,
        "emails_drafted": len(all_emails),
        "emails": all_emails,
    }


# ─────────────────────────────────────────────
# TEST
# ─────────────────────────────────────────────
if __name__ == "__main__":
    product = "500 units of industrial steel valves, Grade A, delivery in 30 days"

    print("=" * 50)
    print("STEP 1: CEO Agent generating task queue...")
    print("=" * 50)
    tasks = ceo_agent(product)
    print(json.dumps(tasks, indent=2))

    print("\n" + "=" * 50)
    print("STEP 3: Running pipeline...")
    print("=" * 50)
    result = run_pipeline(product, tasks)

    print("\n" + "=" * 50)
    print(f"DONE: {result['buyers_found']} buyers, {result['emails_drafted']} emails drafted")
    print("=" * 50)
    if result["emails"]:
        e = result["emails"][0]
        print(f"\nSample email:")
        print(f"To: {e['to']}")
        print(f"Subject: {e['subject']}")
        print(f"\n{e['body']}")