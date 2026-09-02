"""ASGI entry point: ``uvicorn ltx_api.main:app`` (or ``python -m ltx_api``)."""

from ltx_api.server import create_app

app = create_app()
