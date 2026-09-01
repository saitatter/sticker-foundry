# Reverse Proxy Examples

The source Compose stack exposes the web server on `8080` and the backend API on `3000`. Put both behind the same HTTPS hostname and route `/api/*` to the backend.

## Source Compose Stack

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
