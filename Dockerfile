# Stage 1: build frontend and backend
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run server:build

# Stage 2: runtime
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    SERVER_PORT=8080 \
    STATIC_DIST=./dist \
    CLIENT_ORIGIN=https://your-run-domain \
    VITE_SERVER_URL=/api

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/tsconfig.server.json ./tsconfig.server.json
COPY --from=build /app/package*.json ./

EXPOSE 8080
CMD ["node", "dist/server/server/index.js"]
