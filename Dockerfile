# syntax=docker/dockerfile:1.7
# Shared bot image for ALL users — only env vars differ at runtime.
# Layer order is cache-friendly: base → deps → source.

# Keep npm `playwright` version EXACTLY aligned with this tag.
FROM mcr.microsoft.com/playwright:v1.54.1-jammy

WORKDIR /app

# Dependency layer (cached until package*.json changes)
COPY package.json package-lock.json ./
# Pin install so caret ranges never pull a mismatched Playwright.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev \
    && node -e "const v=require('playwright/package.json').version; if(v!=='1.54.1'){console.error('Playwright mismatch',v); process.exit(1)}"

# App source only (finding.txt is mounted at runtime — no rebuild on edits)
COPY src ./src

ENV NODE_ENV=production
ENV HEADED=0

CMD ["npm", "run", "bot"]
