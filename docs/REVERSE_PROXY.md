# Reverse Proxy Examples

The Unraid package exposes the web UI and API on one port: `8080`, with the API under `/api`. Put that port behind HTTPS for production.

The build-from-source Compose stack still exposes web on `8080` and backend on `3000`; use the split routing examples only for that source stack.

## All-In-One Package

For `ghcr.io/saitatter/sticker-foundry:latest`, forward all traffic to `http://YOUR_DOCKER_HOST:8080`. Nginx inside the container routes `/api/*` to the backend.

### Caddy

```caddyfile
stickers.example.com {
  encode zstd gzip
  reverse_proxy 127.0.0.1:8080
}
```

Set:

```bash
PUBLIC_BASE_URL=https://stickers.example.com/api
CORS_ORIGIN=https://stickers.example.com
PASSWORD_RESET_PUBLIC_URL=https://stickers.example.com
```

### Nginx Proxy Manager

Create one proxy host for `stickers.example.com`:

- Forward hostname/IP: your Docker host
- Forward port: `8080`
- Enable Websockets: off
- Block common exploits: on
- SSL: request a Let's Encrypt certificate and force SSL

No custom `/api` location is needed for the all-in-one package.

### Nginx

```nginx
server {
  listen 443 ssl http2;
  server_name stickers.example.com;

  location / {
    proxy_pass http://YOUR_DOCKER_HOST:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }
}
```

## Source Compose Split Stack

### Caddy

```caddyfile
stickers.example.com {
  encode zstd gzip

  handle_path /api/* {
    reverse_proxy 127.0.0.1:3000
  }

  handle {
    reverse_proxy 127.0.0.1:8080
  }
}
```

### Nginx Proxy Manager

Create one proxy host for `stickers.example.com` pointing to port `8080`, then add this custom location:

```nginx
location /api/ {
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_pass http://YOUR_DOCKER_HOST:3000/api/;
}
```

### Traefik

Example labels for a split Compose deployment:

```yaml
labels:
  - traefik.enable=true
  - traefik.http.routers.stickerfoundry-web.rule=Host(`stickers.example.com`)
  - traefik.http.routers.stickerfoundry-web.entrypoints=websecure
  - traefik.http.routers.stickerfoundry-web.tls.certresolver=letsencrypt
  - traefik.http.services.stickerfoundry-web.loadbalancer.server.port=80
  - traefik.http.routers.stickerfoundry-api.rule=Host(`stickers.example.com`) && PathPrefix(`/api`)
  - traefik.http.routers.stickerfoundry-api.entrypoints=websecure
  - traefik.http.routers.stickerfoundry-api.tls.certresolver=letsencrypt
  - traefik.http.services.stickerfoundry-api.loadbalancer.server.port=3000
```

Keep backend and web services on the same Docker network as Traefik for the split stack.
