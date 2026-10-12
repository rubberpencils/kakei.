# Kakei sync server. No runtime dependencies: Node's built-in SQLite stores everything in one file.
FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0 \
    DB_PATH=/data/kakei.db
# Mount a persistent volume at /data or the database is lost on every deploy.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 4000
USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.ts"]
