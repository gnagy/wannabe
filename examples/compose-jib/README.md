# Example: a Gradle application, released with Jib, deployed with Docker Compose

The `.wannabe/` directory of an application whose image is built and pushed with Jib, and whose test
environment is a compose directory in an infra repository beside it (`../my-app-infra`), synced to a host over
ssh. Copy it to the root of your application and change the values; [config.md](../../docs/config.md) explains
each field.

```bash
wannabe released --to test
wannabe deployed --to test
wannabe deployment committed --to test --push
```
