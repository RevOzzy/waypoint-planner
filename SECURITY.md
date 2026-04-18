# Security Policy

## Supported Versions

This project is currently maintained as a single active version. The latest commit on the `main` branch is considered the supported version.

---

## Reporting a Vulnerability

If you discover a security vulnerability, please do not open a public issue right away.

Instead:

- Contact the maintainer directly (preferred), or
- Open an issue with limited details and request private disclosure

Include as much detail as possible:
- Description of the issue
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)

---

## Scope

This project is a client-side, browser-based application with no backend services. Security considerations primarily include:

- Third-party CDN dependencies
- Browser storage (localStorage)
- External API usage (map tiles and geocoding)

No sensitive data is intentionally collected, stored remotely, or transmitted by this application.

---

## Best Practices for Users

- Do not store sensitive or private location data unless you understand browser storage risks
- Export important data regularly
- Be aware that clearing browser data will remove saved projects

---

## Response Expectations

Security reports will be reviewed as soon as possible. Fixes will be prioritized based on severity and impact.

---

## Disclosure Policy

- Vulnerabilities will be fixed before public disclosure when possible
- Credit will be given to reporters if desired
