import requests

print("Testing generate-tasks...")
r = requests.post(
    "http://localhost:5000/generate-tasks",
    json={"product": "500 units of industrial steel valves"}
)
print(r.json())