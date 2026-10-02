# Frontend handoff

Teammates B and C put their files here following the build plan. No frontend
implementation files are included or claimed by this backend package.

FastAPI serves `index.html` at `/` and other files at their relative paths.
Use a hash router (`#home`, `#game`, etc.) and relative `/api/...` requests.
The backend works before the frontend arrives; `/` links to the API explorer.

See `../docs/frontend-integration.md` for payloads and JavaScript examples.
