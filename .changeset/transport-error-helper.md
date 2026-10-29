---
'@core-ai/core-ai': minor
---

Add `isTransportError()`, which reports whether an error or anything in its `cause` chain carries a socket or Node fetch failure code (`UND_ERR_SOCKET`, `UND_ERR_HEADERS_TIMEOUT`, `UND_ERR_BODY_TIMEOUT`, `UND_ERR_CONNECT_TIMEOUT`, `ECONNRESET`, `ETIMEDOUT`, `EPIPE`), so provider wrappers can classify network failures as transient.
