# Configuration reference

A project keeps its configuration in `.wannabe/` at its root. wannabe finds it by walking up from the working
directory, so every command works from anywhere inside the project.

```
.wannabe/
  gradle.yaml            # GradleBuild
  docker.yaml            # DockerImage
  <context>/
    context.yaml         # Context
    deployment.yaml      # Deployment
  plugins/               # optional: the project's own commands
```

Every file is one resource: `apiVersion`, `kind`, `metadata.name`, `spec`. Only `spec` is read today; the other
fields name what the file is and leave room to change a kind's shape later.

Paths are relative to the project root. Nothing in these files may be machine-specific or secret: they are meant
to be committed, and read the same on every checkout.

## Context

`.wannabe/<context>/context.yaml`. The directory's name is the context's name — what `--to`, `--from` and `--in`
take.

```yaml
apiVersion: wannabe/v1alpha1
kind: Context
metadata:
  name: test
spec:
  endpoints:
    app: https://app.test.example.com
    host: deploy@test-host.example.com
```

| Field                 | Used by                                           | Meaning                                                                                                                                    |
|-----------------------|---------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| `spec.endpoints.app`  | nothing yet                                       | Where the application is served                                                                                                            |
| `spec.endpoints.host` | `deployment synced`, `pulled`, `running`, `ready` | The ssh target running the application. **Without it, the context is not deployed by wannabe**, and those commands answer with exit code 3 |

## Deployment

`.wannabe/<context>/deployment.yaml`: where the context's deployment files are, and how the service runs.

```yaml
apiVersion: wannabe/v1alpha1
kind: Deployment
metadata:
  name: my-app
spec:
  dir: ../my-app-infra/test/app
  files: [compose.yml]
  remoteDir: /opt/docker/app
  service: my-app
  readiness: http://localhost:8080/actuator/health/readiness
  readinessTimeoutSeconds: 180
```

| Field                          | Used by                                | Meaning                                                                                                               |
|--------------------------------|----------------------------------------|-----------------------------------------------------------------------------------------------------------------------|
| `spec.dir`                     | `pinned`, `synced`, `committed`        | The compose directory, usually in a separate infra repository beside the project. Its git repository is found from it |
| `spec.files`                   | `pinned`, `committed`                  | The files in `dir` whose `image:` line a release rewrites, and that `committed` commits                               |
| `spec.remoteDir`               | `synced`, `pulled`, `running`, `ready` | Where `dir` is copied to on the host                                                                                  |
| `spec.service`                 | `pinned`, `pulled`, `running`, `ready` | The compose service                                                                                                   |
| `spec.readiness`               | `ready`                                | A URL polled **on the host** until it answers                                                                         |
| `spec.readinessTimeoutSeconds` | `ready`                                | How long to wait; 180 when left out                                                                                   |

## DockerImage

`.wannabe/docker.yaml`.

```yaml
apiVersion: wannabe/v1alpha1
kind: DockerImage
metadata:
  name: my-app
spec:
  pushTasks: [jib]
```

| Field            | Used by         | Meaning                                                                                                                                    |
|------------------|-----------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| `spec.pushTasks` | `docker pushed` | Gradle tasks that build and push the image. They must write `build/jib-image.json`, as Jib does, from which the image and its tag are read |

## GradleBuild

`.wannabe/gradle.yaml`.

```yaml
apiVersion: wannabe/v1alpha1
kind: GradleBuild
metadata:
  name: my-app
spec:
  tasks:
    built: [bootJar]
    cleaned: [clean]
    tested: [test]
```

| Field                  | Used by            | Meaning                                                                                       |
|------------------------|--------------------|-----------------------------------------------------------------------------------------------|
| `spec.tasks.<command>` | `gradle <command>` | The Gradle tasks `wannabe gradle <command>` runs. A command left out answers with exit code 3 |

The commands wannabe ships are `built`, `cleaned`, `tested` and `unit-tested`.

## Reading values

`wannabe self get <file> <path>` prints one value, for scripts and plugins:

```bash
wannabe self get test/deployment spec.service     # my-app
wannabe self get gradle spec.tasks.built          # one task per line
```

It exits with 1 when the value is missing.
