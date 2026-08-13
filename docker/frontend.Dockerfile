# syntax=docker/dockerfile:1
#
# Git-Hired frontend (Vite dev server).
#
# Runs natively on the host's architecture - nothing here needs the amd64
# emulation the backend image does.
FROM node:22-bookworm-slim

WORKDIR /app

# npm ci needs both files and installs exactly what the lockfile pins.
COPY agentic-interviewer/package.json agentic-interviewer/package-lock.json ./
RUN npm ci --no-fund --no-audit

COPY agentic-interviewer/ ./

EXPOSE 5173

# --host 0.0.0.0 is what makes the published port reachable; Vite binds to
# localhost by default, which inside a container means nothing outside it.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
