# CloudOps console

Static consoles used by Learn Azure in 30 Days.

- `cloudops-console.zip` contains `site/` for the storage-hosted release. It
  intentionally excludes `flag.txt`; learners add the per-deployment launch
  code before publishing the site.
- `cloudops-serverless-console.zip` contains `serverless-site/` for the Static
  Web Apps release. It calls `/api/health` and formats the JSON response.
