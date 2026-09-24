# build context: repository root (needs packages/contracts)
FROM node:20-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/web/package.json apps/web/
RUN npm ci --workspaces --include-workspace-root --no-audit --no-fund
COPY packages ./packages
COPY apps/web ./apps/web
RUN npm run build -w apps/web

FROM nginx:1.27-alpine
COPY apps/web/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
