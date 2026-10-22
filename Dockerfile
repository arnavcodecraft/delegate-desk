FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=8080 DB_PATH=/data/delegatedesk.db UPLOAD_DIR=/data/uploads
VOLUME /data
EXPOSE 8080
CMD ["npm", "start"]
