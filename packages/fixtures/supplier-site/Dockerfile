FROM node:22-alpine
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm install
COPY src ./src
EXPOSE 3002
CMD ["npm", "start"]
