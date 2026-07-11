"""
src/handler.py — Lambda adapter for CDK deployment.

CDK points Code.fromAsset at backend/src/, so this file re-exports
the handler from the parent package during Lambda cold start.

The actual implementation lives in backend/app.py and its siblings.
At deploy time, the CDK build step should copy or bundle the parent
directory's modules alongside this file. For now this stub keeps the
import path consistent.
"""
import sys
import os

# When running inside Lambda, the function package root is /var/task.
# During local development via `backend/src/`, add the parent to sys.path.
_backend_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _backend_root not in sys.path:
    sys.path.insert(0, _backend_root)

from app import handler as handler  # noqa: F401,E402 — re-export for Lambda
