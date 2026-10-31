FROM node:22-alpine
WORKDIR /app
COPY agent-bridge.mjs .
USER node
EXPOSE 8080
CMD ["node", "agent-bridge.mjs"]
