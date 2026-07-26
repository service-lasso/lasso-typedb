# Release Suitability

## Included

The release package includes only the reusable TypeDB daemon runtime:

- TypeDB server libraries
- TypeDB console libraries
- upstream TypeDB license file
- server configuration file
- packaged one-shot job assets under `jobs/`

## Excluded

Runtime database state is excluded. Service Lasso creates clean app-owned runtime folders under the consumer workspace:

- `server/data`
- `server/logs`

The package verifier fails if any file exists under a packaged `server/data` folder.

## Dependency Readiness

The manifest declares `@java` explicitly. Consumers must include a release-backed `@java` provider manifest in their `services/` folder.

The sample loader setup steps also require `@python`. Consumers only need `@python` when they intentionally run `typedb load-sample`; the TypeDB daemon and schema init job do not need Python.

## Endpoint Contract

The manifest authors TypeDB interfaces through canonical `endpoints[]` entries:

- `service`: the loopback TCP listener with preferred port `8729`
- `typedb`: the TypeDB URL endpoint targeting `service`

Compatibility environment exports such as `TYPEDB_PORT` and `TYPEDB_URL` remain outside endpoint entries and resolve from `${endpoint.service.port}` and `${endpoint.typedb.url}`.

## License Note

The bundled TypeDB runtime contains the upstream TypeDB license file. Service owners should review license suitability before redistributing modified TypeDB packages or adding additional bundled dependencies.
