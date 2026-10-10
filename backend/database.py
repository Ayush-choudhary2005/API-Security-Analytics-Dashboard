"""
backend/database.py — Production Persistence Engine & Dialect Abstraction.

Supports both PostgreSQL (for production) and SQLite (for development & testing).
Provides:
- Environment-based connection management via DATABASE_URL
- Unified Cursor & Connection wrappers with parameter normalization (? -> %s for Postgres)
- Unified row access supporting dict(row) and row["key"]
- Automatic lastrowid handling across SQLite (cur.lastrowid) and Postgres (RETURNING id)
- Resilient connection pooling & thread-safe transactions
"""

import os
import re
import sqlite3
import threading
from contextlib import contextmanager
from typing import Any, Dict, List, Optional, Tuple, Union

# Try importing PostgreSQL driver
try:
    import psycopg2
    import psycopg2.extras
    import psycopg2.pool
    HAS_POSTGRES = True
except ImportError:
    HAS_POSTGRES = False

_DEFAULT_SQLITE_PATH = os.path.join(os.path.dirname(__file__), "events.db")
_pool_lock = threading.Lock()
_pg_pool = None


def get_database_url() -> str:
    """Resolve active database URL from environment or fallback to SQLite."""
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        return f"sqlite:///{_DEFAULT_SQLITE_PATH}"
    # Standardize legacy heroku postgres:// URLs to postgresql://
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    return url


def is_postgres(url: Optional[str] = None) -> bool:
    """Check if the resolved database engine is PostgreSQL."""
    target_url = url or get_database_url()
    return target_url.startswith("postgresql://") or target_url.startswith("postgres://")


class DictLikeRow(dict):
    """Row wrapper that supports both dict indexing (row['col']) and attribute access."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.__dict__ = self

    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)


class CursorWrapper:
    """Unified Cursor wrapper adapting parameter placeholders and lastrowid across engines."""

    def __init__(self, raw_cursor, is_pg: bool):
        self._raw = raw_cursor
        self._is_pg = is_pg
        self._lastrowid: Optional[int] = None

    @property
    def lastrowid(self) -> Optional[int]:
        if self._is_pg:
            return self._lastrowid
        return getattr(self._raw, "lastrowid", None)

    @property
    def rowcount(self) -> int:
        return getattr(self._raw, "rowcount", -1)

    def execute(self, sql: str, params: Optional[Union[tuple, list, dict]] = None):
        clean_sql = sql.strip()
        self._lastrowid = None

        if self._is_pg:
            # Intercept SQLite PRAGMA table_info(tbl) on PostgreSQL
            pragma_match = re.search(r'PRAGMA\s+table_info\(([^)]+)\)', clean_sql, flags=re.IGNORECASE)
            if pragma_match:
                tbl = pragma_match.group(1).strip().strip("'\"").lower()
                self._raw.execute("SELECT column_name AS name FROM information_schema.columns WHERE table_name = %s", (tbl,))
                return self

            if clean_sql.upper().startswith("PRAGMA FOREIGN_KEYS"):
                self._raw.execute("SELECT 1 AS foreign_keys")
                return self

            # 1. Translate SQLite '?' parameter placeholders to PostgreSQL '%s'
            if "?" in clean_sql:
                # Replace unquoted '?' with '%s'
                translated_sql = clean_sql.replace("?", "%s")
            else:
                translated_sql = clean_sql

            # 2. Translate SQLite-specific keywords and datetime functions to Postgres
            translated_sql = re.sub(r'\bINSERT\s+OR\s+IGNORE\s+INTO\b', 'INSERT INTO', translated_sql, flags=re.IGNORECASE)
            # Translate strftime('%H:%M', datetime(timestamp, 'unixepoch', 'localtime')) -> to_char(to_timestamp(timestamp), 'HH24:MI')
            translated_sql = re.sub(
                r"strftime\s*\(\s*'%H:%M'\s*,\s*datetime\s*\(\s*timestamp\s*,\s*'unixepoch'\s*,\s*'localtime'\s*\)\s*\)",
                "to_char(to_timestamp(timestamp), 'HH24:MI')",
                translated_sql,
                flags=re.IGNORECASE
            )

            # 3. Handle lastrowid on INSERT for Postgres if table uses serial id
            is_insert = translated_sql.strip().upper().startswith("INSERT INTO")
            has_returning = "RETURNING" in translated_sql.upper()
            
            if is_insert and not has_returning:
                # If inserting into tables that have integer primary keys, append RETURNING id
                match = re.search(r'INSERT\s+INTO\s+([a-zA-Z0-9_]+)', translated_sql, flags=re.IGNORECASE)
                if match:
                    table_name = match.group(1).lower()
                    if table_name in ("events", "api_keys", "webhook_configs"):
                        translated_sql = f"{translated_sql} RETURNING id"
                        has_returning = True

            if params is not None:
                self._raw.execute(translated_sql, params)
            else:
                self._raw.execute(translated_sql)

            if is_insert and has_returning:
                try:
                    res = self._raw.fetchone()
                    if res:
                        self._lastrowid = res[0] if isinstance(res, (tuple, list)) else res.get("id")
                except Exception:
                    pass

        else:
            # SQLite engine execution
            if params is not None:
                self._raw.execute(clean_sql, params)
            else:
                self._raw.execute(clean_sql)
            self._lastrowid = getattr(self._raw, "lastrowid", None)

        return self

    def fetchone(self) -> Optional[Dict[str, Any]]:
        row = self._raw.fetchone()
        if row is None:
            return None
        if self._is_pg:
            # DictCursor row
            return DictLikeRow(row)
        else:
            # sqlite3.Row
            return DictLikeRow({k: row[k] for k in row.keys()})

    def fetchall(self) -> List[Dict[str, Any]]:
        rows = self._raw.fetchall()
        if not rows:
            return []
        if self._is_pg:
            return [DictLikeRow(r) for r in rows]
        else:
            return [DictLikeRow({k: r[k] for k in r.keys()}) for r in rows]

    def close(self):
        try:
            self._raw.close()
        except Exception:
            pass


class ConnectionWrapper:
    """Unified Database Connection wrapper providing standard execute and transaction hooks."""

    def __init__(self, raw_conn, is_pg: bool, pool=None):
        self._raw = raw_conn
        self._is_pg = is_pg
        self._pool = pool
        self._closed = False

    @property
    def raw_connection(self):
        return self._raw

    def cursor(self) -> CursorWrapper:
        if self._is_pg:
            cur = self._raw.cursor(cursor_factory=psycopg2.extras.DictCursor)
        else:
            cur = self._raw.cursor()
        return CursorWrapper(cur, self._is_pg)

    def execute(self, sql: str, params: Optional[Union[tuple, list, dict]] = None) -> CursorWrapper:
        cur = self.cursor()
        cur.execute(sql, params)
        return cur

    def commit(self):
        if not self._closed:
            self._raw.commit()

    def rollback(self):
        if not self._closed:
            self._raw.rollback()

    def close(self):
        if self._closed:
            return
        self._closed = True
        if self._is_pg and self._pool:
            try:
                self._pool.putconn(self._raw)
            except Exception:
                pass
        else:
            try:
                self._raw.close()
            except Exception:
                pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self.rollback()
        else:
            self.commit()
        self.close()


def _get_pg_pool(dsn: str):
    """Initialize or retrieve thread-safe PostgreSQL connection pool."""
    global _pg_pool
    if _pg_pool is None:
        with _pool_lock:
            if _pg_pool is None:
                if not HAS_POSTGRES:
                    raise RuntimeError("psycopg2 is required for PostgreSQL connections but is not installed.")
                _pg_pool = psycopg2.pool.ThreadedConnectionPool(
                    minconn=2,
                    maxconn=20,
                    dsn=dsn
                )
    return _pg_pool


def get_connection(url: Optional[str] = None) -> ConnectionWrapper:
    """
    Acquire a unified connection wrapper to the configured database.
    Caller should close the connection or use 'with get_connection() as conn:'.
    """
    db_url = url or get_database_url()
    
    if is_postgres(db_url):
        pool = _get_pg_pool(db_url)
        raw_conn = pool.getconn()
        return ConnectionWrapper(raw_conn, is_pg=True, pool=pool)
    else:
        # Parse sqlite path from sqlite:///path or fallback
        if db_url.startswith("sqlite:///"):
            path = db_url[len("sqlite:///"): ]
        elif db_url == "sqlite:///:memory:":
            path = ":memory:"
        else:
            path = _DEFAULT_SQLITE_PATH
        
        raw_conn = sqlite3.connect(path, check_same_thread=False)
        raw_conn.execute("PRAGMA foreign_keys = ON")
        raw_conn.row_factory = sqlite3.Row
        return ConnectionWrapper(raw_conn, is_pg=False)


@contextmanager
def transaction(url: Optional[str] = None):
    """Transaction context manager: automatically commits on success or rolls back on exception."""
    conn = get_connection(url)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def check_database_health() -> Tuple[bool, str]:
    """Test database connectivity and response."""
    try:
        conn = get_connection()
        row = conn.execute("SELECT 1 AS ping").fetchone()
        conn.close()
        if row and (row.get("ping") == 1 or row[0] == 1):
            engine = "PostgreSQL" if is_postgres() else "SQLite"
            return True, f"{engine} connection healthy"
        return False, "Database responded with unexpected payload"
    except Exception as e:
        return False, f"Database connection failed: {str(e)}"
