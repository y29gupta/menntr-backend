FROM node:20-alpine

RUN apk add --no-cache python3 py3-pip bash

WORKDIR /app
COPY . .

RUN npm install express body-parser uuid

EXPOSE 5000
CMD ["node", "index.js"]
