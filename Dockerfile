# Local / Glama-friendly image for the agentsgot stdio MCP server.
# Does not bake secrets. For introspection-only starts, the entrypoint may mint
# an ephemeral local signer when no wallet env is provided.
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
COPY vendor ./vendor
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable \
  && useradd --create-home --uid 10001 app
COPY package.json pnpm-lock.yaml ./
COPY vendor ./vendor
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
COPY --from=build /app/vendor/shared/dist ./vendor/shared/dist
COPY --from=build /app/skills/dist ./skills/dist
COPY docker/mcp-entrypoint.sh /usr/local/bin/mcp-entrypoint.sh
RUN chmod +x /usr/local/bin/mcp-entrypoint.sh \
  && chown -R app:app /app
USER app
ENTRYPOINT ["mcp-entrypoint.sh"]
CMD ["node", "dist/cli/index.js", "mcp"]
