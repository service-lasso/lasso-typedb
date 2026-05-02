# lasso-typedb

Release-backed TypeDB daemon package for Service Lasso.

This repo packages the TypeDB daemon runtime into Service Lasso archives. It deliberately ships the database server only; schema initialization and sample-data loading are one-shot workflows and are tracked separately because Service Lasso does not yet have a first-class job service model.

## Runtime Contract

- Service id: `typedb`
- Main port: `8729`
- Runtime provider: `@java`
- Healthcheck: TCP on the service port
- Data path: `server/data`
- Log path: `server/logs`
- Default database name exported as `typerefinery`

The service exports:

- `TYPEDB_HOST`
- `TYPEDB_PORT`
- `TYPEDB_DB`
- `TYPEDB_URL`
- `TYPEDB_DATA_PATH`

## Release Artifacts

- `lasso-typedb-2.25.6-win32.zip`
- `lasso-typedb-2.22.0-linux.tar.gz`
- `lasso-typedb-2.22.0-darwin.tar.gz`
- `service.json`
- `SHA256SUMS.txt`

The platform version mismatch mirrors the available source service archives: Windows is TypeDB `2.25.6`, while Linux and macOS are TypeDB `2.22.0`.

## Local Verification

```powershell
npm install
npm test
```

The verifier builds release archives, validates the manifest and package contents, confirms no runtime database state is packaged, and starts the current platform daemon long enough to prove TCP readiness.

## Init And Sample Jobs

The source service set includes:

- `typedb-init`: one-shot TypeQL schema/database creation through the TypeDB console
- `typedb-sample`: one-shot Python sample-data upload after schema initialization

Those are not implemented as managed daemons in this repo. They should be added once Service Lasso has a clear one-shot job/action contract, or as explicit app-owned scripts in a consuming project.

See [docs/job-boundary.md](docs/job-boundary.md).
