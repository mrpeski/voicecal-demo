#!/usr/bin/env python

"""Entry point launching the FastAPI app.

The backend currently contains a minimal skeleton (see `voicecal/app.py`).
Running `uv run uvicorn voicecal.app:app --reload --port 8000` will start the server.
"""

import uvicorn

if __name__ == "__main__":
    uvicorn.run("voicecal.app:app", host="0.0.0.0", port=8000, reload=True)
