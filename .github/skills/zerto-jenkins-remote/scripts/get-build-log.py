# JENKINS GET CONSOLE TOOL
# Downloads and prints the console output of a Jenkins build.
# Expects JENKINS_TOKEN and JENKINS_USER to be set in the environment.
#
# USAGE:
#   uv run scripts/get-build-log.py "ZVML/zvml-build-release/10.10" 794
#   uv run scripts/get-build-log.py "ZVML/zvml-build-release/10.10" lastBuild --tail 200
#   uv run scripts/get-build-log.py "ZVML/zvml-build-release/10.10" 794 > tmp/build.log

# /// script
# dependencies = [
#   "ujenkins",
#   "urllib3",
#   "python-dotenv",
# ]
# ///

import argparse
import asyncio
import os
import sys

import urllib3
from dotenv import load_dotenv
from ujenkins import AsyncJenkinsClient

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

DEFAULT_SERVER = "zbuildsrv1.zerto.local:8443"


def get_env(key: str) -> str:
    val = os.environ.get(key, "").strip()
    if not val:
        raise ValueError(
            f"Missing required environment variable: {key}\n"
            f"Add it to your .env file (see .env.example)."
        )
    return val


def normalize_job_path(job_path: str) -> str:
    """Convert 'ZVML/zvml-build-release/10.10' to 'ZVML/zvml-build-release/10.10'.
    ujenkins accepts slash-separated paths directly."""
    # Strip leading/trailing slashes; ujenkins handles the rest
    return job_path.strip("/")


async def fetch_console(server: str, user: str, token: str, job_path: str, build_id: str, tail: int | None) -> str:
    # ujenkins expects a full URL
    # Jenkins API uses Basic auth: username + API token in the password field
    url = f"https://{server}/"
    client = AsyncJenkinsClient(url=url, user=user, password=token, verify=False)
    try:
        output: str = await client.builds.get_output(name=job_path, build_id=build_id)
    finally:
        await client.close()

    if tail is not None and tail > 0:
        lines = output.splitlines()
        output = "\n".join(lines[-tail:])

    return output


def main() -> int:
    # Load .env, overriding any shell exports (e.g. wrong JENKINS_USER format).
    load_dotenv(override=True)

    parser = argparse.ArgumentParser(
        description="Fetch Jenkins build console output.",
        epilog='Example: uv run scripts/get-build-log.py "ZVML/zvml-build-release/10.10" 794',
    )
    parser.add_argument("job_path", help="Jenkins job path (e.g. ZVML/zvml-build-release/10.10)")
    parser.add_argument("build_id", nargs="?", default="lastBuild", help="Build number or 'lastBuild' (default: lastBuild)")
    parser.add_argument("--tail", type=int, default=None, help="Return only the last N lines")
    parser.add_argument("--server", default=None, help=f"Jenkins server host:port (default: {DEFAULT_SERVER})")
    args = parser.parse_args()

    try:
        server = args.server or os.environ.get("JENKINS_SERVER", "").strip() or DEFAULT_SERVER

        user = get_env("JENKINS_USER")
        token = get_env("JENKINS_TOKEN")
        job_path = normalize_job_path(args.job_path)

        output = asyncio.run(fetch_console(server, user, token, job_path, args.build_id, args.tail))
        print(output)
        return 0

    except FileNotFoundError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    except ValueError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        # Connection errors suggest VPN/network issue
        msg = str(e)
        if "Cannot connect" in msg or "ClientConnectorError" in msg or "Name or service not known" in msg:
            print(
                f"ERROR: Cannot reach Jenkins at {server}\n"
                f"Make sure you are connected to the corporate VPN.",
                file=sys.stderr,
            )
        else:
            print(f"ERROR: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
