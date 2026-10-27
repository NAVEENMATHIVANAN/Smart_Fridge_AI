
import sqlite3
from pathlib import Path

DATABASE_PATH = Path(__file__).resolve().parent / "smart_fridge.db"

NEW_COLUMNS = {
    "purchase_date": "DATE",
    "expiry_date": "DATE",
    "storage_notes": "VARCHAR(500)",
}


def migrate():
    if not DATABASE_PATH.exists():
        raise FileNotFoundError(
            f"Database not found: {DATABASE_PATH}"
        )

    connection = sqlite3.connect(DATABASE_PATH)

    try:
        connection.execute("BEGIN IMMEDIATE")

        table_exists = connection.execute(
            """
            SELECT name
            FROM sqlite_master
            WHERE type = 'table' AND name = 'inventory_items'
            """
        ).fetchone()

        if table_exists is None:
            raise RuntimeError(
                "The inventory_items table does not exist. "
                "Check the actual table name before migrating."
            )

        existing_columns = {
            row[1]
            for row in connection.execute(
                "PRAGMA table_info(inventory_items)"
            ).fetchall()
        }

        for column_name, column_type in NEW_COLUMNS.items():
            if column_name not in existing_columns:
                connection.execute(
                    f"ALTER TABLE inventory_items "
                    f"ADD COLUMN {column_name} {column_type}"
                )
                print(f"Added column: {column_name}")
            else:
                print(f"Already exists: {column_name}")

        connection.commit()
        print("Stage 4 database migration completed successfully.")

    except Exception:
        connection.rollback()
        raise

    finally:
        connection.close()


if __name__ == "__main__":
    migrate()
