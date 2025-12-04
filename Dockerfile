FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && \
    npm cache clean --force && \
    rm -rf /tmp/* /root/.npm
COPY . .
RUN mkdir -p certs && \
    wget -O certs/rds_ca.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem || true
EXPOSE 3000
CMD ["node", "server.js"]