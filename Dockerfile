FROM node:20-bullseye-slim

ENV APP_DIR=/usr/src/app
WORKDIR $APP_DIR
ENV PATH=$APP_DIR/node_modules/.bin:$PATH
ENV NODE_ENV=development

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    curl \
    build-essential \
    python3 \
 && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN if [ -f package-lock.json ]; then npm ci --prefer-offline --no-audit --no-fund; else npm install --no-audit --no-fund; fi

COPY . .

RUN chown -R node:node $APP_DIR

USER node

EXPOSE 3000

CMD ["npm", "run", "dev"]
