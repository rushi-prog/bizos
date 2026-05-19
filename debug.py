import json
from agents import ceo_agent, marketing_agent, run_pipeline
from buyer_finder import find_real_buyers

product = "ER collet for CNC machining"

print("=" * 50)
print("STEP 1: Loading buyers from CSV")
print("=" * 50)
buyers = find_real_buyers(product)
print(f"Buyers loaded: {len(buyers)}")
for b in buyers:
    print(f"  - {b['company']} | email: '{b['email']}'")

print("\n" + "=" * 50)
print("STEP 2: Testing marketing agent on first buyer")
print("=" * 50)
if buyers:
    b = buyers[0]
    task = "Draft a cold email for ER collet buyers targeting CNC machine operators"
    email = marketing_agent(task, b, product)
    print(f"Email to   : {email.get('to')}")
    print(f"Subject    : {email.get('subject')}")
    print(f"Body preview: {str(email.get('body',''))[:100]}")
else:
    print("No buyers found — check your buyers.csv file")

print("\n" + "=" * 50)
print("STEP 3: Full pipeline test")
print("=" * 50)
tasks = [
    {"agent": "Sales", "task": "Find buyers for ER collets", "priority": "High"},
    {"agent": "Marketing", "task": "Draft cold email for ER collet buyers", "priority": "High"},
]
result = run_pipeline(product, tasks)
print(f"Buyers found  : {result['buyers_found']}")
print(f"Emails drafted: {result['emails_drafted']}")
if result['emails']:
    e = result['emails'][0]
    print(f"\nSample email:")
    print(f"To     : {e.get('to')}")
    print(f"Subject: {e.get('subject')}")