FROM node:20-alpine

WORKDIR /app

# Install only runtime deps for the local web server.
COPY tryaitoday-autoeditor-local/package*.json ./
RUN npm ci --omit=dev

# Copy only files required by the Express app.
COPY tryaitoday-autoeditor-local/server.js ./server.js
COPY tryaitoday-autoeditor-local/logo.svg ./logo.svg
COPY tryaitoday-autoeditor-local/editor ./editor
COPY tryaitoday-autoeditor-local/_next ./_next

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
