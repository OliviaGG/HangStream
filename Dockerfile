FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# The SQLite database and the Searchle embedding model live here. The
# directories have to exist in the image - a fresh checkout has neither.
RUN mkdir -p /app/data /app/server/searchle/data/models

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"]