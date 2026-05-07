# Reverse Proxy Examples

StickerFoundry exposes the web UI on port `8080` and the backend API on port `3000` in the default Compose setup. In production, put both behind HTTPS and route `/api/*` to the backend.

## Caddy

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

Set:

```bash
PUBLIC_BASE_URL=https://stickers.example.com
CORS_ORIGIN=https://stickers.example.com
```

## Nginx Proxy Manager

Create one proxy host for `stickers.example.com`:

- Forward hostname/IP: your Docker host
- Forward port: `8080`
- Enable Websockets: off
- Block common exploits: on
- SSL: request a Let's Encrypt certificate and force SSL

Add this custom location:

```nginx
location /api/ {
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_pass http://YOUR_DOCKER_HOST:3000/api/;
}
```

## Traefik

Example labels for a Compose deployment:

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

Keep backend and web services on the same Docker network as Traefik.
