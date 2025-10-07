FROM node:alpine
RUN npm install
COPY . /app
WORKDIR /app
CMD ["node", "server.js"]
