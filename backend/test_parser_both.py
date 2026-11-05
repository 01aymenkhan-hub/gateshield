"""Compatibility entry point for the real HTTP OCR acceptance suite.

Run with --output <private-report.json> --repeat 3 --variants.
No model loading or identity assertions occur on import.
"""
from tests.run_acceptance import main

if __name__ == "__main__":
    raise SystemExit(main())
