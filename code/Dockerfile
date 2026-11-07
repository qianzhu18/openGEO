FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
COPY public ./public
COPY vendor/niubigeo/src ./vendor/niubigeo/src
COPY examples/upstream ./examples/upstream
RUN mkdir -p /app/data/citekeel && chown -R node:node /app/data
USER node
ENV OPENGEO_CONTAINER=1 CITEKEEL_DATA_DIR=/app/data/citekeel CITEKEEL_PORT=8847
EXPOSE 8847
CMD ["npm", "start"]
