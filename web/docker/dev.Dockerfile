# Development image: Node + pnpm + ffmpeg. The code is mounted from your checkout by
# docker-compose.dev.yml; dependencies are installed inside the container.
FROM node:24-alpine
RUN apk add --no-cache ffmpeg \
  && npm install -g pnpm@11.6.0
WORKDIR /app
