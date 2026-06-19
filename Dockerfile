FROM node:22-slim

WORKDIR /app

COPY package.json ./
COPY server.mjs ./
COPY index.html ./
COPY app.js ./
COPY styles.css ./
COPY privacy.html ./
COPY terms.html ./
COPY data-deletion.html ./

RUN mkdir -p published

ENV NODE_ENV=production
ENV PORT=4173

EXPOSE 4173

CMD ["node", "server.mjs"]
