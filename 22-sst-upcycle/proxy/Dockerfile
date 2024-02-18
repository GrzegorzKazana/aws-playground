FROM node:lts-alpine

COPY package.json package-lock.json ./
RUN npm ci

COPY index.js .

CMD ["node", "index.js"]
