FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig*.json next.config.ts postcss.config.mjs ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY LICENSE ./LICENSE
COPY vendor/niubigeo/src ./vendor/niubigeo/src
COPY vendor/niubigeo/LICENSE ./vendor/niubigeo/LICENSE
COPY examples/upstream ./examples/upstream
COPY examples/opengeo ./examples/opengeo
RUN npm run build
RUN mkdir -p /app/data/opengeo && chown -R node:node /app/data
USER node
ENV OPENGEO_CONTAINER=1 OPENGEO_DATA_DIR=/app/data/opengeo OPENGEO_PORT=8847 NEXT_TELEMETRY_DISABLED=1
EXPOSE 8847
CMD ["npm", "start"]
