# Estágio 1: Build (Onde o Node e o npm existem)
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# 1. Recebe o argumento passado pelo docker-compose.yml
ARG VITE_API_URL
# 2. Transforma o argumento em variável de ambiente
ENV VITE_API_URL=$VITE_API_URL

# 3. Faz o build da aplicação (O Vite vai ler a variável aqui)
RUN npm run build

# Estágio 2: Serve (Apenas o Nginx leve para servir os ficheiros estáticos)
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]