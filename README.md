# TallyBIZ ERP

Full-stack Business Management & Accounting ERP built with **Django REST Framework** and **React + TypeScript**.

## Tech Stack
- **Backend:** Python, Django, Django REST Framework, SimpleJWT
- **Frontend:** React, TypeScript, Vite
- **Database & Deployment:** SQLite / PostgreSQL, Docker, GitHub Actions

## Local Setup & Run

### 1. Backend (Django API)
```bash
python -m venv .venv
source .venv/bin/activate  # Windows Git Bash: source .venv/Scripts/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

### 2. Frontend (React Web)
```bash
cd frontend
npm install
npm run dev
```

### 3. Production Build
```bash
cd frontend && npm run build
```
