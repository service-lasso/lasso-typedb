# lasso-typedb

Release-backed TypeDB daemon package for Service Lasso.

This repo packages the TypeDB daemon runtime into Service Lasso archives. Schema initialization and sample-data loading are modeled as manual `setup.steps`, so they run as one-shot jobs and do not create fake long-running daemon services.

## Runtime Contract

- Service id: `typedb`
- Primary endpoint: `service` (`tcp`, loopback, preferred port `8729`)
- URL endpoint: `typedb://${endpoint.service.bind}:${endpoint.service.port}`
- Runtime provider: `@java`
- Healthchecks: `typedb-tcp-ready` TCP check on `${endpoint.service.bind}:${endpoint.service.port}`
- Data path: `server/data`
- Log path: `server/logs`
- Default database name exported as `typerefinery`

The manifest authors service interfaces through canonical `endpoints[]` entries. The service keeps the existing exported aliases outside endpoint entries for compatibility:

- `TYPEDB_HOST`
- `TYPEDB_PORT`
- `TYPEDB_DB`
- `TYPEDB_URL`
- `TYPEDB_DATA_PATH`

## One-Shot Jobs

The manifest includes three manual setup steps:

- `init-schema`: starts after `typedb` is healthy, runs the TypeDB console through `@java`, creates `${TYPEDB_DB}`, and loads the generated `jobs/init/schema.tql`.
- `install-sample-python-deps`: runs through `@python` and installs the packaged sample loader requirements into `jobs/sample/__packages__`.
- `load-sample`: starts after `typedb:init-schema` and `typedb:install-sample-python-deps`, then runs `jobs/sample/basic_upload.py` through `@python`.

For the canonical consumer workflow, including deliberate schema/sample runs
and `--force` reruns, see [One-shot Jobs](https://service-lasso.github.io/service-lasso/reference/one-shot-jobs).


All three steps use `rerun: manual`.

The default init job writes `jobs/init/init.tql` and `jobs/init/schema.tql` into the service root during config so `${TYPEDB_DB}` is resolved from the consuming app's manifest/env. Apps can replace those generated files or fork this service manifest if they own a different schema.

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

The verifier builds release archives, validates the canonical endpoint manifest and setup job contract, confirms packaged init/sample job assets are present, confirms no runtime database state is packaged, and starts the current platform daemon long enough to prove TCP readiness.

## Init And Sample Jobs

The packaged setup contract includes:

- `typedb-init`: one-shot TypeQL schema/database creation through the TypeDB console
- `typedb-sample`: one-shot Python sample-data upload after schema initialization

These are implemented as manual `setup.steps` on the `typedb` service, not as managed daemons. The packaged scripts include the expected setup assets (`init.tql.template`, `schema.tql`, `requirements.txt`, `basic_upload.py`, `basic_logs.py`, `data/`, and `schema/`) and run through Service Lasso's setup lifecycle.

See [docs/job-boundary.md](docs/job-boundary.md).
