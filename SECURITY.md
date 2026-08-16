# Security Policy

## Supported Versions

Only the latest release on the `main` branch is supported with security updates.

| Version | Supported |
|---------|-----------|
| latest (`main`) | ✅ |
| older releases | ❌ |

## Reporting a Vulnerability

**Please do not open a public issue for security vulnerabilities.**

Instead, report security issues privately so we can fix them before they are disclosed:

1. Use **GitHub Private Security Advisories**: open the repository → **Security** tab → **Report a vulnerability** (recommended).
2. Or email the maintainers with the subject `[SECURITY] ...` and include:
   - Affected version / commit
   - Steps to reproduce (PoC if available)
   - Impact assessment

We will:

- Acknowledge your report within **3 business days**.
- Keep you informed of the fix and release timeline.
- Credit you in the security advisory (unless you prefer to stay anonymous).

## Security Considerations

This project handles user accounts, encrypted data, and admin surfaces, and is built with security in mind:

- Passwords are hashed with **bcrypt**; sensitive fields are redacted from logs.
- User data is encrypted at rest, and file-vault keys are protected on the platform.
- Admin routes are protected with **role checks + mTLS client certificates** (`adminClientCertGate`).
- Admin ban approval and other sensitive actions require **re-authentication**.
- Frontend source maps are disabled in production; sensitive source files are blocked from HTTP access.
- Rate limiting and Web Application Firewall (WAF) protections are applied to key endpoints.
- CSP / security headers are applied via Helmet.

## Reporting Non-Security Bugs

For general bugs and feature requests, please open a regular issue or pull request — see [CONTRIBUTING.md](./CONTRIBUTING.md).
