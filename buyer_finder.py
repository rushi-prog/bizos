import csv
import os

BUYERS_CSV = "buyers.csv"


def find_real_buyers(product_keyword: str, limit: int = 50) -> list:
    """
    Reads buyers from buyers.csv and returns them as a list.
    CSV must have columns: contact_name, contact_title, company, industry, email
    """
    buyers = []

    if not os.path.exists(BUYERS_CSV):
        print(f"[BuyerFinder] No buyers.csv found in bizos folder!")
        print(f"[BuyerFinder] Create buyers.csv with columns: contact_name, contact_title, company, industry, email")
        return []

    print(f"\n[BuyerFinder] Reading buyers from {BUYERS_CSV}...")

    with open(BUYERS_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            email = row.get("email", "").strip()
            if not email:
                continue

            buyers.append({
                "source": "CSV",
                "contact_name": row.get("contact_name", "").strip(),
                "contact_title": row.get("contact_title", "Buyer").strip(),
                "company": row.get("company", "").strip(),
                "industry": row.get("industry", "").strip(),
                "email": email,
                "phone": row.get("phone", "").strip(),
                "location": row.get("location", "").strip(),
                "note": f"Imported from CSV — {row.get('company', '')}",
            })

            if len(buyers) >= limit:
                break

    print(f"[BuyerFinder] Loaded {len(buyers)} buyers from CSV")
    return buyers


# ─────────────────────────────────────────────
# TEST
# ─────────────────────────────────────────────
if __name__ == "__main__":
    buyers = find_real_buyers("industrial steel valves")

    print(f"\n{'='*50}")
    print("BUYERS LOADED:")
    print(f"{'='*50}")

    if not buyers:
        print("No buyers found — check your buyers.csv file")
    else:
        for i, b in enumerate(buyers, 1):
            print(f"\n{i}. {b['company']}")
            print(f"   Contact : {b['contact_name']} — {b['contact_title']}")
            print(f"   Email   : {b['email']}")
            print(f"   Industry: {b['industry']}")