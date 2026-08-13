# syntax=docker/dockerfile:1
#
# Git-Hired backend (FastAPI + mediapipe).
#
# Built for linux/amd64 even on Apple Silicon: mediapipe 0.10.21 publishes
# manylinux wheels for x86_64 only - there is no linux/arm64 wheel on PyPI,
# and building it from source is a multi-hour Bazel job. compose pins the
# platform; Docker Desktop runs this under Rosetta.
#
# Python is pinned to 3.12 because mediapipe has no 3.13+ wheels at all.
FROM python:3.12-slim-bookworm

# - libgl1 / libglib2.0-0: opencv and mediapipe dlopen these at *import* time,
#   so without them `import cv2` fails before the server ever starts.
# - curl: the entrypoint asks cloudflared for the tunnel hostname over HTTP.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Unbuffered so the interview logs appear in `docker compose logs` as they
# happen rather than in 4KB bursts.
ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencies first: this layer only rebuilds when requirements.txt changes,
# and installing mediapipe under emulation is the slow part of the build.
COPY requirements.txt ./

# pynput is dropped here, and only here. On Linux it builds evdev from source,
# which needs kernel headers this image has no reason to carry - and the one
# module that imports it, server/src/input_tracker.py, is not wired into the
# backend by design: it watches the keyboard of the machine it runs on, which
# in a container is the server rather than the candidate (see the module
# docstring in server/agents/proctoring.py). Keystroke evidence comes from the
# browser instead. Everything else installs exactly as requirements.txt pins it.
RUN grep -viE '^\s*pynput\b' requirements.txt > /tmp/requirements-container.txt \
    && pip install --no-cache-dir -r /tmp/requirements-container.txt

# Fail the build - not the first interview - if the protobuf/mediapipe pairing
# is broken. This is the same check ./setup.sh runs, for the same reason:
# a bad pin is silent at install time and only surfaces at import.
RUN python -c "import mediapipe as mp; mp.solutions.face_mesh.FaceMesh(max_num_faces=1)" \
    && python -c "import cv2; print('opencv', cv2.__version__)"

COPY server ./server
COPY docker/backend-entrypoint.sh /usr/local/bin/backend-entrypoint
RUN chmod +x /usr/local/bin/backend-entrypoint

# server.py runs uvicorn with reload=True, which re-imports the app by name and
# only resolves from the directory holding it.
WORKDIR /app/server/backend

EXPOSE 8100

ENTRYPOINT ["backend-entrypoint"]
CMD ["python", "server.py"]
