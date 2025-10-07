FROM node:alpine
COPY . /app
RUN npm install
WORKDIR /app
CMD ["node", "server.js"]
