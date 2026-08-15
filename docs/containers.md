# Containers

Bind the Knot store as a cache mount so images do not grow a new `node_modules` layer on every build.

```dockerfile
FROM node:22-bookworm-slim
WORKDIR /app
COPY . .
RUN npm install -g @magnexis/knotjs
ENV KNOT_STORE=/var/cache/knot
RUN knot snapshot
CMD ["knot", "run", "--offline", "--frozen", "src/index.ts"]
```

BuildKit cache:

```dockerfile
RUN --mount=type=cache,target=/var/cache/knot knot snapshot
```

Measure cold vs warm snapshot yourself. Do not copy numbers from a README that did not run on your builder. See [`benchmarks/README.md`](../benchmarks/README.md).
