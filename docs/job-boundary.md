# TypeDB Job Boundary

ISS-334 covers the TypeDB daemon service. The source service set also has two one-shot workflows:

- `typedb-init` creates the `typerefinery` database and loads `schema.tql`.
- `typedb-sample` installs Python dependencies and uploads sample data into the database.

These workflows are intentionally not modeled as separate always-running services. They are jobs: they should run, complete, and report success/failure without remaining healthy as daemons.

Current Service Lasso can materialize install/config files and start daemons, but it does not yet have a first-class, reusable job contract for ordered schema/data tasks. Until that exists, consuming apps can keep init/sample scripts in their own app repo and run them explicitly after `typedb` is healthy.

Follow-up work should define:

- job identity and dependency ordering
- one-shot execution through provider services such as `@java` or `@python`
- persisted job result state
- retry/idempotency policy
- Service Admin and CLI presentation for completed/failed jobs
