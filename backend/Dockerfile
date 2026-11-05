FROM node:24.22.0-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src ./src
COPY build.js .
RUN npm run build && npm prune --omit=dev

FROM node:24.22.0-alpine
ENV NODE_ENV=production MIGRATIONS_DIR=/app/migrations
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
USER node
EXPOSE 4000
CMD ["node","dist/app.js"]
