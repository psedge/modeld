# Stage 1 — clone draw.io (only the webapp is needed at runtime)
FROM alpine/git AS drawio
RUN git clone https://github.com/jgraph/drawio.git /drawio && \
    cd /drawio && \
    git checkout 907d09cc895ede8f7eeff7adcb2adf7c864dd273

# Stage 2 — build the JS bundle
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 3 — minimal runtime image
FROM node:20-alpine AS runtime
WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Static assets and built bundle
COPY --from=builder /app/index.html .
COPY --from=builder /app/style.css .
COPY --from=builder /app/static ./static
COPY --from=builder /app/dist ./dist

# draw.io webapp only (the full repo is ~200MB; the webapp is ~30MB)
COPY --from=drawio /drawio/src/main/webapp ./drawio/src/main/webapp
# Overlay modeld's customized index.html
COPY drawio-index.html ./drawio/src/main/webapp/index.html

# MCP server
COPY mcp ./mcp

# model.yaml — default empty file; override in production with:
#   -v /path/to/model.yaml:/app/model.yaml
RUN echo "" > model.yaml

# Run as non-root
RUN addgroup -S modeld && adduser -S -G modeld modeld \
    && chown -R modeld:modeld /app
USER modeld

EXPOSE 3001
CMD ["node", "mcp/server.js"]
