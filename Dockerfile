# syntax=docker/dockerfile:1

FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/app/.playwright-browsers

COPY package.json package-lock.json ./
# --only-shell skips the ~430MB full Chrome binary — the scraper always launches
# headless, and the headless shell alone is enough for Playwright's page/DOM APIs.
RUN npm ci --omit=dev \
    && npm cache clean --force \
    && npx playwright install --with-deps --only-shell chromium \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/dist ./dist
COPY public ./public

# Fixed UID/GID (not --system, which picks an arbitrary one) so bind-mounted host
# directories like ./.cache can be chowned to a known, stable value.
RUN groupadd --gid 1000 scraper && useradd --uid 1000 --gid scraper --home-dir /app --no-create-home scraper \
    && chown -R scraper:scraper /app
USER scraper

CMD ["node", "dist/index.js"]
