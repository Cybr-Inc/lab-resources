"""Read the lab's incidents through Cosmos REST using the current Azure CLI user.

No package installation is required. The access token stays in this process.
A permission error or timeout never counts as proof of a network restriction.
"""

import argparse
from datetime import datetime, timezone
import json
import re
import subprocess
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


def classify(status, body):
    if status == 200:
        return "allowed"
    try:
        payload = json.loads(body)
        message = payload.get("message", "") if isinstance(payload, dict) else ""
    except (ValueError, TypeError):
        message = ""
    if not isinstance(message, str):
        return "unexpected"
    message = message.lower()
    if status == 403 and (
        "public network access is disabled" in message
        or ("blocked" in message and "firewall" in message)
    ):
        return "blocked"
    return "unexpected"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--account", required=True)
    parser.add_argument("--expect", required=True, choices=["allowed", "blocked"])
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z0-9-]{3,44}", args.account):
        parser.error("Use the lab Cosmos account name, not a URL.")

    token_result = subprocess.run(
        ["az", "account", "get-access-token", "--resource", "https://cosmos.azure.com",
         "--query", "accessToken", "--output", "tsv"],
        check=True, capture_output=True, text=True, timeout=60,
    )
    token = token_result.stdout.strip()
    if not token:
        raise RuntimeError("Azure CLI returned no access token.")
    authorization = quote("type=aad&ver=1.0&sig=" + token, safe="")
    url = f"https://{args.account}.documents.azure.com/dbs/cloudops/colls/incidents/docs"
    request = Request(url, headers={
        "Authorization": authorization,
        "x-ms-date": datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT"),
        "x-ms-version": "2018-12-31",
        "x-ms-max-item-count": "1",
    })
    try:
        with urlopen(request, timeout=30) as response:
            status, body = response.status, response.read().decode("utf-8")
    except HTTPError as error:
        status, body = error.code, error.read().decode("utf-8", errors="replace")

    result = classify(status, body)
    print(f"HTTP {status}")
    if result == "allowed":
        print("Public data read succeeded with your learner identity.")
    elif result == "blocked":
        print("Cosmos DB rejected this request because of its network restriction.")
    else:
        # Report the category without logging response bodies or credentials.
        print("This response does not prove a network restriction.")
        print("Verify the baseline read, role propagation, and the Cosmos network configuration.")
    if result != args.expect:
        print(f"Expected: {args.expect}. Observed: {result}.")
        return 1
    print("Expected result observed.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (subprocess.SubprocessError, OSError, URLError, RuntimeError):
        print("The probe could not finish. Verify Azure CLI sign-in and connectivity.", file=sys.stderr)
        sys.exit(1)
