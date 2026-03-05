# Nano Crazer Verification SOP

## Purpose
Run the Python test suite before declaring changes done.

## Scripts
- run-tests.sh: runs pytest for the repo-level tests.
- run-checks.sh: runs the same test suite (no lint step configured yet).

## Prerequisites
- Python 3.x
- Install deps:
  - `pip install -r requirements.txt pytest`
- Optional (face validation):
  - `face-recognition` system dependencies (see `FACE_VALIDATION_SETUP.md`).

## Usage
- `./nano_crazer-verification-sop/run-tests.sh`
- `./nano_crazer-verification-sop/run-checks.sh`
