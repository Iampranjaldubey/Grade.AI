# GradeAI - Automated Grading Platform

An intelligent academic grading platform built with FastAPI, React, and AI-powered evaluation.

## 🎯 Project Status

**Phase 1: Authentication** ✅ Complete
- User registration and login
- JWT-based authentication with refresh tokens
- Role-based access control (Professor/Student/TA/Admin)

**Phase 2: Course Management** ✅ Complete
- Course CRUD operations with join codes
- Student enrollment system
- Assignment and rubric management
- Complete frontend foundation with auth flows

**Phase 3: In Progress** 🚧
- Detailed course and assignment pages
- File upload and submission system
- AI-powered grading
- Analytics dashboard

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL 14+
- Redis

### Backend Setup
```bash
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

Backend runs at `http://localhost:8000`
API docs at `http://localhost:8000/docs`

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`

See [SETUP.md](SETUP.md) for detailed instructions.

## 📚 Documentation

- [SETUP.md](SETUP.md) - Complete setup instructions
- [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) - Detailed feature documentation
- [phase2-courses.md](phase2-courses.md) - Phase 2 specifications

## 🏗️ Architecture

### Backend Stack
- **Framework**: FastAPI (async Python web framework)
- **Database**: PostgreSQL with SQLAlchemy ORM
- **Cache**: Redis for token management
- **Authentication**: JWT with refresh token rotation
- **File Storage**: AWS S3
- **Vector DB**: ChromaDB for RAG-based grading
- **Task Queue**: Celery for async grading jobs

### Frontend Stack
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Routing**: React Router v6
- **State Management**: Zustand
- **Data Fetching**: TanStack Query (React Query)
- **Forms**: React Hook Form + Zod validation
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Notifications**: React Hot Toast

## 🎨 Design System

**Colors**
- Primary (Navy): `#1E3A5F`
- Accent (Blue): `#2E86AB`
- Backgrounds: White with gray-50 base

**Typography**
- Font Family: Inter
- Clean, professional academic styling

## 🔒 Security Features

- JWT with access/refresh token rotation
- Automatic token refresh on 401 responses
- Token blacklisting on logout
- Rate limiting on login attempts
- Role-based route protection
- Ownership verification on all write operations

## 🎓 User Roles

**Professor**
- Create and manage courses
- Create assignments with rubrics
- View enrolled students
- Grade submissions (manual/AI-assisted)
- Analytics and insights

**Student**
- Enroll in courses via join codes
- View assignments and due dates
- Submit work
- View grades and feedback

## 📝 API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/logout` - Logout
- `GET /api/v1/auth/me` - Get current user

### Courses (Professor)
- `POST /api/v1/courses` - Create course
- `GET /api/v1/courses` - List courses
- `GET /api/v1/courses/{id}` - Get course details
- `PUT /api/v1/courses/{id}` - Update course
- `DELETE /api/v1/courses/{id}` - Soft delete course
- `GET /api/v1/courses/{id}/students` - List enrolled students

### Enrollments (Student)
- `POST /api/v1/enrollments/join` - Join course by code
- `GET /api/v1/enrollments/my-courses` - List enrolled courses
- `DELETE /api/v1/enrollments/{course_id}` - Drop course

### Assignments (Professor)
- `POST /api/v1/assignments` - Create assignment
- `GET /api/v1/assignments?course_id={id}` - List assignments
- `GET /api/v1/assignments/{id}` - Get assignment
- `PUT /api/v1/assignments/{id}` - Update assignment
- `DELETE /api/v1/assignments/{id}` - Soft delete assignment

### Rubrics (Professor)
- `POST /api/v1/assignments/{id}/rubrics` - Create rubrics
- `GET /api/v1/assignments/{id}/rubrics` - List rubrics
- `PUT /api/v1/rubrics/{id}` - Update rubric
- `DELETE /api/v1/rubrics/{id}` - Delete rubric

## 🧪 Testing

### Backend
```bash
cd backend
pytest
```

### Frontend
```bash
cd frontend
npm run test
```

## 📦 Database Schema

Key tables:
- `users` - User accounts with roles
- `courses` - Course information with join codes
- `enrollments` - Student course enrollments
- `assignments` - Assignment details
- `rubrics` - Grading criteria with weights
- `submissions` - Student work submissions
- `evaluations` - AI + manual grades

See `backend/alembic/versions/001_initial_schema.py` for complete schema.

## 🔄 CI/CD

GitHub Actions workflows:
- `.github/workflows/ci.yml` - Run tests on PRs
- `.github/workflows/deploy-staging.yml` - Deploy to staging
- `.github/workflows/deploy-production.yml` - Deploy to production

## 🤝 Contributing

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make changes and test thoroughly
3. Run linters: `npm run lint:fix` (frontend), `black .` (backend)
4. Commit with descriptive message
5. Push and create pull request

## 📄 License

[Add license information]

## 👥 Team

[Add team members]

## 🙏 Acknowledgments

Built with modern best practices and production-ready patterns.
