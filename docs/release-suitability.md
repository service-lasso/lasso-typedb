# Release Suitability

## Included

The release package includes only the reusable TypeDB daemon runtime:

- TypeDB server libraries
- TypeDB console libraries
- upstream TypeDB license file
- server configuration file

## Excluded

Runtime database state is excluded. Service Lasso creates clean app-owned runtime folders under the consumer workspace:

- `server/data`
- `server/logs`

The package verifier fails if any file exists under a packaged `server/data` folder.

## Dependency Readiness

The manifest declares `@java` explicitly. Consumers must include a release-backed `@java` provider manifest in their `services/` folder.

## License Note

The bundled TypeDB runtime contains the upstream TypeDB license file. Service owners should review license suitability before redistributing modified TypeDB packages or adding additional bundled dependencies.
