FROM ubuntu:24.04 AS build
ARG FLUTTER_VERSION=3.47.7
ENV DEBIAN_FRONTEND=noninteractive PATH=/opt/flutter/bin:/opt/flutter/bin/cache/dart-sdk/bin:$PATH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git unzip xz-utils zip libglu1-mesa && rm -rf /var/lib/apt/lists/* \
    && git clone --depth 1 --branch ${FLUTTER_VERSION} https://github.com/flutter/flutter.git /opt/flutter \
    && flutter config --no-analytics && flutter precache --web
WORKDIR /app
COPY apps/client/pubspec.yaml apps/client/pubspec.lock ./
RUN flutter pub get
COPY apps/client/lib lib
COPY apps/client/web web
RUN flutter build web --release --no-web-resources-cdn

FROM nginx:1.27-alpine
ARG OCI_SOURCE="https://github.com/saitatter/sticker-foundry"
ARG OCI_REVISION=""
ARG OCI_VERSION=""
LABEL org.opencontainers.image.source="${OCI_SOURCE}" org.opencontainers.image.revision="${OCI_REVISION}" org.opencontainers.image.version="${OCI_VERSION}" org.opencontainers.image.title="Sticker Foundry"
COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build/web /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -q --spider http://127.0.0.1/ || exit 1
