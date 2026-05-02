# TypeDB Job Boundary

ISS-334 covers the TypeDB daemon service. The source service set also has two one-shot workflows:

- `typedb-init` creates the `typerefinery` database and loads `schema.tql`.
- `typedb-sample` installs Python dependencies and uploads sample data into the database.

These workflows are intentionally not modeled as separate always-running services. They are jobs: they run, complete, and report success/failure without remaining healthy as daemons.

Current Service Lasso models these jobs as `setup.steps` on the `typedb` service.

## Implemented Steps

- `init-schema`
  - depends on `typedb`
  - runs the TypeDB console through `@java`
  - uses config-generated `jobs/init/init.tql` and `jobs/init/schema.tql`
  - creates `${TYPEDB_DB}` and loads the default schema
- `install-sample-python-deps`
  - depends on `@python`
  - installs `jobs/sample/requirements.txt` into the packaged sample job folder
- `load-sample`
  - depends on `typedb`, `typedb:init-schema`, and `typedb:install-sample-python-deps`
  - runs `jobs/sample/basic_upload.py` through `@python`

All steps use `rerun: manual` so a baseline startup does not mutate database/schema/sample state without operator intent.

## Operator Flow

```powershell
service-lasso setup run typedb init-schema
service-lasso setup run typedb load-sample
```

Use `--force` for intentional re-runs. Service Lasso persists setup status, logs, exit code, and history under `.state/setup.json`.
